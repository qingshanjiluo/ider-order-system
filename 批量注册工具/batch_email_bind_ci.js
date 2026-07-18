/**
 * 艾德尔修仙传 - GitHub Actions 一键邮箱绑定工具
 *
 * 输入格式（支持三种方式）：
 *   1. 环境变量 ACCOUNTS：user1,pass1;user2,pass2;user3,pass3
 *   2. 文件（默认 accounts_email.txt）：每行 用户名,密码
 *   3. GitHub Secrets：ACCOUNTS_DATA 或 ACCOUNTS_BASE64
 *
 * 环境变量：
 *   ACCOUNTS       - 分号分隔的账号列表
 *   ACCOUNTS_FILE  - 账号文件路径（默认 accounts_email.txt）
 *   DELAY_MS       - 账号间隔毫秒（默认 10000）
 *   POLL_TIMEOUT_MS - 验证码等待超时（默认 120000）
 *   PROVIDER       - 邮箱提供商: mail_tm / tempy_email / all（默认 mail_tm）
 *   CI             - CI模式（true=无交互）
 */
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const antiDetect = require('./_anti_detect_shared');

const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

const PROVIDER_LIST = ['mail_tm', 'tempy_email'];
const PROVIDER_NAMES = { mail_tm: 'Mail.tm', tempy_email: 'Tempy.email' };

let _apiIdx = 0;
function setApiIdx(idx) { _apiIdx = idx; }

function makeSign(method, path, timestamp, bodyStr) {
  const hmac = crypto.createHmac('sha256', SIGN_KEY);
  hmac.update(method + '\n' + path + '\n' + timestamp + '\n' + bodyStr);
  return hmac.digest('hex');
}

async function apiRequest(method, path, token, body) {
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
  const anti = antiDetect.buildAntiDetectHeaders(_apiIdx++);
  Object.assign(headers, anti);
  const r = await fetch(API_BASE + path, { method, headers, body: bodyStr || undefined, timeout: 30000 });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Mail.tm ────────────────────────────────────────────────
async function createMailTm() {
  const dr = await fetch('https://api.mail.tm/domains', { timeout: 10000 });
  const domains = await dr.json();
  const domain = domains['hydra:member']?.[0]?.domain;
  if (!domain) throw new Error('Mail.tm: 获取域名失败');
  const local = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = local + '@' + domain;
  await fetch('https://api.mail.tm/accounts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: email, password: 'Temp1234!' }), timeout: 15000,
  });
  const ar = await fetch('https://api.mail.tm/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: email, password: 'Temp1234!' }), timeout: 10000,
  });
  const auth = await ar.json();
  return { email, token: auth.token };
}

async function pollMailTm(inbox, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  const headers = { Authorization: 'Bearer ' + inbox.token };
  while (Date.now() < deadline) {
    try {
      const r = await fetch('https://api.mail.tm/messages', { headers, timeout: 10000 });
      if (r.ok) {
        const data = await r.json();
        if (data['hydra:member']?.length) {
          for (const msg of data['hydra:member']) {
            const dr = await fetch('https://api.mail.tm' + msg['@id'], { headers, timeout: 10000 });
            if (dr.ok) {
              const d = await dr.json();
              const combined = (d.subject||'') + ' ' + (d.text||'') + ' ' + (d.html||'');
              const m = combined.match(/\b(\d{6})\b/);
              if (m) return m[1];
            }
          }
        }
      }
    } catch (e) {}
    await sleep(3000);
  }
  return null;
}

// ─── Tempy.email ────────────────────────────────────────────
async function createTempy() {
  const r = await fetch('https://tempy.email/api/v1/mailbox', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 15000,
  });
  if (!r.ok) throw new Error('Tempy.email create failed: ' + r.status);
  const data = await r.json();
  return { email: data.email, token: data.token };
}

async function pollTempy(inbox, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('https://tempy.email/api/v1/mailbox/' + encodeURIComponent(inbox.email) + '/messages', { timeout: 10000 });
      if (r.ok) {
        const msgs = await r.json();
        if (msgs?.length) {
          const combined = msgs.map(m => (m.subject||'') + ' ' + (m.text||'') + ' ' + (m.html||'')).join(' ');
          const m = combined.match(/\b(\d{6})\b/);
          if (m) return m[1];
        }
      }
    } catch (e) {}
    await sleep(3000);
  }
  return null;
}

