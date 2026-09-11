/**
 * 密码哈希与校验，与原 server/db.js 兼容：
 *   hashPasswordWithPepper(pwd, pepper) = sha256(pwd + pepper)
 *   hashPassword(pwd) = hashPasswordWithPepper(pwd, passwordPepper || jwtSecret)
 */
const encoder = new TextEncoder();

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export async function hashPassword(pwd, pepper) {
  return sha256Hex(String(pwd || '') + String(pepper || ''));
}

export async function verifyPassword(pwd, storedHash, pepper) {
  const candidate = await hashPassword(pwd, pepper);
  return candidate === String(storedHash || '').toLowerCase();
}