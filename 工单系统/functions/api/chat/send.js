// functions/api/chat/send.js — POST /api/chat/send
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const body = await request.json().catch(() => ({}));
    let { content } = body;
    content = (content || '').trim();

    if (!content) return json({ error: '消息不能为空' }, 400);
    if (content.length > 500) return json({ error: '消息最长500字' }, 400);

    const username = user.nickname || user.username || '道友';

    const result = await env.DB.prepare(
      "INSERT INTO chat_messages (user_id, username, content) VALUES (?, ?, ?)"
    ).bind(user.id, username, content).run();

    const msgId = result.meta?.last_row_id || 0;

    return json({ ok: true, message: '发送成功', id: msgId });
  }

  return json({ error: 'Method not allowed' }, 405);
}
