// functions/api/admin/accounts/delete.js
// POST /api/admin/accounts/delete — 批量清理账号（标记为completed+停止监控）
// 高效实现：使用 D1 batch 一次提交所有操作，避免逐账号循环导致超时
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

  let deleteIds = [];
  let targetOrderId = order_id ? parseInt(order_id) : null;

  // ── 1. 确定要清理的账号 ID ──────────────────────────
  if (ids && Array.isArray(ids) && ids.length > 0) {
    deleteIds = ids.map(Number).filter(Boolean);
  } else if (targetOrderId) {
    if (excess_only) {
      // 超额清理：保留该工单前 quantity 个（失败/错误优先删，等级最低优先删），其余清理
      const order = await env.DB.prepare('SELECT quantity FROM orders WHERE id = ?').bind(targetOrderId).first();
      if (order && order.quantity > 0) {
        const allAcc = await env.DB.prepare(
          "SELECT id FROM game_accounts WHERE order_id = ? ORDER BY CASE WHEN status IN ('failed','error') THEN 0 ELSE 1 END, COALESCE(level,0) ASC, id ASC"
        ).bind(targetOrderId).all();
        const allRows = allAcc.results || [];
        const keepIds = allRows.slice(0, order.quantity).map(a => a.id);
        deleteIds = allRows.filter(a => !keepIds.includes(a.id)).map(a => a.id);
      } else {
        // quantity=0 → 清理全部
        const allAcc = await env.DB.prepare('SELECT id FROM game_accounts WHERE order_id = ?').bind(targetOrderId).all();
        deleteIds = (allAcc.results || []).map(a => a.id);
      }
    } else {
      const allAcc = await env.DB.prepare('SELECT id FROM game_accounts WHERE order_id = ?').bind(targetOrderId).all();
      deleteIds = (allAcc.results || []).map(a => a.id);
    }
  } else {
    return json({ error: '请指定要清理的账号' }, 400);
  }

  // 限制单次清理数量，防止一次过多导致超时（分批可重复调用）
  const MAX_PER_CALL = 500;
  if (deleteIds.length > MAX_PER_CALL) {
    return json({ error: `一次最多清理 ${MAX_PER_CALL} 个，当前 ${deleteIds.length} 个，请分批操作或使用一键清理`, count: deleteIds.length }, 400);
  }

  if (deleteIds.length === 0) return json({ ok: true, deleted: 0, total: 0, message: '没有需要清理的账号' });

  // ── 2. 查询要清理账号的信息（用于日志） ─────────────
  const placeholders = deleteIds.map(() => '?').join(',');
  const accInfo = await env.DB.prepare(
    `SELECT id, username, server_username, order_id FROM game_accounts WHERE id IN (${placeholders})`
  ).bind(...deleteIds).all();
  const rows = accInfo.results || [];

  // ── 3. 构造批量操作：一次提交所有 UPDATE + INSERT ────
  const stmts = [];
  const logBatch = [];
  for (const acc of rows) {
    stmts.push(
      env.DB.prepare(
        "UPDATE game_accounts SET status = 'completed', health_status = 'cleaned', stop_monitor_at = datetime('now'), last_check_at = datetime('now') WHERE id = ?"
      ).bind(acc.id)
    );
    logBatch.push({ account_id: acc.id, order_id: acc.order_id, name: acc.server_username || acc.username || '?' });
  }
  // 账号日志批量插入（拼接多值，避免逐条插入）
  if (logBatch.length > 0) {
    const vals = logBatch.map(() => '(?, ?, \'admin_clean\', ?)').join(',');
    const logParams = [];
    for (const l of logBatch) logParams.push(l.account_id, l.order_id, '管理员批量清理: ' + l.name);
    stmts.push(env.DB.prepare(`INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES ${vals}`).bind(...logParams));
  }

  // 更新订单 total_accounts_created（若指定了订单）
  if (targetOrderId) {
    stmts.push(
      env.DB.prepare(
        "UPDATE orders SET total_accounts_created = (SELECT COUNT(*) FROM game_accounts WHERE order_id = ? AND status NOT IN ('failed','completed')) WHERE id = ?"
      ).bind(targetOrderId, targetOrderId)
    );
  }

  await env.DB.batch(stmts);

  await logActivity(env, targetOrderId || 0, user.id, 'admin_clean', '批量清理 ' + rows.length + ' 个账号');

  return json({ ok: true, deleted: rows.length, total: deleteIds.length, details: rows.map(a => ({ id: a.id, username: a.username, status: 'cleaned' })) });
}
