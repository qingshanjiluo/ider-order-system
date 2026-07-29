// functions/api/admin/withdrawals.js — GET|POST /api/admin/withdrawals
import { json, logActivity } from '../../_utils.js';
import { authenticateAdmin } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const { user, error } = await authenticateAdmin(request, env);
  if (error) return json({ error }, 403);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';

  // ── GET /api/admin/withdrawals — 管理员查看提现列表 ──
  if (request.method === 'GET') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 50;
    const offset = (page - 1) * limit;
    let query = 'SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id';
    let countQuery = 'SELECT COUNT(*) as total FROM withdrawals';
    const params = [];
    if (status) { query += ' WHERE w.status = ?'; countQuery += ' WHERE status = ?'; params.push(status); }
    query += ' ORDER BY w.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [list, totalResult] = await Promise.all([
      params.length > 2 ? env.DB.prepare(query).bind(...params).all() : env.DB.prepare(query).all(),
      status ? env.DB.prepare(countQuery).bind(status).first() : env.DB.prepare(countQuery).first()
    ]);
    const total = totalResult?.total || 0;
    return json({ ok: true, withdrawals: list.results, total, page, limit });
  }

  // ── POST /api/admin/withdrawals — 审核提现 ──
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { withdrawal_id, action, admin_notes } = body;
    if (!withdrawal_id || !['approved', 'rejected'].includes(action)) {
      return json({ error: '参数无效' }, 400);
    }
    const w = await env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?').bind(withdrawal_id).first();
    if (!w) return json({ error: '提现记录不存在' }, 404);
    if (w.status !== 'pending') return json({ error: '已审核，不可重复操作' }, 400);

    if (action === 'rejected') {
      // 拒绝：退还扣除的余额
      if (w.cost_type === 'coin') {
        await env.DB.prepare('UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?').bind(w.cost_amount, w.user_id).run();
      } else {
        await env.DB.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?').bind(w.cost_amount, w.user_id).run();
      }
    }

    await env.DB.prepare(
      "UPDATE withdrawals SET status = ?, admin_notes = ?, processed_at = datetime('now') WHERE id = ?"
    ).bind(action, admin_notes || '', withdrawal_id).run();

    await logActivity(env, withdrawal_id, w.user_id, 'withdrawal_' + action,
      (action === 'approved' ? '提现已通过' : '提现已拒绝') + ': ' + w.amount_rmb + '元' + (admin_notes ? ' (' + admin_notes + ')' : ''));

    return json({ ok: true, message: action === 'approved' ? '提现已通过' : '已拒绝并退还' });
  }

  return json({ error: 'Method not allowed' }, 405);
}
