// functions/api/accounts/index.js — GET /api/accounts
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);
    const isAdmin = user.is_admin === 1 || user.role === 'admin' || user.role === 'super_admin';
    const url = new URL(request.url);
    const orderId = url.searchParams.get('order_id') || '';
    // 普通用户只能看自己的订单账号；管理员可看所有订单账号
    let query = 'SELECT ga.*, o.status as order_status, o.invite_code FROM game_accounts ga JOIN orders o ON ga.order_id = o.id';
    const params = [];
    const conds = [];
    if (!isAdmin) {
      conds.push('o.user_id = ?');
      params.push(user.id);
    }
    if (orderId) {
      conds.push('ga.order_id = ?');
      params.push(orderId);
    }
    if (conds.length) query += ' WHERE ' + conds.join(' AND ');
    const accounts = await env.DB.prepare(query + ' ORDER BY ga.id DESC').bind(...params).all();
    return json({ ok: true, accounts: accounts.results });
  }

  return json({ error: 'Method not allowed' }, 405);
}
