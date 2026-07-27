// functions/api/cs/conversations/[id]/refund.js
// POST /api/cs/conversations/:id/refund — 客服提交退款申请
import { json } from '../../../../_utils.js';
import { authenticate } from '../../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.is_admin;
  if (!isAdmin) return json({ error: '仅客服可操作退款' }, 403);

  const convId = params.id;
  const conv = await env.DB.prepare("SELECT * FROM cs_conversations WHERE id = ?").bind(convId).first();
  if (!conv) return json({ error: '对话不存在' }, 404);

  const body = await request.json().catch(() => ({}));
  const { order_id, amount, reason } = body;
  if (!order_id || !amount || !reason) return json({ error: '缺少必要参数' }, 400);

  // 验证工单属于该用户
  const order = await env.DB.prepare("SELECT id, user_id, status FROM orders WHERE id = ?").bind(order_id).first();
  if (!order) return json({ error: '工单不存在' }, 404);
  if (order.user_id !== conv.user_id) return json({ error: '工单不属于该用户' }, 400);

  await env.DB.prepare(
    "INSERT INTO refund_requests (conversation_id, order_id, user_id, amount, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))"
  ).bind(convId, order_id, conv.user_id, amount, reason).run();

  // 客服消息：通知用户已提交退款申请
  await env.DB.prepare(
    "INSERT INTO cs_messages (conversation_id, sender_type, sender_id, sender_name, content, created_at) VALUES (?, 'admin', ?, ?, ?, datetime('now'))"
  ).bind(convId, user.id, user.username,
    '💰 已提交退款申请：退还 ' + amount + ' 修仙币。原因：' + reason + '。请等待审核。').run();

  await env.DB.prepare("UPDATE cs_conversations SET updated_at = datetime('now') WHERE id = ?").bind(convId).run();

  return json({ ok: true, message: '退款申请已提交' });
}
