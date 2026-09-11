/**
 * 战斗会话编排（Worker 版）
 *
 * 原版依赖后台 gameLoop 每 500ms 推进一次 server_driven 战斗。
 * Worker 无后台线程 → 采用「请求时惰性推进」：
 *   poll/command/state 请求到达时，按「距上次推进经过的时间」推进若干回合，
 *   达到结算条件则触发 finalizeBattle，并处理自动续战。
 *
 * 依赖注入：deps.bsc（battleSessionCache D1 实例）、deps.db（createDb 实例）。
 */

import * as engine from './battleEngine.js';
import * as cave from './cave.js';
import * as ops from './playerOps.js';
import * as lingjie from './lingjie.js';

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function numVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

const BATTLE_POLL_EVENT_LIMIT = 80;
const BATTLE_POLL_INCLUDE_STATE_EVERY = 5;
const AUTO_INTENT_PERSIST_MIN_INTERVAL_MS = 5000;

// 服务端驱动：每个 poll 周期推进的最大回合数（原 gameLoop TICK=500ms，poll 约 1.6s，最多 4 回合）
const SERVER_DRIVEN_TICK_MS = 500;
const SERVER_DRIVEN_MAX_TICKS_PER_REQUEST = 4;

/** 精简 player：poll 只返回战斗结算相关字段，避免 ~178KB 完整对象 */
const _POLL_PLAYER_LITE_KEYS = [
  'name', 'level', 'exp', 'max_exp', 'hp', 'max_hp', 'mp', 'max_mp',
  'spirit_stones', 'trial_coins', 'league_points', 'league_rating',
  'current_map_id', 'auto_battle_map_id', 'rest_until', 'auto_battle_enabled',
  'skill_levels', 'techniques', 'skill_cooldowns',
  'sect_id', 'alliance_id', 'time_state'
];

function _buildPollPlayerLite(player) {
  const lite = {};
  for (const k of _POLL_PLAYER_LITE_KEYS) {
    if (k in player) lite[k] = player[k];
  }
  return lite;
}

function _shouldPersistAutoIntent(session, enabled, mapId) {
  if (!session || typeof session !== 'object') return true;
  const nowMs = Date.now();
  const normalizedEnabled = !!enabled;
  const normalizedMapId = Math.max(1, intVal(mapId, 1));
  const lastAt = Number(session._autoIntentPersistAt || 0);
  const lastEnabled = !!session._autoIntentPersistEnabled;
  const lastMapId = Math.max(1, intVal(session._autoIntentPersistMapId, 1));
  if (lastEnabled !== normalizedEnabled || lastMapId !== normalizedMapId) return true;
  return (nowMs - lastAt) >= AUTO_INTENT_PERSIST_MIN_INTERVAL_MS;
}

function _markAutoIntentPersisted(session, enabled, mapId) {
  if (!session || typeof session !== 'object') return;
  session._autoIntentPersistAt = Date.now();
  session._autoIntentPersistEnabled = !!enabled;
  session._autoIntentPersistMapId = Math.max(1, intVal(mapId, 1));
}

// dataLoader 由外部注入，避免循环依赖
let _getSkillById = null;
function _skillCanUse(p, sid) {
  if (!p || !p.skill_cooldowns || typeof p.skill_cooldowns !== 'object') return true;
  const cd = p.skill_cooldowns[String(sid)];
  if (cd && cd > 0) return false;
  if (typeof _getSkillById === 'function') {
    const skill = _getSkillById(sid);
    if (skill && skill.id) {
      const mpCost = Math.max(0, intVal(skill.mpCost, 0));
      return mpCost <= intVal(p.mp, 0);
    }
  }
  return true;
}

