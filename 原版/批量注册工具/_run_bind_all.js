/**
 * 快速批量绑定邮箱 - 不交互，直接运行
 * 使用 Mail.tm 提供商（已验证可用）
 */
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const antiDetect = require('./_anti_detect_shared');

const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

let _apiIdx = 0;

function setApiIdx(idx) { _apiIdx = idx; }

function makeSign(method, path, timestamp, bodyStr) {
  const data = method + '\n' + path + '\n' + timestamp + '\n' + bodyStr;
  const hmac = crypto.createHmac('sha256', SIGN_KEY);
  hmac.update(data);
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
  const antiHeaders = antiDetect.buildAntiDetectHeaders(_apiIdx);
  Object.assign(headers, antiHeaders);
  _apiIdx++;

  const r = await fetch(API_BASE + path, { method, headers, body: bodyStr || undefined, timeout: 30000 });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createMailTmInbox() {
  const dr = await fetch('https://api.mail.tm/domains', { timeout: 10000 });
  const domains = await dr.json();
  const domain = domains['hydra:member']?.[0]?.domain;
  const local = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = local + '@' + domain;
  await fetch('https://api.mail.tm/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: email, password: 'Test1234!' }),
    timeout: 15000,
  });
  const ar = await fetch('https://api.mail.tm/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: email, password: 'Test1234!' }),
    timeout: 10000,
  });
  const auth = await ar.json();
  return { email, token: auth.token, provider: 'Mail.tm' };
}

async function pollMailTm(inbox, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  const headers = { Authorization: 'Bearer ' + inbox.token };
  while (Date.now() < deadline) {
    try {
      const r = await fetch('https://api.mail.tm/messages', { headers, timeout: 10000 });
      if (r.ok) {
        const data = await r.json();
        if (data['hydra:member'] && data['hydra:member'].length > 0) {
          for (const msg of data['hydra:member']) {
            const dr = await fetch('https://api.mail.tm' + msg['@id'], { headers, timeout: 10000 });
            if (dr.ok) {
              const detail = await dr.json();
              const combined = (detail.subject || '') + ' ' + (detail.text || '') + ' ' + (detail.html || '');
              const m = combined.match(/\b(\d{6})\b/);
              if (m) return m[1];
            }
          }
        }
      }
    } catch(e) {}
    await sleep(3000);
  }
  return null;
}

async function processAccount(username, password, idx) {
  const ts = () => new Date().toLocaleString('zh-CN', { hour12: false });
  const log = (tag, msg) => console.log('[' + ts() + '] [' + tag + '] ' + msg);

  try {
    setApiIdx(idx * 10 + 1);
    log(username, '登录中...');
    const machineId = antiDetect.generateMachineId(idx);
    const loginData = await apiRequest('POST', '/auth/login', '', { username, password, machine_id: machineId });
    const token = loginData.token;
    const aid = loginData.accountId;
    log(username, '登录成功 accountId=' + aid);
    await sleep(2000);

    const statusData = await apiRequest('GET', '/email/status', token);
    if (statusData.bound) {
      log(username, '已绑定: ' + statusData.email + '，跳过');
      return { status: 'skipped', email: statusData.email };
    }
    log(username, '未绑定，继续');
    await sleep(1500);

    log(username, '创建临时邮箱 Mail.tm...');
    const inbox = await createMailTmInbox();
    log(username, '邮箱: ' + inbox.email);
    await sleep(2000);

    log(username, '发送验证码...');
    const sendData = await apiRequest('POST', '/email/send-code', token, { email: inbox.email });
    log(username, '验证码已发送');
    await sleep(2000);

    log(username, '轮询验证码(最长120s)...');
    const code = await pollMailTm(inbox, 120000);
    if (!code) {
      log(username, '验证码超时');
      return { status: 'timeout', email: inbox.email };
    }
    log(username, '验证码: ' + code);

    log(username, '绑定邮箱...');
    const bindData = await apiRequest('POST', '/email/bind', token, { email: inbox.email, code: code });
    log(username, '绑定成功!');
    return { status: 'success', email: inbox.email };
  } catch(e) {
    log(username, '失败: ' + e.message);
    return { status: 'error', error: e.message };
  }
}

async function main() {
  console.log('批量邮箱绑定 - 使用 Mail.tm\n');
  console.log('时间: ' + new Date().toLocaleString('zh-CN', { hour12: false }));

  const lines = fs.readFileSync('accounts_email.txt', 'utf-8').split('\n').filter(l => l.trim());
  console.log('账号数: ' + lines.length + '\n');

  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim());
    if (parts.length < 2) continue;
    const [username, password] = parts;

    console.log('\n' + '='.repeat(50));
    console.log('[' + (i+1) + '/' + lines.length + '] ' + username);
    console.log('='.repeat(50));

    const r = await processAccount(username, password, i);
    results.push({ username, ...r });
    console.log('  -> 结果: ' + r.status);

    const successCount = results.filter(x => x.status === 'success').length;
    const skipCount = results.filter(x => x.status === 'skipped').length;
    console.log('  进度: ' + successCount + '成功, ' + skipCount + '跳过, ' +
      results.filter(x => x.status === 'timeout' || x.status === 'error').length + '失败');

    if (i < lines.length - 1) {
      const delay = 8000 + Math.floor(Math.random() * 5000);
      console.log('  等待 ' + Math.round(delay/1000) + 's...');
      await sleep(delay);
    }

    if ((i + 1) % 3 === 0 && i < lines.length - 1) {
      const pause = 30 + Math.floor(Math.random() * 15);
      console.log('\n  --- 智能暂停 ' + pause + 's ---\n');
      await sleep(pause * 1000);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('完成!');
  const success = results.filter(r => r.status === 'success').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'timeout' || r.status === 'error').length;
  console.log('成功: ' + success + ', 跳过: ' + skipped + ', 失败: ' + failed);

  const outPath = './email_bind_result_' + Date.now() + '.txt';
  fs.writeFileSync(outPath, results.map(r =>
    r.username + ',' + (r.status === 'success' ? r.email : '') + ',' + r.status
  ).join('\n'), 'utf-8');
  console.log('结果保存: ' + outPath);
}

main().catch(e => console.error('异常:', e.message));
