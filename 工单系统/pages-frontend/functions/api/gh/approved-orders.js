// functions/api/gh/approved-orders.js — GET /api/gh/approved-orders
//
// 只向自动化扫描器下发「购买邀请积分」工单。其余类型（仙盟采集 / 试炼测试 /
// 每日试炼 / 传人派出 / 副本刷取）已下线，不得被获取或处理。
import { json } from '../../_utils.js';
import { authenticateApi } from '../../_auth.js';
import { INVITE_ORDER_TYPE_SQL } from '../../_order_types.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);
    const orders = await env.DB.prepare(
      `SELECT o.*, u.username as user_name FROM orders o JOIN users u ON o.user_id = u.id
       WHERE o.status = 'approved' AND ${INVITE_ORDER_TYPE_SQL}
       ORDER BY o.id ASC`
    ).all();
    return json({ ok: true, orders: orders.results });
  }

  return json({ error: 'Method not allowed' }, 405);
}
