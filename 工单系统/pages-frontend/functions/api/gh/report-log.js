// functions/api/gh/report-log.js — POST /api/gh/report-log
import { json } from '../../_utils.js';
import { authenticateApi } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'POST') {
    if (!authenticateApi(request, env)) return json({ error: '无效API密钥' }, 403);
    const body = await request.json().catch(() => ({}));
    let { account_id, order_id, log_type, message, raw_output, username } = body;
    if (!account_id && order_id) {
      let query, params;
      if (username) {
        query = 'SELECT id FROM game_accounts WHERE order_id = ? AND username = ? LIMIT 1';
        params = [order_id, username];
      } else {
        query = 'SELECT id FROM game_accounts WHERE order_id = ? ORDER BY id ASC LIMIT 1';
        params = [order_id];
      }
      const acc = await env.DB.prepare(query).bind(...params).first();
      if (acc) account_id = acc.id;
    }
    await env.DB.prepare(
      "INSERT INTO account_logs (account_id, order_id, log_type, message, raw_output) VALUES (?, ?, ?, ?, ?)"
    ).bind(account_id || 0, order_id || 0, log_type || 'info', message || '', raw_output || '').run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
