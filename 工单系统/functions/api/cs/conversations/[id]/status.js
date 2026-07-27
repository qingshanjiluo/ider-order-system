// functions/api/cs/conversations/[id]/status.js
// PUT /api/cs/conversations/:id/status — 关闭/重新打开对话
import { json } from '../../../../_utils.js';
import { authenticate } from '../../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const convId = params.id;
  const conv = await env.DB.prepare("SELECT * FROM cs_conversations WHERE id = ?").bind(convId).first();
  if (!conv) return json({ error: '对话不存在' }, 404);

  const isOwner = conv.user_id === user.id;
  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.is_admin;
  if (!isOwner && !isAdmin) return json({ error: '无权限' }, 403);

  const body = await request.json().catch(() => ({}));
  const newStatus = body.status;
  if (!newStatus || !['open', 'closed'].includes(newStatus)) return json({ error: '状态无效' }, 400);

  await env.DB.prepare("UPDATE cs_conversations SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(newStatus, convId).run();
  return json({ ok: true, status: newStatus });
}
