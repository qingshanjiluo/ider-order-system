/**
 * 联赛 API（Worker 版）
 * 迁移自 server/routes/league.js。
 * 依赖：createLeagueSystem(env)（内部使用 createDb(env) 的异步方法）。
 * 说明：原 route 依赖 settlementLock（进程内写锁）与路由级内存缓存，
 *       本版本省略两者（联赛系统内部保留 _leagueSettleRunning 防重入锁与模块级缓存）。
 */
import { verifyToken } from '../auth.js';
import { createLeagueSystem } from '../game/leagueSystem.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function normalizeToken(v) {
  return String(v || '').trim();
}

function ensureGmToken(request, env) {
  const cfgToken = normalizeToken(env.GM_TOOL_TOKEN);
  if (!cfgToken) {
    return { ok: false, status: 503, body: { ok: false, error: 'GM_TOOL_TOKEN 未配置' } };
  }
  const headerToken = normalizeToken(request.headers.get('x-gm-token'));
  if (!headerToken || headerToken !== cfgToken) {
    return { ok: false, status: 403, body: { ok: false, error: '无权限' } };
  }
  return { ok: true };
}

export async function handleLeagueRoute(request, env, route) {
  const method = request.method;
  const url = new URL(request.url);
  const subPath = route.replace(/^\/league/, '') || '/';

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = Number(auth.accountId || auth.sub || 0);

  const league = createLeagueSystem(env);
  const now = Math.floor(Date.now() / 1000);

  if (subPath === '/status' && method === 'GET') return handleStatus(league, now, accountId);
  if (subPath === '/team/create' && method === 'POST') return handleTeamCreate(league, now, accountId, request);
  if (subPath === '/team/join' && method === 'POST') return handleTeamJoin(league, now, accountId, request);
  if (subPath === '/team/leave' && method === 'POST') return handleTeamLeave(league, now, accountId);
  if (subPath === '/register' && method === 'POST') return handleRegister(league, now, accountId, request);
  if (subPath === '/register/cancel_solo' && method === 'POST') return handleCancelSolo(league, now, accountId);
  if (subPath === '/register/cancel_team' && method === 'POST') return handleCancelTeam(league, now, accountId);
  if (subPath === '/team/skills' && method === 'POST') return handleTeamSkills(league, now, accountId, request);
  if (subPath === '/leaderboard' && method === 'GET') return handleLeaderboard(league, url);
  if (subPath === '/team_rank' && method === 'GET') return handleTeamRank(league, url, accountId);
  if (subPath === '/matches' && method === 'GET') return handleMatches(league, url, accountId);
  if (subPath === '/shop' && method === 'GET') return handleShop(league, accountId);
  if (subPath === '/shop/buy' && method === 'POST') return handleShopBuy(league, accountId, request);
  if (subPath === '/run_due' && method === 'POST') return handleRunDue(league, now, request, env);

  return null;
}

async function handleStatus(league, now, accountId) {
  try {
    const data = await league.getSeasonStatusAsync(now, accountId);
    return json({ ok: true, ...data });
  } catch (e) {
    console.error('[league/status] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '获取联赛状态失败' }, 500);
  }
}

async function handleTeamCreate(league, now, accountId, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '');
    const r = await league.createManualTeam(accountId, name, now);
    return json(r);
  } catch (e) {
    console.error('[league/team/create] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '创建联赛队伍失败' }, 500);
  }
}

async function handleTeamJoin(league, now, accountId, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const teamCode = String(body?.team_code || '').trim().toUpperCase();
    const r = await league.joinTeam(accountId, teamCode, now);
    return json(r);
  } catch (e) {
    console.error('[league/team/join] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '加入联赛队伍失败' }, 500);
  }
}

async function handleTeamLeave(league, now, accountId) {
  try {
    const r = await league.leaveRegistrationTeam(accountId, now);
    return json(r);
  } catch (e) {
    console.error('[league/team/leave] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '退出联赛队伍失败' }, 500);
  }
}

async function handleRegister(league, now, accountId, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = String(body?.mode || 'team').toLowerCase();
    let r;
    if (mode === 'system' || mode === 'solo' || mode === 'random') {
      r = await league.registerSolo(accountId, now);
    } else {
      r = await league.registerExistingTeam(accountId, now);
    }
    return json(r);
  } catch (e) {
    console.error('[league/register] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '联赛报名失败' }, 500);
  }
}

async function handleCancelSolo(league, now, accountId) {
  try {
    const r = await league.cancelSoloRegistration(accountId, now);
    return json(r);
  } catch (e) {
    console.error('[league/register/cancel_solo] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '取消单人匹配失败' }, 500);
  }
}

async function handleCancelTeam(league, now, accountId) {
  try {
    const r = await league.cancelTeamRegistration(accountId, now);
    return json(r);
  } catch (e) {
    console.error('[league/register/cancel_team] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '取消队伍报名失败' }, 500);
  }
}

async function handleTeamSkills(league, now, accountId, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const memberAccountId = intVal(body?.member_account_id, 0);
    const equippedSkills = Array.isArray(body?.equipped_skills) ? body.equipped_skills : [];
    const keySkillId = intVal(body?.key_skill_id, 0);
    const r = await league.setTeamSkillConfig(accountId, memberAccountId, equippedSkills, keySkillId, now);
    return json(r);
  } catch (e) {
    console.error('[league/team/skills] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '调整联赛技能组失败' }, 500);
  }
}

async function handleLeaderboard(league, url) {
  try {
    const limit = intVal(url.searchParams.get('limit'), 100);
    const list = await league.listLeaderboardAsync(limit);
    return json({ ok: true, list });
  } catch (e) {
    console.error('[league/leaderboard] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '获取联赛排行榜失败' }, 500);
  }
}

async function handleTeamRank(league, url, accountId) {
  try {
    const weekStart = intVal(url.searchParams.get('week_start'), intVal(url.searchParams.get('season_id'), 0));
    const limit = intVal(url.searchParams.get('limit'), 100);
    const r = await league.listWeekTeamRankAsync(weekStart, limit, accountId);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('[league/team_rank] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '获取联赛队伍排行失败' }, 500);
  }
}

async function handleMatches(league, url, accountId) {
  try {
    const weekStart = intVal(url.searchParams.get('week_start'), intVal(url.searchParams.get('season_id'), 0));
    const limit = intVal(url.searchParams.get('limit'), 50);
    const r = await league.listMyMatchesAsync(accountId, weekStart, limit);
    return json({ ok: true, ...r, scope: 'self_team_only' });
  } catch (e) {
    console.error('[league/matches] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '获取联赛战报失败' }, 500);
  }
}

async function handleShop(league, accountId) {
  try {
    const r = await league.listShopGoodsAsync(accountId);
    return json(r);
  } catch (e) {
    console.error('[league/shop] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '获取联赛商店失败' }, 500);
  }
}

async function handleShopBuy(league, accountId, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemId = String(body?.item_id || '').trim();
    const quantity = intVal(body?.quantity, 1);
    const r = await league.buyShopItem(accountId, itemId, quantity);
    return json(r);
  } catch (e) {
    console.error('[league/shop/buy] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '购买联赛商店商品失败' }, 500);
  }
}

async function handleRunDue(league, now, request, env) {
  try {
    const gm = ensureGmToken(request, env);
    if (!gm.ok) return json(gm.body, gm.status);
    const r = await league.tryRunDueLeagueWork(now);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('[league/run_due] error:', e?.message || e, e?.stack);
    return json({ ok: false, error: '联赛推进失败' }, 500);
  }
}