// ─── 账号处理 ────────────────────────────────────────────────
async function processAccount(username, password, idx, providerKey, pollTimeoutMs) {
  const ts = () => new Date().toLocaleString('zh-CN', { hour12: false });
  const log = (tag, m) => process.stdout.write('[' + ts() + '] [' + tag + '] ' + m + '\n');

  try {
    setApiIdx(idx * 15 + 1);
    log(username, '登录中...');
    const machineId = antiDetect.generateMachineId(idx);
    const loginData = await apiRequest('POST', '/auth/login', '', { username, password, machine_id: machineId });
    const token = loginData.token;
    log(username, '登录成功 accountId=' + (loginData.accountId || '?'));
    await sleep(2000);

    const statusData = await apiRequest('GET', '/email/status', token);
    if (statusData.bound) {
      log(username, '已绑定跳过: ' + (statusData.email || '?'));
      return { status: 'skipped', email: statusData.email || '' };
    }
    log(username, '未绑定');
    await sleep(1500);

    let inbox;
    if (providerKey === 'mail_tm') {
      log(username, '创建 Mail.tm...');
      inbox = await createMailTm();
    } else {
      log(username, '创建 Tempy.email...');
      inbox = await createTempy();
    }
    log(username, '邮箱: ' + inbox.email);
    await sleep(2000);

    log(username, '发验证码...');
    await apiRequest('POST', '/email/send-code', token, { email: inbox.email });
    log(username, '验证码已发送');
    await sleep(2000);

    log(username, '轮询验证码(' + (pollTimeoutMs/1000) + 's)...');
    const code = providerKey === 'mail_tm' ? await pollMailTm(inbox, pollTimeoutMs) : await pollTempy(inbox, pollTimeoutMs);
    if (!code) {
      log(username, '验证码超时');
      return { status: 'timeout', email: inbox.email };
    }
    log(username, '验证码: ' + code);

    log(username, '绑定...');
    await apiRequest('POST', '/email/bind', token, { email: inbox.email, code });
    log(username, '绑定成功!');
    return { status: 'success', email: inbox.email };
  } catch (e) {
    log(username, '失败: ' + e.message);
    return { status: 'error', error: e.message };
  }
}

