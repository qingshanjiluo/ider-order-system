// functions/api/admin/accounts.js — GET /api/admin/accounts
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin) return json({ error: '无权限' }, 403);
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) as total FROM game_accounts ga JOIN orders o ON ga.order_id = o.id';
    let query = 'SELECT ga.*, o.user_id as order_user_id, u.username as user_name FROM game_accounts ga JOIN orders o ON ga.order_id = o.id JOIN users u ON o.user_id = u.id';
    const params = [];
    if (status) {
      const filter = ' WHERE ga.status = ?';
      countQuery += filter;
      query += filter;
      params.push(status);
    }
    const totalResult = await env.DB.prepare(countQuery).bind(...params).first();
    const total = totalResult?.total || 0;
    query += ' ORDER BY ga.id DESC LIMIT ? OFFSET ?';
    const accounts = await env.DB.prepare(query).bind(...params, limit, offset).all();
    return json({ ok: true, accounts: accounts.results, total, page, limit, totalPages: Math.ceil(total / limit) });
  }

  return json({ error: 'Method not allowed' }, 405);
}