/** server_driven 自动战斗选技能（原 gameLoop.pickAutoSkill 内联） */
function pickAutoSkill(state) {
  const p = state.player;
  if (!p) return { action: 'attack', skill_id: 0 };
  const equipped = Array.isArray(p.equipped_skills) ? p.equipped_skills : [];
  const lingli = numVal(p.lingli_raw || p.lingli, 10);
  const lingliBonus = Math.min(lingli * 0.0005, 0.2);
  const skillChance = 0.75 + lingliBonus;
  if (Math.random() >= skillChance) return { action: 'attack', skill_id: 0 };
  const rolled = Math.max(0, intVal(equipped[Math.floor(Math.random() * 5)], 0));
  if (rolled <= 0) return { action: 'attack', skill_id: 0 };
  if (_skillCanUse(p, rolled)) return { action: 'skill', skill_id: intVal(rolled, 0) };
  const available = [...new Set(equipped.map((sid) => intVal(sid, 0)).filter((sid) => sid > 0 && _skillCanUse(p, sid)))];
  if (available.length <= 0) return { action: 'attack', skill_id: 0 };
  return { action: 'skill', skill_id: available[Math.floor(Math.random() * available.length)] };
}

export function setBattleDataLoader(getSkillByIdFn) {
  _getSkillById = getSkillByIdFn;
}
/**
 * 惰性推进 server_driven 战斗。
 * 返回 { advanced, events, ended, victory, draw, settle, state }。
 * 推进前会先尝试获取到结算。
 */
async function advanceLazily({ bsc, engineApi, accountId, session, settleFn, maxTicks, nowMs }) {
  const nowMsV = nowMs || Date.now();
  const now = Math.floor(nowMsV / 1000);
  const state = session.state || {};
  if (state.server_driven !== true || session.status !== 'active') {
    return { advanced: false, events: [], ended: false };
  }
  const lastAdv = intVal(session.state && session.state._last_advance_ms, 0);
  const sinceMs = lastAdv > 0 ? Math.max(0, nowMsV - lastAdv) : SERVER_DRIVEN_TICK_MS;
  const ticks = Math.max(1, Math.min(maxTicks || SERVER_DRIVEN_MAX_TICKS_PER_REQUEST, Math.ceil(sinceMs / SERVER_DRIVEN_TICK_MS)));

  let events = [];
  let ended = false;
  let cur = state;
  let lastSeq = intVal(session.last_seq, 0);
  let apply = null;
  let eventIdx = intVal(session.state && session.state.event_index, 0);

  for (let i = 0; i < ticks; i += 1) {
    if (cur.server_driven !== true) break;
    const cmd = pickAutoSkill(cur);
    apply = engineApi.applyCommand(cur, cmd);
    if (!apply || !apply.ok) break;
    cur = apply.state || cur;
    const rawEvents = Array.isArray(apply.events) ? apply.events : [];
    if (rawEvents.length > 0) {
      events.push(...rawEvents);
      eventIdx += rawEvents.length;
    }
    lastSeq += 1;
    if (apply.ended) { ended = true; break; }
  }
  if (events.length > 0 || ended) {
    cur.event_index = eventIdx;
  }

  if (ended) {
    cur._last_advance_ms = nowMsV;
    // 先落事件，再推进 state
    if (events.length > 0) {
      await bsc.appendEvents(session.id, intVal(session.state && session.state.event_index, 0) + 1, events);
    }
    await bsc.updateSessionState(session.id, { state: cur, lastSeq, lastCmdAt: now });
    const outcome = { victory: Boolean(apply && apply.victory), draw: Boolean(apply && apply.draw) };
    const settle = typeof settleFn === 'function' ? await settleFn(session, cur, outcome) : null;
    const result = {
      victory: Boolean(apply && apply.victory),
      draw: Boolean(apply && apply.draw),
      rewards: (settle && settle.rewards) || {},
      settle_player: (settle && settle.player) || null,
      rest_remaining_sec: (settle && settle.rest_remaining_sec) || 0
    };
    await bsc.finishSession(session.id, result);
    // 同步内存对象，供 poll 后续读取
    session.state = cur;
    session.last_seq = lastSeq;
    session.status = 'finished';
    session.result = result;
    session.ended_at = now;
    return { advanced: true, events, ended: true, victory: result.victory, draw: result.draw, settle, state: cur };
  }

  if (lastSeq > intVal(session.last_seq, 0)) {
    cur._last_advance_ms = nowMsV;
    if (events.length > 0) {
      await bsc.appendEvents(session.id, intVal(session.state && session.state.event_index, 0) + 1, events);
    }
    await bsc.updateSessionState(session.id, { state: cur, lastSeq, lastCmdAt: now, expiresAt: now + 900 });
  }
  return { advanced: lastSeq > intVal(session.last_seq, 0), events, ended: false, state: cur };
}

