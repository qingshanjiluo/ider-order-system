/**
 * 试炼系统 API（Worker 版）
 * - 危机试炼（词条契约 + 试炼币商店）走 /dungeon-battle 路由（challenge_mode=trial_contract）
 * - 问心试炼（心魔战斗）走 /trial/start + /trial/advance
 * GET  /trial/contracts — 试炼契约定义
 * GET  /trial/shop     — 试炼商店
 * POST /trial/shop/buy — 购买商品
 * POST /trial/start    — 开始问心试炼
 * POST /trial/advance  — 推进问心试炼
 */
import { createDb } from '../db.js';
import { verifyToken } from '../auth.js';
import * as ops from '../game/playerOps.js';
import * as engine from '../game/dungeonBattleEngine.js';
import { getItemById, getDungeons, getSkillById, getTechniqueById } from '../game/dataLoader.js';
import { getCommandDelay } from '../game/commandRateLimit.js';
import {
  getTrialContractDefinitions,
  getTrialContractMaxScore,
  calcTrialCoinReward,
  buildTrialContractDungeonBands
} from '../game/trialContracts.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function intVal(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : d; }
function pct(v) {
  const n = Number(v) || 0;
  return `${Math.round(n * 100)}%`;
}

function fmtSkillEffect(effect = {}) {
  const t = String(effect.type || '');
  if (!t) return '';
  if (t === 'damage_percent_range') {
    const s = `造成${pct(effect.minValue)}~${pct(effect.maxValue)}法术伤害`;
    return Number(effect.ignoreSpellDefense) > 0
      ? `${s}（无视${pct(effect.ignoreSpellDefense)}法防）`
      : s;
  }
  if (t === 'damage_percent_plus_agility_multi') {
    const base = `造成（物攻${pct(effect.value)}+身法${pct(effect.agilityCoeff)}）物理伤害x${Math.max(1, Number(effect.count) || 3)}`;
    return Number(effect.perHitGrowth) > 0 ? `${base}（每击递增${pct(effect.perHitGrowth)}）` : base;
  }
  if (t === 'gain_temp_shield_max_hp_percent') {
    const pvpPart = effect.pvpValue != null ? `（PVP ${pct(effect.pvpValue)}）` : '';
    return `获得最大生命${pct(effect.value)}的临时护盾${pvpPart}`;
  }
  return '';
}

function fmtTechniqueEffect(effect = {}) {
  const t = String(effect.type || '');
  if (t === 'on_deal_damage_mana_burn') {
    const pve = pct(effect.value ?? effect.mpBurnPct ?? 0);
    const pvp = pct(effect.pvpValue ?? effect.pvpMpBurnPct ?? effect.value ?? 0);
    return `造成伤害时削减目标法力${pve}并追加等量伤害（PVP：削减${pvp}并追加等量法术伤害）`;
  }
  return '';
}

function buildBookEffectText(item = {}) {
  const effects = Array.isArray(item.effects) ? item.effects : [];
  const parts = [];
  for (const eff of effects) {
    const t = String(eff?.type || '');
    if (t === 'learn_skill') {
      const skillId = Number(eff?.value) || 0;
      const sk = getSkillById(skillId);
      if (!sk || !sk.id) continue;
      const effectText = String(sk.description || '').trim() || fmtSkillEffect((Array.isArray(sk.effects) ? sk.effects[0] : {}) || {});
      const cd = Number(sk.cooldown) > 0 ? `，冷却${Number(sk.cooldown)}回合` : '';
      parts.push(`技能【${String(sk.name || skillId)}】：${effectText}${cd}`);
      continue;
    }
    if (t === 'learn_technique') {
      const techId = Number(eff?.value) || 0;
      const tech = getTechniqueById(techId);
      if (!tech || !tech.id) continue;
      const effectText = String(tech.description || '').trim() || fmtTechniqueEffect((Array.isArray(tech.effects) ? tech.effects[0] : {}) || {});
      parts.push(`功法【${String(tech.name || techId)}】：${effectText}`);
    }
  }
  return parts.join('；');
}

// ── 问心试炼（心魔战斗）──
const TRIAL_COOLDOWN_SEC = 1800;
const TRIAL_ADVANCE_EVENT_LIMIT = 60;
const COMMAND_MAX_QUEUE_WAIT_MS = 120;
const activeTrials = new Map();

