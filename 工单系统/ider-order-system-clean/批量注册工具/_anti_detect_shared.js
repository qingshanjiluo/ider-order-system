/**
 * 艾德尔修仙传 - 共享反检测核心模块 v3.0 🛡️
 *
 * 基于篡改猴「账号切换·防IP检测」脚本的反封号机制提炼：
 *   1. 独立IP池（每账号固定IP，防同IP检测）
 *   2. machine_id 伪装（每账号独立，格式多样防指纹）
 *   3. 随机延迟（操作间延迟随机化，防频率分析）
 *   4. 浏览器指纹轮换（UA/Sec-CH-UA/Accept-Language）
 *   5. CDN代理链模拟（Via/X-Cache）
 *   6. 智能分段（每N个账号暂停一段时间）
 *   7. 签名请求头注入（请求级别的反检测）
 *
 * 使用：
 *   const antiDetect = require('./_anti_detect_shared');
 *   const headers = antiDetect.buildHeaders(loopIndex);
 *   // or use wrapped apiRequest
 */

const crypto = require('crypto');

// ============================================================
// 🛡️ 31段真实中国运营商IP（电信/联通/移动 混合）
// ============================================================
const IP_SEGMENTS = [
  // 中国电信 (China Telecom) - 南方地区
  { isp: '电信', seg: '61.152', province: '上海' },
  { isp: '电信', seg: '222.73', province: '上海' },
  { isp: '电信', seg: '101.80', province: '上海' },
  { isp: '电信', seg: '124.160', province: '浙江' },
  { isp: '电信', seg: '125.118', province: '浙江' },
  { isp: '电信', seg: '183.128', province: '浙江' },
  { isp: '电信', seg: '115.192', province: '陕西' },
  { isp: '电信', seg: '61.134', province: '陕西' },
  { isp: '电信', seg: '36.40', province: '陕西' },
  { isp: '电信', seg: '218.0', province: '江苏' },
  // 中国联通 (China Unicom) - 北方地区
  { isp: '联通', seg: '112.64', province: '上海' },
  { isp: '联通', seg: '58.247', province: '上海' },
  { isp: '联通', seg: '101.224', province: '上海' },
  { isp: '联通', seg: '122.224', province: '浙江' },
  { isp: '联通', seg: '60.12', province: '浙江' },
  { isp: '联通', seg: '106.0', province: '山东' },
  { isp: '联通', seg: '111.8', province: '河南' },
  { isp: '联通', seg: '123.138', province: '陕西' },
  { isp: '联通', seg: '124.89', province: '陕西' },
  { isp: '联通', seg: '175.0', province: '山西' },
  // 中国移动 (China Mobile) - 全国
  { isp: '移动', seg: '111.11', province: '上海' },
  { isp: '移动', seg: '117.136', province: '上海' },
  { isp: '移动', seg: '120.204', province: '上海' },
  { isp: '移动', seg: '112.12', province: '浙江' },
  { isp: '移动', seg: '122.231', province: '浙江' },
  { isp: '移动', seg: '183.129', province: '浙江' },
  { isp: '移动', seg: '111.19', province: '陕西' },
  { isp: '移动', seg: '117.22', province: '陕西' },
  { isp: '移动', seg: '218.200', province: '陕西' },
  { isp: '移动', seg: '36.0', province: '陕西' },
  { isp: '移动', seg: '120.36', province: '福建' },
];

// ============================================================
// 🛡️ 浏览器指纹池
// ============================================================
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
];

const ACCEPT_HEADERS = [
  'application/json, text/plain, */*',
  'application/json, text/plain, text/html, */*',
  'application/json, */*; q=0.8',
  'application/json, text/plain, text/html, application/xhtml+xml, */*; q=0.9',
];

const SEC_CH_UAS = [
  '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
  '"Microsoft Edge";v="122", "Chromium";v="122", "Not:A-Brand";v="24"',
  '"Google Chrome";v="124", "Not:A-Brand";v="8", "Chromium";v="124"',
  '"Google Chrome";v="125", "Not:A-Brand";v="8", "Chromium";v="125"',
];

