/**
 * 邮箱绑定 / 密码重置 API（Worker 版）
 * 迁移自 server/routes/email.js。
 * 说明：验证码验证机制已取消——绑定邮箱、修改/重置密码直接生效，不再校验验证码。
 * send-code 端点保留仅为前端兼容（模拟发送，仅记录日志）。
 */
import { verifyToken } from '../auth.js';
import { createDb } from '../db.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_COOLDOWN_SECONDS = 60;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 模拟发送验证码（不真实发信） */
function sendVerificationCode(email, code) {
  console.log(`[email] 模拟发送验证码 -> ${email}: ${code}`);
}

export async function handleEmailRoute(request, env, route) {
  if (!route.startsWith('/email')) return null;
  const db = createDb(env);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  const isAuthedRoute = ['/email/send-code', '/email/bind', '/email/unbind', '/email/status', '/email/change-password/send-code', '/email/change-password/confirm'].some((p) => route === p || route.startsWith(p));
  if (!isAuthedRoute && route !== '/email/forgot-password/send-code' && route !== '/email/forgot-password/reset') return null;

  let auth = null;
  if (isAuthedRoute) {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    auth = token ? await verifyToken(token, env) : null;
    if (!auth || !auth.accountId) return json({ ok: false, error: '未登录' }, 401);
  }

  const tryCatch = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      console.error('[email] error:', e?.message || e);
      return json({ ok: false, error: '操作失败，请稍后重试' });
    }
  };

  // GET /email/status
  if (route === '/email/status' && request.method === 'GET') {
    return tryCatch(async () => {
      const info = await db.getAccountEmail(auth.accountId);
      const email = String(info?.email || '');
      const verified = Number(info?.verified ?? info?.email_verified ?? 0) === 1;
      let masked = '';
      if (email && verified) {
        const [local, domain] = email.split('@');
        masked = local.length <= 2
          ? local[0] + '***@' + domain
          : local[0] + '***' + local.slice(-1) + '@' + domain;
      }
      return json({ ok: true, bound: verified, email: masked });
    });
  }

  // POST /email/send-code
  if (route === '/email/send-code' && request.method === 'POST') {
    return tryCatch(async () => {
      const { email } = body;
      if (!email || !EMAIL_REGEX.test(String(email).trim())) {
        return json({ ok: false, error: '邮箱格式不正确' });
      }
      const normalEmail = String(email).trim().toLowerCase();
      if (await db.isEmailTaken(normalEmail)) {
        return json({ ok: false, error: '该邮箱已被其他账号绑定' });
      }
      const lastTime = await db.getRecentEmailCodeTime(auth.accountId);
      const now = Math.floor(Date.now() / 1000);
      if (lastTime > 0 && (now - lastTime) < CODE_COOLDOWN_SECONDS) {
        const wait = CODE_COOLDOWN_SECONDS - (now - lastTime);
        return json({ ok: false, error: `请${wait}秒后再试` });
      }
      const code = await db.createEmailVerificationCode(auth.accountId, normalEmail);
      sendVerificationCode(normalEmail, code);
      return json({ ok: true, msg: '验证码已发送，请查收邮箱' });
    });
  }

  // POST /email/bind
  if (route === '/email/bind' && request.method === 'POST') {
    return tryCatch(async () => {
      const { email } = body;
      if (!email) return json({ ok: false, error: '缺少邮箱' });
      if (!EMAIL_REGEX.test(String(email).trim())) {
        return json({ ok: false, error: '邮箱格式不正确' });
      }
      const normalEmail = String(email).trim().toLowerCase();
      if (await db.isEmailTaken(normalEmail)) {
        return json({ ok: false, error: '该邮箱已被其他账号绑定' });
      }
      await db.bindAccountEmail(auth.accountId, normalEmail);
      return json({ ok: true, msg: '邮箱绑定成功' });
    });
  }

  // POST /email/unbind
  if (route === '/email/unbind' && request.method === 'POST') {
    return tryCatch(async () => {
      const info = await db.getAccountEmail(auth.accountId);
      if (!info?.email || Number(info?.verified ?? info?.email_verified ?? 0) !== 1) {
        return json({ ok: false, error: '当前未绑定邮箱' });
      }
      await db.unbindAccountEmail(auth.accountId);
      return json({ ok: true, msg: '邮箱已解绑' });
    });
  }

  // POST /email/change-password/send-code
  if (route === '/email/change-password/send-code' && request.method === 'POST') {
    return tryCatch(async () => {
      const info = await db.getAccountEmail(auth.accountId);
      if (!info?.email || Number(info?.verified ?? info?.email_verified ?? 0) !== 1) {
        return json({ ok: false, error: '请先绑定邮箱' });
      }
      const lastTime = await db.getRecentEmailCodeTime(auth.accountId);
      const now = Math.floor(Date.now() / 1000);
      if (lastTime > 0 && (now - lastTime) < CODE_COOLDOWN_SECONDS) {
        const wait = CODE_COOLDOWN_SECONDS - (now - lastTime);
        return json({ ok: false, error: `请${wait}秒后再试` });
      }
      const code = await db.createEmailVerificationCode(auth.accountId, info.email);
      sendVerificationCode(info.email, code);
      return json({ ok: true, msg: '验证码已发送' });
    });
  }

  // POST /email/change-password/confirm
  if (route === '/email/change-password/confirm' && request.method === 'POST') {
    return tryCatch(async () => {
      const { new_password } = body;
      if (!new_password) return json({ ok: false, error: '缺少新密码' });
      if (String(new_password).length < 6) return json({ ok: false, error: '新密码至少 6 位' });
      const info = await db.getAccountEmail(auth.accountId);
      if (!info?.email || Number(info?.verified ?? info?.email_verified ?? 0) !== 1) {
        return json({ ok: false, error: '请先绑定邮箱' });
      }
      await db.updateAccountPassword(auth.accountId, new_password);
      return json({ ok: true, msg: '密码修改成功' });
    });
  }

  // POST /email/forgot-password/send-code（无需登录）
  if (route === '/email/forgot-password/send-code' && request.method === 'POST') {
    return tryCatch(async () => {
      const { email } = body;
      if (!email || !EMAIL_REGEX.test(String(email).trim())) {
        return json({ ok: false, error: '邮箱格式不正确' });
      }
      const normalEmail = String(email).trim().toLowerCase();
      const acc = await db.getAccountByEmail(normalEmail);
      if (!acc) return json({ ok: false, error: '该邮箱未绑定任何账号' });
      const lastTime = await db.getRecentEmailCodeTime(acc.id);
      const now = Math.floor(Date.now() / 1000);
      if (lastTime > 0 && (now - lastTime) < CODE_COOLDOWN_SECONDS) {
        const wait = CODE_COOLDOWN_SECONDS - (now - lastTime);
        return json({ ok: false, error: `请${wait}秒后再试` });
      }
      const code = await db.createEmailVerificationCode(acc.id, normalEmail);
      sendVerificationCode(normalEmail, code);
      return json({ ok: true, msg: '验证码已发送' });
    });
  }

  // POST /email/forgot-password/reset（无需登录）
  if (route === '/email/forgot-password/reset' && request.method === 'POST') {
    return tryCatch(async () => {
      const { email, new_password } = body;
      if (!email || !new_password) return json({ ok: false, error: '缺少必要参数' });
      if (String(new_password).length < 6) return json({ ok: false, error: '新密码至少 6 位' });
      const normalEmail = String(email).trim().toLowerCase();
      const acc = await db.getAccountByEmail(normalEmail);
      if (!acc) return json({ ok: false, error: '该邮箱未绑定任何账号' });
      await db.updateAccountPassword(acc.id, new_password);
      return json({ ok: true, msg: '密码重置成功，请用新密码登录' });
    });
  }

  return null;
}