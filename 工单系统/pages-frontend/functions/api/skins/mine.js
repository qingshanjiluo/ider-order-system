// functions/api/skins/mine.js — GET /api/skins/mine
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);

  const owned = await env.DB.prepare(`
    SELECT us.id as user_skin_id, us.is_active, s.id, s.name, s.key, s.label, s.description, s.preview_url, us.created_at
    FROM user_skins us JOIN skins s ON us.skin_id = s.id
    WHERE us.user_id = ?
    ORDER BY us.is_active DESC, us.created_at DESC
  `).bind(user.id).all();

  const active = await env.DB.prepare(`
    SELECT s.id, s.name, s.key, s.label, s.css_url
    FROM user_skins us JOIN skins s ON us.skin_id = s.id
    WHERE us.user_id = ? AND us.is_active = 1
    LIMIT 1
  `).bind(user.id).first();

  return json({ ok: true, owned: owned.results, active: active || null });
}
