// functions/api/orders/index.js — GET|POST /api/orders
import { json, logActivity } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

const ORDER_TYPE_LABEL = {
  '代练': '购买邀请积分', '代打': '购买邀请积分', '托管': '购买邀请积分',
  '仙盟采集': '仙盟采集', '试炼测试': '试炼测试',
  '每日试炼': '每日试炼', '传人派出': '传人派出', '副本刷取': '副本刷取',
};

export async function onRequest(context) {
  const { request, env } = context;

  // ── GET /api/orders — 用户工单列表 ──────────────────
  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';

    let query = 'SELECT o.*, (SELECT COUNT(*) FROM game_accounts WHERE order_id = o.id) as account_count FROM orders o WHERE o.user_id = ?';
    const params = [user.id];

    if (status) {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC';
    try {
      const orders = await env.DB.prepare(query).bind(...params).all();
      return json({ ok: true, orders: orders.results });
    } catch (e) {
      return json({ error: '查询失败: ' + e.message }, 500);
    }
  }

  // ── POST /api/orders — 创建工单 ─────────────────────
  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const body = await request.json().catch(() => ({}));
    const {
      order_type,
      coupon_code,
      note,
      invite_code,
      payment_method,   // 'coin' | 'wechat' | 'spirit_stone'
      points,            // 邀请积分数量（10的倍数）
      game_account_name,     // 游戏账号名（新类型必填）
      game_account_password, // 游戏账号密码（新类型必填）
      dispatch_map,          // 派出地图（传人派出）
      material_type,         // 物资类别（传人派出）
      clear_type,            // 刷取类型（副本刷取）
    } = body;

    // ── 0. 输入验证（长度限制）──
    if (note && note.length > 500) return json({ error: '备注最多500字符' }, 400);
    if (order_type && order_type.length > 50) return json({ error: '工单类型最多50字符' }, 400);
    if (game_account_name && game_account_name.length > 100) return json({ error: '账号名最多100字符' }, 400);
    if (game_account_password && game_account_password.length > 200) return json({ error: '密码最多200字符' }, 400);

    // ── 0.1 新工单类型特殊验证 ──
    const NEW_ORDER_TYPES = ['仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取'];
    if (NEW_ORDER_TYPES.includes(order_type)) {
      if (!game_account_name) return json({ error: '请输入游戏账号名' }, 400);
      if (!game_account_password && order_type !== '试炼测试') {
        return json({ error: '请输入游戏账号密码' }, 400);
      }
      if (order_type === '传人派出') {
        if (!dispatch_map) return json({ error: '请选择派出地图' }, 400);
        if (!material_type) return json({ error: '请选择物资类别' }, 400);
      }
      if (order_type === '副本刷取') {
        if (!['全物资', '全阵纹', '一半一半'].includes(clear_type)) {
          return json({ error: '请选择有效的刷取类型：全物资/全阵纹/一半一半' }, 400);
        }
      }
    }

    // ── 1. 验证积分数量 ──
    // 新工单类型使用固定价格（points 由前端计算），跳过积分倍数验证
    if (!NEW_ORDER_TYPES.includes(order_type)) {
      if (!points || points < 10 || points % 10 !== 0) {
        return json({ error: '邀请积分数量必须是10的倍数（最少10）' }, 400);
      }
    }

    // ── 2. 验证付款方式 ──
    const validMethods = ['coin', 'wechat', 'spirit_stone'];
    if (!payment_method || !validMethods.includes(payment_method)) {
      return json({ error: '请选择有效的付款方式' }, 400);
    }

    // ── 3. 根据付款方式计算价格 ──
    let price = 0;        // 显示价格
    let priceUnit = '';   // 价格单位
    let bonusPoints = points; // 获得的积分 = 输入的积分数量

    if (payment_method === 'wechat') {
      // 现金：1元 = 120积分
      price = points / 120;
      priceUnit = '元';
    } else if (payment_method === 'spirit_stone') {
      // 灵石：从 config 读取灵石兑换比例（默认 100万灵石 = 10积分）
      const spiritCfg = await env.DB.prepare("SELECT value FROM config WHERE key='spirit_stone_per_10_points'").first();
      const spiritPer10 = parseInt(spiritCfg?.value || '1000000');
      // spiritPer10 = 每10积分对应的灵石数（单位：灵石）
      // 转换为万灵石显示：spiritPer10 / 10000 = 每10积分对应的万灵石数
      price = Math.round(points / 10 * spiritPer10 / 10000);
      priceUnit = '万灵石';
    } else if (payment_method === 'coin') {
      // 修仙币：1修仙币 = 1积分
      price = points;
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
      if (coupon.min_amount > 0 && points < coupon.min_amount) {
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

    // ── 7. 修仙币支付：验证余额并冻结（使用折后价） ──
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
    // 新工单类型：计算订阅时间
    let subscriptionStart = '';
    let subscriptionEnd = '';
    if (NEW_ORDER_TYPES.includes(order_type)) {
      subscriptionStart = new Date().toISOString();
      if (['仙盟采集', '每日试炼', '传人派出'].includes(order_type)) {
        // 月度订阅：30天
        subscriptionEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      }
    }

    const result = await env.DB.prepare(
      `INSERT INTO orders (user_id, invite_code, payment_method, payment_account, amount, price, coupon_code, discount, bonus_points, order_type, quantity, frozen_points, invite_code_used, status, created_at, est_complete_date, game_account_name, game_account_password, subscription_start, subscription_end, dispatch_map, material_type, clear_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)`
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
      order_type || '代练',
      accCount,         // quantity: 账号数
      frozenPoints,     // frozen_points: 冻结的修仙币
      finalInviteCode,  // invite_code_used
      estDate,
      game_account_name || '',
      game_account_password || '',
      subscriptionStart,
      subscriptionEnd,
      dispatch_map || '',
      material_type || '',
      clear_type || ''
    ).run();

    const orderId = result.meta.last_row_id;

    // 订单创建成功后递增优惠码使用次数
    if (couponId) {
      await env.DB.prepare(
        'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?'
      ).bind(couponId).run();
    }

    // ── 11. 发送通知 ──
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '工单已提交', '工单 #' || ? || ' 已提交，等待管理员审核中', 'order')"
    ).bind(user.id, orderId).run();

    // ── 12. 记录活动日志 ──
    const paymentLabel = payment_method === 'coin' ? '修仙币' : payment_method === 'wechat' ? '现金' : '灵石';
    await logActivity(env, orderId, user.id, 'created', 
      `提交工单: ${accCount}个账号, ${paymentLabel}支付, ${points}积分`);
    await env.DB.prepare(
      "INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES (0, ?, 'order_created', ?)"
    ).bind(orderId, '提交工单 #' + orderId + '：' + (ORDER_TYPE_LABEL[order_type] || order_type) + ', ' + accCount + '个账号').run();

    return json({ 
      ok: true, 
      message: '工单已提交，等待审核', 
      order_id: orderId,
      price_info: {
        points,
        payment_method: payment_method,
        price: finalPrice,
        unit: priceUnit,
        accounts: accCount,
        frozen_points: frozenPoints
      }
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
