// functions/api/skins/use.js — POST /api/skins/use
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);

  const body = await request.json().catch(() => ({}));
  const skinId = parseInt(body.skin_id);

  if (!skinId) return json({ error: '请指定皮肤' }, 400);

  const owned = await env.DB.prepare(
    'SELECT id FROM user_skins WHERE user_id = ? AND skin_id = ?'
  ).bind(user.id, skinId).first();

  if (!owned) return json({ error: '您未拥有该皮肤' }, 403);

  await env.DB.prepare(
    'UPDATE user_skins SET is_active = 0 WHERE user_id = ?'
  ).bind(user.id).run();

  await env.DB.prepare(
    'UPDATE user_skins SET is_active = 1 WHERE user_id = ? AND skin_id = ?'
  ).bind(user.id, skinId).run();

  const skin = await env.DB.prepare(
    'SELECT id, name, key, label, css_url FROM skins WHERE id = ?'
  ).bind(skinId).first();

  return json({ ok: true, message: `已切换至「${skin.label}」`, skin });
}
