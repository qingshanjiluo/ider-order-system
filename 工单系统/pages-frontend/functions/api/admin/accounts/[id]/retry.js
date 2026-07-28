// functions/api/admin/accounts/[id]/retry.js — POST /api/admin/accounts/:id/retry
import { json } from '../../../../_utils.js';
import { authenticateAdmin } from '../../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'POST') {
    const { user, error } = await authenticateAdmin(request, env);
    if (error) return json({ error }, 403);

    const account = await env.DB.prepare(
      'SELECT id, status, order_id FROM game_accounts WHERE id = ?'
    ).bind(parseInt(params.id)).first();

    if (!account) return json({ error: '账号不存在' }, 404);
    if (account.status !== 'failed') return json({ error: '只有失败状态的账号才能重试' }, 400);

    await env.DB.prepare(
      `UPDATE game_accounts SET status = 'registering', setup_status = 'pending', error_msg = '' WHERE id = ?`
    ).bind(parseInt(params.id)).run();

    await env.DB.prepare(
      `INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES (?, ?, 'retry', ?)`
    ).bind(parseInt(params.id), account.order_id, '管理员手动重试').run();

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
