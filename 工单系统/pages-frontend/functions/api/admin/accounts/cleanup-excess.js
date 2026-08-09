// functions/api/admin/accounts/cleanup-excess.js
// POST /api/admin/accounts/cleanup-excess — 一键清理所有超额注册账号
// 对每个超过订购数量的工单，保留前 quantity 个（失败优先删），其余清理
import { json, logActivity } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

const MAX_ORDERS_PER_CALL = 30; // 单次最多处理工单数
const CHUNK = 50;               // 每批处理的账号数（D1 batch 每次最多约100条语句）

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user || !(user.role === 'admin' || user.role === 'super_admin' || user.is_admin))
    return json({ error: '无权限' }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const { order_id, max_orders } = body;

    let targetOrders = [];
    if (order_id) {
      targetOrders = [parseInt(order_id)].filter(Boolean);
    } else {
      const overOrders = await env.DB.prepare(
        `SELECT o.id as order_id, o.quantity,
          (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') as account_count
         FROM orders o
         WHERE o.quantity > 0
           AND (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') > o.quantity
         ORDER BY ((SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') - o.quantity) DESC
         LIMIT ?`
      ).bind(Math.min(max_orders || MAX_ORDERS_PER_CALL, MAX_ORDERS_PER_CALL)).all();
      targetOrders = (overOrders.results || []).map(r => r.order_id);
    }

    if (!targetOrders.length) return json({ ok: true, cleaned: 0, orders_processed: 0, message: '没有需要清理的超额工单' });

    let totalCleaned = 0;
    const orderResults = [];

    for (const oid of targetOrders) {
      const order = await env.DB.prepare('SELECT quantity FROM orders WHERE id = ?').bind(oid).first();
      if (!order || order.quantity <= 0) continue;

      // 该工单需要纳入"超额判断"的账号：排除已清理/已满级完成的（避免反复清理）
      // 排序：健康账号（farming/active/completed）优先保留；failed/error 最靠后（最先被清理）
      const allAcc = await env.DB.prepare(
        "SELECT id FROM game_accounts WHERE order_id = ? AND health_status != 'cleaned' ORDER BY CASE WHEN status IN ('failed','error') THEN 3 WHEN status IN ('farming','active','completed') THEN 0 ELSE 2 END, COALESCE(level,0) DESC, id ASC"
      ).bind(oid).all();
      const allRows = allAcc.results || [];
      const keepIds = allRows.slice(0, order.quantity).map(a => a.id);
      const excessIds = allRows.filter(a => !keepIds.includes(a.id)).map(a => a.id);

      if (!excessIds.length) continue;

      // 查询超额账号信息用于日志（分批查询）
      const accInfoRows = [];
      for (let i = 0; i < excessIds.length; i += CHUNK) {
        const chunkIds = excessIds.slice(i, i + CHUNK);
        const ph = chunkIds.map(() => '?').join(',');
        const accInfo = await env.DB.prepare(
          `SELECT id, username, server_username FROM game_accounts WHERE id IN (${ph})`
        ).bind(...chunkIds).all();
        accInfoRows.push(...(accInfo.results || []));
      }

      // 分批 batch 清理
      for (let i = 0; i < accInfoRows.length; i += CHUNK) {
        const chunk = accInfoRows.slice(i, i + CHUNK);
        const stmts = [];
        for (const acc of chunk) {
          stmts.push(
            env.DB.prepare(
              "UPDATE game_accounts SET status = 'completed', health_status = 'cleaned', stop_monitor_at = datetime('now'), last_check_at = datetime('now') WHERE id = ?"
            ).bind(acc.id)
          );
          stmts.push(
            env.DB.prepare(
              "INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES (?, ?, 'admin_clean', ?)"
            ).bind(acc.id, oid, '一键清理超额: ' + (acc.server_username || acc.username || '?'))
          );
        }
        await env.DB.batch(stmts);
      }

      await env.DB.prepare(
        "UPDATE orders SET total_accounts_created = (SELECT COUNT(*) FROM game_accounts WHERE order_id = ? AND status NOT IN ('failed','completed')) WHERE id = ?"
      ).bind(oid, oid).run();

      totalCleaned += excessIds.length;
      orderResults.push({ order_id: oid, quantity: order.quantity, kept: keepIds.length, cleaned: excessIds.length });
    }

    if (totalCleaned === 0) return json({ ok: true, cleaned: 0, orders_processed: orderResults.length, message: '没有需要清理的超额账号' });

    await logActivity(env, null, user.id, 'admin_cleanup_excess', '一键清理超额: ' + totalCleaned + ' 个账号，处理 ' + orderResults.length + ' 个工单');

    const more = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM orders o WHERE o.quantity > 0
        AND (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') > o.quantity`
    ).first();

    return json({
      ok: true,
      cleaned: totalCleaned,
      orders_processed: orderResults.length,
      orders: orderResults,
      has_more: (more?.cnt || 0) > 0,
      message: '已清理 ' + totalCleaned + ' 个超额账号，处理 ' + orderResults.length + ' 个工单' + ((more?.cnt || 0) > 0 ? '（还有剩余，可再次点击）' : ''),
    });
  } catch (e) {
    return json({ ok: false, error: '清理失败: ' + (e.message || e) }, 500);
  }
}
