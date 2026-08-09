// functions/api/admin/accounts/retry-all.js — POST /api/admin/accounts/retry-all
// 高效实现：使用 D1 batch 分批重置，避免逐账号循环导致超时
import { json, logActivity } from '../../../_utils.js';
import { authenticateAdmin } from '../../../_auth.js';

const MAX_PER_CALL = 500;
const CHUNK = 50; // D1 batch 每次最多约100条语句

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { user, error } = await authenticateAdmin(request, env);
  if (error) return json({ error }, 403);

  const body = await request.json().catch(() => ({}));
  const { order_id, limit } = body;

  let list;
  const lim = Math.min(limit || MAX_PER_CALL, MAX_PER_CALL);
  if (order_id) {
    const failed = await env.DB.prepare(
      "SELECT id, username, order_id, error_msg FROM game_accounts WHERE status = 'failed' AND order_id = ? LIMIT ?"
    ).bind(parseInt(order_id), lim).all();
    list = failed.results || [];
  } else {
    const failed = await env.DB.prepare(
      "SELECT id, username, order_id, error_msg FROM game_accounts WHERE status = 'failed' LIMIT ?"
    ).bind(lim).all();
    list = failed.results || [];
  }

  if (!list.length) return json({ ok: true, retried: 0, message: '没有失败账号需要重试' });

  // 分批 batch 重置
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const stmts = [];
    for (const acc of chunk) {
      stmts.push(
        env.DB.prepare(
          "UPDATE game_accounts SET status = 'registering', setup_status = 'pending', error_msg = '' WHERE id = ?"
        ).bind(acc.id)
      );
      stmts.push(
        env.DB.prepare(
          "INSERT INTO account_logs (account_id, order_id, log_type, message) VALUES (?, ?, 'retry', '批量一键重试')"
        ).bind(acc.id, acc.order_id)
      );
    }
    await env.DB.batch(stmts);
  }

  await logActivity(env, order_id ? parseInt(order_id) : null, user.id, 'retry_all', '一键重试 ' + list.length + ' 个失败账号');

  return json({
    ok: true,
    retried: list.length,
    message: '已重置 ' + list.length + ' 个失败账号，下次扫描将重新处理' + (list.length >= lim ? '（还有更多，可再次点击）' : ''),
  });
}
