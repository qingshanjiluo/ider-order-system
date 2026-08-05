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
    const search = url.searchParams.get('q') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 50;
    const offset = (page - 1) * limit;
    let query = "SELECT o.*, u.username as user_name, (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id) as account_count, (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.status IN ('farming','active','completed') AND ga.setup_status IN ('farming','active','completed')) as delivered_count FROM orders o JOIN users u ON o.user_id = u.id";
    let countQuery = 'SELECT COUNT(*) as total FROM orders o JOIN users u ON o.user_id = u.id';
    const params = [];
    const countParams = [];
    const conds = [];
    if (status) {
      conds.push('o.status = ?');
      params.push(status);
      countParams.push(status);
    }
    if (search) {
      // 支持工单号、用户名、邀请码搜索
      const isNum = /^\d+$/.test(search);
      conds.push(isNum
        ? 'o.id = ? OR o.invite_code LIKE ? OR u.username LIKE ?'
        : 'o.invite_code LIKE ? OR u.username LIKE ?');
      if (isNum) params.push(parseInt(search));
      params.push('%' + search + '%', '%' + search + '%');
      if (isNum) countParams.push(parseInt(search));
      countParams.push('%' + search + '%', '%' + search + '%');
    }
    if (conds.length) {
      query += ' WHERE ' + conds.join(' AND ');
      countQuery += ' WHERE ' + conds.join(' AND ');
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
