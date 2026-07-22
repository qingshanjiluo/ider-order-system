// functions/api/admin/withdrawals/index.js — GET|POST /api/admin/withdrawals
import { json } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin) return json({ error: '无权限' }, 403);

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = 'SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id';
    const params = [];
    if (status) {
      query += ' WHERE w.status = ?';
      params.push(status);
    }
    query += ' ORDER BY w.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...params).all();

    // 总数
    let countQuery = 'SELECT COUNT(*) as total FROM withdrawals';
    const countParams = [];
    if (status) {
      countQuery += ' WHERE status = ?';
      countParams.push(status);
    }
    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();

    return json({ ok: true, withdrawals: result.results, total: countResult.total, page, limit });
  }

  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin) return json({ error: '无权限' }, 403);

    const body = await request.json().catch(() => ({}));
    const { id, action, reply } = body;

    if (!id || !action) return json({ error: '参数不全' }, 400);

    const withdrawal = await env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?').bind(id).first();
    if (!withdrawal) return json({ error: '记录不存在' }, 404);
    if (withdrawal.status !== 'pending') return json({ error: '该申请已处理' }, 400);

    if (action === 'approve') {
      // 审核通过 - 直接扣减积分（提现时已预扣）
      await env.DB.prepare(
        'UPDATE withdrawals SET status = ?, admin_reply = ?, processed_by = ?, processed_at = datetime(\'now\') WHERE id = ?'
      ).bind('approved', reply || '审核通过', user.id, id).run();
      return json({ ok: true, message: '已通过' });
    }

    if (action === 'reject') {
      // 审核拒绝 - 退还积分
      await env.DB.prepare(
        'UPDATE users SET invite_points = invite_points + ? WHERE id = ?'
      ).bind(withdrawal.points, withdrawal.user_id).run();
      await env.DB.prepare(
        'UPDATE withdrawals SET status = ?, admin_reply = ?, processed_by = ?, processed_at = datetime(\'now\') WHERE id = ?'
      ).bind('rejected', reply || '审核拒绝', user.id, id).run();
      return json({ ok: true, message: '已拒绝并退还积分' });
    }

    return json({ error: '无效操作' }, 400);
  }

  return json({ error: 'Method not allowed' }, 405);
}
