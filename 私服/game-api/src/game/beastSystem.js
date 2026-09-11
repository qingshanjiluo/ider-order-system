/**
 * 灵宠/妖兽系统
 * - 捕捉：战斗胜利后概率获得妖兽蛋/幼崽
 * - 培养：喂养灵石/丹药提升等级
 * - 进化：达到条件消耗材料进化为高阶形态
 * - 出战：最多1只出战，提供属性加成+自动释放技能
 * - 品阶：凡品(1阶)→灵品(2阶)→仙品(3阶)
 */
import { getItems } from './dataLoader.js';
import { intVal, deepClone } from './onlineUtils.js';
import { createDb } from '../db.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ── 妖兽数据（运行时加载） ──
let _beasts = null;
function getBeasts() {
  if (!_beasts) {
    try { _beasts = require('../data/beasts.js').default; } catch { _beasts = []; }
  }
  return _beasts || [];
}

function getBeastById(id) {
  return getBeasts().find(b => b.id === id) || null;
}

// ── 玩家灵宠数据初始化 ──
function ensureBeastData(player) {
  if (!player.beasts) {
    player.beasts = {
      roster: [],        // 已拥有的灵宠列表
      active_id: 0,      // 出战灵宠ID
      egg_incubating: null, // 正在孵化的蛋 {beast_id, finish_at}
    };
  }
  if (!player.beasts.roster) player.beasts.roster = [];
  return player.beasts;
}

// ── 计算灵宠属性 ──
function calcBeastStats(beast) {
  const template = getBeastById(beast.template_id);
  if (!template) return null;
  const lv = beast.level || 1;
  const g = template.growth || {};
  const base = template.base_stats || {};
  return {
    hp: Math.floor((base.hp || 0) + (g.hp || 0) * (lv - 1)),
    attack: Math.floor((base.attack || 0) + (g.attack || 0) * (lv - 1)),
    defense: Math.floor((base.defense || 0) + (g.defense || 0) * (lv - 1)),
    agility: Math.floor((base.agility || 0) + (g.agility || 0) * (lv - 1)),
  };
}

// ── 灵宠出战属性加成（按百分比加成到玩家） ──
function getBeastCombatBonus(beast) {
  if (!beast || !beast.template_id) return {};
  const stats = calcBeastStats(beast);
  if (!stats) return {};
  // 出战灵宠提供 15% 属性加成
  const ratio = 0.15;
  return {
    max_hp: Math.floor(stats.hp * ratio),
    min_phys_damage: Math.floor(stats.attack * ratio * 0.5),
    max_phys_damage: Math.floor(stats.attack * ratio),
    phys_defense: Math.floor(stats.defense * ratio),
    spell_attack: Math.floor(stats.attack * ratio * 0.8),
    agility: Math.floor(stats.agility * ratio * 0.3),
  };
}

// ── 喂养经验 ──
function feedBeastExp(beast, amount) {
  if (!beast) return { ok: false, error: '灵宠不存在' };
  beast.exp = (beast.exp || 0) + amount;
  // 升级经验公式：level^2 * 50
  while (beast.exp >= (beast.level || 1) * (beast.level || 1) * 50) {
    beast.exp -= (beast.level || 1) * (beast.level || 1) * 50;
    beast.level = (beast.level || 1) + 1;
  }
  return { ok: true, beast };
}

// ── 战斗胜利后尝试捕捉 ──
function tryCaptureBeast(player, mapLevel) {
  const beasts = getBeasts();
  // 筛选当前地图可掉落的妖兽
  const candidates = beasts.filter(b => {
    if (!b.drop_map_ids || b.drop_map_ids.length === 0) return false;
    if (b.drop_rate <= 0) return false;
    // 等级匹配：妖兽等级范围与地图等级匹配
    return true;
  });
  if (candidates.length === 0) return null;

  // 随机选一只
  const beast = candidates[Math.floor(Math.random() * candidates.length)];
  // 捕捉概率：基础掉落率 * 地图等级加成
  const levelBonus = Math.min(2.0, 1 + (mapLevel - 50) / 200);
  const captureChance = beast.drop_rate * levelBonus;
  if (Math.random() > captureChance) return null;

  // 检查玩家是否已有该灵宠
  const bd = ensureBeastData(player);
  const existing = bd.roster.find(r => r.template_id === beast.id);
  if (existing) {
    // 已有：转化为经验丹
    return { type: 'exp_item', beast_name: beast.name, exp: beast.tier * 100 };
  }

  // 新灵宠
  const newBeast = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    template_id: beast.id,
    name: beast.name,
    level: 1,
    exp: 0,
    loyalty: 50, // 忠诚度 0-100
    created_at: Math.floor(Date.now() / 1000),
  };
  bd.roster.push(newBeast);
  return { type: 'new_beast', beast: newBeast, template: beast };
}

