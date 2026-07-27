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

  const skin = await env.DB.prepare(
    'SELECT id, name, key, label, price FROM skins WHERE id = ? AND is_active = 1'
  ).bind(skinId).first();

  if (!skin) return json({ error: '皮肤不存在或已下架' }, 404);

  const existing = await env.DB.prepare(
    'SELECT id FROM user_skins WHERE user_id = ? AND skin_id = ?'
  ).bind(user.id, skinId).first();

  if (existing) return json({ error: '您已拥有该皮肤' }, 400);

  const cost = skin.price;
  if (cost > 0) {
    const userInfo = await env.DB.prepare('SELECT bonus_points FROM users WHERE id = ?').bind(user.id).first();
    const balance = userInfo?.bonus_points || 0;
    if (balance < cost) return json({ error: `修仙币不足，需要 ${cost} 修仙币` }, 400);
    await env.DB.prepare('UPDATE users SET bonus_points = bonus_points - ? WHERE id = ?').bind(cost, user.id).run();
  }

  await env.DB.prepare(
    'INSERT INTO user_skins (user_id, skin_id, is_active, created_at) VALUES (?, ?, 1, datetime(\'now\'))'
  ).bind(user.id, skinId).run();

  await env.DB.prepare(
    'UPDATE user_skins SET is_active = 0 WHERE user_id = ? AND skin_id != ?'
  ).bind(user.id, skinId).run();

  return json({
    ok: true,
    message: cost > 0 ? `购买成功！花费 ${cost} 修仙币，已自动使用皮肤「${skin.label}」` : `已免费领取皮肤「${skin.label}」并自动使用`,
    skin: { id: skin.id, name: skin.name, key: skin.key, label: skin.label },
    cost,
  });
}
