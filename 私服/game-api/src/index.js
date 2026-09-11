/**
 * 艾德尔修仙传 私服 · game-api Worker
 * Cloudflare Workers + D1 全托管重建（Phase 3 迁移工程）
 *
 * 当前已实现：
 *   - POST /api/auth/register   注册（sha256+pepper 哈希，兼容原库）
 *   - POST /api/auth/login      登录（JWT HS256，7天）
 *   - GET  /api/player/sync     玩家存档读取（D1）
 *   - POST /api/player/create   创建角色（初始存档）
 *   - GET  /api/status          服务状态
 *
 * 迁移路线：本文件为骨架，业务路由按批次从 server/routes/* 迁移。
 * 详细迁移清单见 game-api/MIGRATION.md
 */
import { signToken, verifyToken } from './auth.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { createInitialPlayerData, enrichPlayer } from './player.js';
import { handleChatMessages, handleChatSend } from './chat.js';
import offlineEarnings from './game/offlineEarnings.js';
import { handleScheduled } from './game/cronHandler.js';
import { validateBody, RULES } from './validation.js';
import { rateLimit, RATE_LIMITS, ensureRateLimitTable } from './rateLimit.js';
import { ChatRoom } from './game/chatRoom.js';

// 导出 Durable Object 类
export { ChatRoom };
import { handlePlayerRoute } from './routes/player.js';
import { handleGameData } from './routes/gameData.js';
import { handleBattleRoute } from './routes/battle.js';
import { handleDungeonRoute } from './routes/dungeon.js';
import { handleExchangeRoute } from './routes/exchange.js';
import { handleMailRoute } from './routes/mail.js';
import { handleTrialRoute } from './routes/trial.js';
import { handleLeagueRoute } from './routes/league.js';
import { handleAllianceRoute } from './routes/alliance.js';
import { handleSectCoreRoute } from './routes/online/sectCoreRoutes.js';
import { handleSectTaskRoute } from './routes/online/sectTaskRoutes.js';
import { handleSectTreasuryRoute } from './routes/online/sectTreasuryRoutes.js';
import { handleBaiyiRoute } from './routes/online/baiyiRoutes.js';
import { handleCaveDiscipleRoute } from './routes/online/caveDiscipleRoutes.js';
import { handleInviteRoute } from './routes/invite.js';
import { handleEmailRoute } from './routes/email.js';
import { handleGmRoute } from './routes/gm.js';
import { handleAdminRoute } from './routes/admin.js';
import { handleApprenticeRoute } from './routes/apprentice.js';
import { handleDungeonBattleRoute } from './routes/dungeonBattle.js';
import { handleArenaRoute } from './routes/online/arenaRoutes.js';
import { handleBeastRoute } from './game/beastSystem.js';
import { handleSectWarRoute } from './game/sectWar.js';
import { handleAIRoute } from './game/aiRoutes.js';

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T',
  'Access-Control-Max-Age': '86400'
};

async function getIp(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  if (xff.trim()) return xff.split(',')[0].trim().replace(/^::ffff:/, '');
  return '';
}

function withCors(resp) {
  if (!resp) return resp;
  const h = new Headers(resp.headers);
  for (const k of ['Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers', 'Access-Control-Max-Age']) h.delete(k);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(resp.body, { status: resp.status, headers: h });
}

