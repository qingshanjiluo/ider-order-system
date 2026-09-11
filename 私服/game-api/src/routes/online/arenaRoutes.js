/**
 * 擂台赛路由
 * GET  /arena/info        赛事信息
 * POST /arena/register    报名
 * POST /arena/start       开始对战
 * POST /arena/settle      结算对战
 * GET  /arena/history     历史战绩
 */
import { createDb } from '../../db.js';
import { verifyToken } from '../../auth.js';
import { createArenaTournament } from '../../game/arenaTournament.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleArenaRoute(request, env, route) {
  const auth = await verifyToken(request, env);
  if (auth.error) return json({ ok: false, error: auth.error }, 401);
  const accountId = auth.accountId;
  const db = createDb(env);
  const url = new URL(request.url);
  const method = request.method;

  const subPath = route.slice('/arena'.length) || '/';
  if (subPath === '/info' && method === 'GET') return handleArenaInfo(db, accountId, request, url, env);
  if (subPath === '/register' && method === 'POST') return handleArenaRegister(db, accountId, request, url, env);
  if (subPath === '/start' && method === 'POST') return handleArenaStart(db, accountId, request, url, env);
  if (subPath === '/settle' && method === 'POST') return handleArenaSettle(db, accountId, request, url, env);
  if (subPath === '/history' && method === 'GET') return handleArenaHistory(db, accountId, request, url, env);
  return null;
}

async function handleArenaInfo(db, accountId, request, url, env) {
  const arena = createArenaTournament(env);
  return json(await arena.getTournamentInfo(accountId));
}

async function handleArenaRegister(db, accountId, request, url, env) {
  const arena = createArenaTournament(env);
  return json(await arena.register(accountId));
}

async function handleArenaStart(db, accountId, request, url, env) {
  const body = await request.json().catch(() => ({}));
  const arena = createArenaTournament(env);
  return json(await arena.startMatch(accountId, body?.bracket_round, body?.bracket_match_index));
}

async function handleArenaSettle(db, accountId, request, url, env) {
  const body = await request.json().catch(() => ({}));
  const arena = createArenaTournament(env);
  return json(await arena.settleMatch(accountId, body?.bracket_round, body?.bracket_match_index, body?.winner_id));
}

async function handleArenaHistory(db, accountId, request, url, env) {
  const arena = createArenaTournament(env);
  return json(await arena.getHistory());
}
