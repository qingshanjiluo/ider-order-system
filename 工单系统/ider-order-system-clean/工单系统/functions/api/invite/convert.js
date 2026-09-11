// functions/api/invite/convert.js — POST /api/invite/convert
// 一键将邀请积分转换为修仙币（120积分 = 1修仙币）
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);

    // 检查转换开关
    const cfg = await env.DB.prepare("SELECT value FROM config WHERE key = 'withdraw_enabled'").first();
    if (cfg && cfg.value === '0') return json({ error: '转换功能已关闭' }, 403);

    const body = await request.json().catch(() => ({}));
    const { points } = body;
    if (!points || points < 10) return json({ error: '最少转换10积分' }, 400);
    if ((user.invite_points || 0) < points) return json({ error: '邀请积分不足' }, 400);

    // 转换比例：120邀请积分 = 1修仙币
    const COINS_PER_POINT = 1 / 120;
    const coinsToAdd = Math.floor(points * COINS_PER_POINT);
    if (coinsToAdd < 1) return json({ error: '积分太少，无法转换' }, 400);

    // 扣除邀请积分，增加修仙币
    await env.DB.prepare(
      'UPDATE users SET invite_points = invite_points - ?, bonus_points = bonus_points + ? WHERE id = ?'
    ).bind(points, coinsToAdd, user.id).run();

    // 记录转换日志
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, ?, ?, 'convert')"
    ).bind(
      user.id,
      '积分转换成功',
      `已将 ${points} 邀请积分转换为 ${coinsToAdd} 修仙币（120:1）`
    ).run();

    return json({
      ok: true,
      message: `成功将 ${points} 邀请积分转换为 ${coinsToAdd} 修仙币`,
      converted: coinsToAdd,
      deducted: points,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