export default {
  // ── Cron Trigger 定时任务（联赛/擂台结算、数据清理）──
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // ── 维护模式：拒绝所有 API 请求 ──
    const MAINTENANCE = false;
    if (MAINTENANCE) {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api/, '') || '/';
      // 允许静态资源和状态检查
      if (path === '/status' || path === '/game-data') {
        // 放行
      } else {
        return json({ ok: false, error: '服务器维护中，请稍后再试', maintenance: true }, 503);
      }
    }

    // 首次请求时确保限流表存在
    ctx.waitUntil(ensureRateLimitTable(env.DB));

    const resp = await this._dispatch(request, env).catch((e) => {
      console.error('[dispatch]', e?.message || e);
      return json({ ok: false, error: 'Internal Error' }, 500);
    });
    return withCors(resp);
  },

  async _dispatch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 统一前缀 /api
    if (!path.startsWith('/api')) return json({ ok: false, error: 'Not Found' }, 404, CORS);
    let route = path.replace(/^\/api/, '');

    // 前缀归一化：前端洞府/宗门沿用 /online/cave、/online/sect、/online/city 旧路径，
    // 后端分发只认 /cave、/sect、/city（与百艺 /online/* 区分开），这里统一转换
    if (route.startsWith('/online/cave/')) route = '/cave' + route.slice('/online/cave'.length);
    else if (route.startsWith('/online/sect/')) route = '/sect' + route.slice('/online/sect'.length);
    else if (route === '/online/city/buy') route = '/city/buy';

    try {
      // ── 认证 ──
      if (route === '/auth/register' && request.method === 'POST') return handleRegister(request, env);
      if (route === '/auth/login' && request.method === 'POST') return handleLogin(request, env);
      if (route === '/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, CORS);
      if (route === '/auth/renew' && request.method === 'GET') return handleAuthRenew(request, env);

      // ── 玩家 ──
      if (route === '/player/sync' && request.method === 'GET') return handlePlayerSync(request, env);
      if (route === '/player/create' && request.method === 'POST') return handlePlayerCreate(request, env);

      // 核心玩法路由（复用原 playerOps 逻辑）：level_up/breakthrough/equip/unequip/use_item/skill/talent 等
      if (route.startsWith('/player/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handlePlayerRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 战斗（poll 惰性推进 + command 逐指令）──
      if (route.startsWith('/battle/') && (request.method === 'POST' || request.method === 'GET')) {
        // 战斗接口限流：每秒 5 次
        const rl = await rateLimit(request, env, RATE_LIMITS.battle);
        if (rl) return rl;
        const handled = await handleBattleRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 聊天（D1 持久化，前端 /chat/*）──
      if (route === '/chat/messages' && request.method === 'GET') return handleChatMessages(request, env);
      if (route === '/chat/send' && request.method === 'POST') return handleChatSend(request, env);

      // ── 聊天 WebSocket（Durable Object ChatRoom）──
      if (route === '/chat/ws' || route.startsWith('/chat/ws/')) {
        const channel = url.searchParams.get('channel') || 'world';
        const roomName = `chat-${channel}`;
        const roomId = env.ChatRoom.idFromName(roomName);
        const stub = env.ChatRoom.get(roomId);
        return stub.fetch(request);
      }
      if (route === '/chat/send-ws' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const channel = body.channel || 'world';
        const roomName = `chat-${channel}`;
        const roomId = env.ChatRoom.idFromName(roomName);
        const stub = env.ChatRoom.get(roomId);
        return stub.fetch(new Request(new URL(`/chat/send`, request.url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }));
      }
      if (route === '/chat/online') {
        const channel = url.searchParams.get('channel') || 'world';
        const roomName = `chat-${channel}`;
        const roomId = env.ChatRoom.idFromName(roomName);
        const stub = env.ChatRoom.get(roomId);
        return stub.fetch(new Request(new URL('/chat/online', request.url)));
      }

      // ── 副本（列表/怪物/组队/每日次数）──
      if (route.startsWith('/dungeon/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handleDungeonRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 交易所（坊市：挂单/求购/成交/撤单）──
      if (route.startsWith('/exchange/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handleExchangeRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 邮箱（列表/领取/一键领取/清理）──
      if (route.startsWith('/mail/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handleMailRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 试炼（契约/商店/开战/推进）──
      if (route.startsWith('/trial/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handleTrialRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 联赛（状态/报名/队伍/排行/商店/推进）──
      if (route.startsWith('/league/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handleLeagueRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 仙盟（创建/成员/建筑/商店）──
      if (route.startsWith('/alliance/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handleAllianceRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 宗门（拜入/任务/宝库）──
      if (route.startsWith('/sect/') && (request.method === 'POST' || request.method === 'GET')) {
        const handledCore = await handleSectCoreRoute(request, env, route);
        if (handledCore) return handledCore;
        const handledTask = await handleSectTaskRoute(request, env, route);
        if (handledTask) return handledTask;
        const handledTreasury = await handleSectTreasuryRoute(request, env, route);
        if (handledTreasury) return handledTreasury;
      }
      // 城中百宝阁（复用宗门宝库路由实现）
      if (route === '/city/buy' && request.method === 'POST') {
        const handled = await handleSectTreasuryRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 百艺（炼丹/炼器/刻阵/制物/兑换码）──
      if (route.startsWith('/online/') && request.method === 'POST') {
        const handled = await handleBaiyiRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 洞府（采集/阵形）──
      if (route.startsWith('/cave/') && (request.method === 'POST' || request.method === 'GET')) {
        const handled = await handleCaveDiscipleRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 邀请 / 邮箱 / 传人（弟子派遣）/ GM ──
      if (route.startsWith('/invite')) {
        const handled = await handleInviteRoute(request, env, route);
        if (handled) return handled;
      }
      if (route.startsWith('/email')) {
        const handled = await handleEmailRoute(request, env, route);
        if (handled) return handled;
      }
      if (route.startsWith('/apprentice')) {
        const handled = await handleApprenticeRoute(request, env, route);
        if (handled) return handled;
      }
      if (route.startsWith('/gm')) {
        const handled = await handleGmRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 管理员后台（需 JWT + is_admin）──
      if (route.startsWith('/admin')) {
        const handled = await handleAdminRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 城池斗法 / 副本战斗 ──
      if (route.startsWith('/dungeon-battle')) {
        const handled = await handleDungeonBattleRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 擂台赛 ──
      if (route.startsWith('/arena')) {
        const handled = await handleArenaRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 灵宠/妖兽 ──
      if (route.startsWith('/beast/')) {
        const rl = await rateLimit(request, env, RATE_LIMITS.beast);
        if (rl) return rl;
        const handled = await handleBeastRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 宗门战争 ──
      if (route.startsWith('/sect-war/')) {
        const rl = await rateLimit(request, env, RATE_LIMITS.sectwar);
        if (rl) return rl;
        const handled = await handleSectWarRoute(request, env, route);
        if (handled) return handled;
      }

      // ── AI玩家系统（仅管理员）──
      if (route.startsWith('/ai/')) {
        // 验证管理员权限
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        const payload = token ? await verifyToken(token, env) : null;
        if (!payload) return json({ ok: false, error: '未登录' }, 401);
        const acc = await env.DB.prepare('SELECT is_admin FROM accounts WHERE id = ?').bind(payload.accountId || payload.sub || 0).first();
        if (!acc || !Number(acc.is_admin || 0)) return json({ ok: false, error: '无管理员权限' }, 403);
        const handled = await handleAIRoute(request, env, route);
        if (handled) return handled;
      }

      // ── 状态 ──
      if (route === '/game-data' && request.method === 'GET') return handleGameData();
      if (route === '/status' && request.method === 'GET') {
        return json({ ok: true, boot_id: env.BOOT_ID || 'ideer-worker', uptime_sec: 0, db_driver: 'd1' }, 200, CORS);
      }

      return json({ ok: false, error: 'Not Found' }, 404, CORS);
    } catch (e) {
      console.error('[game-api]', route, e?.stack || e?.message || e);
      return json({ ok: false, error: '服务异常，请稍后重试', detail: String(e?.message || e) }, 500, CORS);
    }
  }
};

// ══════════════════════ 认证 ══════════════════════

async function handleRegister(request, env) {
  const v = await validateBody(request, {
    username: RULES.username,
    password: RULES.password,
  });
  if (!v.ok) return json({ ok: false, error: v.error }, 200, CORS);
  const { username, password, machine_id } = v.data;
  const machineId = String(machine_id || '').trim().slice(0, 128);

  const registerIp = await getIp(request);
  // IP 封禁检查
  if (registerIp) {
    const banned = await env.DB.prepare('SELECT 1 FROM ip_bans WHERE ip = ? LIMIT 1').bind(registerIp).first().catch(() => null);
    if (banned) return json({ ok: false, error: '该IP已被封禁，禁止注册' }, 200, CORS);
  }

  // 大小写不敏感查重
  const dup = await env.DB.prepare('SELECT id FROM accounts WHERE LOWER(username) = LOWER(?) LIMIT 1').bind(username).first().catch(() => null);
  if (dup) return json({ ok: false, error: '用户名已存在' }, 200, CORS);

  const hash = await hashPassword(password, env.PASSWORD_PEPPER || env.JWT_SECRET);
  const created = await env.DB.prepare(
    'INSERT INTO accounts (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).bind(username, hash, Math.floor(Date.now() / 1000)).run().catch((e) => {
    if (String(e?.message || '').includes('UNIQUE')) return null;
    throw e;
  });
  if (!created) return json({ ok: false, error: '用户名已存在' }, 200, CORS);
  const accountId = created.meta?.last_row_id || 0;

  if (machineId) {
    await env.DB.prepare('INSERT INTO machine_login_log (account_id, machine_id, created_at) VALUES (?, ?, ?)')
      .bind(accountId, machineId, Math.floor(Date.now() / 1000)).run().catch(() => {});
  }

  const token = await signToken(accountId, username, env);
  return json({ ok: true, token, accountId }, 200, CORS);
}

async function handleLogin(request, env) {
  const v = await validateBody(request, {
    username: RULES.username,
    password: RULES.password,
  });
  if (!v.ok) return json({ ok: false, error: v.error }, 200, CORS);
  const { username, password, machine_id } = v.data;

  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE username = ? LIMIT 1').bind(username).first().catch(() => null);
  if (!acc) return json({ ok: false, error: '用户名或密码错误' }, 200, CORS);

  const ok = await verifyPassword(password, acc.password_hash, env.PASSWORD_PEPPER || env.JWT_SECRET);
  if (!ok) return json({ ok: false, error: '用户名或密码错误' }, 200, CORS);

  const now = Math.floor(Date.now() / 1000);
  if (Number(acc.is_banned || 0) > 0) {
    const expiresAt = Number(acc.ban_expires_at || 0);
    if (!(expiresAt > 0 && expiresAt <= now)) {
      const reason = String(acc.ban_reason || '').trim();
      return json({ ok: false, error: reason ? `账号已封禁：${reason}` : '账号已封禁' }, 200, CORS);
    }
  }

  const machineId = String(machine_id || '').trim();
  if (machineId) {
    await env.DB.prepare('INSERT INTO machine_login_log (account_id, machine_id, created_at) VALUES (?, ?, ?)')
      .bind(acc.id, machineId, now).run().catch(() => {});
    await env.DB.prepare('UPDATE accounts SET last_machine_id = ? WHERE id = ?').bind(machineId, acc.id).run().catch(() => {});
  }

  const token = await signToken(acc.id, acc.username, env);
  return json({ ok: true, token, accountId: acc.id, isAdmin: !!Number(acc.is_admin || 0) }, 200, CORS);
}

// ══════════════════════ 玩家 ══════════════════════

async function getAuthAccount(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  const payload = await verifyToken(token, env);
  if (!payload) return null;
  return payload;
}

async function handlePlayerSync(request, env) {
  const auth = await getAuthAccount(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401, CORS);
  const accountId = auth.accountId || auth.sub || 0;

  // 查询失败与"确实无角色"必须区分：D1 偶发失败时绝不能返回 hasCharacter:false，
  // 否则前端会误以为没有角色而弹出创建页面（玩家反馈"角色创建页面突然弹出"）。
  async function fetchPlayerRow() {
    try {
      return await env.DB.prepare('SELECT * FROM players WHERE account_id = ? LIMIT 1').bind(accountId).first();
    } catch (e) {
      console.error('[sync] query players err', e?.message);
      return 'DB_ERR';
    }
  }
  let player = await fetchPlayerRow();
  if (player === 'DB_ERR') {
    // 重试一次，仍失败则返回错误让前端稍后重试，而不是误报"无角色"
    const retry = await fetchPlayerRow();
    if (retry === 'DB_ERR') return json({ ok: false, error: '服务器繁忙，请稍后重试' }, 503, CORS);
    player = retry;
  }
  if (!player) return json({ ok: true, hasCharacter: false, player: null }, 200, CORS);

  // ── 封禁心跳（A5 踢人机制）──
  // token 无过期后，封禁通过 sync 心跳即时生效（最多延迟一个轮询周期），返回 401 让前端登出
  try {
    const acc = await env.DB.prepare('SELECT is_banned, ban_reason, ban_expires_at FROM accounts WHERE id = ? LIMIT 1').bind(accountId).first();
    if (acc && Number(acc.is_banned || 0) > 0) {
      const expiresAt = Number(acc.ban_expires_at || 0);
      if (!(expiresAt > 0 && expiresAt <= Math.floor(Date.now() / 1000))) {
        const reason = String(acc.ban_reason || '').trim();
        return json({ ok: false, error: reason ? `账号已封禁：${reason}` : '账号已封禁' }, 401, CORS);
      }
    }
  } catch (e) {
    console.error('[sync] ban check err', e?.message);
  }

  // players 表用 JSON 列存储核心 data，这里重组为前端结构
  const data = mergePlayerData(player);

  // ── 离线挂机收益（B5 基准记账式）──
  // last_sync_at 记录上次同步时间；在线轮询间隔很短（<OFFLINE_MIN_SEC 秒）不结算，
  // 切后台/退出超过阈值则按"在线场均收益基准"结算离线经验/灵石（确定性强，不受战斗模拟影响）。
  const OFFLINE_MIN_SEC = 90;
  const now = Math.floor(Date.now() / 1000);
  const lastSync = Number(data.last_sync_at) || 0;
  let offline = null;
  if (lastSync > 0 && now - lastSync >= OFFLINE_MIN_SEC) {
    offline = offlineEarnings.settleOfflineEarnings(data, now - lastSync);
  }
  data.last_sync_at = now;

  // 有结算或首次初始化时间戳时写回，避免派生字段污染 DB（enrich 之后再写）
  if (offline || !lastSync) {
    try {
      await env.DB.prepare('UPDATE players SET data = ? WHERE id = ?').bind(JSON.stringify(data), player.id).run();
    } catch (e) {
      console.error('[sync] update err', e?.message);
    }
  }

  enrichPlayer(data);

  // 附加管理员标记
  try {
    const accRow = await env.DB.prepare('SELECT is_admin FROM accounts WHERE id = ?').bind(accountId).first();
    data.isAdmin = !!Number(accRow?.is_admin || 0);
  } catch { data.isAdmin = false; }

  return json({ ok: true, hasCharacter: true, player: data, offline }, 200, CORS);
}

/** 滑动续期：用当前有效 token 换取新的 7 天 token，避免用户长期不登录后过期掉线 */
async function handleAuthRenew(request, env) {
  const auth = await getAuthAccount(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401, CORS);
  const accountId = auth.accountId || auth.sub || 0;
  const username = auth.username || '';
  const token = await signToken(accountId, username, env);
  return json({ ok: true, token }, 200, CORS);
}

async function handlePlayerCreate(request, env) {
  const auth = await getAuthAccount(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401, CORS);
  const accountId = auth.accountId || auth.sub || 0;
  const body = await request.json().catch(() => ({}));
  const { name, spirit_roots, spirit_root_quality, spirit_root_variant } = body;

  if (!name || String(name).length < 2 || String(name).length > 12) {
    return json({ ok: false, error: '角色名 2-12 字符' }, 200, CORS);
  }
  const existing = await env.DB.prepare('SELECT id FROM players WHERE account_id = ? LIMIT 1').bind(accountId).first().catch(() => null);
  if (existing) return json({ ok: false, error: '已创建角色' }, 200, CORS);

  // 灵根随机（创建页预览回传合法数据则采用；非法/缺失则后端重新随机）
  const data = await createInitialPlayerData(name, { roots: spirit_roots, quality: spirit_root_quality, variant: spirit_root_variant }, env);
  const ts = Math.floor(Date.now() / 1000);
  const ins = await env.DB.prepare(
    'INSERT INTO players (account_id, slot, data, created_at) VALUES (?, 1, ?, ?)'
  ).bind(accountId, JSON.stringify(data), ts).run().catch((e) => {
    console.error('[player/create] insert err', e?.message);
    return null;
  });
  if (!ins) return json({ ok: false, error: '创建失败，请稍后重试' }, 200, CORS);

  const player = data;
  enrichPlayer(player);
  return json({ ok: true, player }, 200, CORS);
}

/** 将 players 行的 JSON 列合并为核心 data（初始版本只读 data 列，其余大字段后续批次补充） */
function mergePlayerData(row) {
  try {
    const core = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
    return core;
  } catch (e) {
    return {};
  }
}