import { json } from '../../_utils.js';
import { authenticateApi } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'POST') {
    if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);
    const body = await request.json().catch(() => ({}));
    const { username } = body;
    if (!username) return json({ error: '缺少username' }, 400);

    const existing = await env.DB.prepare(
      'SELECT id FROM game_accounts WHERE username = ?'
    ).bind(username).first();

    return json({ ok: true, exists: !!existing });
  }

  return json({ error: 'Method not allowed' }, 405);
}
