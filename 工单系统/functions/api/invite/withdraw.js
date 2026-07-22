// functions/api/invite/withdraw.js — POST /api/invite/withdraw
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    // 检查提现开关
    const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'withdraw_enabled'").first();
    if (cfg && cfg.value === '0') return json({ error: '提现功能已关闭' }, 403);

    const body = await request.json().catch(() => ({}));
    const { points } = body;
    if (!points || points < 10) return json({ error: '最少提现10积分' }, 400);
    if ((user.invite_points || 0) < points) return json({ error: '积分不足' }, 400);

    // 预扣积分并创建提现记录
    await env.DB.prepare(
      'UPDATE users SET invite_points = invite_points - ? WHERE id = ?'
    ).bind(points, user.id).run();
    await env.DB.prepare(
      'INSERT INTO withdrawals (user_id, points, status) VALUES (?, ?, ?)'
    ).bind(user.id, points, 'pending').run();

    return json({ ok: true, message: '提现申请已提交，等待管理员审核' });
  }

  return json({ error: 'Method not allowed' }, 405);
}
