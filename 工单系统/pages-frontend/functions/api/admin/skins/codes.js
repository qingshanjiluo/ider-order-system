// functions/api/admin/skins/codes.js — POST /api/admin/skins/codes (批量生成激活码)
import { json } from '../../../_utils.js';
import { authenticate, isAdmin } from '../../../_auth.js';

function generateActivationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 10; i++) {
    code += chars[bytes[i] % chars.length];
    if (i === 4) code += '-';
  }
  return code;
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const user = await authenticate(request, env);
    if (!user || !isAdmin(user)) return json({ error: '无权限' }, 403);

    const body = await request.json().catch(() => ({}));
    const skin_id = parseInt(body.skin_id);
    const count = Math.min(Math.max(parseInt(body.count) || 1, 1), 100);
    const expires_at = body.expires_at || null;

    if (!skin_id) return json({ error: '请指定皮肤ID' }, 400);

    const skin = await env.DB.prepare('SELECT id FROM skins WHERE id = ?').bind(skin_id).first();
    if (!skin) return json({ error: '皮肤不存在' }, 404);

    const codes = [];
    const stmt = env.DB.prepare(
      'INSERT INTO activation_codes (code, skin_id, user_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?)'
    );

    for (let i = 0; i < count; i++) {
      let code;
      let tries = 0;
      do {
        code = generateActivationCode();
        const dup = await env.DB.prepare('SELECT id FROM activation_codes WHERE code = ?').bind(code).first();
        if (!dup) break;
        tries++;
      } while (tries < 10);

      if (tries >= 10) continue;

      await stmt.bind(code, skin_id, user.id, expires_at, user.id).run();
      codes.push(code);
    }

    return json({ ok: true, message: `成功生成 ${codes.length} 个激活码`, codes });
  } catch (err) {
    return json({ error: `生成失败: ${err.message}` }, 500);
  }
}
