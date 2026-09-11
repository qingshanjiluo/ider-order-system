/**
 * 性能优化工具
 * - 请求限流（防止恶意刷接口）- 使用 KV 替代 D1 减少写入
 * - 响应压缩提示
 * - 缓存控制
 */

/**
 * 基于 KV 的限流器（跨实例共享，减少 D1 写入）
 * KV 免费额度：100,000 读取/天，1,000 写入/天
 * 适用于低频写入场景（限流计数器）
 */
export class RateLimiter {
  constructor(env) {
    this.env = env;
  }

  /**
   * 检查限流（使用 KV）
   * @param {string} key 限流键
   * @param {number} windowSec 时间窗口（秒）
   * @param {number} maxRequests 窗口内最大请求数
   * @returns {{ok: boolean, error?: string, retryAfter?: number}}
   */
  async check(key, windowSec = 1, maxRequests = 10) {
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `rl:${key}:${Math.floor(now / windowSec)}`;

    try {
      // 从 KV 读取当前窗口的请求计数
      const data = await this.env.KV.get(windowKey, 'json');
      const count = data?.count || 0;

      if (count >= maxRequests) {
        const retryAfter = windowSec - (now % windowSec);
        return {
          ok: false,
          error: `请求过于频繁，请 ${retryAfter} 秒后重试`,
          retryAfter
        };
      }

      // 增加计数并写回 KV（设置 TTL 自动过期）
      await this.env.KV.put(windowKey, JSON.stringify({ count: count + 1 }), {
        expirationTtl: windowSec * 2  // 保留2个窗口周期
      });

      return { ok: true };
    } catch (e) {
      // KV 不可用时放行
      console.error('[rateLimiter] KV error:', e?.message);
      return { ok: true };
    }
  }
}

/**
 * 限流中间件
 * @param {Request} request
 * @param {object} env
 * @param {object} options
 * @returns {Response|null} 返回 Response 表示被限流，null 表示放行
 */
export async function rateLimit(request, env, options = {}) {
  const {
    windowSec = 1,
    maxRequests = 10,
    keyPrefix = 'default',
    keyExtractor = null
  } = options;

  // 提取限流键
  let key = keyPrefix;
  if (keyExtractor) {
    key = `${keyPrefix}:${keyExtractor(request)}`;
  } else {
    // 默认用 IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    key = `${keyPrefix}:${ip}`;
  }

  const limiter = new RateLimiter(env);
  const result = await limiter.check(key, windowSec, maxRequests);

  if (!result.ok) {
    return new Response(JSON.stringify({
      ok: false,
      error: result.error
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter || 1),
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  return null; // 放行
}

/**
 * 常用限流配置
 */
export const RATE_LIMITS = {
  // 战斗接口：每秒 5 次
  battle: { windowSec: 1, maxRequests: 5, keyPrefix: 'battle' },
  // 聊天发送：每 2 秒 1 次（已有内置限流，这里作为额外保护）
  chat: { windowSec: 2, maxRequests: 1, keyPrefix: 'chat' },
  // 登录/注册：每分钟 10 次
  auth: { windowSec: 60, maxRequests: 10, keyPrefix: 'auth' },
  // 通用 API：每秒 20 次
  api: { windowSec: 1, maxRequests: 20, keyPrefix: 'api' },
  // 灵宠接口：每 2 秒 10 次
  beast: { windowSec: 2, maxRequests: 10, keyPrefix: 'beast' },
  // 宗门战争：每 2 秒 5 次
  sectwar: { windowSec: 2, maxRequests: 5, keyPrefix: 'sectwar' },
};

/**
 * 设置限流表（已废弃，使用 KV 替代）
 * 保留空函数以兼容现有调用
 */
export async function ensureRateLimitTable(db) {
  // KV 限流无需创建表，直接返回
  return;
}
