// functions/api/orders/[id]/cancel.js — POST /api/orders/:id/cancel
// 用户撤回待审核工单，退还冻结的修仙币和免费试用额度
import { json } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';
import { logActivity } from '../../../_utils.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const orderId = params.id;
    const order = await env.DB.prepare(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?'
    ).bind(orderId, user.id).first();

    if (!order) return json({ error: '工单不存在' }, 404);
    if (order.status !== 'pending') return json({ error: '只能撤回待审核的工单' }, 400);

    // 计算退款金额
    const refundBonusPoints = (order.frozen_points || 0) - (order.free_trial_used || 0);
    const refundTrialBalance = order.free_trial_used || 0;

    // 退还修仙币（真实余额）
    if (refundBonusPoints > 0) {
      await env.DB.prepare(
        'UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?'
      ).bind(refundBonusPoints, user.id).run();
    }

    // 退还免费试用额度
    if (refundTrialBalance > 0) {
      await env.DB.prepare(
        'UPDATE users SET free_trial_balance = free_trial_balance + ? WHERE id = ?'
      ).bind(refundTrialBalance, user.id).run();
    }

    // 如果使用了优惠券，退还优惠券使用次数
    if (order.coupon_code) {
      await env.DB.prepare(
        'UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE code = ?'
      ).bind(order.coupon_code).run();
    }

    // 更新订单状态为已取消
    await env.DB.prepare(
      "UPDATE orders SET status = 'cancelled' WHERE id = ?"
    ).bind(orderId).run();

    // 记录活动日志
    const refundDetail = [];
    if (refundBonusPoints > 0) refundDetail.push(`${refundBonusPoints}修仙币`);
    if (refundTrialBalance > 0) refundDetail.push(`${refundTrialBalance}试用额度`);
    await logActivity(env, orderId, user.id, 'cancelled',
      `用户撤回工单，退还: ${refundDetail.join(' + ') || '无'}`);

    // 发送通知
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '工单已取消', '工单 #' || ? || ' 已撤回，退款已到账', 'order')"
    ).bind(user.id, orderId).run();

    return json({
      ok: true,
      message: '工单已撤回，退款已到账',
      refund: {
        bonus_points: refundBonusPoints,
        free_trial_balance: refundTrialBalance,
      },
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
