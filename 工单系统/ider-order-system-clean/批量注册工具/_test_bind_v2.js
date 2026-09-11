/**
 * 测试邮箱绑定 v2 - 使用 Mail.tm 提供商 + 更长轮询时间
 */
const crypto = require('crypto');
const fetch = require('node-fetch');
const antiDetect = require('./_anti_detect_shared');

const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

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
  const antiHeaders = antiDetect.buildAntiDetectHeaders(Math.floor(Math.random() * 100));
  Object.assign(headers, antiHeaders);

  const r = await fetch(API_BASE + path, { method, headers, body: bodyStr || undefined, timeout: 30000 });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createTempyEmail() {
  const r = await fetch('https://tempy.email/api/v1/mailbox', { method: 'POST', timeout: 15000 });
  return await r.json();
}

async function pollTempy(inbox, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('https://tempy.email/api/v1/mailbox/' + encodeURIComponent(inbox.email) + '/messages', { timeout: 10000 });
      if (r.ok) {
        const msgs = await r.json();
        if (msgs && msgs.length > 0) {
          const combined = msgs.map(m => (m.subject || '') + ' ' + (m.text || '') + ' ' + (m.html || '')).join(' ');
          const codeMatch = combined.match(/\b(\d{6})\b/);
          if (codeMatch) return { code: codeMatch[1], provider: 'Tempy.email' };
        }
      }
    } catch(e) {}
    await sleep(3000);
  }
  return null;
}

async function createMailTmEmail() {
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
        if (data['hydra:member'] && data['hydra:member'].length > 0) {
          for (const msg of data['hydra:member']) {
            const dr = await fetch('https://api.mail.tm' + msg['@id'], { headers, timeout: 10000 });
            if (dr.ok) {
              const detail = await dr.json();
              const combined = (detail.subject || '') + ' ' + (detail.text || '') + ' ' + (detail.html || '');
              const codeMatch = combined.match(/\b(\d{6})\b/);
              if (codeMatch) return { code: codeMatch[1], provider: 'Mail.tm' };
            }
          }
        }
      }
    } catch(e) {}
    await sleep(3000);
  }
  return null;
}

async function main() {
  const username = process.argv[2] || '元始仙尊';
  const password = process.argv[3] || 'qwertyuiop';
  const useMailTm = process.argv[4] === 'mailtm';

  console.log('=== 邮箱绑定测试 v2 ===\n');
  console.log('账号:', username);
  console.log('提供商:', useMailTm ? 'Mail.tm' : 'Tempy.email');

  try {
    // Login
    console.log('\n[1] 登录...');
    const machineId = antiDetect.generateMachineId(Math.floor(Math.random() * 1000));
    const loginData = await apiRequest('POST', '/auth/login', '', { username, password, machine_id: machineId });
    const token = loginData.token;
    console.log('  OK accountId=' + loginData.accountId);
    await sleep(1500);

    // Check status
    const statusData = await apiRequest('GET', '/email/status', token);
    if (statusData.bound) { console.log('  已绑定:', statusData.email); return; }
    console.log('  未绑定');
    await sleep(1000);

    // Create inbox
    console.log('\n[2] 创建临时邮箱...');
    let inbox, pollFn, providerName;
    if (useMailTm) {
      inbox = await createMailTmEmail();
      pollFn = pollMailTm;
      providerName = 'Mail.tm';
    } else {
      inbox = await createTempyEmail();
      pollFn = pollTempy;
      providerName = 'Tempy.email';
    }
    console.log('  Email:', inbox.email);
    await sleep(1500);

    // Send code
    console.log('\n[3] 发送验证码...');
    const sendData = await apiRequest('POST', '/email/send-code', token, { email: inbox.email });
    console.log('  ' + (sendData.msg || 'OK'));
    const sendTime = Date.now();

    // Poll longer (up to 180s)
    console.log('\n[4] 轮询验证码 (最长180秒)...');
    const result = await pollFn(inbox, 180000);
    if (!result) {
      console.log('  超时未收到, 已过 ' + Math.round((Date.now() - sendTime) / 1000) + 's');
      console.log('\n检查是否 Tencent Cloud SES 不可用:');
      console.log('  1. 验证码已创建在数据库中');
      console.log('  2. 但 SES 可能未配置（环境变量缺失）');

      // Still try to get the code from DB directly? No, we can't access the server DB.

      // Let's try with the other provider
      if (!useMailTm) {
        console.log('\n尝试使用 Mail.tm...');
        inbox2 = await createMailTmEmail();
        console.log('  新邮箱:', inbox2.email);
        await sleep(1500);
        await apiRequest('POST', '/email/send-code', token, { email: inbox2.email });
        console.log('  验证码已发送');
        const result2 = await pollMailTm(inbox2, 180000);
        if (result2) {
          console.log('  收到验证码:', result2.code, 'via', result2.provider);
          const bindData = await apiRequest('POST', '/email/bind', token, { email: inbox2.email, code: result2.code });
          console.log('  绑定结果:', bindData.msg || 'OK');
          return;
        }
      }
      return;
    }

    console.log('  收到验证码:', result.code, 'via', result.provider);

    // Bind
    console.log('\n[5] 绑定...');
    const bindData = await apiRequest('POST', '/email/bind', token, { email: inbox.email, code: result.code });
    console.log('  ' + (bindData.msg || '绑定成功!'));
    console.log('\n=== 完成! ===');

  } catch(e) {
    console.error('\n[失败]', e.message);
    console.error(e.stack);
  }
}

main().catch(e => console.error('异常:', e.message));