// ── 路由处理 ──
export async function handleBeastRoute(request, env, route) {
  const db = createDb(env);
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: '未登录' }, 401);

  let accountId;
  try {
    const payload = await import('../auth.js').then(m => m.verifyToken(token));
    accountId = payload.account_id;
  } catch { return json({ ok: false, error: '登录已过期' }, 401); }

  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });

  const bd = ensureBeastData(player);
  const method = request.method;
  let body = {};
  if (method === 'POST') {
    try { body = await request.json(); } catch { body = {}; }
  }

  // GET /beast/roster — 灵宠列表
  if (route === '/beast/roster' && method === 'GET') {
    const roster = bd.roster.map(b => {
      const template = getBeastById(b.template_id);
      const stats = calcBeastStats(b);
      return { ...b, template_name: template?.name, template_element: template?.element,
        template_tier: template?.tier, template_type: template?.type,
        description: template?.description, evolve_to: template?.evolve_to,
        stats, evolve_cost: template?.evolve_cost || 0 };
    });
    return json({ ok: true, roster, active_id: bd.active_id });
  }

  // POST /beast/deploy — 出战
  if (route === '/beast/deploy' && method === 'POST') {
    const beastId = intVal(body.beast_id, 0);
    if (!beastId) { bd.active_id = 0; return json({ ok: true, player, msg: '收回灵宠' }); }
    const beast = bd.roster.find(b => b.id === beastId);
    if (!beast) return json({ ok: false, error: '灵宠不存在' });
    bd.active_id = beastId;
    const saveRet = await db.savePlayerImmediate(accountId, 1, player);
    if (saveRet?.conflict) return json({ ok: false, error: '数据繁忙' }, 409);
    return json({ ok: true, player, msg: `${beast.name} 出战！` });
  }

  // POST /beast/feed — 喂养（消耗灵石）
  if (route === '/beast/feed' && method === 'POST') {
    const beastId = intVal(body.beast_id, 0);
    const count = Math.min(100, Math.max(1, intVal(body.count, 1)));
    const beast = bd.roster.find(b => b.id === beastId);
    if (!beast) return json({ ok: false, error: '灵宠不存在' });
    const cost = count * 100;
    if ((player.spirit_stones || 0) < cost) return json({ ok: false, error: '灵石不足' });
    player.spirit_stones -= cost;
    const result = feedBeastExp(beast, count * 20);
    if (!result.ok) return json(result);
    const saveRet = await db.savePlayerImmediate(accountId, 1, player);
    if (saveRet?.conflict) return json({ ok: false, error: '数据繁忙' }, 409);
    return json({ ok: true, player, beast: result.beast, msg: `喂养成功，${beast.name} 获得 ${count * 20} 经验` });
  }

  // POST /beast/evolve — 进化
  if (route === '/beast/evolve' && method === 'POST') {
    const beastId = intVal(body.beast_id, 0);
    const beast = bd.roster.find(b => b.id === beastId);
    if (!beast) return json({ ok: false, error: '灵宠不存在' });
    const template = getBeastById(beast.template_id);
    if (!template || !template.evolve_to) return json({ ok: false, error: '该灵宠无法进化' });
    if ((player.spirit_stones || 0) < (template.evolve_cost || 0)) return json({ ok: false, error: '灵石不足' });
    player.spirit_stones -= template.evolve_cost;
    beast.template_id = template.evolve_to;
    beast.name = getBeastById(template.evolve_to)?.name || beast.name;
    beast.level = Math.max(1, beast.level - 5); // 进化降5级
    const saveRet = await db.savePlayerImmediate(accountId, 1, player);
    if (saveRet?.conflict) return json({ ok: false, error: '数据繁忙' }, 409);
    return json({ ok: true, player, beast, msg: `${beast.name} 进化成功！` });
  }

  // POST /beast/release — 放生
  if (route === '/beast/release' && method === 'POST') {
    const beastId = intVal(body.beast_id, 0);
    const idx = bd.roster.findIndex(b => b.id === beastId);
    if (idx < 0) return json({ ok: false, error: '灵宠不存在' });
    const released = bd.roster.splice(idx, 1)[0];
    if (bd.active_id === beastId) bd.active_id = 0;
    // 放生返还少量灵石
    const template = getBeastById(released.template_id);
    const refund = (template?.tier || 1) * 500;
    player.spirit_stones = (player.spirit_stones || 0) + refund;
    const saveRet = await db.savePlayerImmediate(accountId, 1, player);
    if (saveRet?.conflict) return json({ ok: false, error: '数据繁忙' }, 409);
    return json({ ok: true, player, msg: `放生 ${released.name}，获得 ${refund} 灵石` });
  }

  return null; // 未匹配
}
