// functions/api/after-sales/index.js — GET|POST /api/after-sales
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);
    const items = await env.DB.prepare(
      "SELECT a.*, o.invite_code as order_invite_code FROM appeals a LEFT JOIN orders o ON a.order_id = o.id WHERE a.user_id = ? AND a.type IN ('after_sales','appeal') ORDER BY a.created_at DESC"
    ).bind(user.id).all();
    return json({ ok: true, items: items.results });
  }

  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);
    const body = await request.json().catch(() => ({}));
    let { order_id, title, content, type } = body;
    if (!content) return json({ error: '请填写内容' }, 400);
    if (!order_id) return json({ error: '请选择相关工单' }, 400);
    if (!title) title = type || '售后';
    await env.DB.prepare(
      "INSERT INTO appeals (user_id, order_id, title, content, type, status, created_at) VALUES (?, ?, ?, ?, 'after_sales', 'pending', datetime('now'))"
    ).bind(user.id, order_id, title, content).run();
    return json({ ok: true, message: '售后请求已提交，等待管理员回复' });
  }

  return json({ error: 'Method not allowed' }, 405);
}
