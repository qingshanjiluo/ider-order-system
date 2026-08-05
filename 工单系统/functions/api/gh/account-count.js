// functions/api/gh/account-count.js — GET /api/gh/account-count?order_id=X
// 返回指定工单关联的账号数量（按状态分组）
// valid: 有效已交付账号（挂机/满级且配置完成）— 扫描器以此判断需补发多少
import { json } from '../../_utils.js';
import { authenticateApi } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);

  const url = new URL(request.url);
  const order_id = url.searchParams.get('order_id');
  if (!order_id) return json({ error: '缺少 order_id' }, 400);

  const stats = await env.DB.prepare(
    "SELECT status, setup_status, COUNT(*) as cnt FROM game_accounts WHERE order_id = ? GROUP BY status, setup_status"
  ).bind(order_id).all();

  const rows = stats.results || [];
  const total = rows.reduce((s, r) => s + r.cnt, 0);
  const byStatus = {};
  const bySetup = {};
  // 有效 = 挂机/满级 且 配置完成
  const VALID_SETUP = ['farming', 'active', 'completed'];
  let valid = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + r.cnt;
    bySetup[r.setup_status || ''] = (bySetup[r.setup_status || ''] || 0) + r.cnt;
    if (['farming', 'active', 'completed'].includes(r.status) && VALID_SETUP.includes(r.setup_status)) {
      valid += r.cnt;
    }
  }

  return json({ ok: true, order_id: parseInt(order_id), total, valid, by_status: byStatus, by_setup: bySetup });
}
