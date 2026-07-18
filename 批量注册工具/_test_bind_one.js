/**
 * 快速测试：用单个账号测试邮箱绑定流程
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

async function testEmailProvider() {
  // Test Tempy.email
  const r = await fetch('https://tempy.email/api/v1/mailbox', { method: 'POST', timeout: 15000 });
  const inbox = await r.json();
  console.log('[OK] 创建临时邮箱:', inbox.email);
  return inbox;
}

async function pollTempyEmail(inbox, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('https://tempy.email/api/v1/mailbox/' + encodeURIComponent(inbox.email) + '/messages', { timeout: 10000 });
      if (r.ok) {
        const msgs = await r.json();
        if (msgs && msgs.length > 0) {
          const combined = msgs.map(m => (m.subject || '') + ' ' + (m.text || '') + ' ' + (m.html || '')).join(' ');
          const codeMatch = combined.match(/\b(\d{6})\b/);
          if (codeMatch) return codeMatch[1];
        }
      }
    } catch(e) {}
    await sleep(3000);
  }
  throw new Error('验证码超时');
}

async function main() {
  const username = process.argv[2] || '古月方想';
  const password = process.argv[3] || 'qwertyuiop';

  console.log('=== 测试邮箱绑定流程 ===\n');
  console.log('账号:', username);

  try {
    // Step 1: Login
    console.log('\n[1/5] 登录账号...');
    const machineId = antiDetect.generateMachineId(Math.floor(Math.random() * 100));
    const loginData = await apiRequest('POST', '/auth/login', '', { username, password, machine_id: machineId });
    const token = loginData.token;
    console.log('  -> 登录成功, accountId=' + loginData.accountId);
    await sleep(1500);

    // Step 2: Check email status
    console.log('\n[2/5] 检查邮箱绑定状态...');
    const statusData = await apiRequest('GET', '/email/status', token);
    if (statusData.bound) {
      console.log('  -> 已绑定邮箱:', statusData.email + '，跳过');
      return;
    }
    console.log('  -> 未绑定，继续流程');
    await sleep(1000);

    // Step 3: Create temp email via Tempy.email
    console.log('\n[3/5] 创建临时邮箱 (Tempy.email)...');
    const inbox = await testEmailProvider();
    const email = inbox.email;
    console.log('  -> 邮箱:', email);
    await sleep(1500);

    // Step 4: Send verification code
    console.log('\n[4/5] 发送验证码到:', email);
    const sendData = await apiRequest('POST', '/email/send-code', token, { email });
    console.log('  ->', sendData.msg || '验证码已发送');
    await sleep(2000);

    // Step 5: Poll for code
    console.log('\n[5/5] 轮询验证码 (等待60s)...');
    const code = await pollTempyEmail(inbox, 60000);
    console.log('  -> 收到验证码:', code);

    // Step 6: Bind
    console.log('\n[6/6] 绑定邮箱...');
    const bindData = await apiRequest('POST', '/email/bind', token, { email, code });
    console.log('  ->', bindData.msg || '绑定成功!');

    console.log('\n=== 邮箱绑定成功! ===');
  } catch(e) {
    console.error('\n[失败]', e.message);
  }
}

main().catch(e => console.error('异常:', e.message));
