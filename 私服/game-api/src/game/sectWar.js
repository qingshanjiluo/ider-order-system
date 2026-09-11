/**
 * 宗门战争系统
 * - 宗门领地战：10块领地，宗门争夺控制权
 * - 赛季制：每7天为一赛季
 * - 战斗：宗门成员 vs 宗门成员，按战力匹配
 * - 贡献：参战获得宗门贡献，占领领地获得额外奖励
 */
import { createDb } from '../db.js';
import { verifyToken } from '../auth.js';
import { intVal, deepClone } from './onlineUtils.js';
import { getSectById } from './dataLoader.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ── 领地数据（静态） ──
const TERRITORIES = [
  { id: 1, name: '荒石荒原', element: 'earth', base_level: 30, bonus_desc: '灵石产出+10%', bonus_type: 'spirit_stone_bonus', bonus_value: 0.1 },
  { id: 2, name: '青竹灵谷', element: 'wood', base_level: 50, bonus_desc: '经验获取+8%', bonus_type: 'exp_bonus', bonus_value: 0.08 },
  { id: 3, name: '烈焰火山', element: 'fire', base_level: 80, bonus_desc: '炼丹成功率+5%', bonus_type: 'alchemy_bonus', bonus_value: 0.05 },
  { id: 4, name: '玄冰深渊', element: 'water', base_level: 110, bonus_desc: '防御+5%', bonus_type: 'defense_bonus', bonus_value: 0.05 },
  { id: 5, name: '雷霆峰', element: 'metal', base_level: 140, bonus_desc: '攻击+5%', bonus_type: 'attack_bonus', bonus_value: 0.05 },
  { id: 6, name: '归墟裂谷', element: 'none', base_level: 180, bonus_desc: '全属性+3%', bonus_type: 'all_stat_bonus', bonus_value: 0.03 },
  { id: 7, name: '古战场遗迹', element: 'none', base_level: 220, bonus_desc: '暴击率+3%', bonus_type: 'crit_bonus', bonus_value: 0.03 },
  { id: 8, name: '无尽风域', element: 'none', base_level: 260, bonus_desc: '身法+8%', bonus_type: 'agility_bonus', bonus_value: 0.08 },
  { id: 9, name: '魔渊入口', element: 'none', base_level: 300, bonus_desc: '法攻+8%', bonus_type: 'spell_attack_bonus', bonus_value: 0.08 },
  { id: 10, name: '飞升台', element: 'none', base_level: 350, bonus_desc: '全属性+5%', bonus_type: 'all_stat_bonus', bonus_value: 0.05 },
];

// ── 赛季状态 ──
let _seasonCache = null;
function getSeasonState() {
  const now = Math.floor(Date.now() / 1000);
  if (_seasonCache && now - _seasonCache.started_at < 7 * 86400) return _seasonCache;
  // 重置赛季
  _seasonCache = {
    season_id: Math.floor(now / (7 * 86400)),
    started_at: Math.floor(now / (7 * 86400)) * 7 * 86400,
    territories: {}, // territory_id -> { sect_id, holder_name, held_since }
    battles: [],     // { id, attacker_sect, defender_sect, territory_id, attacker_members, defender_members, result, created_at }
    war_enabled: true,
  };
  return _seasonCache;
}

// ── 获取领地信息 ──
function getTerritoryInfo() {
  const season = getSeasonState();
  return TERRITORIES.map(t => {
    const holder = season.territories[t.id] || {};
    return {
      ...t,
      holder_sect_id: holder.sect_id || 0,
      holder_name: holder.holder_name || '无主之地',
      held_since: holder.held_since || 0,
    };
  });
}

// ── 获取宗门领地加成（供战斗系统调用） ──
export function getSectTerritoryBonuses(sectId) {
  if (!sectId) return [];
  const season = getSeasonState();
  const bonuses = [];
  for (const t of TERRITORIES) {
    const holder = season.territories[t.id];
    if (holder && holder.sect_id === sectId) {
      bonuses.push({ type: t.bonus_type, value: t.bonus_value, name: t.name });
    }
  }
  return bonuses;
}

