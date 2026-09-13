/**
 * E2 安全响应头（轮63）。不引 helmet：本项目 deps 里没有它，而 Dockerfile 走 `npm ci --omit=dev`，
 * 加依赖会让镜像与本地不一致，收益却只是同样几个头 —— 这里自备，逐条写清为什么是这个值。
 *
 * CSP 现状要说实话：public/index.html 里有内联 onclick / style（条数由测试第 ④ 条实测核对，
 * 不靠这里的注释），所以 script-src / style 只能含 'unsafe-inline'。
 * 这是**已知弱点**而非"已加固完成"：收紧它需要先把手写内联事件改成 addEventListener，
 * 属工程债（记在《后续开发规划》），不在本轮范围。
 */
const CSP = [
  // 只允许同源脚本 + 已存在的外部 Turnstile；'unsafe-inline' 是被内联 onclick 逼出来的
  //（实测 14 处，口径与第 24 套④同源：用正则 /\son[a-z]+\s*=/ 数 public/index.html）
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  // 内联 style 属性同理
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // 前端全部走同源 /api，不需要连 ws：留 self 与 ws 升级位（chat 用 WebSocket）
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // 防点击劫持：整站不许被嵌
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self'",
  // 先报告不外罚：观察期内不希望把真人玩家挡在门外
  "upgrade-insecure-requests"
].join('; ');

function secureHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  // 老浏览器专有但仍在用：跨源时不带 Referer 之外再兜一层
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  // 只有真跑在 https 前才有意义；http 直连下发 HSTS 反而会被误当成已启用
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  // 少暴露指纹
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = { secureHeaders, CSP };
