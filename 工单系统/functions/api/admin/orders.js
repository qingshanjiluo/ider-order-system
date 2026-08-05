// functions/api/admin/orders.js — GET /api/admin/orders
import { json } from '../../_utils.js';
import { authenticateAdmin } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const { user, error } = await authenticateAdmin(request, env);
    if (error) return json({ error }, 403);
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 50;
    const offset = (page - 1) * limit;
    let query = 'SELECT o.*, u.username as user_name FROM orders o JOIN users u ON o.user_id = u.id';
    let countQuery = 'SELECT COUNT(*) as total FROM orders';
    const params = [];
    const countParams = [];
    if (status) {
      query += ' WHERE o.status = ?';
      countQuery += ' WHERE status = ?';
      params.push(status);
      countParams.push(status);
    }
    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const orders = params.length > 0
      ? await env.DB.prepare(query).bind(...params).all()
      : await env.DB.prepare(query).all();
    const totalResult = countParams.length > 0
      ? await env.DB.prepare(countQuery).bind(...countParams).first()
      : await env.DB.prepare(countQuery).first();
    const total = (totalResult && totalResult.total != null) ? Number(totalResult.total) : 0;
    return json({ ok: true, orders: orders.results, total, page, limit });
  }

  return json({ error: 'Method not allowed' }, 405);
}
