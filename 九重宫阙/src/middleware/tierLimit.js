/**
 * E2 · 分层限流（全局 100 次/分/IP 仍作天花板，此处按端点代价收紧）
 * 目的：AI 生成、副本结算这类"贵"端点必须比读接口严得多，否则单个脚本就能把进程与外部额度打满。
 * 键：**IP**（本中间件挂在全局限流之后、鉴权之前，因此拿不到 userId；按用户维度收紧由 auth 层的
 *      角色互斥与 loginGuard 负责，二者互补而非重复）。固定窗口计数，重启清零。
 */
const TIERS = [
  { prefix: '/api/ai/', max: 6, windowMs: 60000, label: 'AI 生成' },
  // 轮80：传记润色直调 aiService.generate('lore')（chronicle.js:64），此前只有全局 100/分兜底
  // ——一个脚本就能把外部 LLM 额度打满。pick() 先列先中，精确条目须排在任何父前缀之前。
  { prefix: '/api/chronicle/biography/enhance', max: 6, windowMs: 60000, label: 'AI 传记润色' },
  { prefix: '/api/dungeon/', max: 15, windowMs: 60000, label: '副本结算' },
  { prefix: '/api/battle/', max: 25, windowMs: 60000, label: '战斗' },
  { prefix: '/api/auth/', max: 12, windowMs: 60000, label: '认证' },
  { prefix: '/api/market/', max: 30, windowMs: 60000, label: '市场' },
  { prefix: '/api/friend/', max: 30, windowMs: 60000, label: '好友' },   // P2/E8（轮48）：申请/回应/拜访都是可被灌水的写入口
  { prefix: '/api/guild/', max: 40, windowMs: 60000, label: '仙盟' },
  { prefix: '/api/sect/', max: 40, windowMs: 60000, label: '宗门' },
  { prefix: '/api/cultivation/', max: 60, windowMs: 60000, label: '修炼' },
  { prefix: '/api/shop/', max: 60, windowMs: 60000, label: '坊市' }
];
const EXEMPT = ['/api/health'];
const hits = new Map();

function pick(path) {
  for (const t of TIERS) if (path.startsWith(t.prefix)) return t;
  return null;
}

function tierLimit(req, res, next) {
  const path = req.path || req.url.split('?')[0];
  if (EXEMPT.some((e) => path.startsWith(e))) return next();
  const tier = pick(path);
  if (!tier) return next();                      // 未列出的端点由全局限流兜底

  const key = `${req.userId || req.ip}|${tier.prefix}`;
  const now = Date.now();
  let rec = hits.get(key);
  if (!rec || now - rec.start > tier.windowMs) { rec = { start: now, n: 0 }; hits.set(key, rec); }
  rec.n++;
  res.setHeader('X-RateLimit-Limit', String(tier.max));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, tier.max - rec.n)));
  if (rec.n > tier.max) {
    const retryAfter = Math.max(1, Math.ceil((tier.windowMs - (now - rec.start)) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    hits.set(key + '|warn', { start: now, n: 1 });
    return res.status(429).json({ error: `${tier.label}接口过于频繁，请 ${retryAfter} 秒后再试`, scope: tier.prefix, retryAfterSeconds: retryAfter });
  }
  next();
}

tierLimit._hits = hits;
tierLimit._tiers = TIERS;
function reset() { hits.clear(); }

module.exports = tierLimit;
module.exports.reset = reset;
