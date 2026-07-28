// functions/api/admin/accounts/retry-all.js — POST /api/admin/accounts/retry-all
import { json } from '../../../_utils.js';
import { authenticateAdmin } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { user, error } = await authenticateAdmin(request, env);
  if (error) return json({ error }, 403);

  const failed = await env.DB.prepare(
    "SELECT id, username, order_id, error_msg FROM game_accounts WHERE status = 'failed'"
  ).all();
  const list = failed.results || [];

  let count = 0;
  for (const acc of list) {
    await env.DB.prepare(
      "UPDATE game_accounts SET status = 'registering', setup_status = 'pending', error_msg = '' WHERE id = ?"
    ).bind(acc.id).run();
    await env.DB.prepare(
      "INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES (?, ?, 'retry', '批量一键重试')"
    ).bind(acc.id, acc.order_id).run();
    count++;
  }

  return json({
    ok: true,
    retried: count,
    message: count > 0 ? ('已重置 ' + count + ' 个失败账号，下次扫描将重新处理') : '没有失败账号需要重试',
  });
}