const CDN_NODES = [
  'cloudflare', 'aliyun-cdn', 'tencent-cdn',
  'baishan-cdn', 'wangsu-cdn', 'china-cache', 'cdn77',
];

const LANG_PREFS = [
  'zh-CN,zh;q=0.9',
  'zh-CN,zh;q=0.9,en;q=0.8',
  'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.7',
  'zh-CN,zh;q=0.8,en;q=0.7',
];

// ============================================================
// 🛡️ IP 生成（每个账号固定独立IP，参照篡改猴脚本的IP池思想）
// ============================================================
function generateRealisticIp(accountIndex) {
  const seg = IP_SEGMENTS[accountIndex % IP_SEGMENTS.length];
  const third = Math.floor(Math.random() * 245) + 5;
  const fourth = Math.floor(Math.random() * 250) + 3;
  return seg.seg + '.' + third + '.' + fourth;
}

function getIpInfo(accountIndex) {
  const seg = IP_SEGMENTS[accountIndex % IP_SEGMENTS.length];
  return { ip: generateRealisticIp(accountIndex), isp: seg.isp, province: seg.province };
}

// ============================================================
// 🛡️ machine_id 生成（每个账号独立，格式多样防指纹）
// ============================================================
function generateMachineId(accountIndex) {
  const patterns = [
    // 格式1: web开头 + 随机hex + 时间戳base36（模仿真实浏览器）
    () => `web_${crypto.randomBytes(4).toString('hex')}_${Date.now().toString(36).slice(-6)}`,
    // 格式2: canvas指纹风格
    () => `canvas_${crypto.randomBytes(6).toString('hex')}`,
    // 格式3: UUID风格
    () => {
      const hex = crypto.randomBytes(16).toString('hex');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    },
    // 格式4: browser ID风格（参照篡改猴脚本）
    () => `bid_${crypto.randomBytes(8).toString('hex')}`,
    // 格式5: 设备ID风格 + 索引混淆
    () => `dev_${(accountIndex * 777 + Date.now()).toString(16)}_${crypto.randomBytes(3).toString('hex')}`,
    // 格式6: 模拟篡改猴脚本的 web_fake_xxxx 格式
    () => `web_fake_${String(accountIndex).padStart(4, '0')}_${Date.now().toString(36)}`,
  ];
  return patterns[accountIndex % patterns.length]();
}

// ============================================================
// 🛡️ IP池管理（参照篡改猴脚本的 ipPool 机制）
// ============================================================
const ipPool = {};

function getOrAssignIp(accountIndex) {
  const key = String(accountIndex);
  if (!ipPool[key]) {
    ipPool[key] = generateRealisticIp(accountIndex);
  }
  return ipPool[key];
}

function resetIpPool() {
  Object.keys(ipPool).forEach(k => delete ipPool[k]);
}

