// functions/api/admin/users/[id]/delete.js — DELETE /api/admin/users/:id/delete
import { json } from '../../../../_utils.js';
import { authenticate } from '../../../../_auth.js';

// 所有引用 users 表的关联表
const USER_RELATED_TABLES = [
  'sessions',
  'notifications',
  'appeals',
  'bot_logs',
  'order_activities',
  'redeem_log',
  'withdrawals',
  'checkin_logs',
];

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'DELETE') {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin) return json({ error: '无权限' }, 403);
    const targetId = parseInt(params.id);
    if (targetId === admin.id) return json({ error: '不能删除自己' }, 400);

    // 先删除所有关联数据（外键依赖）
    for (const table of USER_RELATED_TABLES) {
      try {
        await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(targetId).run();
      } catch (e) {
        // 表可能不存在，忽略
      }
    }

    // 处理 orders 表（可能关联 game_accounts）
    try {
      // 获取该用户的所有订单 ID
      const orders = await env.DB.prepare('SELECT id FROM orders WHERE user_id = ?').bind(targetId).all();
      for (const order of (orders.results || [])) {
        // 删除订单关联的 game_accounts（外键依赖）
        try {
          await env.DB.prepare('DELETE FROM game_accounts WHERE order_id = ?').bind(order.id).run();
        } catch (e) { /* 忽略 */ }
      }
      // 删除用户的所有订单
      await env.DB.prepare('DELETE FROM orders WHERE user_id = ?').bind(targetId).run();
    } catch (e) {
      // 忽略
    }

    // 处理 coupons（created_by 引用 users）
    try {
      await env.DB.prepare('DELETE FROM coupons WHERE created_by = ?').bind(targetId).run();
    } catch (e) { /* 忽略 */ }

    // 最后删除用户本身
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
    return json({ ok: true, message: '用户已删除' });
  }

  return json({ error: 'Method not allowed' }, 405);
}
