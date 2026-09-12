// functions/api/gh/cleanup-excess.js — POST /api/gh/cleanup-excess
//
// 供自动化（GitHub Actions）调用的"超额账号清理"端点，用 API Key 鉴权，
// 不需要管理员会话——这样定时任务可以在 D1 每日额度重置后立刻执行清理，
// 而不必等人工点按钮。
//
// 逻辑与管理员界面的一键清理超额完全共用（_cleanup_excess.js）：
// 每张工单保留 quantity + 1 个，其余软清理（status=completed +
// health_status=cleaned + stop_monitor_at=now）。
import { json } from '../../_utils.js';
import { authenticateApi } from '../../_auth.js';
import { cleanupExcess, MAX_ORDERS_PER_CALL } from '../../_cleanup_excess.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const result = await cleanupExcess(env, {
      orderId: body.order_id ? parseInt(body.order_id) : null,
      maxOrders: body.max_orders || MAX_ORDERS_PER_CALL,
    });

    return json({
      ok: true,
      cleaned: result.cleaned,
      orders_processed: result.orders_processed,
      orders: result.orders,
      has_more: result.has_more,
      message: result.cleaned > 0
        ? '已清理 ' + result.cleaned + ' 个超额账号，处理 ' + result.orders_processed + ' 个工单'
        : '没有需要清理的超额账号',
    });
  } catch (e) {
    return json({ ok: false, error: '清理失败: ' + (e.message || e) }, 500);
  }
}
