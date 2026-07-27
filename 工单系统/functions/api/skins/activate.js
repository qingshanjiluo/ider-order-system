// functions/api/skins/activate.js — POST /api/skins/activate
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);

  const body = await request.json().catch(() => ({}));
  const code = (body.code || '').trim().toUpperCase();
  if (!code) return json({ error: '请输入激活码' }, 400);

  const ac = await env.DB.prepare(
    'SELECT id, skin_id, user_id, expires_at FROM activation_codes WHERE code = ?'
  ).bind(code).first();

  if (!ac) return json({ error: '激活码不存在' }, 404);
  if (ac.user_id !== 0) return json({ error: '激活码已被使用' }, 400);
  if (ac.expires_at && new Date(ac.expires_at) < new Date()) {
    return json({ error: '激活码已过期' }, 400);
  }

  const skin = await env.DB.prepare(
    'SELECT id, name, key, label FROM skins WHERE id = ? AND is_active = 1'
  ).bind(ac.skin_id).first();

  if (!skin) return json({ error: '关联皮肤不存在或已下架' }, 404);

  const existing = await env.DB.prepare(
    'SELECT id FROM user_skins WHERE user_id = ? AND skin_id = ?'
  ).bind(user.id, ac.skin_id).first();

  if (existing) return json({ error: '您已拥有该皮肤' }, 400);

  await env.DB.prepare(
    'UPDATE activation_codes SET user_id = ?, used_at = datetime(\'now\') WHERE id = ?'
  ).bind(user.id, ac.id).run();

  await env.DB.prepare(
    'INSERT INTO user_skins (user_id, skin_id, created_at) VALUES (?, ?, datetime(\'now\'))'
  ).bind(user.id, ac.skin_id).run();

  return json({ ok: true, message: `皮肤「${skin.label}」激活成功！`, skin: { id: skin.id, name: skin.name, key: skin.key, label: skin.label } });
}
