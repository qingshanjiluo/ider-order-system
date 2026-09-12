/**
 * 统一错误出口（E2 攻击模拟顺带修的一处真实缺陷 · 轮52）
 *
 * 问题：body-parser 遇到畸形 JSON 或超大请求体时，走的是 express 默认错误处理 ——
 * 把整段堆栈打到 stderr（日志被噪声淹没），并且**返回 HTML 错误页**。
 * 前端 `response.json()` 因此在"解析错误响应"这一步再崩一次，玩家看到的就是一句干巴巴的失败。
 * （轮49 已经把 api.js 改成 text + 容错解析，那是客户端侧的防线；服务端该给出的是 JSON 语义。）
 *
 * 约定：所有错误响应都带 `error`（人话）+ `status` + `type`，5xx 不外泄内部 message。
 * 必须挂在所有路由（含 SPA fallback）**之后**。
 */
module.exports = function requestErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) {
    // 真正的服务端异常：留一条带 trace 的日志给运维，但响应体不泄漏实现细节
    console.error(`[error] ${req.method} ${req.originalUrl} → ${status}: ${(err && err.stack ? String(err.stack).split('\n')[0] : err) || '未知错误'}`);
    return res.status(status).json({ success: false, status, type: 'server_error', error: '服务器暂时无法处理该请求，请稍后再试' });
  }
  const kind = status === 413 ? '请求体过大' : '请求格式错误';
  return res.status(status).json({
    success: false,
    status,
    type: 'request_error',
    error: `${kind}：${err.type === 'entity.too.large' ? '单次请求内容超过上限' : (err.message || '请检查请求参数')}`
  });
};
