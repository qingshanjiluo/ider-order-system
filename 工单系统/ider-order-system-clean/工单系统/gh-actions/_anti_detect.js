/**
 * 艾德尔工单系统 - 防封号检测模块
 * 每账号独立伪造IP + 机器码 + 浏览器指纹 + 随机延迟
 */
const crypto = require('crypto');

// ─── 31段运营商IP池 ─────────────────────────
const ISP_IPS = [
  '61.148.', '61.149.', '61.150.', '61.151.', '61.152.',
  '114.241.', '114.242.', '114.243.', '114.244.',
  '36.1.', '36.2.', '36.3.', '36.4.', '36.5.',
  '58.30.', '58.31.', '58.32.', '58.33.',
  '120.0.', '120.1.', '120.2.',
  '111.192.', '111.193.', '111.194.', '111.195.',
  '117.136.', '117.137.', '117.138.',
  '106.2.', '106.3.', '106.4.',
];

function randomIP() {
  const prefix = ISP_IPS[Math.floor(Math.random() * ISP_IPS.length)];
  return prefix + (Math.floor(Math.random() * 254) + 1) + '.' + (Math.floor(Math.random() * 254) + 1);
}

// ─── 6种机器码格式 ───────────────────────────
function generateMachineId(idx) {
  const seed = idx * 7 + Date.now() % 10000;
  const formats = [
    // Format 1: MAC-like
    () => {
      const mac = [];
      for (let i = 0; i < 6; i++) mac.push((seed * (i + 1) % 256).toString(16).padStart(2, '0'));
      return mac.join(':').toUpperCase();
    },
    // Format 2: UUID v4 like
    () => {
      const s = crypto.createHash('md5').update('m' + seed).digest('hex');
      return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
    },
    // Format 3: Hex serial
    () => {
      return crypto.createHash('sha1').update('s' + seed).digest('hex').toUpperCase().slice(0, 32);
    },
    // Format 4: Android ID
    () => {
      return crypto.createHash('md5').update('a' + seed).digest('hex').toUpperCase().slice(0, 16);
    },
    // Format 5: IMEI
    () => {
      const base = String(864902040000000 + seed * 13);
      return base.slice(0, 15);
    },
    // Format 6: Random numeric
    () => {
      return String(100000000000000 + Math.floor(Math.random() * 900000000000000));
    },
  ];
  return formats[idx % formats.length]();
}

// ─── 12种UA轮换 ────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; SM-S908E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Xiaomi14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.144 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; V2183A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; 2201123C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.134 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; IN2010) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; M2102K1C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.112 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Find X7 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.40 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; KB2000) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 11; Mi 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.140 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; SM-G996B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.80 Mobile Safari/537.36',
];

function randomUA(idx) {
  return USER_AGENTS[idx % USER_AGENTS.length];
}

// ─── 14种 Sec-CH-UA 轮换 ──────────────────
const SEC_CH_UA_PLATFORMS = [
  '"Android"', '"Android"', '"Android"', '"Android"',
  '"Windows"', '"macOS"', '"iOS"', '"Linux"',
  '"Android"', '"Android"', '"Windows"', '"macOS"',
  '"Chrome OS"', '"Unknown"',
];
const SEC_CH_UA = [
  '"Google Chrome";v="120", "Chromium";v="120", "Not?A_Brand";v="99"',
  '"Google Chrome";v="121", "Chromium";v="121", "Not?A_Brand";v="99"',
  '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="99"',
  '"Google Chrome";v="122", "Chromium";v="122", "Not?A_Brand";v="99"',
  '"Google Chrome";v="123", "Chromium";v="123", "Not?A_Brand";v="99"',
  '"Microsoft Edge";v="120", "Chromium";v="120", "Not?A_Brand";v="99"',
  '"Google Chrome";v="118", "Chromium";v="118", "Not?A_Brand";v="99"',
];

// ─── Accept-Language 轮换 ──────────────────
const LANGUAGES = [
  'zh-CN,zh;q=0.9,en;q=0.8',
  'zh-CN,zh;q=0.8,en-US;q=0.6',
  'zh-CN,zh;q=0.7,en;q=0.5',
  'zh-CN,zh;q=0.9',
  'zh-CN,zh;q=0.8,en-US;q=0.7,en;q=0.5',
];

// ─── 构建反检测请求头 ─────────────────────
function buildAntiDetectHeaders(idx) {
  const ip = randomIP();
  const ua = randomUA(idx);
  const lang = LANGUAGES[idx % LANGUAGES.length];
  const secChUa = SEC_CH_UA[idx % SEC_CH_UA.length];
  const platform = SEC_CH_UA_PLATFORMS[idx % SEC_CH_UA_PLATFORMS.length];
  const viewportW = 360 + Math.floor(Math.random() * 600);
  const viewportH = 640 + Math.floor(Math.random() * 400);

  return {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': lang,
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-CH-UA': secChUa,
    'Sec-CH-UA-Mobile': Math.random() > 0.3 ? '?1' : '?0',
    'Sec-CH-UA-Platform': platform,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'X-Forwarded-For': ip,
    'X-Real-IP': ip,
    'X-Client-IP': ip,
    'X-CDN-IP': ip,
    'X-Originating-IP': ip,
    'REMOTE_ADDR': ip,
    'X-Request-ID': crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 15),
    'X-Viewport-Width': String(viewportW),
    'X-Viewport-Height': String(viewportH),
    'Cache-Control': Math.random() > 0.5 ? 'no-cache' : 'max-age=0',
    'Pragma': 'no-cache',
    'DNT': Math.random() > 0.8 ? '1' : '0',
  };
}

