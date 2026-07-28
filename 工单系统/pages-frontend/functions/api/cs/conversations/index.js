// functions/api/cs/conversations/index.js
// GET  /api/cs/conversations — 当前用户的对话列表
// POST /api/cs/conversations — 创建新对话
import { json } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  if (request.method === 'GET') {
    const convs = await env.DB.prepare(
      `SELECT c.*, o.order_type, o.status as order_status,
        (SELECT content FROM cs_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_msg,
        (SELECT count(*) FROM cs_messages WHERE conversation_id = c.id AND sender_type != 'user') as unread_admin
       FROM cs_conversations c LEFT JOIN orders o ON c.order_id = o.id
       WHERE c.user_id = ? ORDER BY c.updated_at DESC`
    ).bind(user.id).all();
    return json({ ok: true, conversations: convs.results });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { subject, order_id, message } = body;
    if (!subject || !message) return json({ error: '缺少标题或消息内容' }, 400);

    const result = await env.DB.prepare(
      "INSERT INTO cs_conversations (user_id, order_id, subject, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
    ).bind(user.id, order_id || null, subject).run();
    const convId = result.meta?.last_row_id;

    await env.DB.prepare(
      "INSERT INTO cs_messages (conversation_id, sender_type, sender_id, sender_name, content, created_at) VALUES (?, 'user', ?, ?, ?, datetime('now'))"
    ).bind(convId, user.id, user.username, message).run();

    return json({ ok: true, conversation_id: convId });
  }

  return json({ error: 'Method not allowed' }, 405);
}
