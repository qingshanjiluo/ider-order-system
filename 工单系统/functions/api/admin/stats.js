// functions/api/admin/stats.js — GET /api/admin/stats
// 营收统一转换为人民币（RMB）：
//   wechat: price 已是人民币
//   coin:   price 是修仙币，120积分=1元 → RMB = price / 120
//   spirit_stone: price 是万灵石，通过 config 比例转换为 RMB
import { json } from '../../_utils.js';
import { authenticateAdmin } from '../../_auth.js';

// 辅助函数：将 price 按支付方式转换为人民币
// SQLite CASE 表达式模板（需与 spirit_stone_per_10_points 配置配合）
const REVENUE_TO_RMB = `
  CASE
    WHEN payment_method = 'wechat' THEN price
    WHEN payment_method = 'coin' THEN price / 120.0
    WHEN payment_method = 'spirit_stone' THEN price * 120.0 * 10000.0 / (
      SELECT CAST(value AS REAL) FROM config WHERE key = 'spirit_stone_per_10_points' LIMIT 1
    )
    ELSE 0
  END`;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const { user: admin, error } = await authenticateAdmin(request, env);
    if (error) return json({ error }, 403);

    const [totalUsers, totalOrders, approvedOrders, completedOrders, rejectedOrders, pendingOrders,
           activeOrders,
           totalAccounts, onlineAccounts, completedAccounts, errorAccounts,
           totalRevenue, todayOrders, todayRevenue, weeklyOrders] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first(),
      env.DB.prepare('SELECT COUNT(*) as cnt FROM orders').first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='approved'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='completed'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='rejected'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='pending'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='active'").first(),
      env.DB.prepare('SELECT COUNT(*) as cnt FROM game_accounts').first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts WHERE status IN ('farming','active')").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts WHERE status='completed'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts WHERE status IN ('error','failed')").first(),
      // 总营收：所有支付方式统一转换为人民币
      env.DB.prepare(`SELECT COALESCE(SUM(${REVENUE_TO_RMB}), 0) as total FROM orders WHERE status IN ('approved','completed','active')`).first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE created_at >= datetime('now', '-1 day')").first(),
      // 今日营收：所有支付方式统一转换为人民币
      env.DB.prepare(`SELECT COALESCE(SUM(${REVENUE_TO_RMB}), 0) as total FROM orders WHERE created_at >= datetime('now', '-1 day') AND status IN ('approved','completed','active')`).first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE created_at >= datetime('now', '-7 days')").first(),
    ]);

    // Level distribution
    const levelDist = await env.DB.prepare(
      "SELECT level, COUNT(*) as cnt FROM users GROUP BY level ORDER BY level"
    ).all();

    // Order status distribution for chart
    const orderStatusDist = await env.DB.prepare(
      "SELECT status, COUNT(*) as cnt FROM orders GROUP BY status"
    ).all();

    // Account status distribution
    const accountStatusDist = await env.DB.prepare(
      "SELECT status, COUNT(*) as cnt FROM game_accounts GROUP BY status"
    ).all();

    // Top users by spending
    const topSpenders = await env.DB.prepare(
      "SELECT id, username, display_name, total_spent, total_orders, level FROM users WHERE total_spent > 0 ORDER BY total_spent DESC LIMIT 5"
    ).all();

    // Recent 7-day order trend（营收统一转换为人民币）
    const dailyTrend = await env.DB.prepare(
      `SELECT date(created_at) as day, COUNT(*) as cnt, COALESCE(SUM(${REVENUE_TO_RMB}), 0) as revenue FROM orders WHERE created_at >= datetime('now', '-7 days') GROUP BY date(created_at) ORDER BY day`
    ).all();

    return json({
      ok: true,
      stats: {
        total_users: totalUsers.cnt,
        total_orders: totalOrders.cnt,
        approved_orders: approvedOrders.cnt,
        completed_orders: completedOrders.cnt,
        rejected_orders: rejectedOrders.cnt,
        pending_orders: pendingOrders.cnt,
        active_orders: activeOrders.cnt,
        total_accounts: totalAccounts.cnt,
        online_accounts: onlineAccounts.cnt,
        completed_accounts: completedAccounts.cnt,
        error_accounts: errorAccounts.cnt,
        total_revenue: totalRevenue.total || 0,
        today_orders: todayOrders.cnt,
        today_revenue: todayRevenue.total || 0,
        weekly_orders: weeklyOrders.cnt,
        level_distribution: levelDist.results,
        order_status_distribution: orderStatusDist.results,
        account_status_distribution: accountStatusDist.results,
        top_spenders: topSpenders.results,
        daily_trend: dailyTrend.results,
      },
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
