/**
 * 艾德尔修仙传 - 批量邮箱绑定自动化工具 v1.0
 *
 * 功能：
 *   批量登录账号 → 自动创建临时邮箱 → 发送邮箱验证码 → 轮询收验证码 → 绑定邮箱
 *
 * 🛡️ 防封号集成（复用 _anti_detect_shared.js）：
 *   - 每账号独立伪造 IP（X-Forwarded-For / X-Real-IP 等）
 *   - 每账号独立 machine_id（格式多样防浏览器指纹检测）
 *   - 完整浏览器指纹轮换（UA / Sec-CH-UA / Accept-Language）
 *   - CDN代理链模拟（Via / X-Cache）
 *   - 操作间随机延迟（防频率分析）
 *   - 智能分段暂停（每N个账号休息随机时间）
 *   - 每个账号使用独立临时邮箱，防邮箱关联
 *   - 多个免费邮箱提供商轮换（防单一提供商被封）
 *
 * 📧 免费邮箱提供商（纯 API，无需注册）：
 *   - TempMail.lol  - 免费 REST API，无需认证
 *   - Mail.tm       - 免费 REST API，自动创建收件箱
 *   - 1secmail      - 免费，无需注册
 *   - Tempy.email   - 免费，无需 token
 *   - Mail.gw       - 完全免费，8 QPS/IP
 *
 * 使用：
 *   node batch_email_bind.js
 */
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const antiDetect = require('./_anti_detect_shared');

// ============================================================
// 常量
// ============================================================
const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

