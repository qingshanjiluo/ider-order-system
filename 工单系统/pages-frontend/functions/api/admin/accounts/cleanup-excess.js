// functions/api/admin/accounts/cleanup-excess.js
// POST /api/admin/accounts/cleanup-excess — 一键清理所有超额注册账号
// 逻辑与自动化端点 /api/gh/cleanup-excess 共用 _cleanup_excess.js
import { json, logActivity } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';
import { cleanupExcess, MAX_ORDERS_PER_CALL } from '../../../_cleanup_excess.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user || !(user.role === 'admin' || user.role === 'super_admin' || user.is_admin))
    return json({ error: '无权限' }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const { order_id, max_orders } = body;

    const result = await cleanupExcess(env, {
      orderId: order_id ? parseInt(order_id) : null,
      maxOrders: max_orders || MAX_ORDERS_PER_CALL,
    });

    if (result.orders_processed === 0) {
      return json({ ok: true, cleaned: 0, orders_processed: 0, message: '没有需要清理的超额工单' });
    }
    if (result.cleaned === 0) {
      return json({ ok: true, cleaned: 0, orders_processed: result.orders_processed, message: '没有需要清理的超额账号' });
    }

    await logActivity(env, null, user.id, 'admin_cleanup_excess',
      '一键清理超额: ' + result.cleaned + ' 个账号，处理 ' + result.orders_processed + ' 个工单');

    return json({
      ok: true,
      cleaned: result.cleaned,
      orders_processed: result.orders_processed,
      orders: result.orders,
      has_more: result.has_more,
      message: '已清理 ' + result.cleaned + ' 个超额账号，处理 ' + result.orders_processed + ' 个工单' + (result.has_more ? '（还有剩余，可再次点击）' : ''),
    });
  } catch (e) {
    return json({ ok: false, error: '清理失败: ' + (e.message || e) }, 500);
  }
}
