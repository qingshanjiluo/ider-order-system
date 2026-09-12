// _order_approval.js — 工单「审核通过」后的统一权益结算
//
// 人工审核通过（POST /api/orders/:id/status）与修仙币自动批准
// （POST /api/orders 支付成功即 approved）共用本函数，确保两条路径产生的
// 订单数统计 / 经验值 / 邀请分成 / 套餐到账 / 站内通知完全一致。
import { addXP, getInviteBoost } from './_xp.js';
import { logActivity } from './_utils.js';

/**
 * 结算一张已通过工单的权益（调用方负责已经/即将把 orders.status 置为 approved）。
 *
 * @param {object} env        Cloudflare 环境（含 DB）
 * @param {object} order      工单对象，至少含 user_id / bonus_points / invite_code
 * @param {number} orderId    工单 ID
 * @param {object} [opts]
 * @param {string} [opts.notificationTitle]   站内通知标题
 * @param {string} [opts.notificationContent] 站内通知正文
 * @param {string} [opts.activityDetail]      活动日志明细
 */
export async function applyApprovalBenefits(env, order, orderId, opts = {}) {
  const {
    notificationTitle = '工单已通过',
    notificationContent = '已审核通过，正在处理中',
    activityDetail = '工单已审核通过',
  } = opts;

  const userId = order.user_id;
  const bonusPoints = order.bonus_points || 0;

  // 1) 用户订单数统计
  await env.DB.prepare(
    'UPDATE users SET total_orders = total_orders + 1 WHERE id = ?'
  ).bind(userId).run();

  // 2) 邀请套餐订单：直接到账邀请积分并提升倍率（不计 XP / 分成）
  const isPackage = order.invite_code && order.invite_code.startsWith('PKG:');
  if (isPackage) {
    await env.DB.prepare(
      'UPDATE users SET total_purchased_points = COALESCE(total_purchased_points, 0) + ?, invite_points = invite_points + ? WHERE id = ?'
    ).bind(bonusPoints, bonusPoints, userId).run();
    const pkgName = order.invite_code.replace('PKG:', '').split(':')[1] || '邀请套餐';
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '套餐已到账', '「' || ? || '」' || ? || ' 邀请积分已到账，当前倍率已提升！', 'commission')"
    ).bind(userId, pkgName, bonusPoints).run();
    await logActivity(env, orderId, userId, 'commission', '购买套餐到账 ' + bonusPoints + ' 积分');
  } else {
    // 3) 经验值（按积分 10% 计，最低 10 点）
    const xpGain = Math.max(10, Math.floor(bonusPoints * 0.1));
    await addXP(env, userId, xpGain, '工单 #' + orderId + ' 审核通过');
    await logActivity(env, orderId, userId, 'approved', activityDetail);

    // 4) 邀请分成（基于 bonus_points，按邀请人当前倍率）
    const buyer = await env.DB.prepare('SELECT invited_by FROM users WHERE id = ?').bind(userId).first();
    if (buyer && buyer.invited_by > 0) {
      const inviter = await env.DB.prepare(
        'SELECT total_purchased_points FROM users WHERE id = ?'
      ).bind(buyer.invited_by).first();
      const boostInfo = getInviteBoost(inviter?.total_purchased_points || 0);
      const commission = bonusPoints * (boostInfo.rate / 100);
      await env.DB.prepare(
        'UPDATE users SET invite_points = invite_points + ? WHERE id = ?'
      ).bind(commission, buyer.invited_by).run();
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '邀请分成到账', '下线成交获得 ' || ? || ' 邀请积分奖励（' || ? || '倍率）', 'commission')"
      ).bind(buyer.invited_by, commission.toFixed(1), boostInfo.label).run();
      await logActivity(env, orderId, buyer.invited_by, 'commission',
        '获得分成 ' + commission.toFixed(1) + ' 积分（' + boostInfo.label + '倍率）');
    }
  }

  // 5) 通知用户工单已通过
  await env.DB.prepare(
    "INSERT INTO notifications (user_id, title, content, type) VALUES (?, ?, '工单 #' || ? || ' ' || ?, 'order')"
  ).bind(userId, notificationTitle, orderId, notificationContent).run();
}