// ============================================================
// 免费邮箱提供商 API 配置
// ============================================================
const EMAIL_PROVIDERS = {
  // TempMail.lol - 完全免费，无需注册
  tempmail_lol: {
    name: 'TempMail.lol',
    createInbox: async () => {
      const r = await fetch('https://api.tempmail.lol/v2/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      if (!r.ok) throw new Error('TempMail.lol create inbox failed: ' + r.status);
      const data = await r.json();
      return { email: data.address, token: data.token, provider: 'tempmail_lol' };
    },
    pollCode: async (inbox, maxWaitMs) => {
      const address = inbox.email;
      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`https://api.tempmail.lol/v2/inbox/${address}`, { timeout: 10000 });
          if (r.ok) {
            const data = await r.json();
            if (data.emails && data.emails.length > 0) {
              for (const email of data.emails) {
                const code = extractCodeFromEmail(email);
                if (code) return code;
              }
            }
          }
        } catch (e) {}
        await antiDetect.randomDelay(3000, 5000);
      }
      throw new Error('TempMail.lol: 验证码超时未收到');
    },
  },

  // Mail.tm - 免费 REST API
  mail_tm: {
    name: 'Mail.tm',
    _token: null,
    createInbox: async () => {
      const domainR = await fetch('https://api.mail.tm/domains', { timeout: 10000 });
      const domains = await domainR.json();
      const domain = domains['hydra:member']?.[0]?.domain;
      if (!domain) throw new Error('Mail.tm: 获取域名失败');
      const local = randomLocalPart();
      const r = await fetch('https://api.mail.tm/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: local + '@' + domain, password: 'Temp123!' }),
        timeout: 15000,
      });
      if (!r.ok) throw new Error('Mail.tm create account failed: ' + r.status);
      const authR = await fetch('https://api.mail.tm/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: local + '@' + domain, password: 'Temp123!' }),
        timeout: 10000,
      });
      const auth = await authR.json();
      return { email: local + '@' + domain, token: auth.token, provider: 'mail_tm', password: 'Temp123!' };
    },
    pollCode: async (inbox, maxWaitMs) => {
      const deadline = Date.now() + maxWaitMs;
      const headers = { Authorization: 'Bearer ' + inbox.token };
      while (Date.now() < deadline) {
        try {
          const r = await fetch('https://api.mail.tm/messages', { headers, timeout: 10000 });
          if (r.ok) {
            const data = await r.json();
            if (data['hydra:member'] && data['hydra:member'].length > 0) {
              for (const msg of data['hydra:member']) {
                const detailR = await fetch(msg['@id'], { headers, timeout: 10000 });
                if (detailR.ok) {
                  const detail = await detailR.json();
                  const combined = (detail.subject || '') + ' ' + (detail.text || '') + ' ' + (detail.html || '');
                  const code = extractCodeFromStr(combined);
                  if (code) return code;
                }
              }
            }
          }
        } catch (e) {}
        await antiDetect.randomDelay(3000, 5000);
      }
      throw new Error('Mail.tm: 验证码超时未收到');
    },
  },

  // 1secmail - 完全免费，无需注册
  secmail: {
    name: '1secmail',
    createInbox: async () => {
      const local = randomLocalPart();
      const domains = ['1secmail.com', '1secmail.org', '1secmail.net', 'ezztt.com', 'xojxe.com'];
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const email = local + '@' + domain;
      return { email, token: local, domain, provider: 'secmail' };
    },
    pollCode: async (inbox, maxWaitMs) => {
      const deadline = Date.now() + maxWaitMs;
      const [local, domain] = inbox.email.split('@');
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${local}&domain=${domain}`, { timeout: 10000 });
          if (r.ok) {
            const msgs = await r.json();
            if (msgs && msgs.length > 0) {
              for (const msg of msgs) {
                const detailR = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${local}&domain=${domain}&id=${msg.id}`, { timeout: 10000 });
                if (detailR.ok) {
                  const detail = await detailR.json();
                  const combined = (detail.subject || '') + ' ' + (detail.textBody || '') + ' ' + (detail.htmlBody || '');
                  const code = extractCodeFromStr(combined);
                  if (code) return code;
                }
              }
            }
          }
        } catch (e) {}
        await antiDetect.randomDelay(3000, 5000);
      }
      throw new Error('1secmail: 验证码超时未收到');
    },
  },

  // Tempy.email - 免费，无需 sign-up
  tempy_email: {
    name: 'Tempy.email',
    createInbox: async () => {
      const r = await fetch('https://tempy.email/api/v1/mailbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      if (!r.ok) throw new Error('Tempy.email create failed: ' + r.status);
      const data = await r.json();
      return { email: data.email, token: data.token, provider: 'tempy_email' };
    },
    pollCode: async (inbox, maxWaitMs) => {
      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`https://tempy.email/api/v1/mailbox/${encodeURIComponent(inbox.email)}/messages`, { timeout: 10000 });
          if (r.ok) {
            const msgs = await r.json();
            if (msgs && msgs.length > 0) {
              const combined = msgs.map(m => (m.subject || '') + ' ' + (m.text || '') + ' ' + (m.html || '')).join(' ');
              const code = extractCodeFromStr(combined);
              if (code) return code;
            }
          }
        } catch (e) {}
        await antiDetect.randomDelay(3000, 5000);
      }
      throw new Error('Tempy.email: 验证码超时未收到');
    },
  },

  // Mail.gw - 完全免费，8 QPS
  mail_gw: {
    name: 'Mail.gw',
    createInbox: async () => {
      const domainR = await fetch('https://api.mail.gw/domains', { timeout: 10000 });
      const domains = await domainR.json();
      const domain = domains['hydra:member']?.[0]?.domain || 'mail.gw';
      const local = randomLocalPart();
      const email = local + '@' + domain;
      const pass = 'Pass' + crypto.randomBytes(4).toString('hex');
      const r = await fetch('https://api.mail.gw/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/ld+json' },
        body: JSON.stringify({ address: email, password: pass }),
        timeout: 15000,
      });
      if (!r.ok) throw new Error('Mail.gw create account failed: ' + r.status);
      const tokenR = await fetch('https://api.mail.gw/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: email, password: pass }),
        timeout: 10000,
      });
      const tokenData = await tokenR.json();
      return { email, token: tokenData.token, provider: 'mail_gw', password: pass };
    },
    pollCode: async (inbox, maxWaitMs) => {
      const deadline = Date.now() + maxWaitMs;
      const headers = { Authorization: 'Bearer ' + inbox.token };
      const [local] = inbox.email.split('@');
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`https://api.mail.gw/messages?page=1&itemsPerPage=5`, { headers, timeout: 10000 });
          if (r.ok) {
            const data = await r.json();
            const msgs = data['hydra:member'] || [];
            if (msgs.length > 0) {
              const combined = msgs.map(m => (m.subject || '') + ' ' + (m.body || '')).join(' ');
              const code = extractCodeFromStr(combined);
              if (code) return code;
            }
          }
        } catch (e) {}
        await antiDetect.randomDelay(3000, 5000);
      }
      throw new Error('Mail.gw: 验证码超时未收到');
    },
  },
};

