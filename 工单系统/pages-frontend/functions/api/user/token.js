// GET/POST /api/user/token — 用户 Token 管理
import { json, generateToken } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  if (request.method === 'GET') {
    const auth = request.headers.get('Authorization') || '';
    const currentToken = auth.replace('Bearer ', '');
    return json({ ok: true, token: currentToken });
  }

  if (request.method === 'POST') {
    const auth = request.headers.get('Authorization') || '';
    const oldToken = auth.replace('Bearer ', '');

    const newToken = generateToken();
    const expires = new Date(Date.now() + 7 * 86400000).toISOString();

    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(oldToken).run();
    await env.DB.prepare(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
    ).bind(user.id, newToken, expires).run();

    return json({ ok: true, token: newToken, message: 'Token 已重新生成，旧 Token 已失效' });
  }

  return json({ error: 'Method not allowed' }, 405);
}
