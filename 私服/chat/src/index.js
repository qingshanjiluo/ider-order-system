/**
 * 艾德尔修仙传 私服 · 聊天网关 Worker
 *
 * 反代模式：前端统一连本 Worker，Worker 转发到游戏后端 /chat 接口。
 * 原游戏后端负责认证、仙盟校验、用户名、限流（数据源唯一）。
 *
 * 路由（透传到 GAME_ORIGIN）：
 *   GET  /api/chat/messages?channel=&since=&alliance_id=
 *   POST /api/chat/send            { channel, text }
 *
 * 可选：CHAT_MODE=proxy（默认）或 standalone（D1 独立存储）
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS ──
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!path.startsWith('/api/chat')) {
      return json({ ok: false, error: 'Not Found' }, 404, corsHeaders);
    }

    const mode = (env.CHAT_MODE || 'proxy').toLowerCase();
    if (mode === 'standalone') {
      return handleStandalone(request, env, url);
    }

    // ── 反代模式：透传原样请求到游戏 server ──
    const gameOrigin = (env.GAME_ORIGIN || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    // /api/chat/* -> /chat/*（原 server 挂在 /chat）
    const targetPath = path.replace(/^\/api\/chat/, '/chat');
    const targetUrl = gameOrigin + targetPath + url.search;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('Origin', gameOrigin);

    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
    });

    try {
      const res = await fetch(proxyReq);
      const newRes = new Response(res.body, res);
      for (const [k, v] of Object.entries(corsHeaders)) newRes.headers.set(k, v);
      return newRes;
    } catch (e) {
      return json({ ok: false, error: '聊天服务暂不可用，请稍后再试', detail: e.message }, 502, corsHeaders);
    }
  }
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}

function intVal(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : def;
}

/**
 * standalone 模式：D1 独立存储（不依赖原游戏 server）
 * 注意：此模式下无法校验仙盟归属/真实用户名，仅适合公共聊天室场景。
 */
async function handleStandalone(request, env, url) {
  const path = url.pathname;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (path === '/api/chat/messages' && request.method === 'GET') {
    const channel = String(url.searchParams.get('channel') || 'global').trim();
    const since = intVal(url.searchParams.get('since'), 0);
    const limit = 80;
    let stmt, params;
    if (since > 0) {
      stmt = `SELECT id, channel, account_id, username, text, ts FROM chat_messages WHERE channel = ? AND id > ? ORDER BY id ASC LIMIT ?`;
      params = [channel, since, limit];
    } else {
      stmt = `SELECT id, channel, account_id, username, text, ts FROM chat_messages WHERE channel = ? ORDER BY id DESC LIMIT ?`;
      params = [channel, limit];
    }
    const r = await env.DB.prepare(stmt).bind(...params).all();
    const messages = since > 0 ? r.results : r.results.reverse();
    return json({ ok: true, messages }, 200, cors);
  }

  if (path === '/api/chat/send' && request.method === 'POST') {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json({ ok: false, error: '未登录' }, 401, cors);

    const body = await request.json().catch(() => ({}));
    const channel = String(body.channel || 'global').trim();
    const text = String(body.text || '').trim().slice(0, 40);
    if (!text) return json({ ok: false, error: '消息不能为空' }, 200, cors);

    // 简单用户标识：JWT 校验（需要 JWT_SECRET）
    let username = '游客';
    let accountId = 0;
    try {
      const payload = await verifyJwt(env.JWT_SECRET, token);
      if (payload) {
        accountId = payload.accountId || payload.sub || payload.account_id || 0;
        const acc = await env.DB.prepare('SELECT username FROM accounts WHERE id = ? LIMIT 1').bind(accountId).first();
        username = acc?.username || '修仙者';
      } else {
        return json({ ok: false, error: '未登录' }, 401, cors);
      }
    } catch (e) {
      return json({ ok: false, error: '未登录' }, 401, cors);
    }

    const ts = Math.floor(Date.now() / 1000);
    const ins = await env.DB.prepare(
      'INSERT INTO chat_messages (channel, account_id, username, text, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(channel, accountId, username, text, ts).run();
    const msg = { id: ins.meta?.last_row_id || 0, channel, account_id: accountId, username, text, ts };
    return json({ ok: true, msg }, 200, cors);
  }

  return json({ ok: false, error: 'Not Found' }, 404, cors);
}

function verifyJwt(secret, token) {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const data = `${h}.${p}`;
    const enc = new TextEncoder();
    const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const keyPromise = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return keyPromise.then(k => crypto.subtle.verify('HMAC', k, sig, enc.encode(data))).then(ok => {
      if (!ok) return null;
      const pad = p.length % 4 ? 4 - (p.length % 4) : 0;
      return JSON.parse(atob(p + '='.repeat(pad)).replace(/\\u[0-9a-fA-F]{4}/g, m => String.fromCharCode(parseInt(m.slice(2), 16))));
    });
  } catch (e) { return null; }
}