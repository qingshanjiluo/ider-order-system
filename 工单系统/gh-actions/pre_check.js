/**
 * 工单扫描预检查 - 验证 Worker API 和游戏 API 可用性
 * 用于 GitHub Actions pre-check job
 */
const crypto = require('crypto');
// Node.js 20+ 内置 fetch，无需 node-fetch
const fs = require('fs');

const WORKER_URL = process.env.WORKER_URL;
const API_KEY = process.env.API_KEY;
const API_BASE = process.env.API_BASE;
const SIGN_KEY = process.env.SIGN_KEY;
const CLIENT_VERSION = process.env.CLIENT_VERSION;

function setOutput(key, value) {
  const outEnv = process.env.GITHUB_OUTPUT || '';
  if (outEnv) {
    fs.appendFileSync(outEnv, `${key}=${value}\n`);
  }
  console.log(`${key}=${value}`);
}

async function check() {
  let apiOk = false;
  let workerOk = false;

  // 检查 Worker API
  console.log('[预检查] 验证 Worker API...');
  try {
    const r = await fetch(WORKER_URL + '/api/gh/approved-orders', {
      headers: { 'X-API-Key': API_KEY },
      timeout: 10000,
    });
    const d = await r.json();
    workerOk = d.ok === true || d.error === '无效API密钥';
    console.log('[Worker] ' + (workerOk ? '✅ 可用' : '❌ 不可用: ' + JSON.stringify(d)));
  } catch (e) {
    console.log('[Worker] ❌ 连接失败: ' + e.message);
  }

  // 检查游戏 API
  console.log('[预检查] 验证游戏 API...');
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/auth/register';
    const bodyStr = '';
    const hmac = crypto.createHmac('sha256', SIGN_KEY);
    hmac.update('POST\n' + path + '\n' + timestamp + '\n' + bodyStr);
    const sign = hmac.digest('hex');

    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': CLIENT_VERSION,
        'X-Sign-T': String(timestamp),
        'X-Sign': sign,
      },
      timeout: 10000,
    });
    // 4xx/5xx 都算可达（服务在线）
    apiOk = r.status < 500;
    console.log('[Game API] ' + (apiOk ? '✅ 可达 (HTTP ' + r.status + ')' : '❌ 不可达 (HTTP ' + r.status + ')'));
  } catch (e) {
    console.log('[Game API] ❌ 连接失败: ' + e.message);
  }

  setOutput('api_ok', apiOk);
  setOutput('worker_ok', workerOk);

  if (!workerOk) {
    console.error('\n❌ Worker API 不可用，将跳过扫描');
    process.exit(1);
  }
}

check().catch(e => {
  console.error('致命错误:', e.message);
  process.exit(1);
});
