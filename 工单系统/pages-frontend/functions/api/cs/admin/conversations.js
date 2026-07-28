// functions/api/cs/admin/conversations.js
// GET /api/cs/admin/conversations — 客服对话列表（管理端）
import { json } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user || !(user.role === 'admin' || user.role === 'super_admin' || user.is_admin))
    return json({ error: '无权限' }, 403);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';

  let query = `
    SELECT c.*, u.username as user_name,
      (SELECT content FROM cs_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_msg,
      (SELECT count(*) FROM cs_messages WHERE conversation_id = c.id AND sender_type = 'user' AND id > COALESCE((SELECT max(id) FROM cs_messages WHERE conversation_id = c.id AND sender_type = 'admin'), 0)) as unread
    FROM cs_conversations c JOIN users u ON c.user_id = u.id`;
  const params = [];
  if (status) { query += ' WHERE c.status = ?'; params.push(status); }
  query += ' ORDER BY c.updated_at DESC';

  const convs = await env.DB.prepare(query).bind(...params).all();
  return json({ ok: true, conversations: convs.results });
}
