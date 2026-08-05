// functions/api/admin/orders/[id]/reissue.js — POST /api/admin/orders/:id/reissue
import { json } from '../../../../_utils.js';
import { authenticateAdmin } from '../../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { user, error } = await authenticateAdmin(request, env);
  if (error) return json({ error }, 403);

  const orderId = parseInt(params.id);
  const order = await env.DB.prepare('SELECT id, status, user_id, quantity FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return json({ error: '工单不存在' }, 404);

  // 1. 统计订单下各状态账号数
  const orderStats = await env.DB.prepare(
    "SELECT status, COUNT(*) as cnt FROM game_accounts WHERE order_id = ? GROUP BY status"
  ).bind(orderId).all();
  const statRows = orderStats.results || [];
  const createdCount = statRows.reduce((s, r) => s + r.cnt, 0);

  // 2. 统计失败账号
  const failedAccs = await env.DB.prepare(
    "SELECT id, username, status, error_msg FROM game_accounts WHERE order_id = ? AND status = 'failed'"
  ).bind(orderId).all();
  const failedList = failedAccs.results || [];

  // 3. 重置为 pending 以便下次扫描重试
  let resetCount = 0;
  for (const acc of failedList) {
    await env.DB.prepare(
      "UPDATE game_accounts SET status = 'pending', setup_status = 'pending', error_msg = '' WHERE id = ?"
    ).bind(acc.id).run();
    resetCount++;
  }

  // 4. 计算差额：订购数量 vs 已创建账号数
  const quantity = order.quantity || 0;
  const shortfall = quantity > 0 ? Math.max(0, quantity - createdCount) : 0;

  // 5. 如果工单是被拒绝/取消/完成/挂机的，且存在差额，恢复成 approved 以便扫描器补发
  if (shortfall > 0) {
    await env.DB.prepare(
      "UPDATE orders SET status = 'approved', updated_at = datetime('now') WHERE id = ? AND status != 'approved'"
    ).bind(orderId).run();
    await env.DB.prepare(
      "UPDATE orders SET total_accounts_created = ? WHERE id = ?"
    ).bind(createdCount, orderId).run();
  } else if (order.status === 'rejected' || order.status === 'cancelled') {
    await env.DB.prepare(
      "UPDATE orders SET status = 'approved', updated_at = datetime('now') WHERE id = ?"
    ).bind(orderId).run();
  }

  // 6. 若存在差额（账号不足），标记为待补齐，便于管理员继续创建
  if (shortfall > 0) {
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '补发审查待补齐', '工单 #' || ? || ' 账号不足：需 ' || ? || ' 个，已创建 ' || ? || ' 个，待补齐 ' || ? || ' 个', 'order')"
    ).bind(order.user_id, orderId, quantity, createdCount, shortfall).run();
  }

  // 7. 记录日志
  const notes = [];
  if (resetCount > 0) notes.push('已重置 ' + resetCount + ' 个失败账号，下次扫描将重新处理');
  if (shortfall > 0) notes.push('已创建 ' + createdCount + '/' + quantity + '，缺 ' + shortfall + ' 个待补齐');
  if (notes.length === 0) notes.push('账号数量已达标，无需处理');

  return json({
    ok: true,
    reset_count: resetCount,
    shortfall,
    created_count: createdCount,
    quantity,
    failed_accounts: failedList.map(a => ({ id: a.id, username: a.username, error: a.error_msg })),
    message: notes.join('；'),
  });
}
