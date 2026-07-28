// functions/api/cs/conversations/[id]/messages.js
// GET  /api/cs/conversations/:id/messages — 获取消息
// POST /api/cs/conversations/:id/messages — 发送消息（用户或客服）
import { json } from '../../../../_utils.js';
import { authenticate } from '../../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const convId = params.id;
  const conv = await env.DB.prepare("SELECT * FROM cs_conversations WHERE id = ?").bind(convId).first();
  if (!conv) return json({ error: '对话不存在' }, 404);
  const isOwner = conv.user_id === user.id;
  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.is_admin;
  if (!isOwner && !isAdmin) return json({ error: '无权限' }, 403);

  if (request.method === 'GET') {
    const msgs = await env.DB.prepare(
      "SELECT * FROM cs_messages WHERE conversation_id = ? ORDER BY id ASC"
    ).bind(convId).all();
    return json({ ok: true, messages: msgs.results });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { content } = body;
    if (!content) return json({ error: '消息不能为空' }, 400);

    const senderType = isAdmin ? 'admin' : 'user';
    await env.DB.prepare(
      "INSERT INTO cs_messages (conversation_id, sender_type, sender_id, sender_name, content, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).bind(convId, senderType, user.id, user.username, content).run();

    await env.DB.prepare(
      "UPDATE cs_conversations SET updated_at = datetime('now') WHERE id = ?"
    ).bind(convId).run();

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
