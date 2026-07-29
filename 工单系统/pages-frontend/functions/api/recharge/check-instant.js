// functions/api/recharge/check-instant.js — POST /api/recharge/check-instant
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const body = await request.json().catch(() => ({}));
  const { recharge_id } = body;

  const record = await env.DB.prepare(
    "SELECT * FROM recharge_instant WHERE id = ? AND user_id = ?"
  ).bind(recharge_id, user.id).first();

  if (!record) return json({ error: '记录不存在' }, 404);
  if (record.status === 'completed') return json({ ok: true, status: 'completed', message: '已到账' });

  return json({ ok: true, status: record.status || 'pending', message: '等待买家购买...' });
}