// ─── 入口 ────────────────────────────────────────────────────
async function main() {
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const accountsStr = process.env.ACCOUNTS || '';
  const accountsFile = process.env.ACCOUNTS_FILE || '';
  const delayMs = parseInt(process.env.DELAY_MS || '') || 10000;
  const pollTimeoutMs = parseInt(process.env.POLL_TIMEOUT_MS || '') || 120000;
  const providerEnv = (process.env.PROVIDER || 'mail_tm').toLowerCase();
  const secretsData = process.env.ACCOUNTS_DATA || '';
  const secretsBase64 = process.env.ACCOUNTS_BASE64 || '';

  let accounts = [];

  // 1. Environment variable ACCOUNTS (semicolon separated)
  if (accountsStr.trim()) {
    const parts = accountsStr.split(';').filter(s => s.trim());
    for (const p of parts) {
      const [u, pw] = p.split(',').map(s => s.trim());
      if (u && pw) accounts.push({ username: u, password: pw });
    }
    if (accounts.length) console.log('[输入] 从 ACCOUNTS 环境变量加载 ' + accounts.length + ' 个账号');
  }

  // 2. File (support multiple search paths)
  const searchFiles = accountsFile
    ? [accountsFile]
    : ['accounts_email.txt', '../accounts_email.txt', 'accounts.txt', '../accounts.txt'];
  let usedFile = '';
  if (!accounts.length) {
    for (const fp of searchFiles) {
      if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        for (const line of lines) {
          const [u, pw] = line.split(',').map(s => s.trim());
          if (u && pw) accounts.push({ username: u, password: pw });
        }
        if (accounts.length) { usedFile = fp; break; }
      }
    }
    if (accounts.length) console.log('[输入] 从 ' + usedFile + ' 加载 ' + accounts.length + ' 个账号');
  }

  // 3. GitHub Secrets ACCOUNTS_DATA
  if (!accounts.length && secretsData.trim()) {
    const lines = secretsData.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    for (const line of lines) {
      const [u, pw] = line.split(',').map(s => s.trim());
      if (u && pw) accounts.push({ username: u, password: pw });
    }
    if (accounts.length) console.log('[输入] 从 ACCOUNTS_DATA Secret 加载 ' + accounts.length + ' 个账号');
  }

  // 4. GitHub Secrets ACCOUNTS_BASE64
  if (!accounts.length && secretsBase64.trim()) {
    try {
      const decoded = Buffer.from(secretsBase64, 'base64').toString('utf-8');
      const lines = decoded.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      for (const line of lines) {
        const [u, pw] = line.split(',').map(s => s.trim());
        if (u && pw) accounts.push({ username: u, password: pw });
      }
      if (accounts.length) console.log('[输入] 从 ACCOUNTS_BASE64 Secret 加载 ' + accounts.length + ' 个账号');
    } catch (e) {
      console.error('[输入] ACCOUNTS_BASE64 解码失败: ' + e.message);
    }
  }

  if (!accounts.length) {
    console.error('[错误] 没有找到任何账号！');
    console.error('请通过以下方式提供：');
    console.error('  1. 环境变量 ACCOUNTS: user1,pass1;user2,pass2');
    console.error('  2. 仓库账号文件: accounts_email.txt / accounts.txt（当前目录或仓库根目录）');
    console.error('  3. 环境变量 ACCOUNTS_FILE 指定文件路径');
    console.error('  4. GitHub Secrets: ACCOUNTS_DATA 或 ACCOUNTS_BASE64');
    process.exit(1);
  }

  // Provider selection
  const providers = providerEnv === 'all' ? PROVIDER_LIST : (PROVIDER_LIST.includes(providerEnv) ? [providerEnv] : ['mail_tm']);
  console.log('[配置] 总账号: ' + accounts.length + ', 间隔: ' + (delayMs/1000) + 's, 超时: ' + (pollTimeoutMs/1000) + 's');
  console.log('[配置] 提供商: ' + providers.map(p => PROVIDER_NAMES[p] || p).join(', '));
  console.log('[配置] 反检测: 独立IP+机器码+指纹轮换+智能暂停');
  console.log('');

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < accounts.length; i++) {
    const { username, password } = accounts[i];
    const providerKey = providers[i % providers.length];
    const SEP = '───── ' + username + ' [' + (i+1) + '/' + accounts.length + '] ─────';
    console.log(SEP);
    console.log('[🛡️ IP] ' + antiDetect.getIpInfo(i).ip + ' (' + antiDetect.getIpInfo(i).isp + '·' + antiDetect.getIpInfo(i).province + ')');

    const r = await processAccount(username, password, i, providerKey, pollTimeoutMs);
    results.push({ username, ...r });
    console.log('  → ' + ({ success: '✅ 成功(' + (r.email||'') + ')', skipped: '⏭️ 已跳过(' + (r.email||'') + ')', timeout: '⏰ 超时', error: '❌ ' + (r.error||'') }[r.status] || r.status));

    const succ = results.filter(x => x.status === 'success').length;
    const skip = results.filter(x => x.status === 'skipped').length;
    const fail = results.filter(x => x.status !== 'success' && x.status !== 'skipped').length;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log('[进度] ' + succ + '成功 ' + skip + '跳过 ' + fail + '失败 | ' + Math.floor(elapsed/60) + 'm' + (elapsed%60) + 's');

    if (i < accounts.length - 1) {
      const d = delayMs + Math.floor(Math.random() * 5000);
      console.log('[等待] ' + Math.round(d/1000) + 's');
      await sleep(d);
    }

    if ((i + 1) % 3 === 0 && i < accounts.length - 1) {
      const pause = 25 + Math.floor(Math.random() * 20);
      console.log('[🛡️ 暂停] ' + pause + 's');
      await sleep(pause * 1000);
    }
    console.log('');
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  const finalSucc = results.filter(x => x.status === 'success').length;
  const finalSkip = results.filter(x => x.status === 'skipped').length;
  const finalFail = results.filter(x => x.status !== 'success' && x.status !== 'skipped').length;

  console.log('══════════════════════════════════');
  console.log('✅ 全部完成!');
  console.log('   成功: ' + finalSucc + ' / 跳过: ' + finalSkip + ' / 失败: ' + finalFail);
  console.log('   总耗时: ' + Math.floor(totalTime/60) + '分' + (totalTime%60) + '秒');

  const output = {
    run_time: new Date().toISOString(),
    total: accounts.length,
    success: finalSucc,
    skipped: finalSkip,
    failed: finalFail,
    duration_seconds: totalTime,
    results: results.map(r => ({
      username: r.username,
      status: r.status,
      email: r.email || '',
      error: r.error || '',
    })),
  };

  const jsonPath = 'email_bind_result_' + Date.now() + '.json';
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log('[输出] 结果已保存: ' + jsonPath);

  const txtPath = jsonPath.replace('.json', '.txt');
  fs.writeFileSync(txtPath, results.map(r =>
    r.username + ',' + (r.email||'') + ',' + r.status
  ).join('\n'), 'utf-8');
  console.log('[输出] 文本结果: ' + txtPath);

  // GitHub Actions step summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    let md = '# 📧 邮箱绑定结果\n\n';
    md += '| 账号 | 状态 | 邮箱 |\n';
    md += '|------|------|------|\n';
    for (const r of results) {
      const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
      md += '| ' + r.username + ' | ' + icon + ' ' + r.status + ' | ' + (r.email||r.error||'') + ' |\n';
    }
    md += '\n**总计:** ' + finalSucc + ' 成功, ' + finalSkip + ' 跳过, ' + finalFail + ' 失败\n';
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md, 'utf-8');
  }

  if (finalFail > 0) process.exit(1);
}

main().catch(e => {
  console.error('[致命] ' + e.message);
  process.exit(1);
});