// ============================================================
// 工具函数
// ============================================================
function randomLocalPart() {
  const prefix = ['user', 'test', 'mail', 'temp', 'acc', 'id', 'play', 'game', 'xiuxian', 'dao', 'ling', 'fan', 'yyds', 'nb', 'vip'][Math.floor(Math.random() * 16)];
  return prefix + crypto.randomBytes(4).toString('hex');
}

function extractCodeFromEmail(email) {
  if (!email) return null;
  const subject = email.subject || '';
  const body = email.body || email.text || email.html || '';
  const from = email.from || email.fromAddress || '';
  const combined = subject + ' ' + body + ' ' + from;
  return extractCodeFromStr(combined);
}

function extractCodeFromStr(str) {
  if (!str) return null;
  const codeMatch = str.match(/\b(\d{6})\b/);
  if (codeMatch) return codeMatch[1];
  const codeMatch4 = str.match(/\b(\d{4})\b/);
  if (codeMatch4) return codeMatch4[1];
  return null;
}

const PROVIDER_KEYS = Object.keys(EMAIL_PROVIDERS);

function getProvider(idx) {
  return PROVIDER_KEYS[idx % PROVIDER_KEYS.length];
}

// ============================================================
// 签名 & API 请求（带反检测头）
// ============================================================
let _apiAccountIndex = 0;
let _apiCallCounter = 0;

function setApiAccountIndex(idx) { _apiAccountIndex = idx; _apiCallCounter = 0; }

function makeSign(method, path, timestamp, bodyStr) {
  const data = method + '\n' + path + '\n' + timestamp + '\n' + bodyStr;
  const hmac = crypto.createHmac('sha256', SIGN_KEY);
  hmac.update(data);
  return hmac.digest('hex');
}

async function apiRequest(method, path, token, body, extraHeaders) {
  if (token === undefined) token = '';
  if (body === undefined) body = null;
  if (extraHeaders === undefined) extraHeaders = {};
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = makeSign(method, path, timestamp, bodyStr);
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Version': CLIENT_VERSION,
    'X-Sign-T': String(timestamp),
    'X-Sign': sign,
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const antiHeaders = antiDetect.buildAntiDetectHeaders(_apiAccountIndex + (_apiCallCounter % 100));
  Object.assign(headers, antiHeaders);
  _apiCallCounter++;

  Object.assign(headers, extraHeaders || {});

  const url = API_BASE + path;
  const opts = { method, headers, timeout: 30000 };
  if (bodyStr) opts.body = bodyStr;
  try {
    const r = await fetch(url, opts);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('非JSON响应(' + r.status + '): ' + text.slice(0, 200)); }
    if (!data || data.ok === false) { throw new Error(data && data.error ? data.error : '请求失败'); }
    return data;
  } catch (e) {
    if (e.message.includes('非JSON') || e.message.includes('请求失败')) throw e;
    throw new Error(path + ' 请求失败: ' + e.message);
  }
}

// ============================================================
// 日志
// ============================================================
const LOG_LEVELS = { INFO: 0, OK: 1, WARN: 2, ERR: 3 };
function log(level, tag, msg) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const icons = { INFO: '\u2139', OK: '\u2713', WARN: '\u26A0', ERR: '\u2717' };
  console.log('[' + ts + '] [' + tag + '] ' + (icons[level] || '') + ' ' + msg);
}
function info(tag, msg) { log('INFO', tag, msg); }
function ok(tag, msg) { log('OK', tag, msg); }
function warn(tag, msg) { log('WARN', tag, msg); }
function err(tag, msg) { log('ERR', tag, msg); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// 账号结构
// ============================================================
class Account {
  constructor(username, password) {
    this.username = String(username || '').trim();
    this.password = String(password || '').trim();
    this.token = '';
    this.accountId = 0;
    this.email = '';
    this.emailInbox = null;
    this.providerUsed = '';
  }
  isValid() {
    return this.username.length >= 2 && this.password.length >= 6;
  }
}

// ============================================================
// 加载账号文件
// ============================================================
function loadAccounts(filepath) {
  if (!fs.existsSync(filepath)) {
    warn('加载', '文件不存在: ' + filepath);
    return [];
  }
  const rawLines = fs.readFileSync(filepath, 'utf-8').split('\n');
  const trimmedLines = rawLines.map(l => l.trim());
  const accounts = [];
  for (let i = 0; i < trimmedLines.length; i++) {
    const line = trimmedLines[i];
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      const acc = new Account(parts[0], parts[1]);
      if (acc.isValid()) {
        acc._lineIndex = i;
        acc._rawLine = rawLines[i];
        accounts.push(acc);
      } else {
        warn('加载', '跳过无效账号: ' + parts[0]);
      }
    }
  }
  info('加载', '共加载 ' + accounts.length + ' 个账号');
  return accounts;
}

