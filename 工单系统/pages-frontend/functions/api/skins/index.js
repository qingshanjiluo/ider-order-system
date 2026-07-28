// functions/api/skins/index.js — GET /api/skins
import { json } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const skins = await env.DB.prepare(
    'SELECT id, name, key, label, description, price, preview_url, css_url, sort_order FROM skins WHERE is_active = 1 ORDER BY sort_order ASC'
  ).all();

  return json({ ok: true, skins: skins.results });
}
