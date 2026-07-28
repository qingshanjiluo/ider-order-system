// functions/api/admin/skins/index.js — GET|POST /api/admin/skins
import { json } from '../../../_utils.js';
import { authenticate, isAdmin } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const user = await authenticate(request, env);
    if (!user || !isAdmin(user)) return json({ error: '无权限' }, 403);

    const skins = await env.DB.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM user_skins us WHERE us.skin_id = s.id) as owned_count,
        (SELECT COUNT(*) FROM activation_codes ac WHERE ac.skin_id = s.id) as code_count,
        (SELECT COUNT(*) FROM activation_codes ac WHERE ac.skin_id = s.id AND ac.user_id > 0) as used_code_count
      FROM skins s ORDER BY s.sort_order ASC
    `).all();

    return json({ ok: true, skins: skins.results });
  }

  if (request.method === 'POST') {
    const user = await authenticate(request, env);
    if (!user || !isAdmin(user)) return json({ error: '无权限' }, 403);

    const body = await request.json().catch(() => ({}));
    const { name, key, label, description, price = 0, preview_url = '', css_url = '', is_active = 1, sort_order = 0 } = body;

    if (!name || !key || !label) {
      return json({ error: '请填写名称(key/label)' }, 400);
    }

    const existing = await env.DB.prepare('SELECT id FROM skins WHERE key = ?').bind(key).first();
    if (existing) return json({ error: '皮肤标识已存在' }, 400);

    await env.DB.prepare(
      'INSERT INTO skins (name, key, label, description, price, preview_url, css_url, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, key, label, description, price, preview_url, css_url, is_active, sort_order).run();

    return json({ ok: true, message: '皮肤已创建' });
  }

  return json({ error: 'Method not allowed' }, 405);
}
