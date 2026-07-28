// functions/api/gh/failed-accounts.js — GET /api/gh/failed-accounts
import { json } from '../../_utils.js';
import { authenticateApi } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);
    const accounts = await env.DB.prepare(
      `SELECT ga.*, o.user_id, o.invite_code, o.order_type 
       FROM game_accounts ga 
       JOIN orders o ON ga.order_id = o.id 
       WHERE ga.status = 'failed'
       AND o.status NOT IN ('completed', 'rejected', 'cancelled')
       ORDER BY ga.id ASC
       LIMIT 50`
    ).all();
    return json({ ok: true, accounts: accounts.results });
  }

  return json({ error: 'Method not allowed' }, 405);
}