// ============================================================
// 🛡️ 构建反检测请求头
// ============================================================
function buildAntiDetectHeaders(loopIndex) {
  const idx = loopIndex;
  const fakeIp = getOrAssignIp(idx);
  const ua = USER_AGENTS[idx % USER_AGENTS.length];
  const cdnNode = CDN_NODES[idx % CDN_NODES.length];

  return {
    // 🛡️ IP伪装核心（每账号独立IP，参照篡改猴脚本）
    'X-Forwarded-For': fakeIp,
    'X-Real-IP': fakeIp,
    'X-Client-IP': fakeIp,
    'X-Originating-IP': fakeIp,

    // 🛡️ 浏览器指纹
    'User-Agent': ua,
    'Accept': ACCEPT_HEADERS[idx % ACCEPT_HEADERS.length],
    'Accept-Language': LANG_PREFS[idx % LANG_PREFS.length],
    'Accept-Encoding': 'gzip, deflate, br',

    // 🛡️ Sec-CH-UA 客户端提示（Chrome/Edge 特有指纹）
    'Sec-CH-UA': SEC_CH_UAS[idx % SEC_CH_UAS.length],
    'Sec-CH-UA-Platform': idx % 4 === 0 ? '"macOS"' : '"Windows"',
    'Sec-CH-UA-Mobile': '?0',

    // 🛡️ Fetch元数据（模拟真实浏览器请求）
    'Sec-Fetch-Site': ['none', 'same-origin', 'same-site', 'cross-site'][idx % 4],
    'Sec-Fetch-Mode': ['cors', 'no-cors', 'navigate'][idx % 3],
    'Sec-Fetch-Dest': 'empty',

    // 🛡️ CDN代理链模拟
    'Via': `1.1 ${cdnNode}`,
    'X-Cache': ['HIT', 'MISS'][idx % 2],

    // 🛡️ 连接与隐私
    'Connection': 'keep-alive',
    'Cache-Control': ['no-cache', 'max-age=0', 'private', 'no-store'][idx % 4],
    'DNT': idx % 3 === 0 ? '1' : '0',
  };
}

// ============================================================
// 🛡️ 随机延迟（参照篡改猴脚本的 randomInt + randomDelay）
// ============================================================
function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 🛡️ 智能分段暂停（每N个账号暂停一段时间）
// ============================================================
async function smartPause(currentIndex, total, options) {
  const opts = Object.assign({
    batchSize: 3,
    pauseMin: 20000,
    pauseMax: 40000,
    enabled: true,
  }, options || {});

  if (!opts.enabled) return;
  if (currentIndex >= total - 1) return;
  if ((currentIndex + 1) % opts.batchSize !== 0) return;

  const pauseMs = Math.floor(Math.random() * (opts.pauseMax - opts.pauseMin + 1)) + opts.pauseMin;
  console.log(`  [🛡️ 智能暂停] 已完成 ${currentIndex + 1}/${total} 个，暂停 ${(pauseMs / 1000).toFixed(0)} 秒...`);
  await sleep(pauseMs);
}

// ============================================================
// 🛡️ 包裹 apiRequest - 注入反检测头的通用函数
// ============================================================
/**
 * 创建一个带反检测的 apiRequest 函数
 * @param {Function} originalApiRequest - 原始 apiRequest 函数
 * @param {number} startIndex - 起始索引（用于IP分配）
 * @returns {Function} 包裹后的 apiRequest
 */
function createWrappedApiRequest(originalApiRequest) {
  let callIndex = 0;
  let accountIndex = 0;

  const wrapped = function(method, path, token, body, extraHeaders) {
    const idx = accountIndex > 0 ? accountIndex : (callIndex);
    const antiHeaders = buildAntiDetectHeaders(idx);
    const mergedExtra = Object.assign({}, extraHeaders || {}, antiHeaders);
    callIndex++;
    return originalApiRequest(method, path, token, body, mergedExtra);
  };

  wrapped.setAccountIndex = function(idx) {
    accountIndex = idx;
    callIndex = 0;
  };

  return wrapped;
}

// ============================================================
// 🛡️ 生成注册 body（注入独立 machine_id）
// ============================================================
function buildRegisterBody(username, password, accountIndex) {
  return {
    username: username,
    password: password,
    machine_id: generateMachineId(accountIndex),
  };
}

function buildLoginBody(username, password, accountIndex) {
  return {
    username: username,
    password: password,
    machine_id: generateMachineId(accountIndex),
  };
}

// ============================================================
// 导出
// ============================================================
module.exports = {
  // IP
  generateRealisticIp,
  getIpInfo,
  getOrAssignIp,
  resetIpPool,
  IP_SEGMENTS,

  // 指纹
  generateMachineId,
  buildAntiDetectHeaders,
  USER_AGENTS,

  // 延迟
  randomDelay,
  sleep,
  smartPause,

  // 包裹
  createWrappedApiRequest,

  // 请求体
  buildRegisterBody,
  buildLoginBody,
};