export async function startBattleSession({ accountId, body, helpers, deps }) {
  const bsc = deps.bsc;
  const db = deps.db;
  const engineApi = deps.engine || engine;
  const dataLoader = deps.dataLoader || {};
  const { getEnemyById, getMapById, getDungeonEnemyById } = dataLoader;
  const {
    randomEnemyFromMap,
    isNightmareMap,
    applyNightmareEnemy,
    clampRestUntil,
    consumeBattleStartTalisman,
    applyBattleStartTalisman
  } = helpers || {};

  const { mapId, enemyId, dungeonId, poll_mode, auto_restart } = body || {};
  const requestedDungeonMode = Number(dungeonId) > 0;
  const pollMode = Boolean(poll_mode);
  const autoRestart = auto_restart !== undefined ? Boolean(auto_restart) : pollMode;

  const active = await bsc.getActiveSessionByAccount(accountId);
  if (active && String(active.status || '') === 'active') {
    const activeDungeonMode = String(active?.state?.enemy_source || 'wild') === 'dungeon';
    if (activeDungeonMode !== requestedDungeonMode) {
      await bsc.deleteSession(String(active.id || ''));
    } else {
      if (pollMode && !active.state?.server_driven) active.state.server_driven = true;
      active.last_poll_at = Math.floor(Date.now() / 1000);
      active.auto_restart = autoRestart;
      if (pollMode) {
        const activeMapId = active.map_id || mapId || 1;
        if (_shouldPersistAutoIntent(active, autoRestart, activeMapId)) {
          await db.updatePlayerAutoBattleIntent(accountId, autoRestart, activeMapId);
          _markAutoIntentPersisted(active, autoRestart, activeMapId);
        }
      }
      const source = String(active?.state?.enemy_source || 'wild');
      const enemy = source === 'dungeon' ? getDungeonEnemyById(active.enemy_id) : getEnemyById(active.enemy_id);
      return {
        ok: true,
        battleId: String(active.id || ''),
        state: engineApi.stateLite(active.state || {}),
        enemyData: enemy || null,
        last_seq: Math.max(0, Number(active.last_seq) || 0),
        resumed: true,
        server_driven: Boolean(active.state?.server_driven)
      };
    }
  }

  const map = getMapById(mapId || 1);
  if (!map) {
    return { ok: false, error: '地图不存在' };
  }

  let enemy;
  const dungeonMode = requestedDungeonMode;
  if (enemyId) {
    enemy = dungeonMode ? getDungeonEnemyById(enemyId) : getEnemyById(enemyId);
  } else {
    enemy = typeof randomEnemyFromMap === 'function' ? randomEnemyFromMap(mapId || 1) : null;
  }

  if (typeof isNightmareMap === 'function' && typeof applyNightmareEnemy === 'function' && isNightmareMap(map) && enemy && !enemy.nightmare) {
    enemy = applyNightmareEnemy(enemy, map);
  }
  if (!enemy || !enemy.id) {
    return { ok: false, error: '无法生成敌人' };
  }

  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return { ok: false, error: '角色不存在' };

  if (!dungeonMode && lingjie.isLingjieMap(map)) {
    enemy = lingjie.scaleLingjieEnemyForPlayer(enemy, map, player);
  }

  const nowSecVal = Math.floor(Date.now() / 1000);
  const restUntil = typeof clampRestUntil === 'function' ? clampRestUntil(player, nowSecVal) : intVal(player.rest_until, 0);
  if (restUntil !== intVal(player.rest_until, 0)) {
    player.rest_until = restUntil;
    await db.updatePlayerRestUntil(accountId, restUntil);
  }
  if (restUntil > nowSecVal) {
    const remain = Math.max(0, restUntil - nowSecVal);
    return {
      ok: false,
      error: '调息中，剩余' + remain + '秒',
      rest_remaining_sec: remain
    };
  }

  player.rest_until = 0;
  const mainServiceResult = cave.settleMainFormationServices(player, nowSecVal, { allowAutoActivate: true });
  ops.tryApplySkillPresetForBattle(player, dungeonMode ? 'dungeon' : 'grind');
  let playerDirty = !!(mainServiceResult && mainServiceResult.changed);
  const buffsBefore = player.timed_buffs && typeof player.timed_buffs === 'object' ? Object.keys(player.timed_buffs).length : 0;
  ops.cleanupTimedBuffs(player);
  const buffsAfter = player.timed_buffs && typeof player.timed_buffs === 'object' ? Object.keys(player.timed_buffs).length : 0;
  if (buffsAfter !== buffsBefore) playerDirty = true;
  const talismanUse = typeof consumeBattleStartTalisman === 'function' ? consumeBattleStartTalisman(player) : { used: false };
  if (talismanUse && talismanUse.used) playerDirty = true;
  if (playerDirty) await db.savePlayer(accountId, 1, player);

  const battleId = cryptoRandomHex();
  const initState = engineApi.createInitialBattleState(player, enemy, Math.floor(Math.random() * 2147483647));
  initState.enemy_source = dungeonMode ? 'dungeon' : 'wild';
  initState.dungeon_id = dungeonMode ? Math.floor(Number(dungeonId) || 0) : 0;
  initState.turn_mode = dungeonMode ? 'fixed_agility' : 'action_bar';
  if (!dungeonMode && lingjie.isLingjieMap(map)) {
    initState.map_environment = lingjie.buildLingjieBattleContext(map);
  }
  if (pollMode) initState.server_driven = true;

  await bsc.createSession(battleId, accountId, mapId || 1, enemy.id, pollMode ? 172800 : 900, initState);
  if (pollMode) {
    const newSess = await bsc.getActiveSessionByAccount(accountId);
    if (newSess) {
      newSess.auto_restart = autoRestart;
      const nextMapId = mapId || 1;
      if (_shouldPersistAutoIntent(newSess, autoRestart, nextMapId)) {
        await db.updatePlayerAutoBattleIntent(accountId, autoRestart, nextMapId);
        _markAutoIntentPersisted(newSess, autoRestart, nextMapId);
      }
    } else {
      await db.updatePlayerAutoBattleIntent(accountId, autoRestart, mapId || 1);
    }
  }

  const initEvts = [{ t: 'combat_log', text: '遭遇了 ' + String(enemy.name || '敌人') }];
  if (initState.map_environment && initState.map_environment.id) {
    initEvts.push({
      t: 'combat_log',
      text: '灵界环境【' + String(initState.map_environment.name || '未知') + '】生效：' + String(initState.map_environment.effect_desc || '')
    });
    if (initState.map_environment.reward_desc) {
      initEvts.push({
        t: 'combat_log',
        text: '灵界奖励：' + String(initState.map_environment.reward_desc || '')
      });
    }
  }
  if (talismanUse.used && typeof applyBattleStartTalisman === 'function') {
    const applied = applyBattleStartTalisman(initState, talismanUse);
    if (Array.isArray(applied)) initEvts.push(...applied);
  }
  if (Array.isArray(initState._init_events) && initState._init_events.length > 0) {
    initEvts.push(...initState._init_events);
  }
  await bsc.appendEvents(battleId, 1, initEvts);
  initState.event_index = initEvts.length;

  return {
    ok: true,
    battleId,
    enemyData: enemy,
    state: engineApi.stateLite(initState),
    last_seq: 0,
    resumed: false,
    server_driven: Boolean(initState.server_driven)
  };
}

