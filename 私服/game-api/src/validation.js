/**
 * API 输入验证工具
 * 统一的请求体/查询参数校验，防止缓冲区溢出、格式错误、注入攻击
 */

/**
 * 校验 JSON 请求体
 * @param {Request} request
 * @param {object} rules 验证规则
 * @returns {{ok: boolean, data?: object, error?: string}}
 */
export async function validateBody(request, rules = {}) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: '请求体格式错误（非 JSON）' };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: '请求体不能为空' };
  }

  // 检查请求体大小（防止超大 payload）
  const bodyStr = JSON.stringify(body);
  if (bodyStr.length > 65536) { // 64KB 限制
    return { ok: false, error: '请求体过大' };
  }

  for (const [field, rule] of Object.entries(rules)) {
    const value = body[field];
    const result = validateField(field, value, rule);
    if (!result.ok) return result;
  }

  return { ok: true, data: body };
}

/**
 * 校验单个字段
 */
function validateField(field, value, rule) {
  const { type, required, min, max, minLength, maxLength, pattern, enum: enumValues, allowEmpty } = rule;

  // 必填检查
  if (required && (value === undefined || value === null)) {
    return { ok: false, error: `缺少必填字段: ${field}` };
  }

  // 允许空值
  if (allowEmpty && (value === undefined || value === null || value === '')) {
    return { ok: true };
  }

  // 非必填且未提供 → 跳过后续校验
  if (value === undefined || value === null) return { ok: true };

  // 类型检查
  if (type === 'string' && typeof value !== 'string') {
    return { ok: false, error: `${field} 必须是字符串` };
  }
  if (type === 'number' && typeof value !== 'number') {
    return { ok: false, error: `${field} 必须是数字` };
  }
  if (type === 'boolean' && typeof value !== 'boolean') {
    return { ok: false, error: `${field} 必须是布尔值` };
  }
  if (type === 'array' && !Array.isArray(value)) {
    return { ok: false, error: `${field} 必须是数组` };
  }

  // 字符串长度
  if (typeof value === 'string') {
    if (minLength !== undefined && value.length < minLength) {
      return { ok: false, error: `${field} 长度不能少于 ${minLength} 字符` };
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return { ok: false, error: `${field} 长度不能超过 ${maxLength} 字符` };
    }
    // 防止控制字符注入
    if (value.includes('\0') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
      return { ok: false, error: `${field} 包含非法字符` };
    }
  }

  // 数字范围
  if (typeof value === 'number') {
    if (min !== undefined && value < min) {
      return { ok: false, error: `${field} 不能小于 ${min}` };
    }
    if (max !== undefined && value > max) {
      return { ok: false, error: `${field} 不能大于 ${max}` };
    }
    if (!Number.isFinite(value)) {
      return { ok: false, error: `${field} 必须是有限数字` };
    }
  }

  // 枚举值
  if (enumValues && Array.isArray(enumValues) && !enumValues.includes(value)) {
    return { ok: false, error: `${field} 的值无效，允许: ${enumValues.join(', ')}` };
  }

  // 正则匹配
  if (pattern && typeof value === 'string' && !pattern.test(value)) {
    return { ok: false, error: `${field} 格式不正确` };
  }

  return { ok: true };
}

/**
 * 校验查询参数
 * @param {URL} url
 * @param {object} rules 验证规则
 * @returns {{ok: boolean, data?: object, error?: string}}
 */
export function validateQuery(url, rules = {}) {
  const params = {};
  for (const [key, rule] of Object.entries(rules)) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      // 尝试自动转换类型
      if (rule.type === 'number') {
        params[key] = Number(value);
        if (!Number.isFinite(params[key])) {
          return { ok: false, error: `${key} 必须是数字` };
        }
      } else {
        params[key] = value;
      }
    }
    const result = validateField(key, params[key], rule);
    if (!result.ok) return result;
  }
  return { ok: true, data: params };
}

// ── 预定义验证规则 ──

export const RULES = {
  // 用户名：2-20 字符，字母数字下划线
  username: { type: 'string', required: true, minLength: 2, maxLength: 20, pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/ },
  // 密码：6-64 字符
  password: { type: 'string', required: true, minLength: 6, maxLength: 64 },
  // 角色名：2-12 字符
  characterName: { type: 'string', required: true, minLength: 2, maxLength: 12 },
  // 聊天消息：1-200 字符
  chatText: { type: 'string', required: true, minLength: 1, maxLength: 200 },
  // 频道名
  channel: { type: 'string', required: true, enum: ['world', 'alliance'] },
  // 邮箱
  email: { type: 'string', required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  // 验证码：6 位数字
  code: { type: 'string', required: true, minLength: 6, maxLength: 6, pattern: /^\d{6}$/ },
  // 正整数 ID
  positiveId: { type: 'number', required: true, min: 1 },
  // 页码
  page: { type: 'number', min: 0 },
  // 数量
  count: { type: 'number', min: 1, max: 9999 },
  // 延迟时间（毫秒）
  delay: { type: 'number', min: 0, max: 30000 },
};
