/**
 * 艾德尔工单系统 - 每日日常维护
 * 遍历所有 farming 账号：
 *   1. 仙盟相关：搜索/加入仙盟 → 灵池沐浴 → 仙园采摘 → 悟道树冥想
 *   2. 洞府采集：检查洞府状态 → 开启采集
 *   3. 每日试炼：根据配置跑试炼副本
 */
const crypto = require('crypto');
const antiDetect = require('./_anti_detect');

const WORKER_URL = 'https://ider-order-system.sifangzhiji.workers.dev';
const API_KEY = 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';
const API_BASE = process.env.API_BASE || 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = process.env.CLIENT_VERSION || '1.2.4';
const SIGN_KEY = process.env.SIGN_KEY || 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';
const ALLIANCE_NAME = process.env.ALLIANCE_NAME || '天地一家大爱盟';
const CAVE_TYPE = process.env.CAVE_TYPE || 'field';

const REQUIRED_ENV = { WORKER_URL, API_KEY, API_BASE, SIGN_KEY };
for (const [name, val] of Object.entries(REQUIRED_ENV)) {
  if (!val) { console.error('错误: 环境变量 ' + name + ' 未设置'); process.exit(1); }
}

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
  const r = await fetch(API_BASE + path, { method, headers, body: bodyStr || undefined, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败(' + r.status + ')');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function workerApi(path, method, body) {
  const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
  const url = WORKER_URL.replace(/\/+$/, '') + path;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  return r.json();
}

async function doAllianceDaily(username, token) {
  const done = [];

  // 获取角色状态，检查仙盟
  const stateData = await apiRequest('GET', '/player/state', token);
  const player = stateData.player || {};
  let allianceId = player.alliance_id || 0;

  // 未加入仙盟则搜索并申请
  if (!allianceId) {
    console.log('  [' + username + '] 未加入仙盟，搜索「' + ALLIANCE_NAME + '」...');
    try {
      const listData = await apiRequest('GET', '/alliance/list', token);
      const alliances = listData.alliances || [];
      const target = alliances.find(a => a.name === ALLIANCE_NAME && a.member_limit > (a.member_count || 0));
      const fallback = target || alliances.find(a => a.member_limit > (a.member_count || 0));
      if (fallback) {
        await apiRequest('POST', '/alliance/apply', token, { alliance_id: fallback.id });
        console.log('  [' + username + '] 已申请加入: ' + fallback.name);
        done.push('apply_alliance');
        await sleep(2000);
        const st2 = await apiRequest('GET', '/player/state', token);
        allianceId = st2.player?.alliance_id || 0;
        if (allianceId) console.log('  [' + username + '] ✅ 已加入仙盟 ID=' + allianceId);
      } else {
        console.log('  [' + username + '] 未找到可加入的仙盟');
      }
    } catch (e) {
      console.log('  [' + username + '] 仙盟申请失败: ' + e.message);
    }
  } else {
    console.log('  [' + username + '] 已加入仙盟 ID=' + allianceId);
  }

  // 仙盟日常操作
  if (allianceId) {
    try {
      await apiRequest('POST', '/alliance/spirit_pool/bathe', token, { alliance_id: allianceId });
      console.log('  [' + username + '] ✅ 灵池沐浴');
      done.push('bathe');
    } catch (e) { console.log('  [' + username + '] 沐浴跳过: ' + e.message); }
    await sleep(1500);

    try {
      await apiRequest('POST', '/alliance/garden/pick', token, { alliance_id: allianceId });
      console.log('  [' + username + '] ✅ 仙园采摘');
      done.push('garden_pick');
    } catch (e) { console.log('  [' + username + '] 采摘跳过: ' + e.message); }
    await sleep(1500);

    try {
      await apiRequest('POST', '/alliance/enlightenment_tree/meditate', token, { alliance_id: allianceId });
      console.log('  [' + username + '] ✅ 悟道树冥想');
      done.push('meditate');
    } catch (e) { console.log('  [' + username + '] 悟道跳过: ' + e.message); }
    await sleep(1000);
  }

  return done;
}

async function doCaveGathering(username, token) {
  try {
    const caveStatus = await apiRequest('GET', '/online/cave/status', token);
    if (caveStatus.gathering) {
      console.log('  [' + username + '] ✅ 已在采集中');
      return ['already_gathering'];
    }
    if ((caveStatus.rare_remaining || 0) <= 0) {
      console.log('  [' + username + '] 灵气枯竭，无法采集');
      return ['no_rare'];
    }
    await apiRequest('POST', '/online/cave/start', token, { type: CAVE_TYPE });
    console.log('  [' + username + '] ✅ 开启采集 type=' + CAVE_TYPE);
    return ['start_gather'];
  } catch (e) {
    console.log('  [' + username + '] 洞府采集跳过: ' + e.message);
    return [];
  }
}

async function maintainAccount(account, idx) {
  setApiIdx(idx * 10);

  const { server_username, server_password, order_id, username } = account;
  if (!server_username || !server_password) {
    console.log('  [' + (username || '?') + '] ⏭️ 无账号密码，跳过');
    return { ok: false, skipped: true };
  }

  console.log('  [' + server_username + '] 开始日常维护...');

  try {
    await antiDetect.randomDelay(2000);

    const machineId = 'daily_' + idx + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const loginData = await apiRequest('POST', '/auth/login', '', {
      username: server_username, password: server_password, machine_id: machineId,
    });
    const token = loginData.token;
    console.log('  [' + server_username + '] ✅ 登录成功');
    await antiDetect.randomDelay(1500);

    // 仙盟日常
    const allianceDone = await doAllianceDaily(server_username, token);
    await antiDetect.randomDelay(2000);

    // 洞府采集
    const caveDone = await doCaveGathering(server_username, token);

    const allDone = [...allianceDone, ...caveDone];

    await workerApi('/api/gh/report-health', 'POST', {
      order_id, username,
      status: 'farming',
      level: account.level || 0,
      map_id: account.map_id || 0,
      map_name: account.map_name || '',
      error_msg: '日常: ' + (allDone.join(', ') || '无操作'),
    });

    console.log('  [' + server_username + '] ✅ 完成 ' + allDone.length + ' 项: ' + allDone.join(', '));
    return { ok: true, done: allDone };
  } catch (e) {
    console.log('  [' + (server_username || '?') + '] ❌ 失败: ' + e.message);
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  艾德尔工单系统 - 每日日常维护');
  console.log('  时间: ' + new Date().toISOString());
  console.log('  仙盟: ' + ALLIANCE_NAME + ' | 采集: ' + (CAVE_TYPE === 'field' ? '灵田' : '灵矿'));
  console.log('═══════════════════════════════════════');

  console.log('\n[扫描] 获取 farming 账号列表...');
  const data = await workerApi('/api/gh/active-accounts');
  if (!data.ok || !data.accounts || !data.accounts.length) {
    console.log('[结果] 没有活跃账号');
    return;
  }

  const accounts = data.accounts;
  console.log('[结果] 找到 ' + accounts.length + ' 个活跃账号\n');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    console.log('──── [' + (i + 1) + '/' + accounts.length + '] ' + (account.server_username || account.username) + ' ────');

    const result = await maintainAccount(account, i);
    if (result.ok && !result.skipped) success++;
    if (!result.ok) failed++;

    await antiDetect.smartPause(i, 5, 20);
    await antiDetect.randomDelay(3000);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  日常维护完成 ✓');
  console.log('  总计: ' + accounts.length + ' | 成功: ' + success + ' | 失败: ' + failed);
  console.log('═══════════════════════════════════════');
}

main().catch(e => {
  console.error('\n❌ 致命错误:', e.message);
  process.exit(1);
});
