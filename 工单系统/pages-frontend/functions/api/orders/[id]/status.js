// functions/api/orders/[id]/status.js
// 注意: 此路径为 /api/orders/:id/status（前端已使用此路径），
//       但功能上属于 admin 接口。若需迁移至 /api/admin/orders/:id/status，
//       需同步更新前端调用地址。
import { json, logActivity } from '../../../_utils.js';
import { authenticateAdmin } from '../../../_auth.js';
import { applyApprovalBenefits } from '../../../_order_approval.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 管理员权限验证（统一使用 authenticateAdmin）
  const { user, error } = await authenticateAdmin(request, env);
  if (error) return json({ error }, 403);

  const orderId = parseInt(params.id);
  if (isNaN(orderId)) return json({ error: '无效工单ID' }, 400);

  const body = await request.json().catch(() => ({}));
  const { status, admin_notes } = body;

  if (!status || !['approved', 'rejected', 'completed'].includes(status)) {
    return json({ error: '无效状态值' }, 400);
  }

  // 先查当前订单，防止重复操作（幂等性）
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return json({ error: '工单不存在' }, 404);
  if (order.status === status) {
    return json({ ok: true, message: '工单已是此状态，无需重复操作' });
  }

  // 更新工单状态
  await env.DB.prepare(
    "UPDATE orders SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(status, admin_notes || '', orderId).run();

  // ── approved: 审核通过 ──────────────────────────────
  if (status === 'approved') {
    // 如果是从 rejected 重新通过，需要重新扣除冻结积分
    if (order.status === 'rejected' && order.payment_method === 'coin' && order.frozen_points > 0) {
      const user = await env.DB.prepare('SELECT bonus_points FROM users WHERE id = ?').bind(order.user_id).first();
      if ((user?.bonus_points || 0) < order.frozen_points) {
        return json({ error: '用户修仙币余额不足，无法重新通过' }, 400);
      }
      await env.DB.prepare(
        'UPDATE users SET bonus_points = bonus_points - ? WHERE id = ?'
      ).bind(order.frozen_points, order.user_id).run();
      await logActivity(env, orderId, order.user_id, 'refund_reverse',
        '重新通过工单，扣除修仙币 ' + order.frozen_points + ' 个');
    }

    // 统一权益结算（订单数统计 / XP / 邀请分成 / 套餐到账 / 站内通知）
    // 与修仙币支付自动批准走同一套逻辑，保证两条路径结果一致。
    await applyApprovalBenefits(env, order, orderId);
  }

  // ── rejected: 拒绝 ─────────────────────────────────
  else if (status === 'rejected') {
    // 修仙币支付：退还冻结的积分
    if (order.payment_method === 'coin' && order.frozen_points > 0) {
      await env.DB.prepare(
        'UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?'
      ).bind(order.frozen_points, order.user_id).run();
      await logActivity(env, orderId, order.user_id, 'refund',
        '工单拒绝，退还冻结修仙币 ' + order.frozen_points + ' 个');
    }
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '工单被拒绝', '工单 #' || ? || ' 被拒绝: ' || ?, 'order')"
    ).bind(order.user_id, orderId, admin_notes || '无原因').run();
    await logActivity(env, orderId, order.user_id, 'rejected', '拒绝原因: ' + (admin_notes || '未说明'));
  }

  // ── completed: 完成 ────────────────────────────────
  else if (status === 'completed') {
    await logActivity(env, orderId, order.user_id, 'completed', '工单已完成');
  }

  return json({ ok: true, message: '状态已更新' });
}
