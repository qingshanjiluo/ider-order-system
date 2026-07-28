import { json } from '../../_utils.js';
import { authenticateApi } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);

  const body = await request.json().catch(() => ({}));
  const { order_id, game_account_name } = body;
  if (!order_id) return json({ error: '缺少 order_id' }, 400);

  await env.DB.prepare(
    "UPDATE orders SET game_account_name = COALESCE(NULLIF(?, ''), game_account_name), status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END, updated_at = datetime('now') WHERE id = ?"
  ).bind(game_account_name || '', order_id).run();

  await env.DB.prepare(
    "INSERT INTO account_logs (account_id, order_id, log_type, message, raw_output) VALUES (0, ?, 'trial_test', '试炼测试已触发', ?)"
  ).bind(order_id, JSON.stringify({ game_account_name })).run();

  return json({ ok: true, message: '试炼测试已触发' });
}
