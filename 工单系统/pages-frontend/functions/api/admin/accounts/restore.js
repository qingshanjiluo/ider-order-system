// functions/api/admin/accounts/restore.js
// POST /api/admin/accounts/restore — 恢复被误清理的账号
// 仅恢复"健康"的已清理账号（有角色名且有等级），这些是误清理的应保留账号
import { json, logActivity } from '../../../_utils.js';
import { authenticate } from '../../../_auth.js';

const CHUNK = 200;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user || !(user.role === 'admin' || user.role === 'super_admin' || user.is_admin))
    return json({ error: '无权限' }, 403);

  const body = await request.json().catch(() => ({}));
  const { order_id } = body; // 可选：只恢复指定工单

  let where = "health_status = 'cleaned' AND character_name != '' AND COALESCE(level,0) > 0";
  const params = [];
  if (order_id) {
    where += ' AND order_id = ?';
    params.push(parseInt(order_id));
  }

  // 统计可恢复数量
  const cntRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM game_accounts WHERE ${where}`
  ).bind(...params).first();
  const total = cntRow?.cnt || 0;
  if (total === 0) return json({ ok: true, restored: 0, message: '没有需要恢复的账号' });

  // 分批恢复（每批一个 UPDATE，无需逐条）
  let restored = 0;
  let offset = 0;
  const BATCH = 500;
  while (true) {
    const rows = await env.DB.prepare(
      `SELECT id FROM game_accounts WHERE ${where} LIMIT ${BATCH}`
    ).bind(...params).all();
    const list = rows.results || [];
    if (!list.length) break;

    const stmts = [];
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      const ids = chunk.map(() => '?').join(',');
      stmts.push(
        env.DB.prepare(
          `UPDATE game_accounts SET health_status = 'ok', stop_monitor_at = NULL WHERE id IN (${ids})`
        ).bind(...chunk.map(a => a.id))
      );
    }
    // 分批执行
    for (let i = 0; i < stmts.length; i += 20) {
      await env.DB.batch(stmts.slice(i, i + 20));
    }
    restored += list.length;
    offset += list.length;
    if (list.length < BATCH) break;
  }

  await logActivity(env, order_id ? parseInt(order_id) : null, user.id, 'admin_restore', '恢复误清理账号 ' + restored + ' 个');

  return json({ ok: true, restored, message: '已恢复 ' + restored + ' 个被误清理的健康账号，请重新执行一键清理超额' });
}