function nowSec() { return Math.floor(Date.now() / 1000); }

function _randomBattleId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function _buildHeartDemon(player) {
  const str = intVal(player.strength, 10);
  const con = intVal(player.constitution, 10);
  const bone = intVal(player.bone, 10);
  const zhenyuan = intVal(player.zhenyuan, 10);
  const boneMult = 1.0 + (bone / 300.0) * 0.01;
  const avgAtk = Math.floor(str * 0.75 * boneMult);
  const defense = Math.floor(con * 0.25 * boneMult);
  const spellAtk = Math.floor(zhenyuan * 0.8 * boneMult);
  const spellDef = Math.floor(zhenyuan * 0.2 * boneMult);
  const maxHp = Math.floor(con * 5 * boneMult);
  const maxMp = Math.floor(zhenyuan * 3 * boneMult);
  const agility = Math.max(0, intVal(player.agility, 0));
  return {
    id: 35, name: '心魔', type: 'spirit', level: intVal(player.level, 1),
    hp: maxHp, attack: avgAtk, defense,
    spellAttack: spellAtk, spellDefense: spellDef,
    agility, mp: maxMp,
    exp: 0, drops: [],
    skills: [28],
    skill_levels: { '28': { level: Math.max(1, Math.floor(intVal(player.level, 1) / 40)) } }
  };
}

function _isLiteStateRequested(request) {
  const url = new URL(request.url);
  return String(url.searchParams.get('state') || 'lite').trim().toLowerCase() === 'full' ? false : true;
}

function _stateToClientByMode(state, lite) {
  if (!state || typeof state !== 'object') return null;
  if (!lite) return engine.stateToClient(state);
  return engine.stateToClient(state);
}

// 定期清理过期试炼（30分钟）
function _cleanupStaleTrials() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, trial] of activeTrials) {
    if (trial.created_at < cutoff) activeTrials.delete(id);
  }
}
_cleanupStaleTrials();

const TRIAL_COIN_SHOP = [
  { id: 'tc_book_221', item_id: 221, count: 1, cost: 250, desc: '《寂灭》 x1' },
  { id: 'tc_book_222', item_id: 222, count: 1, cost: 350, desc: '《狂澜》 x1' },
  { id: 'tc_book_223', item_id: 223, count: 1, cost: 200, desc: '《御天之气》 x1' },
  { id: 'tc_book_233', item_id: 233, count: 1, cost: 450, desc: '《落星指》 x1' },
  { id: 'tc_book_234', item_id: 234, count: 1, cost: 450, desc: '《爆燃术》 x1' },
  { id: 'tc_book_220', item_id: 220, count: 1, cost: 350, desc: '《夺灵法》 x1' },
  { id: 'tc_book_231', item_id: 231, count: 1, cost: 550, desc: '《目牛术》 x1' },
  { id: 'tc_book_232', item_id: 232, count: 1, cost: 550, desc: '《护体神光》 x1' },
  { id: 'tc_book_235', item_id: 235, count: 1, cost: 550, desc: '《魔神诀》 x1' },
  { id: 'tc_book_237', item_id: 237, count: 1, cost: 700, desc: '《镇岳》 x1' },
  { id: 'tc_book_238', item_id: 238, count: 1, cost: 800, desc: '《波涛意》 x1' },
  { id: 'tc_book_224', item_id: 224, count: 1, cost: 550, desc: '《岿然》 x1' },
  { id: 'tc_book_225', item_id: 225, count: 1, cost: 300, desc: '《荡魔》 x1' },
  { id: 'tc_book_226', item_id: 226, count: 1, cost: 1500, desc: '《命之法则》 x1' },
  { id: 'tc_book_227', item_id: 227, count: 1, cost: 800, desc: '《神象镇狱功》 x1' },
  { id: 'tc_book_228', item_id: 228, count: 1, cost: 1500, desc: '《逆命法则》 x1' },
  { id: 'tc_book_229', item_id: 229, count: 1, cost: 1500, desc: '《体之法则》 x1' },
  { id: 'tc_book_230', item_id: 230, count: 1, cost: 1500, desc: '《灵之法则》 x1' }
];