// ── 宣战（宗门 leader 对领地宣战） ──
function declareWar(player, sectId, territoryId) {
  if (!sectId) return { ok: false, error: '你未加入宗门' };
  const territory = TERRITORIES.find(t => t.id === territoryId);
  if (!territory) return { ok: false, error: '领地不存在' };
  const season = getSeasonState();
  if (!season.war_enabled) return { ok: false, error: '战争未开启' };

  // 检查是否已有进行中的战争
  const existing = season.battles.find(b =>
    b.attacker_sect === sectId && b.territory_id === territoryId && b.status === 'active'
  );
  if (existing) return { ok: false, error: '已对该领地宣战' };

  const battle = {
    id: `war_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    attacker_sect: sectId,
    defender_sect: season.territories[territoryId]?.sect_id || 0,
    territory_id: territoryId,
    attacker_power: player.max_hp + (player.min_phys_damage || 0) + (player.max_phys_damage || 0),
    defender_power: 0,
    attacker_members: [player.name],
    defender_members: [],
    status: 'active', // active, resolved
    result: null, // attacker_win, defender_win
    created_at: Math.floor(Date.now() / 1000),
    ends_at: Math.floor(Date.now() / 1000) + 3600, // 1小时后结算
  };
  season.battles.push(battle);
  return { ok: true, battle, msg: `向 ${territory.name} 宣战！` };
}

// ── 加入防御方 ──
function joinDefense(player, sectId, battleId) {
  const season = getSeasonState();
  const battle = season.battles.find(b => b.id === battleId && b.status === 'active');
  if (!battle) return { ok: false, error: '战争不存在或已结束' };
  if (battle.defender_sect !== sectId) return { ok: false, error: '这不是你的宗门领地' };
  if (battle.defender_members.includes(player.name)) return { ok: false, error: '你已加入防御' };
  battle.defender_members.push(player.name);
  battle.defender_power += player.max_hp + (player.min_phys_damage || 0) + (player.max_phys_damage || 0);
  return { ok: true, battle };
}

// ── 结算战争 ──
function settleWar(battleId) {
  const season = getSeasonState();
  const battle = season.battles.find(b => b.id === battleId && b.status === 'active');
  if (!battle) return null;
  if (Date.now() / 1000 < battle.ends_at) return null; // 未到结算时间

  // 胜负判定：总战力比较 + 随机因素
  const attackerRoll = battle.attacker_power * (0.8 + Math.random() * 0.4);
  const defenderRoll = battle.defender_power * (0.8 + Math.random() * 0.4);
  const attackerWin = attackerRoll > defenderRoll || battle.defender_power === 0;

  battle.status = 'resolved';
  battle.result = attackerWin ? 'attacker_win' : 'defender_win';

  if (attackerWin) {
    // 进攻方占领
    season.territories[battle.territory_id] = {
      sect_id: battle.attacker_sect,
      holder_name: getSectById(battle.attacker_sect)?.name || '未知',
      held_since: Math.floor(Date.now() / 1000),
    };
  }
  return battle;
}

// ── 路由处理 ──
export async function handleSectWarRoute(request, env, route) {
  const db = createDb(env);
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: '未登录' }, 401);

  let accountId;
  try {
    const payload = await verifyToken(token);
    accountId = payload.account_id;
  } catch { return json({ ok: false, error: '登录已过期' }, 401); }

  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });

  let body = {};
  if (request.method === 'POST') {
    try { body = await request.json(); } catch { body = {}; }
  }

  // GET /sect-war/territories — 领地列表
  if (route === '/sect-war/territories' && request.method === 'GET') {
    const territories = getTerritoryInfo();
    const season = getSeasonState();
    return json({ ok: true, territories, season_id: season.season_id, war_enabled: season.war_enabled });
  }

  // GET /sect-war/battles — 战争列表
  if (route === '/sect-war/battles' && request.method === 'GET') {
    const season = getSeasonState();
    // 自动结算到期战争
    season.battles.filter(b => b.status === 'active').forEach(b => settleWar(b.id));
    const battles = season.battles.slice(-50).reverse();
    return json({ ok: true, battles });
  }

  // POST /sect-war/declare — 宣战
  if (route === '/sect-war/declare' && request.method === 'POST') {
    const territoryId = intVal(body.territory_id, 0);
    const sectId = player.sect_id || 0;
    const result = declareWar(player, sectId, territoryId);
    return json(result);
  }

  // POST /sect-war/defend — 加入防御
  if (route === '/sect-war/defend' && request.method === 'POST') {
    const battleId = body.battle_id || '';
    const sectId = player.sect_id || 0;
    const result = joinDefense(player, sectId, battleId);
    return json(result);
  }

  return null;
}
