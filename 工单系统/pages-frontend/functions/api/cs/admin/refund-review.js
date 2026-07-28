// functions/api/cs/admin/refund-review.js
// POST /api/cs/admin/refund-review — 审核退款申请（通过/拒绝）
import { json, logActivity } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user || !(user.role === 'admin' || user.role === 'super_admin' || user.is_admin))
    return json({ error: '无权限' }, 403);

  const body = await request.json().catch(() => ({}));
  const { refund_id, action, admin_note } = body;
  if (!refund_id || !action || !['approved', 'rejected'].includes(action))
    return json({ error: '参数无效' }, 400);

  const refund = await env.DB.prepare("SELECT * FROM refund_requests WHERE id = ?").bind(refund_id).first();
  if (!refund) return json({ error: '退款申请不存在' }, 404);
  if (refund.status !== 'pending') return json({ error: '该申请已处理' }, 400);

  await env.DB.prepare(
    "UPDATE refund_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ? WHERE id = ?"
  ).bind(action, user.id, admin_note || '', refund_id).run();

  if (action === 'approved') {
    // 退还冻结修仙币（优先退 bonus_points）
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(refund.order_id).first();
    if (order && order.frozen_points > 0) {
      await env.DB.prepare("UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?").bind(order.frozen_points, order.user_id).run();
      await env.DB.prepare("UPDATE orders SET frozen_points = 0 WHERE id = ?").bind(order.id).run();
    }
    // 也退 amount（如果已花掉的积分）
    if (refund.amount > 0) {
      await env.DB.prepare("UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?").bind(refund.amount, refund.user_id).run();
    }
    await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status NOT IN ('completed','rejected')").bind(refund.order_id).run();
    await logActivity(env, refund.order_id, refund.user_id, 'refund', '退款通过: ' + refund.amount + ' 修仙币，原因: ' + refund.reason);
  } else {
    await logActivity(env, refund.order_id, refund.user_id, 'refund_rejected', '退款拒绝: ' + (admin_note || '无说明'));
  }

  // 在对话中发送通知消息
  if (refund.conversation_id) {
    const note = action === 'approved'
      ? '✅ 退款已通过！退还 ' + refund.amount + ' 修仙币' + (admin_note ? '。备注：' + admin_note : '')
      : '❌ 退款未通过' + (admin_note ? '。原因：' + admin_note : '');
    await env.DB.prepare(
      "INSERT INTO cs_messages (conversation_id, sender_type, sender_id, sender_name, content, created_at) VALUES (?, 'admin', ?, ?, ?, datetime('now'))"
    ).bind(refund.conversation_id, user.id, user.username, note).run();
    await env.DB.prepare("UPDATE cs_conversations SET updated_at = datetime('now') WHERE id = ?").bind(refund.conversation_id).run();
  }

  return json({ ok: true, message: action === 'approved' ? '退款已通过' : '退款已拒绝' });
}