export async function handleTrialRoute(request, env, route) {
  const method = request.method;
  const subPath = route.replace(/^\/trial/, '') || '/';

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = Number(auth.accountId || auth.sub || 0);

  const db = createDb(env);
  const body = await request.json().catch(() => ({}));

  if (subPath === '/contracts' && method === 'GET') return handleTrialContracts();
  if (subPath === '/shop' && method === 'GET') return handleTrialShop();
  if (subPath === '/shop/buy' && method === 'POST') return handleTrialShopBuy(db, accountId, body);
  if (subPath === '/start' && method === 'POST') return handleTrialStart(db, accountId);
  if (subPath === '/advance' && method === 'POST') return handleTrialAdvance(request, db, accountId, body);
  return null;
}

function handleTrialContracts() {
  const maxScore = getTrialContractMaxScore(6);
  const dungeonBands = buildTrialContractDungeonBands(getDungeons());
  const maxDungeonMultiplier = dungeonBands.reduce((m, b) => Math.max(m, Number(b.multiplier) || 1), 1);
  const maxSingleRunCoins = calcTrialCoinReward(maxScore, maxDungeonMultiplier);
  return json({
    ok: true,
    modifiers: getTrialContractDefinitions(),
    max_score: maxScore,
    max_single_run_coins: maxSingleRunCoins,
    dungeon_reward_multipliers: dungeonBands.map((b) => ({
      dungeon_id: Number(b.dungeonId) || 0,
      dungeon_name: String(b.name || ''),
      level_min: Number(b.levelMin) || 1,
      multiplier: Number(b.multiplier) || 1,
      index: Number(b.index) || 0,
      total: Number(b.total) || 1
    }))
  });
}

function handleTrialShop() {
  const goods = TRIAL_COIN_SHOP
    .map((g) => {
      const item = getItemById(Number(g.item_id) || 0);
      if (!item || !item.id) return null;
      return {
        id: String(g.id),
        item_id: Number(g.item_id) || 0,
        item_name: String(item.name || g.desc || '未知道具'),
        count: Math.max(1, Number(g.count) || 1),
        cost: Math.max(1, Number(g.cost) || 1),
        desc: String(g.desc || ''),
        effect_text: buildBookEffectText(item)
      };
    })
    .filter(Boolean);
  return json({ ok: true, goods });
}

async function handleTrialShopBuy(db, accountId, body) {
  const shopId = String(body?.item_id || '').trim();
  const quantity = Math.max(1, Math.min(200, Number(body?.quantity) || 1));
  const cfg = TRIAL_COIN_SHOP.find((g) => String(g.id) === shopId);
  if (!cfg) return json({ ok: false, error: '无效商品' });

  const item = getItemById(Number(cfg.item_id) || 0);
  if (!item || !item.id) return json({ ok: false, error: '商品配置缺失道具' });

  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });

  const totalCost = Math.max(1, Number(cfg.cost) || 1) * quantity;
  const ownCoins = Math.max(0, Number(player.trial_coins) || 0);
  if (ownCoins < totalCost) return json({ ok: false, error: `试炼币不足，需要${totalCost}` });

  const totalCount = Math.max(1, Number(cfg.count) || 1) * quantity;
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);
  const okPut = ops.putItemInInventory(player.inventory, item, totalCount);
  if (!okPut) return json({ ok: false, error: '背包空间不足' });

  player.trial_coins = ownCoins - totalCost;
  await db.savePlayer(accountId, 1, player);
  return json({
    ok: true,
    player,
    bought: {
      item_id: Number(item.id),
      item_name: String(item.name || ''),
      count: totalCount,
      spent: totalCost
    }
  });
}

