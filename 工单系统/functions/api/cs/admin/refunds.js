// functions/api/cs/admin/refunds.js
// GET /api/cs/admin/refunds — 退款列表
import { json } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const user = await authenticate(request, env);
  if (!user || !(user.role === 'admin' || user.role === 'super_admin' || user.is_admin))
    return json({ error: '无权限' }, 403);

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    let query = `
      SELECT r.*, u.username as user_name, o.order_type, o.amount as order_amount,
        (SELECT content FROM cs_messages WHERE conversation_id = r.conversation_id ORDER BY id DESC LIMIT 1) as last_msg
      FROM refund_requests r
      JOIN users u ON r.user_id = u.id
      JOIN orders o ON r.order_id = o.id`;
    const params = [];
    if (status) { query += ' WHERE r.status = ?'; params.push(status); }
    query += ' ORDER BY r.created_at DESC';
    const refunds = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, refunds: refunds.results });
  }

  return json({ error: 'Method not allowed' }, 405);
}
