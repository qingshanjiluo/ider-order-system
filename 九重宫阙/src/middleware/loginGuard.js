/**
 * E2 · 登录失败锁定（零侵入：不改处理函数内部，靠拦截响应状态记账）
 * 阈值：连续 5 次失败 → 锁 5 分钟；再 5 次 → 锁 30 分钟；上限 24 小时。成功登录即清零。
 * 维度：用户名 + 客户端 IP（防拿单个账号打满后横向影响他人）。
 * 内存态即可（重启清空 = 攻击者也重启了自己），不引入新存储。
 */
const WINDOW_MS = 15 * 60 * 1000;
const STEPS = [{ n: 5, lockMs: 5 * 60 * 1000 }, { n: 10, lockMs: 30 * 60 * 1000 }, { n: 15, lockMs: 24 * 60 * 60 * 1000 }];
const store = new Map();

function keyOf(req) {
  const u = String((req.body && req.body.username) || '').toLowerCase().slice(0, 64);
  return `${u}|${req.ip}`;
}

function lockInfo(key) {
  const rec = store.get(key);
  if (!rec) return null;
  if (rec.until && rec.until > Date.now()) return { locked: true, retryAfterSec: Math.ceil((rec.until - Date.now()) / 1000), attempts: rec.attempts };
  if (rec.until) { store.delete(key); }              // 锁已过期，顺带回收
  if (Date.now() - rec.first > WINDOW_MS) store.delete(key);  // 窗口外重置计数
  return null;
}

function recordFailure(key) {
  const now = Date.now();
  let rec = store.get(key);
  if (!rec || (rec.until && rec.until <= now)) rec = { attempts: 0, first: now, until: 0 };
  if (now - rec.first > WINDOW_MS) rec = { attempts: 0, first: now, until: 0 };
  rec.attempts++;
  for (const s of STEPS) if (rec.attempts >= s.n) rec.until = now + s.lockMs;
  store.set(key, rec);
  return rec;
}

/** 挂在 /login 上：先判锁，再按响应状态记账 */
function guard(req, res, next) {
  const key = keyOf(req);
  const locked = lockInfo(key);
  if (locked) {
    return res.status(423).json({ error: `失败次数过多，账号锁定中，请 ${locked.retryAfterSec} 秒后再试`, retryAfterSeconds: locked.retryAfterSec });
  }
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 401 || res.statusCode === 400) recordFailure(key);
    else if (res.statusCode < 400) store.delete(key);
    res.json = json;
    return json(body);
  };
  next();
}

function reset(req) { store.delete(keyOf(req)); }

module.exports = { guard, reset, lockInfo, keyOf, recordFailure, _store: store };
