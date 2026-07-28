// functions/api/admin/accounts/delete.js
// POST /api/admin/accounts/delete — 批量删除账号（标记为completed+清理）
import { json, logActivity } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user || !(user.role === 'admin' || user.role === 'super_admin' || user.is_admin))
    return json({ error: '无权限' }, 403);

  const body = await request.json().catch(() => ({}));
  const { ids, order_id, excess_only } = body;

  let conditions = [];
  let params = [];

  if (ids && Array.isArray(ids) && ids.length > 0) {
    conditions.push(`id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  } else if (order_id) {
    conditions.push('order_id = ?');
    params.push(order_id);
    if (excess_only) {
      // 只删除超出目标数量的账号
      const order = await env.DB.prepare('SELECT quantity FROM orders WHERE id = ?').bind(order_id).first();
      if (order?.quantity > 0) {
        conditions.push('id NOT IN (SELECT id FROM game_accounts WHERE order_id = ? ORDER BY id ASC LIMIT ?)');
        params.push(order_id, order.quantity);
      }
    }
  } else {
    return json({ error: '请指定要删除的账号' }, 400);
  }

  const query = `SELECT id, username, server_username, order_id, level FROM game_accounts WHERE ${conditions.join(' AND ')}`;
  const accounts = await env.DB.prepare(query).bind(...params).all();
  const rows = accounts.results || [];

  if (rows.length === 0) return json({ error: '没有匹配的账号' }, 404);

  // 先查询各工单的 quantity，用于超额判断
  const orderQuantities = {};
  const orderIds = [...new Set(rows.map(a => a.order_id))];
  for (const oid of orderIds) {
    const o = await env.DB.prepare('SELECT quantity, user_id FROM orders WHERE id = ?').bind(oid).first();
    if (o) orderQuantities[oid] = o;
  }

  let deleted = 0;
  const result = [];

  for (const acc of rows) {
    const oq = orderQuantities[acc.order_id];
    try {
      // 检查该工单超额情况
      const totalForOrder = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM game_accounts WHERE order_id = ? AND status NOT IN ('completed', 'failed')"
      ).bind(acc.order_id).first();

      await env.DB.prepare(
        "UPDATE game_accounts SET status = 'completed', health_status = 'cleaned', stop_monitor_at = datetime('now'), last_check_at = datetime('now') WHERE id = ?"
      ).bind(acc.id).run();

      await env.DB.prepare(
        "INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES (?, ?, 'admin_clean', ?)"
      ).bind(acc.id, acc.order_id, '管理员手动清理: ' + (acc.server_username || acc.username || '?')).run();

      deleted++;
      result.push({ id: acc.id, username: acc.username, status: 'cleaned' });
    } catch (e) {
      result.push({ id: acc.id, username: acc.username, error: e.message });
    }
  }

  // 如果有 order_id，更新 total_accounts_created
  if (order_id) {
    await env.DB.prepare(
      "UPDATE orders SET total_accounts_created = (SELECT COUNT(*) FROM game_accounts WHERE order_id = ? AND status NOT IN ('failed','completed')) WHERE id = ?"
    ).bind(order_id, order_id).run();
  }

  await logActivity(env, order_id || 0, user.id, 'admin_clean', '批量清理 ' + deleted + ' 个账号');

  return json({ ok: true, deleted, total: rows.length, details: result });
}
