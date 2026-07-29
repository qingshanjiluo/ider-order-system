// functions/api/withdrawals/index.js — GET|POST /api/withdrawals
import { json, logActivity } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

const RATES = {
  coin: { label: '修仙币', unit: '修仙币', rate: 1500, rateText: '1500修仙币 = 1元' },
  spirit_stone: { label: '灵石', unit: '万灵石', rate: 10000, rateText: '1亿灵石 = 1元' },
};

export async function onRequest(context) {
  const { request, env } = context;

  // ── GET /api/withdrawals — 用户提现记录 ──
  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);
    const [list, userInfo] = await Promise.all([
      env.DB.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all(),
      env.DB.prepare('SELECT bonus_points, spirit_stones FROM users WHERE id = ?').bind(user.id).first()
    ]);
    return json({
      ok: true,
      withdrawals: list.results,
      rates: RATES,
      balance: { bonus_points: userInfo?.bonus_points || 0, spirit_stones: userInfo?.spirit_stones || 0 }
    });
  }

  // ── POST /api/withdrawals — 创建提现 ──
  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    const body = await request.json().catch(() => ({}));
    const { cost_type, account_name, account_info } = body;

    if (!cost_type || !RATES[cost_type]) return json({ error: '无效的兑换类型' }, 400);
    if (!account_name || account_name.length > 100) return json({ error: '请填写收款账号' }, 400);

    const rate = RATES[cost_type];
    const minRmb = 1;

    // 检查用户余额
    const userInfo = await env.DB.prepare(
      cost_type === 'coin'
        ? 'SELECT bonus_points as balance FROM users WHERE id = ?'
        : 'SELECT spirit_stones as balance FROM users WHERE id = ?'
    ).bind(user.id).first();

    const balance = userInfo?.balance || 0;
    const maxRmb = Math.floor(balance / rate.rate);

    if (maxRmb < minRmb) {
      const err = cost_type === 'coin'
        ? `修仙币不足，需要至少 ${rate.rate} 修仙币才能兑换 1 元`
        : `灵石不足，需要至少 ${rate.rate} 万灵石才能兑换 1 元`;
      return json({ error }, 400);
    }

    const amountRmb = maxRmb;
    const costAmount = amountRmb * rate.rate;

    // 扣余额
    if (cost_type === 'coin') {
      await env.DB.prepare('UPDATE users SET bonus_points = bonus_points - ? WHERE id = ?').bind(costAmount, user.id).run();
    } else {
      await env.DB.prepare('UPDATE users SET spirit_stones = spirit_stones - ? WHERE id = ?').bind(costAmount, user.id).run();
    }

    const result = await env.DB.prepare(
      "INSERT INTO withdrawals (user_id, amount_rmb, cost_type, cost_amount, rate_text, account_name, account_info, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))"
    ).bind(user.id, amountRmb, cost_type, costAmount, rate.rateText, account_name, account_info || '').run();

    const wId = result.meta.last_row_id;
    await logActivity(env, wId, user.id, 'withdrawal_created',
      '提现申请: ' + amountRmb + '元 (' + rate.rateText + ', 扣除' + costAmount + rate.unit + ')');

    return json({
      ok: true,
      message: '提现申请已提交，等待审核',
      withdrawal_id: wId,
      amount_rmb: amountRmb,
      cost_amount: costAmount,
      cost_type,
      rate_text: rate.rateText,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
