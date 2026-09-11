/**
 * GM 管理路由（Worker 版）
 * 迁移自 server/routes/gm.js，所有接口需 X-GM-Token 鉴权（env.GM_TOOL_TOKEN）。
 */
import { createDb } from '../db.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handleGmRoute(request, env, route) {
  if (!route.startsWith('/gm')) return null;

  const gmToken = String(env.GM_TOOL_TOKEN || '').trim();
  if (!gmToken) return json({ ok: false, error: 'GM 功能未启用（未配置 GM_TOOL_TOKEN）' }, 503);

  const token = String(request.headers.get('x-gm-token') || '').trim();
  if (!token || token !== gmToken) return json({ ok: false, error: 'GM Token 无效' }, 403);

  const db = createDb(env);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  // POST /gm/unban - 解封账号
  if (route === '/gm/unban' && request.method === 'POST') {
    try {
      const { username } = body;
      if (!username) return json({ ok: false, error: '缺少用户名' });
      const acc = await db.getAccountByUsername(username);
      if (!acc) return json({ ok: false, error: '账号不存在' });
      const aid = Number(acc.id);
      await env.DB.prepare('UPDATE accounts SET is_banned = 0, ban_reason = \'\', banned_at = 0, ban_expires_at = 0 WHERE id = ?').bind(aid).run().catch(() => {});
      return json({ ok: true, message: `账号 ${username} 已解封` });
    } catch (e) {
      console.error('[gm/unban] error:', e?.message || e);
      return json({ ok: false, error: '解封失败: ' + (e?.message || e) }, 500);
    }
  }

  // POST /gm/ban - 封禁账号
  if (route === '/gm/ban' && request.method === 'POST') {
    try {
      const { username, reason, expiresAt } = body;
      if (!username) return json({ ok: false, error: '缺少用户名' });
      const acc = await db.getAccountByUsername(username);
      if (!acc) return json({ ok: false, error: '账号不存在' });
      const aid = Number(acc.id);
      await db.setAccountBanned(aid, Number(expiresAt) || 0, reason || 'GM 操作');
      return json({ ok: true, message: `账号 ${username} 已封禁` });
    } catch (e) {
      console.error('[gm/ban] error:', e?.message || e);
      return json({ ok: false, error: '封禁失败: ' + (e?.message || e) }, 500);
    }
  }

  // GET /gm/status - 查询账号状态
  if (route === '/gm/status' && request.method === 'GET') {
    try {
      const username = String(request.url.includes('?') ? new URL(request.url).searchParams.get('username') || '' : '').trim();
      if (!username) return json({ ok: false, error: '缺少用户名' });
      const acc = await db.getAccountByUsername(username);
      if (!acc) return json({ ok: false, error: '账号不存在' });
      return json({
        ok: true,
        data: {
          id: acc.id,
          username: acc.username,
          is_banned: Number(acc.is_banned || 0) > 0,
          ban_reason: acc.ban_reason || '',
          banned_at: Number(acc.banned_at || 0),
          ban_expires_at: Number(acc.ban_expires_at || 0),
          machine_share_ban_count: Number(acc.machine_share_ban_count || 0)
        }
      });
    } catch (e) {
      console.error('[gm/status] error:', e?.message || e);
      return json({ ok: false, error: '查询失败' }, 500);
    }
  }

  return null;
}