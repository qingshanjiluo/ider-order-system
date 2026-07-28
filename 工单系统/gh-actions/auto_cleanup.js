// gh-actions/auto_cleanup.js
// 自动清理脚本：120级满3天后删号（游戏服 + 数据库）
const crypto = require('crypto');
const antiDetect = require('./_anti_detect');

const WORKER_URL = 'https://ider-order-system.sifangzhiji.workers.dev';
const API_KEY = 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';
const API_BASE = process.env.API_BASE || 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = process.env.CLIENT_VERSION || '1.2.4';
const SIGN_KEY = process.env.SIGN_KEY || 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';

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
  Object.assign(headers, antiDetect.buildAntiDetectHeaders(_apiIdx++));
  const r = await fetch(API_BASE + path, { method, headers, body: bodyStr || undefined, signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  try { return JSON.parse(text); } catch (e) { return { ok: false, error: text.slice(0, 100) }; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function tsLog(msg) {
  const t = new Date().toLocaleString('zh-CN', { hour12: false });
  console.log(`[${t}] ${msg}`);
}

async function workerApi(path, method, body) {
  const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
  const url = WORKER_URL.replace(/\/+$/, '') + path;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  return r.json();
}

// 尝试在游戏服删除账号角色（需打开设置输入删档确认）
async function tryDeleteGameAccount(server_username, server_password) {
  if (!server_username || !server_password) return false;
  try {
    // 1. 先登录获取 token
    const loginData = await apiRequest('POST', '/auth/login', '', { username: server_username, password: server_password, machine_id: antiDetect.randomMachineId() });
    if (!loginData.ok || !loginData.token) return false;
    const token = loginData.token;

    // 2. 尝试删号端点，需传入确认文本"删档"
    const deleteEndpoints = [
      { method: 'POST', path: '/player/delete', body: { confirm: '删档' } },
      { method: 'POST', path: '/player/delete_account', body: { confirm: '删档' } },
      { method: 'POST', path: '/player/delete', body: { code: '删档' } },
      { method: 'POST', path: '/player/confirm_delete', body: { code: '删档' } },
      { method: 'POST', path: '/player/unregister', body: { reason: '删档' } },
      { method: 'POST', path: '/auth/unregister', body: { confirm: '删档' } },
      { method: 'POST', path: '/player/reset', body: {} },
      { method: 'DELETE', path: '/player/character', body: null },
    ];
    for (const ep of deleteEndpoints) {
      try {
        const res = await apiRequest(ep.method, ep.path, token, ep.body);
        if (res && (res.ok === true || res.code === 0 || String(res.message || '').includes('成功') || String(res.message || '').includes('删除'))) {
          return true;
        }
      } catch (e) { /* try next */ }
      await sleep(300);
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  艾德尔工单系统 - 账号自动清理');
  console.log('  时间: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════');

  // 获取所有已完成（到120级）且超过3天的账号
  tsLog('查询可清理的账号...');
  const data = await workerApi('/api/gh/all-accounts');
  if (!data.ok || !data.accounts) { tsLog('查询失败'); return; }

  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  let candidates = data.accounts.filter(a => {
    if (a.status !== 'completed' && a.status !== 'farming') return false;
    if (!a.reached_120_at && a.level < 120) return false;
    const reachedTime = a.reached_120_at ? new Date(a.reached_120_at).getTime() : 0;
    if (reachedTime && (now - reachedTime) < THREE_DAYS) return false;
    // 有 stop_monitor_at 的也要超过3天
    if (a.stop_monitor_at && (now - new Date(a.stop_monitor_at).getTime()) < THREE_DAYS) return false;
    return true;
  });

  tsLog('找到 ' + candidates.length + ' 个待清理账号');

  let cleaned = 0;
  for (let i = 0; i < candidates.length; i++) {
    const acc = candidates[i];
    const name = acc.server_username || acc.username || '?';
    console.log(`──── [${i+1}/${candidates.length}] ${name} ────`);

    // 尝试从游戏服删除
    let gameDeleted = false;
    if (acc.server_username && acc.server_password) {
      gameDeleted = await tryDeleteGameAccount(acc.server_username, acc.server_password);
      tsLog('游戏服删除: ' + (gameDeleted ? '✅' : '⚠️ 跳过（无删除端点或已不存在）'));
    }

    // 从数据库标记删除
    await workerApi('/api/gh/report-account', 'POST', {
      order_id: acc.order_id,
      username: acc.username,
      status: 'completed',
      level: acc.level || 0,
    });

    // 直接标记为已清理
    try {
      await workerApi('/api/gh/report-account', 'POST', {
        order_id: acc.order_id,
        username: acc.username,
        status: 'completed',
        level: acc.level || 120,
        character_name: acc.character_name || '',
        server_username: acc.server_username || '',
        setup_status: 'cleaned',
      });
      // 额外删掉数据库记录（可选）
    } catch (e) { /* ignore */ }

    tsLog('已清理: ' + name + (gameDeleted ? ' (游戏服已删)' : ' (标记完成)'));
    cleaned++;
    await antiDetect.smartPause(i, 5, 3);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  清理完成: ' + cleaned + ' 个账号');
  console.log('═══════════════════════════════════════');
}

main().catch(e => {
  tsLog('❌ 错误: ' + e.message);
  process.exit(1);
});
