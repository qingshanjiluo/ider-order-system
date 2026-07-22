// functions/api/appeals/index.js — GET|POST /api/appeals
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录' }, 401);
    const appeals = await env.DB.prepare(
      "SELECT * FROM appeals WHERE user_id = ? AND type != 'after_sales' ORDER BY created_at DESC"
    ).bind(user.id).all();
    return json({ ok: true, appeals: appeals.results });
  }

  if (request.method === 'POST') {
    try {
      const user = await authenticate(request, env);
      if (!user) return json({ error: '未登录' }, 401);
      const body = await request.json().catch(() => ({}));
      const { order_id, title, content, type } = body;
      if (!title || !content) return json({ error: '请填写标题和内容' }, 400);
      // 使用 null 而非 0 以避免外键约束问题
      const orderIdVal = order_id ? Number(order_id) : null;
      await env.DB.prepare(
        "INSERT INTO appeals (user_id, order_id, title, content, type, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))"
      ).bind(user.id, orderIdVal, title, content, type || 'appeal').run();
      return json({ ok: true, message: '申诉已提交' });
    } catch (err) {
      console.error('Appeal POST error:', err);
      return json({ error: '提交失败: ' + (err.message || '服务器错误') }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
