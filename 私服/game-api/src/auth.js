/**
 * JWT 签名与校验（HS256），与原 server/middleware/auth.js 的 signToken 兼容
 * 原实现：jwt.sign({ accountId, username, sessionId }, config.jwtSecret, { expiresIn: '7d' })
 */
const encoder = new TextEncoder();

function base64UrlEncode(str) {
  const bytes = encoder.encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
  const bin = atob(b64 + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signToken(accountId, username, env) {
  const now = Math.floor(Date.now() / 1000);
  // A5 无过期 token：不写 exp 字段（verifyPayload 对缺失 exp 跳过时效校验）。
  // 会话有效性由 gm 封禁心跳（sync 检查 is_banned）与前端登出控制。
  const payload = {
    accountId,
    username,
    sessionId: `${accountId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    iat: now
  };
  return signPayload(payload, env.JWT_SECRET);
}

export async function verifyToken(token, env) {
  return verifyPayload(token, env.JWT_SECRET);
}

/** 通用 JWT 签发（自定义 payload），用于交易所市场令牌等短时效凭证 */
export async function signPayload(payload, secret, ttlSec) {
  const now = Math.floor(Date.now() / 1000);
  // ttlSec 未传或 <=0 视为无过期（不写 exp，verifyPayload 跳过时效校验）；
  // 只有显式传正数 ttlSec 才写入 exp。修复：原默认 300 秒导致登录 token 5 分钟即过期。
  const hasExp = ttlSec !== undefined && ttlSec !== null && Number(ttlSec) > 0;
  const full = hasExp
    ? { ...(payload || {}), iat: now, exp: now + Math.floor(Number(ttlSec)) }
    : { ...(payload || {}), iat: now };
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(full))}`;
  const sig = await hmacSign(data, secret);
  return `${data}.${sig}`;
}

/** 通用 JWT 校验，返回 payload 或 null */
export async function verifyPayload(token, secret) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const data = `${h}.${p}`;

    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBin = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = sigBin.length % 4 ? 4 - (sigBin.length % 4) : 0;
    const sigBytes = Uint8Array.from(atob(sigBin + '='.repeat(pad)), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(p));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch (e) {
    return null;
  }
}