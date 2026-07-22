// functions/api/admin/users.js — GET /api/admin/users
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin) return json({ error: '无权限' }, 403);
    // 动态迁移：确保 users 表包含免费试用余额列
    try { await env.DB.prepare('ALTER TABLE users ADD COLUMN free_trial_balance INTEGER DEFAULT 10').run(); } catch (e) { /* 列已存在 */ }
    
    const users = await env.DB.prepare(
      "SELECT id, username, display_name, level, xp, total_orders, total_spent, total_invited, invite_code, invite_points, total_purchased_points, bonus_points, free_trial_balance, role, email, avatar_url, bio, is_admin, locked, created_at, last_login FROM users ORDER BY id DESC"
    ).all();
    return json({ ok: true, users: users.results });
  }

  return json({ error: 'Method not allowed' }, 405);
}