// ── 问心试炼：开始 ──
async function handleTrialStart(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  if (intVal(player.level, 1) < 240) return json({ ok: false, error: '问心试炼需元婴大圆满（等级≥240）方可挑战' });

  const lastComplete = intVal(player.heart_trial_last_complete, 0);
  const cur = nowSec();
  if (lastComplete > 0 && (cur - lastComplete) < TRIAL_COOLDOWN_SEC) {
    const remain = TRIAL_COOLDOWN_SEC - (cur - lastComplete);
    return json({ ok: false, error: `试炼冷却中，剩余${Math.floor(remain / 60)}分${remain % 60}秒` });
  }

  // 清理该账号之前的未完成试炼
  for (const [id, t] of activeTrials) {
    if (t.account_id === accountId) activeTrials.delete(id);
  }

  const demon1 = _buildHeartDemon(player);
  const demon2 = _buildHeartDemon(player);
  const waves = [[demon1], [demon2]];
  const dungeon = { id: 9999, name: '问心试炼' };

  // 满血满蓝进入战斗
  const fullPlayer = structuredClone(player);
  const maxHp = Math.max(1, intVal(fullPlayer.max_hp, intVal(fullPlayer.hp, 1)));
  const maxMp = Math.max(0, intVal(fullPlayer.max_mp, intVal(fullPlayer.mp, 0)));
  fullPlayer.hp = maxHp;
  fullPlayer.mp = maxMp;
  fullPlayer.account_id = accountId;

  const state = engine.createDungeonBattle(dungeon, [fullPlayer], waves);
  const battleId = _randomBattleId();
  activeTrials.set(battleId, { state, account_id: accountId, created_at: Date.now() });

  return json({ ok: true, battle_id: battleId, state: engine.stateToClient(state) });
}

// ── 问心试炼：推进 ──
async function handleTrialAdvance(request, db, accountId, body) {
  const _delay = getCommandDelay(accountId);
  if (_delay > COMMAND_MAX_QUEUE_WAIT_MS) {
    const battle_id = String(body?.battle_id || '');
    if (!battle_id) return json({ ok: false, error: '缺少 battle_id' });
    const battle = activeTrials.get(battle_id);
    if (!battle || battle.account_id !== accountId) return json({ ok: false, error: '试炼无效或已过期' });
    return json({
      ok: true, throttled: true, retry_after_ms: Math.floor(Number(_delay) || 0),
      ended: false, victory: false, draw: false,
      state: _stateToClientByMode(battle.state, _isLiteStateRequested(request)),
      events: []
    });
  }
  if (_delay > 0) await new Promise((r) => setTimeout(r, _delay));

  try {
    const liteState = _isLiteStateRequested(request);
    const battle_id = String(body?.battle_id || '');
    if (!battle_id) return json({ ok: false, error: '缺少 battle_id' });
    const battle = activeTrials.get(battle_id);
    if (!battle || battle.account_id !== accountId) return json({ ok: false, error: '试炼无效或已过期' });

    let result;
    try {
      result = engine.advanceTurn(battle.state);
    } catch (advErr) {
      const st = (battle && battle.state && typeof battle.state === 'object') ? battle.state : {};
      console.error('[trial/advance] advanceTurn 异常 battle=%s account=%s round=%s wave=%s: %s',
        String(battle_id), String(accountId), String(st.round || 0), String(st.current_wave || 0),
        advErr?.message || advErr);
      activeTrials.delete(battle_id);
      return json({
        ok: true, ended: true, victory: false, draw: false, state: null,
        events: [{ t: 'system', text: '试炼状态异常，已自动终止。' }]
      });
    }
    if (!result.ok) return json(result);
    battle.state = result.state;

    if (result.ended) {
      activeTrials.delete(battle_id);
      const player = await db.getPlayerByAccountId(accountId);
      if (player) {
        player.heart_trial_last_complete = nowSec();
        if (result.victory) {
          player.breakthrough_heart_trial_passed = true;
        }
        await db.savePlayer(accountId, 1, player);
      }
    }

    const rawEvents = Array.isArray(result.events) ? result.events : [];
    const events = rawEvents.length > TRIAL_ADVANCE_EVENT_LIMIT
      ? rawEvents.slice(rawEvents.length - TRIAL_ADVANCE_EVENT_LIMIT)
      : rawEvents;
    if (rawEvents.length > TRIAL_ADVANCE_EVENT_LIMIT) {
      events.unshift({ t: 'system', text: '战斗日志过长，本次仅展示最新片段。' });
    }

    return json({
      ok: true,
      state: _stateToClientByMode(result.state, liteState),
      events,
      ended: Boolean(result.ended),
      victory: Boolean(result.victory),
      draw: Boolean(result.draw)
    });
  } catch (err) {
    console.error('[trial/advance] 异常:', err?.message, err?.stack);
    return json({ ok: false, error: '试炼推进异常' }, 500);
  }
}
