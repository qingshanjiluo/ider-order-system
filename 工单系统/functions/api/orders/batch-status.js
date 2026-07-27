// functions/api/orders/batch-status.js — POST /api/orders/batch-status
// 批量审批/拒绝/完成工单
import { json, logActivity } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (!user.is_admin && user.role !== 'admin' && user.role !== 'super_admin')
    return json({ error: '无权限' }, 403);

  const body = await request.json().catch(() => ({}));
  const { ids, status, notes } = body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) return json({ error: '请选择工单' }, 400);
  if (!['approved', 'rejected', 'completed'].includes(status)) return json({ error: '状态无效' }, 400);

  let approved = 0;
  let failed = 0;
  const errors = [];

  for (const id of ids) {
    try {
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
      if (!order) { failed++; errors.push(`#${id}: 不存在`); continue; }

      if (status === 'approved') {
        // 解冻积分（如果是coin支付且之前被拒绝过）
        if (order.payment_method === 'coin' && order.frozen_points > 0 && order.status !== 'approved') {
          await env.DB.prepare('UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?').bind(order.frozen_points, order.user_id).run();
        }
        await env.DB.prepare(
          "UPDATE orders SET status = 'approved', updated_at = datetime('now'), admin_notes = COALESCE(?,'') || admin_notes WHERE id = ?"
        ).bind(notes ? notes + '\n' : '', id).run();
        // 如果是积分支付，冻结修仙币
        if (order.payment_method === 'coin' && order.frozen_points > 0) {
          await env.DB.prepare('UPDATE users SET bonus_points = bonus_points - ? WHERE id = ?').bind(order.frozen_points, order.user_id).run();
        }
        await logActivity(env, id, order.user_id, 'approved', '批量审批通过' + (notes ? ': ' + notes : ''));
      } else if (status === 'rejected') {
        if (order.payment_method === 'coin' && order.frozen_points > 0) {
          await env.DB.prepare('UPDATE users SET bonus_points = bonus_points + ? WHERE id = ?').bind(order.frozen_points, order.user_id).run();
        }
        await env.DB.prepare(
          "UPDATE orders SET status = 'rejected', frozen_points = 0, updated_at = datetime('now'), admin_notes = COALESCE(?,'') || admin_notes WHERE id = ?"
        ).bind(notes ? notes + '\n' : '', id).run();
        await logActivity(env, id, order.user_id, 'rejected', '批量拒绝' + (notes ? ': ' + notes : ''));
      } else if (status === 'completed') {
        await env.DB.prepare(
          "UPDATE orders SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now'), admin_notes = COALESCE(?,'') || admin_notes WHERE id = ?"
        ).bind(notes ? notes + '\n' : '', id).run();
        await logActivity(env, id, order.user_id, 'completed', '批量完成' + (notes ? ': ' + notes : ''));
      }
      approved++;
    } catch (e) {
      failed++;
      errors.push(`#${id}: ${e.message}`);
    }
  }

  return json({ ok: true, approved, failed, errors });
}