// ============================================================
// 批量邮箱绑定引擎
// ============================================================
class EmailBindEngine {
  constructor(accounts, options) {
    this.accounts = accounts;
    this.accountFilePath = (options && options.accountFilePath) || './accounts.txt';
    this.emailOutputPath = (options && options.emailOutputPath) || './email_bind_result.txt';
    this.options = Object.assign({
      delayBetweenAccounts: 8000,
      delayBetweenSteps: 2000,
      codePollTimeout: 60000,
      providerRotation: true,
      maxRetriesPerStep: 2,
    }, options || {});
    this.stats = { success: 0, fail: 0, skip: 0, alreadyBound: 0 };
    this.shouldStop = false;
    this.bindResults = [];
  }

  getAntiDetectIndex(acc) {
    return acc._lineIndex !== undefined ? acc._lineIndex : (this.stats.success + this.stats.fail);
  }

  stop() { this.shouldStop = true; }

  markAccountDone(acc) {
    if (acc._lineIndex === undefined || acc._lineIndex < 0) return;
    try {
      const content = fs.readFileSync(this.accountFilePath, 'utf-8');
      const lines = content.split('\n');
      const idx = acc._lineIndex;
      if (idx < lines.length) {
        const trimmed = lines[idx].trim();
        if (!trimmed.startsWith('#') && !trimmed.startsWith('//')) {
          lines[idx] = '# ' + lines[idx];
          fs.writeFileSync(this.accountFilePath, lines.join('\n'), 'utf-8');
        }
      }
    } catch (e) {
      warn('标记', '标记完成失败: ' + e.message);
    }
  }

  appendEmailResult(username, email, provider, status) {
    const line = `${username},${email},${provider},${status},${new Date().toISOString()}`;
    try {
      fs.appendFileSync(this.emailOutputPath, line + '\n', 'utf-8');
    } catch (e) {
      warn('保存', '保存邮箱结果失败: ' + e.message);
    }
  }

  async delay(ms) {
    if (ms <= 0 || this.shouldStop) return;
    const step = 100;
    for (let i = 0; i < ms / step; i++) {
      if (this.shouldStop) return;
      await sleep(step);
    }
  }

  async stepLogin(acc) {
    info(acc.username, '正在登录账号...');
    const machineId = antiDetect.generateMachineId(this.getAntiDetectIndex(acc));
    const body = { username: acc.username, password: acc.password, machine_id: machineId };
    const data = await apiRequest('POST', '/auth/login', '', body);
    acc.token = data.token;
    acc.accountId = data.accountId || 0;
    return data;
  }

  async stepCheckEmailStatus(acc) {
    info(acc.username, '正在检查邮箱绑定状态...');
    try {
      const data = await apiRequest('GET', '/email/status', acc.token);
      if (data.bound && data.email) {
        ok(acc.username, '已绑定邮箱: ' + data.email + '，跳过');
        return true;
      }
    } catch (e) {
      warn(acc.username, '检查邮箱状态失败: ' + e.message);
    }
    return false;
  }

  async stepCreateTempEmail(acc, providerKey) {
    const provider = EMAIL_PROVIDERS[providerKey];
    if (!provider) throw new Error('未知邮箱提供商: ' + providerKey);
    info(acc.username, '正在创建临时邮箱 [' + provider.name + ']...');
    const inbox = await provider.createInbox();
    acc.email = inbox.email;
    acc.emailInbox = inbox;
    acc.providerUsed = providerKey;
    ok(acc.username, '临时邮箱创建成功: ' + inbox.email + ' [' + provider.name + ']');
    return inbox;
  }

  async stepSendCode(acc) {
    info(acc.username, '正在发送邮箱验证码到: ' + acc.email);
    const data = await apiRequest('POST', '/email/send-code', acc.token, { email: acc.email });
    ok(acc.username, '验证码已发送到 ' + acc.email);
    await antiDetect.randomDelay(1500, 3000);
    return data;
  }

