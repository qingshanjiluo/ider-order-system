/**
 * 战斗路由（Worker 版）
 * 原 server/routes/battle.js 迁移。
 * - server_driven（poll 模式）：请求时惰性推进
 * - 逐指令（command 模式）：客户端逐条推进
 * - 与玩家写操作共用 D1 事务式读改写（每请求独立），天然避免并发覆盖。
 */

import * as engine from '../game/battleEngine.js';
import { createBattleCache } from '../game/battleSessionCache.js';
import { createDb } from '../db.js';
import { startBattleSession, setAutoRestartIntent, pollBattleSession, setBattleDataLoader } from '../game/battleSessionOrchestrator.js';
import { executeBattleCommand } from '../game/battleCommandService.js';
import { queryBattleState } from '../game/battleStateService.js';
import { finalizeBattle, setSettlementDb } from '../game/battleSettlementService.js';
import { getCommandDelay } from '../game/commandRateLimit.js';
import { clampRestUntil } from '../game/battleTiming.js';
import { isNightmareMap, applyNightmareEnemy, randomEnemyFromMap } from '../game/battleEncounterFactory.js';
import { consumeBattleStartTalisman, applyBattleStartTalisman } from '../game/battleStartEffectsService.js';
import { verifyToken } from '../auth.js';
import * as dataLoader from '../game/dataLoader.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T',
  'Access-Control-Max-Age': '86400'
};

const COMMAND_MAX_QUEUE_WAIT_MS = 120;
const BATTLE_START_MAX_QUEUE_WAIT_MS = 0;
const BATTLE_POLL_MIN_INTERVAL_MS = 120;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

async function getAuthAccount(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  return verifyToken(token, env);
}

function buildDeps(env) {
  const db = createDb(env);
  const bsc = createBattleCache(env);
  const settleFn = (session, state, outcome) => finalizeBattle(session, state, outcome);
  return { db, bsc, settleFn };
}

export async function handleBattleRoute(request, env, route) {
  const auth = await getAuthAccount(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = auth.accountId || auth.sub || 0;
  const method = request.method;
  const body = method === 'POST' ? await request.json().catch(() => ({})) : {};

  setBattleDataLoader(dataLoader.getSkillById);
  setSettlementDb(createDb(env));

  if (route === '/battle/start' && method === 'POST') {
    const _delay = env.COMMAND_DELAY_DISABLED ? 0 : getCommandDelay(accountId);
    if (_delay > BATTLE_START_MAX_QUEUE_WAIT_MS) {
      return json({ ok: false, error: '开始战斗过于频繁，请稍后重试', code: 'BATTLE_START_THROTTLED', retry_after_ms: _delay });
    }
    const deps = buildDeps(env);
    const resp = await startBattleSession({
      accountId,
      body,
      helpers: {
        randomEnemyFromMap,
        isNightmareMap,
        applyNightmareEnemy,
        clampRestUntil,
        consumeBattleStartTalisman,
        applyBattleStartTalisman
      },
      deps: {
        ...deps,
        engine,
        dataLoader
      }
    });
    return json(resp);
  }

  if (route === '/battle/auto_restart' && method === 'POST') {
    const deps = buildDeps(env);
    const resp = await setAutoRestartIntent({ accountId, body, deps });
    return json(resp);
  }

  if (route === '/battle/command' && method === 'POST') {
    const _delay = env.COMMAND_DELAY_DISABLED ? 0 : getCommandDelay(accountId);
    if (_delay > COMMAND_MAX_QUEUE_WAIT_MS) {
      return json({ ok: false, error: '操作过于频繁，服务器正在平峰，请稍后重试', code: 'COMMAND_THROTTLED', retry_after_ms: _delay });
    }
    if (_delay > 0) {
      await new Promise((r) => setTimeout(r, _delay));
    }
    const deps = buildDeps(env);
    const resp = await executeBattleCommand({
      accountId,
      body,
      deps: { ...deps, engine, finalizeBattle }
    });
    return json(resp);
  }

  // /battle/state/:battleId
  const stateMatch = route.match(/^\/battle\/state\/([^/]+)$/);
  if (stateMatch && method === 'GET') {
    const url = new URL(request.url);
    const deps = buildDeps(env);
    const resp = await queryBattleState({
      accountId,
      battleId: stateMatch[1],
      after: url.searchParams.get('after'),
      deps: { ...deps, engine }
    });
    return json(resp);
  }

  if (route === '/battle/poll' && method === 'GET') {
    const url = new URL(request.url);
    const query = Object.fromEntries(url.searchParams.entries());
    const deps = buildDeps(env);
    const resp = await pollBattleSession({ accountId, query, deps: { ...deps, engine } });
    return json(resp);
  }

  if (route === '/battle/result' && method === 'POST') {
    return json({ ok: false, error: '战斗协议已升级，请更新客户端', code: 'BATTLE_PROTOCOL_UPGRADE_REQUIRED', minVersion: '1.1.0' }, 426);
  }

  return null;
}