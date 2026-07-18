const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
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
  try { return JSON.parse(text); } catch(e) { return { ok: false, error: text.slice(0, 200) }; }
}

async function main() {
  const lines = fs.readFileSync('accounts_email.txt', 'utf-8').split('\n').filter(l => l.trim());
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim());
    if (parts.length < 2) continue;
    const [username, password] = parts;

    try {
      const machineId = antiDetect.generateMachineId(i);
      const loginData = await apiRequest('POST', '/auth/login', '', { username, password, machine_id: machineId });
      if (!loginData.ok) throw new Error(loginData.error || '登录失败');

      const statusData = await apiRequest('GET', '/email/status', loginData.token);
      const status = statusData.bound ? '已绑定' : '未绑定';
      const email = statusData.bound ? statusData.email : '';
      console.log((i+1) + '. ' + username + ' -> ' + status + ' ' + email);
      results.push({ username, status, email });
    } catch(e) {
      console.log((i+1) + '. ' + username + ' -> 错误: ' + e.message);
      results.push({ username, status: '错误', error: e.message });
    }

    // Delay between checks
    if (i < lines.length - 1) {
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    }
  }

  console.log('\n=== 汇总 ===');
  const bound = results.filter(r => r.status === '已绑定').length;
  const unbound = results.filter(r => r.status === '未绑定').length;
  const failed = results.filter(r => r.status === '错误').length;
  console.log('已绑定: ' + bound + ', 未绑定: ' + unbound + ', 错误: ' + failed);
  console.log('\n未绑定的账号:');
  results.filter(r => r.status === '未绑定').forEach(r => console.log('  ' + r.username));
}

main().catch(e => console.error('异常:', e.message));
