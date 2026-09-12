// functions/api/orders/index.js — GET|POST /api/orders
//
// 平台只保留「购买邀请积分」一种工单：
//   - POST 只接受 代练 / 代打 / 托管（历史三种写法同义），其余类型一律拒绝；
//   - 修仙币（coin）支付立即扣款并自动批准（approved），无需人工审核；
//   - 自动批准与人工审核共用 _order_approval.js 的权益结算（XP/分成/套餐）。
import { json, logActivity } from '../../_utils.js';
import { authenticate } from '../../_auth.js';
import { isInviteOrderType, CANONICAL_ORDER_TYPE } from '../../_order_types.js';
import { applyApprovalBenefits } from '../../_order_approval.js';

export async function onRequest(context) {
  const { request, env } = context;

  // ── GET /api/orders — 用户工单列表（分页） ─────────
  if (request.method === 'GET') {
    try {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = 'SELECT o.*, (SELECT COUNT(*) FROM game_accounts WHERE order_id = o.id) as account_count FROM orders o WHERE o.user_id = ?';
    let countQuery = 'SELECT COUNT(*) as total FROM orders WHERE user_id = ?';
    const params = [user.id];
    const countParams = [user.id];

    if (status) {
      query += ' AND o.status = ?';
      countQuery += ' AND status = ?';
      params.push(status);
      countParams.push(status);
    }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [orders, totalResult] = await Promise.all([
      params.length > 2 ? env.DB.prepare(query).bind(...params).all() : env.DB.prepare(query).all(),
      env.DB.prepare(countQuery).bind(...countParams).first()
    ]);
    const total = totalResult?.total || 0;
      return json({ ok: true, orders: orders.results, total, page, limit });
    } catch (e) {
      return json({ error: '获取工单失败: ' + e.message }, 500);
    }
  }

  // ── POST /api/orders — 创建工单（仅购买邀请积分） ────
  if (request.method === 'POST') {
    try {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const body = await request.json().catch(() => ({}));
    const {
      order_type,
      coupon_code,
      note,
      invite_code,
      payment_method,   // 'coin' | 'wechat' | 'spirit_stone'
      points,           // 邀请积分数量（10的倍数）
    } = body;

    // ── 0. 输入验证（长度限制）──
    if (note && note.length > 500) return json({ error: '备注最多500字符' }, 400);

    // ── 0.1 工单类型白名单：只允许购买邀请积分 ──
    if (!isInviteOrderType(order_type)) {
      return json({
        error: `工单类型「${String(order_type).slice(0, 50)}」已下线，平台仅支持「购买邀请积分」`,
      }, 400);
    }
    const normalizedType = CANONICAL_ORDER_TYPE;

    // ── 1. 验证积分数量 ──
    if (!points || points < 10 || points % 10 !== 0) {
      return json({ error: '邀请积分数量必须是10的倍数（最少10）' }, 400);
    }
    if (points > 500) {
      return json({ error: '单个工单最多购买500邀请积分，如需更多请分多次下单' }, 400);
    }

    // ── 2. 验证付款方式 ──
    const validMethods = ['coin', 'wechat', 'spirit_stone'];
    if (!payment_method || !validMethods.includes(payment_method)) {
      return json({ error: '请选择有效的付款方式' }, 400);
    }

    // ── 3. 根据付款方式计算价格 ──
    const unitPrice = points;   // 1 积分 = 1 单位
    let price = 0;              // 显示价格
    let priceUnit = '';         // 价格单位
    const bonusPoints = points; // 获得的积分

    if (payment_method === 'wechat') {
      // 现金：1元 = 120积分
      price = unitPrice / 120;
      priceUnit = '元';
    } else if (payment_method === 'spirit_stone') {
      // 灵石：从 config 读取灵石兑换比例（默认 100万灵石 = 10积分）
      const spiritCfg = await env.DB.prepare("SELECT value FROM config WHERE key='spirit_stone_per_10_points'").first();
      const spiritPer10 = parseInt(spiritCfg?.value || '1000000');
      // spiritPer10 = 每10积分对应的灵石数（单位：灵石）
      // 转换为万灵石显示：spiritPer10 / 10000 = 每10积分对应的万灵石数
      price = Math.round(unitPrice / 10 * spiritPer10 / 10000);
      priceUnit = '万灵石';
    } else if (payment_method === 'coin') {
      // 修仙币：1修仙币 = 1积分
      price = unitPrice;
      priceUnit = '修仙币';
    }

    // ── 4. 优惠码折扣 ──
    let discount = 0;
    let couponType = 'percent';
    let couponFixedAmount = 0;
    let couponId = null;
    if (coupon_code) {
      const coupon = await env.DB.prepare(
        "SELECT * FROM coupons WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now')) AND (max_uses = 0 OR used_count < max_uses)"
      ).bind(coupon_code).first();
      if (!coupon) {
        return json({ error: '优惠码无效、已过期或已达使用上限' }, 400);
      }
      if (coupon.min_amount > 0 && unitPrice < coupon.min_amount) {
        return json({ error: `该优惠码需订单金额达到 ${coupon.min_amount} 积分才能使用` }, 400);
      }
      couponId = coupon.id;
      couponType = coupon.coupon_type || 'percent';
      if (couponType === 'fixed') {
        couponFixedAmount = coupon.fixed_amount || 0;
      } else {
        discount = coupon.discount_percent || 0;
      }
    }

    // ── 5. 等级折扣 ──
    const userLevel = user.level || 1;
    const levelDiscounts = { 1: 0, 2: 0, 3: 10, 4: 20, 5: 30, 6: 40, 7: 45, 8: 50, 9: 60, 10: 70 };
    const levelDiscount = levelDiscounts[userLevel] || 0;

    // ── 6. 计算最终价格（取最大折扣） ──
    let finalPrice = price;
    if (couponType === 'fixed') {
      const afterCoupon = Math.max(0, price - couponFixedAmount);
      const levelPrice = price * (100 - levelDiscount) / 100;
      finalPrice = Math.min(afterCoupon, levelPrice);
      discount = levelPrice < afterCoupon ? levelDiscount : Math.round(couponFixedAmount / price * 100);
    } else {
      const maxDiscount = Math.max(discount, levelDiscount);
      finalPrice = price * (100 - maxDiscount) / 100;
      discount = maxDiscount;
    }

    // ── 7. 修仙币支付：验证余额并扣款（使用折后价） ──
    // 修仙币已即时扣款，属于「已付款」，因此随后自动批准，无需人工审核。
    let frozenPoints = 0;
    if (payment_method === 'coin') {
      const userInfo = await env.DB.prepare('SELECT bonus_points FROM users WHERE id = ?').bind(user.id).first();
      const currentBalance = userInfo?.bonus_points || 0;
      // finalPrice 的单位与 price 相同（修仙币），直接比较
      const needPoints = Math.round(Number(finalPrice));
      if (currentBalance < needPoints) {
        return json({
          error: `修仙币余额不足，当前余额: ${currentBalance}，需要: ${needPoints}`
        }, 400);
      }
      await env.DB.prepare(
        'UPDATE users SET bonus_points = bonus_points - ? WHERE id = ?'
      ).bind(needPoints, user.id).run();
      frozenPoints = needPoints;
    }

    // ── 8. 计算账号数 ──
    const accCount = Math.max(1, Math.ceil(bonusPoints / 10));

    // ── 9. 预估完成日期 ──
    const estDays = parseInt((await env.DB.prepare("SELECT value FROM config WHERE key='est_delivery_days'").first())?.value || '5');
    const estDate = new Date(Date.now() + estDays * 86400000).toISOString().split('T')[0];

    // ── 10. 插入订单 ──
    const finalInviteCode = invite_code || user.invite_code || '';
    // payment_account: 微信支付需要用户提供账号，其他方式用默认值
    const paymentAccountLabel = payment_method === 'wechat' ? '微信' : payment_method === 'coin' ? '修仙币' : '灵石';

    // 修仙币支付的工单自动通过（已扣款，无需人工审核）
    const autoApproved = payment_method === 'coin';
    const orderStatus = autoApproved ? 'approved' : 'pending';

    const result = await env.DB.prepare(
      `INSERT INTO orders (user_id, invite_code, payment_method, payment_account, amount, price, coupon_code, discount, bonus_points, order_type, quantity, frozen_points, invite_code_used, status, created_at, est_complete_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    ).bind(
      user.id,
      finalInviteCode,
      payment_method,
      paymentAccountLabel,
      points,           // amount: 积分数量
      finalPrice,       // price: 最终价格
      coupon_code || '',
      discount,
      bonusPoints,      // bonus_points: 获得的积分
      normalizedType,
      accCount,         // quantity: 账号数
      frozenPoints,     // frozen_points: 冻结的修仙币
      finalInviteCode,  // invite_code_used
      orderStatus,
      estDate
    ).run();

    const orderId = result.meta.last_row_id;

    // 订单创建成功后递增优惠码使用次数
    if (couponId) {
      await env.DB.prepare(
        'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?'
      ).bind(couponId).run();
    }

    // ── 11. 记录活动日志 ──
    const paymentLabel = payment_method === 'coin' ? '修仙币' : payment_method === 'wechat' ? '现金' : '灵石';
    await logActivity(env, orderId, user.id, 'created',
      `提交工单: ${accCount}个账号, ${paymentLabel}支付, ${points}积分` + (autoApproved ? '（修仙币支付自动通过）' : ''));

    // ── 12. 自动批准：与人工审核同一套权益结算 ──
    if (autoApproved) {
      await applyApprovalBenefits(env, {
        user_id: user.id,
        bonus_points: bonusPoints,
        invite_code: finalInviteCode,
      }, orderId, {
        notificationTitle: '工单已自动通过',
        notificationContent: '修仙币支付成功，已自动通过并开始处理',
        activityDetail: '修仙币支付成功，工单自动通过',
      });
    } else {
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '工单已提交', '工单 #' || ? || ' 已提交，等待管理员审核中', 'order')"
      ).bind(user.id, orderId).run();
    }

    return json({
      ok: true,
      message: autoApproved ? '工单已提交并自动通过，开始处理中' : '工单已提交，等待审核',
      order_id: orderId,
      auto_approved: autoApproved,
      price_info: {
        points,
        payment_method: payment_method,
        price: finalPrice,
        unit: priceUnit,
        accounts: accCount,
        frozen_points: frozenPoints
      }
    });
    } catch (e) {
      console.error('[orders POST]', e.message, e.stack);
      return json({ error: '创建工单失败: ' + e.message, detail: e.stack?.split('\n').slice(0,3).join('; ') }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
