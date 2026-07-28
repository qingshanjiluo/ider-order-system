// functions/api/chat/messages.js — GET /api/chat/messages
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const messages = await env.DB.prepare(
      'SELECT id, user_id, username, content, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 50'
    ).all();

    return json({ ok: true, messages: (messages.results || []).reverse() });
  }

  return json({ error: 'Method not allowed' }, 405);
}
