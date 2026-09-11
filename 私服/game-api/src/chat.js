/**
 * 聊天路由（D1 持久化版）
 * 迁移自 server/routes/chat.js：原为内存数组，此处改用 D1 chat_messages 表。
 * 规则保持：每人 2 秒 1 条、5 条触发禁言 30 秒、文本上限 200 字。
 */
import { verifyToken } from './auth.js';
import { validateBody, RULES } from './validation.js';

const COOLDOWN_SEC = 2;
const SPAM_THRESHOLD = 5;
const MUTE_SEC = 30;
const MAX_TEXT_LEN = 200;

function intVal(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : def;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T',
  'Access-Control-Max-Age': '86400'
};

async function getAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  return verifyToken(token, env);
}

// GET /chat/messages?channel=&since=&alliance_id=
export async function handleChatMessages(request, env) {
  const url = new URL(request.url);
  const channel = String(url.searchParams.get('channel') || 'global').trim();
  const since = intVal(url.searchParams.get('since'), 0);
  const allianceId = intVal(url.searchParams.get('alliance_id'), 0);

  let stmt, params;
  if (channel === 'alliance') {
    if (allianceId <= 0) return json({ ok: true, messages: [] }, 200, CORS);
    if (since > 0) {
      stmt = `SELECT id, channel, alliance_id, account_id, username, text, ts
              FROM chat_messages WHERE channel='alliance' AND alliance_id=? AND id>?
              ORDER BY id ASC LIMIT 200`;
      params = [allianceId, since];
    } else {
      stmt = `SELECT id, channel, alliance_id, account_id, username, text, ts
              FROM chat_messages WHERE channel='alliance' AND alliance_id=?
              ORDER BY id DESC LIMIT 80`;
      params = [allianceId];
    }
  } else {
    if (since > 0) {
      stmt = `SELECT id, channel, alliance_id, account_id, username, text, ts
              FROM chat_messages WHERE channel='global' AND id>?
              ORDER BY id ASC LIMIT 200`;
      params = [since];
    } else {
      stmt = `SELECT id, channel, alliance_id, account_id, username, text, ts
              FROM chat_messages WHERE channel='global'
              ORDER BY id DESC LIMIT 80`;
      params = [];
    }
  }

  const r = await env.DB.prepare(stmt).bind(...params).all();
  let messages = r.results || [];
  // 无 since 时倒序取回，需反转为时间正序
  if (since <= 0) messages = messages.reverse();
  return json({ ok: true, messages }, 200, CORS);
}

// POST /chat/send { channel, text }
export async function handleChatSend(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401, CORS);
  const accountId = auth.accountId || auth.sub || 0;

  const v = await validateBody(request, {
    channel: RULES.channel,
    text: RULES.chatText,
  });
  if (!v.ok) return json({ ok: false, error: v.error }, 200, CORS);
  const { channel: rawChannel, text: rawText } = v.data;

  // 频道归一化：前端世界频道传 'world'，统一落库为 'global'（与查询分支一致）
  const channel = rawChannel === 'alliance' ? 'alliance' : 'global';
  let text = String(rawText || '').trim().slice(0, MAX_TEXT_LEN);
  if (!text) return json({ ok: false, error: '消息不能为空' }, 200, CORS);

  // 玩家存在性校验 + 取角色名（聊天显示用角色名，与前端乐观回显一致，避免“闪一下变注册名”）
  const player = await env.DB.prepare('SELECT id, data FROM players WHERE account_id=? LIMIT 1').bind(accountId).first().catch(() => null);
  if (!player) return json({ ok: false, error: '无角色数据' }, 200, CORS);
  let pname = '';
  try { pname = String((JSON.parse(player.data || '{}').name) || '').trim(); } catch (e) {}
  const acc = await env.DB.prepare('SELECT username FROM accounts WHERE id=? LIMIT 1').bind(accountId).first().catch(() => null);
  const username = pname || acc?.username || '?';

  // 限流：基于 D1 查最近发送记录（每账号）
  const rl = await checkRateLimit(env, accountId);
  if (!rl.ok) return json({ ok: false, error: rl.error }, 200, CORS);

  const allianceId = channel === 'alliance' ? intVal(body.alliance_id, 0) : 0;
  const ts = Math.floor(Date.now() / 1000);
  const ins = await env.DB.prepare(
    'INSERT INTO chat_messages (channel, alliance_id, account_id, username, text, ts) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(channel, allianceId, accountId, username, text, ts).run();
  const msg = { id: ins.meta?.last_row_id || 0, channel, alliance_id: allianceId, account_id: accountId, username, text, ts };
  return json({ ok: true, msg }, 200, CORS);
}

/**
 * 限流：统计该账号最近 10 秒发送条数，超过阈值禁言。
 * 简化实现（原内存 Map → D1 查询），跨请求可见。
 */
async function checkRateLimit(env, accountId) {
  const now = Math.floor(Date.now() / 1000);
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS cnt, MAX(ts) AS last_ts FROM chat_messages WHERE account_id=? AND ts>?'
  ).bind(accountId, now - COOLDOWN_SEC).first().catch(() => null);

  const cnt = intVal(recent?.cnt, 0);
  const lastTs = intVal(recent?.last_ts, 0);

  if (now - lastTs < COOLDOWN_SEC && cnt >= SPAM_THRESHOLD) {
    return { ok: false, error: `发送过快，禁言 ${MUTE_SEC} 秒` };
  }
  if (cnt >= SPAM_THRESHOLD) {
    return { ok: false, error: `发送过快，禁言 ${MUTE_SEC} 秒` };
  }
  if (now - lastTs < COOLDOWN_SEC) {
    return { ok: false, error: `请稍后再发（每 ${COOLDOWN_SEC} 秒 1 条）` };
  }
  return { ok: true };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}