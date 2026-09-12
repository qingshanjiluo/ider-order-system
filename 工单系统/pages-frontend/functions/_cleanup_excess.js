// _cleanup_excess.js — 清理超出订购数量的账号
//
// 管理员界面（POST /api/admin/accounts/cleanup-excess）与自动化
// （POST /api/gh/cleanup-excess）共用同一份逻辑，避免两处实现漂移。
//
// 语义（与既有"一键清理超额"完全一致）：
//   - 只处理 account_count > quantity + 1 的工单；
//   - 每张工单保留 quantity + 1 个（健康账号、等级高者优先保留；
//     failed/error 最优先被清理）；
//   - 其余账号做"软清理"：status='completed' + health_status='cleaned'
//     + stop_monitor_at=now，使其不再被健康检测/自动升级遍历；
//   - 单次最多处理 MAX_ORDERS_PER_CALL 张工单，账号按 CHUNK 分批提交。

export const MAX_ORDERS_PER_CALL = 30; // 单次最多处理工单数
const CHUNK = 50;                      // 每批处理的账号数（D1 batch 每次最多约100条语句）

/**
 * @param {object} env
 * @param {object} [opts]
 * @param {number|string} [opts.orderId]  只处理指定工单
 * @param {number} [opts.maxOrders]       不指定 orderId 时最多处理多少张超额工单
 * @returns {Promise<{cleaned:number, orders_processed:number, orders:Array, has_more:boolean}>}
 */
export async function cleanupExcess(env, opts = {}) {
  const { orderId = null } = opts;
  const maxOrders = Math.min(opts.maxOrders || MAX_ORDERS_PER_CALL, MAX_ORDERS_PER_CALL);

  // ── 1. 确定目标工单 ──────────────────────────────
  let targetOrders = [];
  if (orderId) {
    targetOrders = [parseInt(orderId)].filter(Boolean);
  } else {
    const overOrders = await env.DB.prepare(
      `SELECT o.id as order_id, o.quantity,
        (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') as account_count
       FROM orders o
       WHERE o.quantity > 0
         AND (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') > o.quantity + 1
       ORDER BY ((SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') - o.quantity) DESC
       LIMIT ?`
    ).bind(maxOrders).all();
    targetOrders = (overOrders.results || []).map(r => r.order_id);
  }

  if (!targetOrders.length) {
    return { cleaned: 0, orders_processed: 0, orders: [], has_more: false };
  }

  // ── 2. 逐工单清理 ────────────────────────────────
  let totalCleaned = 0;
  const orderResults = [];

  for (const oid of targetOrders) {
    const order = await env.DB.prepare('SELECT quantity FROM orders WHERE id = ?').bind(oid).first();
    if (!order || order.quantity <= 0) continue;

    // 该工单需要纳入"超额判断"的账号：排除已清理的（避免反复清理）
    // 排序：健康账号（farming/active/completed）优先保留；failed/error 最靠后（最先被清理）
    const allAcc = await env.DB.prepare(
      "SELECT id FROM game_accounts WHERE order_id = ? AND health_status != 'cleaned' ORDER BY CASE WHEN status IN ('failed','error') THEN 3 WHEN status IN ('farming','active','completed') THEN 0 ELSE 2 END, COALESCE(level,0) DESC, id ASC"
    ).bind(oid).all();
    const allRows = allAcc.results || [];
    // 保留 订购数量 + 1 个（含1个冗余缓冲）
    const keepCount = order.quantity + 1;
    const keepIds = allRows.slice(0, keepCount).map(a => a.id);
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

  // ── 3. 是否还有剩余超额工单 ──────────────────────
  let hasMore = false;
  if (totalCleaned > 0) {
    const more = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM orders o WHERE o.quantity > 0
        AND (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') > o.quantity + 1`
    ).first();
    hasMore = (more?.cnt || 0) > 0;
  }

  return { cleaned: totalCleaned, orders_processed: orderResults.length, orders: orderResults, has_more: hasMore };
}