// ─── 随机延迟 ─────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function randomDelay(minOrBase = 2000, max = null) {
  if (max === null) {
    // 单参数：base + jitter (0~50%)
    const jitter = Math.floor(Math.random() * minOrBase * 0.5);
    await sleep(minOrBase + jitter);
  } else {
    // 双参数：min ~ max 均匀分布
    const delay = minOrBase + Math.floor(Math.random() * (max - minOrBase));
    await sleep(delay);
  }
}

// ─── 人类行为模拟（点击/输入等操作的间隔） ─
async function humanTypingDelay(charCount = 1) {
  // 模拟打字速度：每字 80~250ms
  const perChar = 80 + Math.floor(Math.random() * 170);
  await sleep(perChar * Math.max(1, charCount));
}

// ─── 随机失败模拟（让行为更像真人） ──────
function shouldRandomFail(failRate = 0.03) {
  // 3% 概率模拟"第一次失败后重试"的行为
  return Math.random() < failRate;
}

// ─── 智能暂停（每N个账号后暂停） ─────────
async function smartPause(current, every = 3, baseSeconds = 30) {
  if ((current + 1) % every === 0) {
    const pause = baseSeconds + Math.floor(Math.random() * baseSeconds);
    const jitter = Math.floor(Math.random() * 10);
    console.log(`  智能暂停 ${pause}s (第 ${current + 1} 个)...`);
    await sleep((pause + jitter) * 1000);
  }
}

// ─── 每个账号独立的行为指纹 ──────────────
function accountProfile(idx) {
  // 为每个账号生成固定但唯一的行为参数
  const seed = (idx * 9973 + 7919) % 100000;
  const rng = () => { const x = Math.sin(seed + _rngCounter++) * 10000; return x - Math.floor(x); };
  let _rngCounter = 0;
  return {
    // 操作速度: 0=快 1=中 2=慢
    speed: Math.floor(rng() * 3),
    // 延迟倍数: 慢账号延迟x2
    delayMultiplier: [1.0, 1.5, 2.5][Math.floor(rng() * 3)],
    // 失败率偏移
    failBias: rng() * 0.05,
    // 活跃时段偏好
    activeHour: Math.floor(rng() * 24),
    // 账号ID hash
    profileId: 'ap_' + seed.toString(16),
  };
}

// ─── 生成随机用户名 ────────────────────────
function randomUsername(maxLen = 20, usedNames = null) {
  const adj = ['Celestial', 'Mystic', 'Shadow', 'Phoenix', 'Dragon', 'Thunder', 'Crystal', 'Iron',
    'Jade', 'Silver', 'Golden', 'Dark', 'Light', 'Storm', 'Wind', 'Fire', 'Water', 'Earth',
    'Star', 'Moon', 'Sun', 'Cloud', 'Rain', 'Snow', 'Frost', 'Flame', 'Night', 'Ghost',
    'Silent', 'Brave', 'Swift', 'Proud', 'Wild', 'Fierce'];
  const noun = ['Fox', 'Wolf', 'Tiger', 'Eagle', 'Lion', 'Bear', 'Falcon', 'Serpent', 'Dragon',
    'Owl', 'Crane', 'Deer', 'Knight', 'Blade', 'Soul', 'Spirit', 'Monk', 'Sage', 'Lord',
    'King', 'Saint', 'Master', 'Hunter', 'Warrior', 'Mage', 'Rogue', 'Berserker', 'Paladin'];
  const usedSet = usedNames ? new Set(usedNames) : null;
  let attempts = 0;
  const maxAttempts = 100;
  let name;
  do {
    const a = adj[Math.floor(Math.random() * adj.length)];
    const n = noun[Math.floor(Math.random() * noun.length)];
    const num = Math.floor(Math.random() * 9999) + 1;
    name = a + n + num;
    attempts++;
    if (attempts > maxAttempts) break;
  } while (name.length > maxLen || (usedSet && usedSet.has(name)));
  return name;
}

function randomPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let pw = '';
  for (let i = 0; i < 14; i++) pw += chars.charAt(Math.floor(Math.random() * chars.length));
  return pw;
}

module.exports = {
  buildAntiDetectHeaders,
  generateMachineId,
  randomIP,
  randomUA,
  randomUsername,
  randomPassword,
  sleep,
  randomDelay,
  humanTypingDelay,
  shouldRandomFail,
  smartPause,
  accountProfile,
};
