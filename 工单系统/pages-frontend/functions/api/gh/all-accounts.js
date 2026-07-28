// functions/api/gh/all-accounts.js — GET /api/gh/all-accounts
// 返回所有未完成工单的账号（不限状态），供 auto_levelup_all.js 使用
import { authenticateApi } from '../../_auth.js';
import { json } from '../../_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);

  const accounts = await env.DB.prepare(
    `SELECT ga.*, o.user_id, o.invite_code, o.order_type 
     FROM game_accounts ga 
     JOIN orders o ON ga.order_id = o.id 
     WHERE o.status NOT IN ('completed', 'rejected', 'cancelled')
     AND ga.status NOT IN ('completed', 'error')
     AND (ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime('now'))
     ORDER BY ga.level ASC
     LIMIT 200`
  ).all();

  return json({ ok: true, accounts: accounts.results });
}