  async stepPollCode(acc) {
    const providerKey = acc.providerUsed;
    const provider = EMAIL_PROVIDERS[providerKey];
    if (!provider) throw new Error('未知邮箱提供商: ' + providerKey);
    info(acc.username, '正在轮询验证码 [' + provider.name + '] 超时=' + this.options.codePollTimeout + 'ms...');
    const code = await provider.pollCode(acc.emailInbox, this.options.codePollTimeout);
    if (code) {
      ok(acc.username, '收到验证码: ' + code);
      return code;
    }
    throw new Error('未收到验证码');
  }

  async stepBindEmail(acc, code) {
    info(acc.username, '正在绑定邮箱 ' + acc.email + ' 验证码=' + code);
    const data = await apiRequest('POST', '/email/bind', acc.token, { email: acc.email, code: code });
    ok(acc.username, '邮箱绑定成功!');
    return data;
  }

  async processAccount(acc) {
    const sep = '─── ' + acc.username + ' ───';
    info(acc.username, '═'.repeat(sep.length));
    info(acc.username, sep);
    info(acc.username, '═'.repeat(sep.length));

    const antiIdx = this.getAntiDetectIndex(acc);
    setApiAccountIndex(antiIdx);
    const ipInfo = antiDetect.getIpInfo(antiIdx);
    info(acc.username, '\uD83D\uDEE1\uFE0F 伪装IP: ' + ipInfo.ip + ' (' + ipInfo.isp + '\u00B7' + ipInfo.province + ')');

    try {
      const stepDelay = () => antiDetect.randomDelay(1000, 2500);

      await this.stepLogin(acc);
      await stepDelay();

      const alreadyBound = await this.stepCheckEmailStatus(acc);
      if (alreadyBound) {
        this.stats.alreadyBound++;
        this.appendEmailResult(acc.username, '(已绑定)', '', 'skipped');
        return true;
      }
      await stepDelay();

      let lastError = null;
      const providerStartIdx = this.options.providerRotation
        ? (this.stats.success % PROVIDER_KEYS.length)
        : 0;

      for (let p = 0; p < PROVIDER_KEYS.length; p++) {
        if (this.shouldStop) return false;
        const providerKey = PROVIDER_KEYS[(providerStartIdx + p) % PROVIDER_KEYS.length];
        const providerName = EMAIL_PROVIDERS[providerKey].name;

        try {
          await this.stepCreateTempEmail(acc, providerKey);
          await stepDelay();

          await this.stepSendCode(acc);
          await antiDetect.randomDelay(2000, 4000);

          const code = await this.stepPollCode(acc);
          if (!code) throw new Error('验证码提取失败');

          await this.stepBindEmail(acc, code);

          this.appendEmailResult(acc.username, acc.email, providerName, 'success');
          ok(acc.username, '\u2605\u2605\u2605\u2605\u2605 邮箱绑定成功! \u2605\u2605\u2605\u2605\u2605');
          return true;

        } catch (e) {
          lastError = e;
          warn(acc.username, providerName + ' 失败: ' + e.message + '，尝试下一个提供商...');

          if (acc.email) {
            this.appendEmailResult(acc.username, acc.email, providerName, 'fail-' + e.message);
          }
          acc.email = '';
          acc.emailInbox = null;
          await antiDetect.randomDelay(2000, 4000);
        }
      }

      throw lastError || new Error('所有邮箱提供商均失败');

    } catch (e) {
      err(acc.username, '处理失败: ' + e.message);
      return false;
    }
  }

