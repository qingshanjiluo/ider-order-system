// functions/api/admin/orders/[id]/reissue.js — POST /api/admin/orders/:id/reissue
import { json } from '../../../../_utils.js';
import { authenticateAdmin } from '../../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { user, error } = await authenticateAdmin(request, env);
  if (error) return json({ error }, 403);

  const orderId = parseInt(params.id);
  const order = await env.DB.prepare('SELECT id, status, user_id FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return json({ error: '工单不存在' }, 404);

  // 1. 统计失败账号
  const failedAccs = await env.DB.prepare(
    "SELECT id, username, status, error_msg FROM game_accounts WHERE order_id = ? AND status = 'failed'"
  ).bind(orderId).all();
  const failedList = failedAccs.results || [];

  // 2. 重置为 pending 以便下次扫描重试
  let resetCount = 0;
  for (const acc of failedList) {
    await env.DB.prepare(
      "UPDATE game_accounts SET status = 'pending', setup_status = 'pending', error_msg = '' WHERE id = ?"
    ).bind(acc.id).run();
    resetCount++;
  }

  // 3. 如果工单是被拒绝或卡住的，恢复成 approved
  if (order.status === 'rejected' || order.status === 'cancelled' || order.status === 'completed') {
    await env.DB.prepare(
      "UPDATE orders SET status = 'approved', updated_at = datetime('now') WHERE id = ?"
    ).bind(orderId).run();
  }

  // 4. 记录日志
  if (resetCount > 0) {
    await env.DB.prepare(
      "INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES (0, ?, 'reissue', ?)"
    ).bind(orderId, '管理员触发补发审查，重置 ' + resetCount + ' 个失败账号').run();
  }

  return json({
    ok: true,
    reset_count: resetCount,
    failed_accounts: failedList.map(a => ({ id: a.id, username: a.username, error: a.error_msg })),
    message: resetCount > 0 ? ('已重置 ' + resetCount + ' 个失败账号，下次扫描将重新处理') : '没有需要补发的失败账号',
  });
}
