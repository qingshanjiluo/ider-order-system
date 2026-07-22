// functions/api/user/info.js — GET /api/user/info
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';
import { XP_LEVELS, getLevelTitle } from '../../_xp.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);
    
    // 动态迁移：确保 users 表包含免费试用余额列
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN free_trial_balance INTEGER DEFAULT 10').run(); } catch (e) { /* 列已存在 */ }
    
    // 查询免费试用余额
    const userWithTrial = await env.DB.prepare('SELECT free_trial_balance FROM users WHERE id = ?').bind(user.id).first();
    
    const totalInvited = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM users WHERE invited_by = ?'
    ).bind(user.id).first();
    const nextXP = XP_LEVELS[Math.min(user.level + 1, XP_LEVELS.length - 1)] || 0;
    const userData = { ...user, total_invited: totalInvited.cnt, xp_next: nextXP, password_hash: undefined };
    userData.level_title = getLevelTitle(user.level);
    userData.free_trial_balance = userWithTrial?.free_trial_balance || 0;
    return json({ ok: true, user: userData });
  }

  return json({ error: 'Method not allowed' }, 405);
}
