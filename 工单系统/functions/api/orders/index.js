// functions/api/orders/index.js — GET|POST /api/orders
import { json, logActivity } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

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
    const orders = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, orders: orders.results });
  }

  // ── POST /api/orders — 创建工单 ─────────────────────
  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    // 动态迁移：确保 orders 表包含所有需要的列（兼容旧数据库）
    const ADD_COLUMNS = [
      'frozen_points INTEGER DEFAULT 0',
      'invite_code_used TEXT DEFAULT ""',
      'game_account_name TEXT DEFAULT ""',
      'game_account_password TEXT DEFAULT ""',
      'subscription_start TEXT DEFAULT ""',
      'subscription_end TEXT DEFAULT ""',
      'free_trial_used INTEGER DEFAULT 0',
    ];
    for (const col of ADD_COLUMNS) {
      try { await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${col}`).run(); } catch (e) { /* 列已存在 */ }
    }
    // 动态迁移：确保 users 表包含免费试用余额列
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN free_trial_balance INTEGER DEFAULT 10').run(); } catch (e) { /* 列已存在 */ }

    const body = await request.json().catch(() => ({}));
    const {
      order_type,
      coupon_code,
      note,
      invite_code,
      payment_method,   // 'coin' | 'wechat' | 'spirit_stone'
      points,            // 邀请积分数量（10的倍数）
      game_account_name,     // 游戏账号名（仙盟采集/试炼测试/每日试炼）
      game_account_password, // 游戏账号密码（仙盟采集/每日试炼）
    } = body;

    // ── 0. 输入验证（长度限制）──
    if (note && note.length > 500) return json({ error: '备注最多500字符' }, 400);
    if (order_type && order_type.length > 50) return json({ error: '工单类型最多50字符' }, 400);
    if (game_account_name && game_account_name.length > 100) return json({ error: '账号名最多100字符' }, 400);
    if (game_account_password && game_account_password.length > 200) return json({ error: '密码最多200字符' }, 400);

    // ── 0.1 工单类型特殊验证 ──
    const GAME_ORDER_TYPES = ['仙盟采集', '试炼测试', '每日试炼'];
    const BUY_POINTS_TYPE = '购买邀请积分';
    if (GAME_ORDER_TYPES.includes(order_type)) {
      // 游戏工单类型：需要账号+密码
      if (!game_account_name) return json({ error: '请输入游戏账号名' }, 400);
      if (!game_account_password) return json({ error: '请输入游戏账号密码' }, 400);
    }
    if (order_type === BUY_POINTS_TYPE) {
      // 购买邀请积分：需要邀请码+积分数量
      if (!invite_code) return json({ error: '请输入邀请码' }, 400);
      if (!points || points < 10 || points % 10 !== 0) {
        return json({ error: '积分数量必须是10的倍数（最少10）' }, 400);
      }
    }

    // ── 1. 验证积分数量 ──
    // 购买邀请积分在上面已验证，游戏工单类型使用固定价格跳过

    // ── 2. 验证付款方式 ──
    const validMethods = ['coin', 'wechat', 'spirit_stone'];
    if (!payment_method || !validMethods.includes(payment_method)) {
      return json({ error: '请选择有效的付款方式' }, 400);
    }

    // ── 3. 根据付款方式计算价格 ──
    let price = 0;        // 显示价格（原价）
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
    if (coupon_code) {
      const coupon = await env.DB.prepare(
        "SELECT * FROM coupons WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now')) AND (max_uses = 0 OR used_count < max_uses)"
      ).bind(coupon_code).first();
      if (coupon) {
        couponType = coupon.coupon_type || 'percent';
        if (couponType === 'fixed') {
          couponFixedAmount = coupon.fixed_amount || 0;
        } else {
          discount = coupon.discount_percent || 0;
        }
        await env.DB.prepare(
          'UPDATE coupons SET used_count = used_count + 1 WHERE id = ?'
        ).bind(coupon.id).run();
      }
    }

    // ── 5. 等级折扣 ──
    const userLevel = user.level || 1;
    const levelDiscounts = { 1: 0, 2: 0, 3: 10, 4: 20, 5: 30, 6: 40, 7: 45, 8: 50, 9: 60, 10: 70 };
    const levelDiscount = levelDiscounts[userLevel] || 0;

    // ── 6. 计算最终价格（取最大折扣） ──
    let finalPrice = price;
    if (couponType === 'fixed') {
      // 固定金额减免
      finalPrice = Math.max(0, price - couponFixedAmount);
      // 如果等级折扣更高，使用等级折扣
      const levelPrice = price * (100 - levelDiscount) / 100;
      finalPrice = Math.min(finalPrice, levelPrice);
      discount = levelDiscount; // 记录实际折扣百分比
    } else {
      // 百分比折扣，取最大值
      const maxDiscount = Math.max(discount, levelDiscount);
      finalPrice = price * (100 - maxDiscount) / 100;
      discount = maxDiscount;
    }

    // ── 7. 修仙币支付：免费试用 + 余额验证并冻结 ──
    let frozenPoints = 0;
    let freeTrialUsed = 0;
    if (payment_method === 'coin') {
      // 查询免费试用开关和余额
      const freeTrialCfg = await env.DB.prepare("SELECT value FROM config WHERE key='free_trial_enabled'").first();
      const freeTrialEnabled = freeTrialCfg?.value === '1';
      
      const userInfo = await env.DB.prepare('SELECT bonus_points, free_trial_balance FROM users WHERE id = ?').bind(user.id).first();
      const currentBalance = userInfo?.bonus_points || 0;
      const trialBalance = freeTrialEnabled ? (userInfo?.free_trial_balance || 0) : 0;
      
      // 优先使用免费试用额度，不足部分从真实余额扣
      freeTrialUsed = Math.min(trialBalance, finalPrice);
      const realBalanceNeeded = finalPrice - freeTrialUsed;
      
      if (currentBalance < realBalanceNeeded) {
        const totalAvailable = currentBalance + trialBalance;
        return json({
          error: `余额不足，当前余额: ${currentBalance}修仙币${trialBalance > 0 ? ` + 试用额度: ${trialBalance}修仙币` : ''}，需要: ${Math.round(finalPrice)}修仙币（优惠后）`
        }, 400);
      }
      
      // 扣减免费试用额度
      if (freeTrialUsed > 0) {
        await env.DB.prepare(
          'UPDATE users SET free_trial_balance = free_trial_balance - ? WHERE id = ?'
        ).bind(freeTrialUsed, user.id).run();
      }
      // 扣减真实余额
      if (realBalanceNeeded > 0) {
        await env.DB.prepare(
          'UPDATE users SET bonus_points = bonus_points - ? WHERE id = ?'
        ).bind(realBalanceNeeded, user.id).run();
      }
      frozenPoints = finalPrice;
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
    // 游戏工单类型：计算订阅时间
    let subscriptionStart = '';
    let subscriptionEnd = '';
    if (GAME_ORDER_TYPES.includes(order_type)) {
      subscriptionStart = new Date().toISOString();
      if (order_type === '仙盟采集' || order_type === '每日试炼') {
        // 月度订阅：30天
        subscriptionEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      }
    }

    const result = await env.DB.prepare(
      `INSERT INTO orders (user_id, invite_code, payment_method, payment_account, amount, price, coupon_code, discount, bonus_points, order_type, quantity, frozen_points, invite_code_used, status, created_at, est_complete_date, game_account_name, game_account_password, subscription_start, subscription_end, free_trial_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?, ?, ?, ?, ?, ?)`
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
      order_type || '仙盟采集',
      accCount,         // quantity: 账号数
      frozenPoints,     // frozen_points: 冻结的修仙币
      finalInviteCode,  // invite_code_used
      estDate,
      game_account_name || '',
      game_account_password || '',
      subscriptionStart,
      subscriptionEnd,
      freeTrialUsed     // free_trial_used: 使用的免费试用额度
    ).run();

    const orderId = result.meta.last_row_id;

    // ── 11. 发送通知 ──
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '工单已提交', '工单 #' || ? || ' 已提交，等待管理员审核中', 'order')"
    ).bind(user.id, orderId).run();

    // ── 12. 记录活动日志 ──
    const paymentLabel = payment_method === 'coin' ? '修仙币' : payment_method === 'wechat' ? '现金' : '灵石';
    const trialLog = freeTrialUsed > 0 ? `, 免费试用抵扣${freeTrialUsed}` : '';
    await logActivity(env, orderId, user.id, 'created',
      `提交工单: ${accCount}个账号, ${paymentLabel}支付, ${points}积分${trialLog}`);

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
        frozen_points: frozenPoints,
        free_trial_used: freeTrialUsed
      }
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
