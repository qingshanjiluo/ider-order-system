// functions/api/admin/skins/[id].js — PUT|DELETE /api/admin/skins/:id
import { json } from '../../../_utils.js';
import { authenticate, isAdmin } from '../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const id = parseInt(params.id);
  if (!id) return json({ error: 'Invalid id' }, 400);

  const user = await authenticate(request, env);
  if (!user || !isAdmin(user)) return json({ error: '无权限' }, 403);

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    const { name, key, label, description, price, preview_url, css_url, is_active, sort_order } = body;

    const existing = await env.DB.prepare('SELECT id FROM skins WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: '皮肤不存在' }, 404);

    if (key) {
      const dup = await env.DB.prepare('SELECT id FROM skins WHERE key = ? AND id != ?').bind(key, id).first();
      if (dup) return json({ error: '皮肤标识已被占用' }, 400);
    }

    await env.DB.prepare(`
      UPDATE skins SET
        name = COALESCE(?, name),
        key = COALESCE(?, key),
        label = COALESCE(?, label),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        preview_url = COALESCE(?, preview_url),
        css_url = COALESCE(?, css_url),
        is_active = COALESCE(?, is_active),
        sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).bind(name || null, key || null, label || null, description || null, price ?? null, preview_url ?? null, css_url ?? null, is_active ?? null, sort_order ?? null, id).run();

    return json({ ok: true, message: '皮肤已更新' });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM user_skins WHERE skin_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM activation_codes WHERE skin_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM skins WHERE id = ?').bind(id).run();

    return json({ ok: true, message: '皮肤已删除' });
  }

  return json({ error: 'Method not allowed' }, 405);
}