  async run() {
    this.shouldStop = false;
    this.stats = { success: 0, fail: 0, skip: 0, alreadyBound: 0 };
    this.bindResults = [];
    const accounts = this.accounts;

    info('引擎', '========================================');
    info('引擎', '批量邮箱绑定工具 v1.0 \uD83D\uDEE1\uFE0F');
    info('引擎', '可用邮箱提供商: ' + PROVIDER_KEYS.map(k => EMAIL_PROVIDERS[k].name).join(', '));
    info('引擎', '共 ' + accounts.length + ' 个账号需要绑定');
    info('引擎', '\uD83D\uDEE1\uFE0F 反检测: 独立IP+机器码+浏览器指纹+随机延迟+智能分段');
    info('引擎', '========================================');

    for (let i = 0; i < accounts.length; i++) {
      if (this.shouldStop) {
        warn('引擎', '用户中断');
        break;
      }
      const acc = accounts[i];
      const result = await this.processAccount(acc);

      if (result) {
        this.stats.success++;
        this.markAccountDone(acc);
      } else {
        this.stats.fail++;
      }

      if (i < accounts.length - 1 && !this.shouldStop) {
        const waitMs = antiDetect.randomDelay
          ? Math.floor(Math.random() * 5000) + this.options.delayBetweenAccounts
          : this.options.delayBetweenAccounts;
        info('引擎', '等待 ' + Math.round(waitMs / 1000) + 's 后处理下一个账号...');
        await this.delay(waitMs);
      }

      if ((i + 1) % 3 === 0 && i < accounts.length - 1) {
        const pauseSec = Math.floor(Math.random() * 25) + 25;
        info('\uD83D\uDEE1\uFE0F 智能暂停', '已完成 ' + (i + 1) + '/' + accounts.length + ' 个，休息 ' + pauseSec + 's 防检测...');
        for (let s = 0; s < pauseSec && !this.shouldStop; s++) {
          await sleep(1000);
        }
      }
    }

    info('引擎', '========================================');
    info('引擎', '批量邮箱绑定完成!');
    info('引擎', '成功: ' + this.stats.success + ', 已跳过: ' + this.stats.alreadyBound + ', 失败: ' + this.stats.fail);
    info('引擎', '绑定结果已保存: ' + this.emailOutputPath);
    info('引擎', '========================================');
  }
}

// ============================================================
// 交互式控制台
// ============================================================
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

function showBanner() {
  console.log('');
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551     艾德尔修仙传 - 批量邮箱绑定工具 v1.0 \uD83D\uDEE1\uFE0F          \u2551');
  console.log('\u2551     功能: 登录 -> 创建临时邮箱 -> 收验证码 -> 绑定           \u2551');
  console.log('\u2551     \uD83D\uDEE1\uFE0F 防封号: 独立IP+机器码+指纹轮换+随机延迟+智能分段       \u2551');
  console.log('\u2551     \uD83D\uDCE7 提供商: TempMail.lol / Mail.tm / 1secmail / Tempy.email  \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  console.log('');
}

async function main() {
  showBanner();

  const filepath = './accounts.txt';
  if (!fs.existsSync(filepath)) {
    console.log('未找到 accounts.txt');
    console.log('请先创建 accounts.txt，每行格式: 用户名,密码');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('按回车退出...', () => { rl.close(); });
    return;
  }

  const accounts = loadAccounts(filepath);
  if (accounts.length === 0) {
    console.log('没有有效账号，退出');
    return;
  }

  console.log('加载 ' + accounts.length + ' 个账号:');
  for (const acc of accounts.slice(0, 10)) {
    console.log('  [' + acc.username + ']');
  }
  if (accounts.length > 10) {
    console.log('  ... 还有 ' + (accounts.length - 10) + ' 个');
  }

  console.log('');
  console.log('配置选项 (直接回车使用默认值):');

  let delay = await ask('账号间隔(秒) [8]: ');
  delay = parseInt(delay) || 8;

  let pollTimeout = await ask('验证码等待超时(秒) [60]: ');
  pollTimeout = parseInt(pollTimeout) || 60;

  let rotation = await ask('启用提供商轮换（防关联） [Y/n]: ');
  const useRotation = rotation.toLowerCase() !== 'n';

  console.log('');
  console.log('确认配置:');
  console.log('  账号数: ' + accounts.length);
  console.log('  账号间隔: ' + delay + 's');
  console.log('  验证码超时: ' + pollTimeout + 's');
  console.log('  提供商轮换: ' + (useRotation ? '是' : '否'));
  console.log('');

  const confirm = await ask('是否开始批量绑定邮箱? (Y/n): ');
  if (confirm.toLowerCase() === 'n' || confirm.toLowerCase() === 'no') {
    console.log('已取消');
    return;
  }

  const engine = new EmailBindEngine(accounts, {
    delayBetweenAccounts: delay * 1000,
    codePollTimeout: pollTimeout * 1000,
    providerRotation: useRotation,
    accountFilePath: filepath,
    emailOutputPath: './email_bind_result.txt',
  });

  process.on('SIGINT', () => {
    console.log('\n收到中断信号，正在停止...');
    engine.stop();
  });

  await engine.run();

  console.log('');
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl2.question('按回车退出...', () => { rl2.close(); });
}

main().catch(e => {
  console.error('程序异常:', e.message);
  console.error(e.stack);
  process.exit(1);
});