function cryptoRandomHex() {
  try {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

export async function setAutoRestartIntent({ accountId, body, deps }) {
  const enabled = !!(body && body.enabled);
  const rawMapId = Number(body && body.map_id);
  const hasMapId = Number.isFinite(rawMapId) && rawMapId > 0;
  const mapId = hasMapId ? Math.floor(rawMapId) : undefined;
  const player = await deps.db.updatePlayerAutoBattleIntent(accountId, enabled, mapId);
  if (!player) {
    return { ok: false, error: '无角色' };
  }
  const session = await deps.bsc.getActiveSessionByAccount(accountId);
  if (session) {
    session.auto_restart = enabled;
    if (hasMapId) session.map_id = mapId;
  }
  return {
    ok: true,
    enabled,
    map_id: Math.max(1, Math.floor(Number(player && (player.auto_battle_map_id || player.current_map_id)) || 1))
  };
}

export async function pollBattleSession({ accountId, query, deps }) {
  const bsc = deps.bsc;
  const engineApi = deps.engine || engine;
  const session = await bsc.getAnySessionByAccount(accountId);
  if (!session) {
    return { ok: true, active: false };
  }

  const nowMs = Date.now();
  const nowSecVal = Math.floor(nowMs / 1000);
  session.last_poll_at = nowSecVal;

  const arParam = query && query.auto_restart;
  if (arParam !== undefined) {
    const enabled = arParam === '1' || arParam === 'true';
    const prevEnabled = !!session.auto_restart;
    session.auto_restart = enabled;
    const mapForIntent = session.map_id || (session.state && session.state.player && session.state.player.current_map_id) || 1;
    if (prevEnabled !== enabled || _shouldPersistAutoIntent(session, enabled, mapForIntent)) {
      await deps.db.updatePlayerAutoBattleIntent(accountId, enabled, mapForIntent);
      _markAutoIntentPersisted(session, enabled, mapForIntent);
    }
  }

  // 惰性推进：server_driven 会话在 poll 时按时间推进
  if (session.status === 'active') {
    await advanceLazily({ bsc, engineApi, accountId, session, settleFn: deps.settleFn, nowMs });
  }

  if (session.status === 'active') {
    await bsc.updateSessionState(session.id, { expiresAt: nowSecVal + 900 });
  }

  const afterIdx = Math.max(0, Math.floor(Number(query && query.after) || 0));
  const eventWindow = await bsc.getEventWindowInfo(session.id);
  const evtRows = await bsc.listEventsSince(session.id, afterIdx, BATTLE_POLL_EVENT_LIMIT);
  const evts = evtRows.map((x) => ({
    index: Number(x.event_index) || 0,
    ...(x.event || {})
  }));
  const eventsReset = afterIdx > 0 && eventWindow.firstIndex > afterIdx + 1;
  session._poll_count = intVal(session._poll_count, 0) + 1;
  const shouldIncludeState = session.status === 'finished'
    || evts.length > 0
    || (session._poll_count % BATTLE_POLL_INCLUDE_STATE_EVERY) === 1;
  const stateForClient = shouldIncludeState ? engineApi.stateLite(session.state || {}) : null;

  if (session.status === 'finished') {
    const sd = session.result || {};
    const fullPlayer = (sd.settle_data && sd.settle_data.player) || sd.settle_player || null;
    return {
      ok: true,
      active: false,
      finished: true,
      battleId: session.id,
      victory: Boolean(sd.victory),
      draw: Boolean(sd.draw),
      rewards: (sd.settle_data && sd.settle_data.rewards) || sd.rewards || {},
      player: fullPlayer ? _buildPollPlayerLite(fullPlayer) : null,
      rest_remaining_sec: intVal((sd.settle_data && sd.settle_data.rest_remaining_sec) || sd.rest_remaining_sec, 0),
      state: stateForClient,
      events: evts,
      event_index: intVal(session.state && session.state.event_index, 0),
      events_reset: eventsReset,
      events_from: eventWindow.firstIndex || 0
    };
  }

  return {
    ok: true,
    active: true,
    battleId: session.id,
    state: stateForClient,
    events: evts,
    event_index: intVal(session.state && session.state.event_index, 0),
    events_reset: eventsReset,
    events_from: eventWindow.firstIndex || 0
  };
}
