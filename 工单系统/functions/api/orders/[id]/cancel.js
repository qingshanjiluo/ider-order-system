// functions/api/orders/[id]/cancel.js — POST /api/orders/:id/cancel
// 用户自行取消待审批工单（仅限 pending 状态）
import { json, logActivity } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const orderId = parseInt(params.id);
  if (isNaN(orderId)) return json({ error: '无效工单ID' }, 400);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return json({ error: '工单不存在' }, 404);
  if (order.user_id !== user.id) return json({ error: '无权操作此工单' }, 403);
  if (order.status !== 'pending') return json({ error: '仅待审批工单可以取消' }, 400);

  // 修仙币支付：退还冻结积分
  if (order.payment_method === 'coin' && order.frozen_points > 0) {
    await env.DB.prepare(
      'UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?'
    ).bind(order.frozen_points, user.id).run();
  }

  await env.DB.prepare(
    "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
  ).bind(orderId).run();

  await logActivity(env, orderId, user.id, 'cancelled', '用户自行取消工单');
  await env.DB.prepare(
    "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '工单已取消', '工单 #' || ? || ' 已取消' || CASE WHEN ? > 0 THEN '，已退还 ' || ? || ' 修仙币' ELSE '' END, 'order')"
  ).bind(user.id, orderId, order.frozen_points || 0, order.frozen_points || 0).run();

  return json({ ok: true, message: '工单已取消' + (order.frozen_points > 0 ? '，已退还 ' + order.frozen_points + ' 修仙币' : '') });
}
