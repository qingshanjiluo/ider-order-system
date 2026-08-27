/**
 * 邀请积分账号清理脚本 v2
 * 功能：
 * 1. 查询超过7天的邀请积分账号
 * 2. 标记为待删除状态
 * 3. 通过游戏API请求删档确认
 * 4. 防止服务器压力过大
 */
const crypto = require('crypto');

const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';
const WORKER_URL = process.env.WORKER_URL || 'https://ider-order-system.sifangzhiji.workers.dev';
const API_KEY = process.env.API_KEY || 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';

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

  const r = await fetch(API_BASE + path, {
    method,
    headers,
    body: bodyStr || undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('非JSON(' + r.status + '): ' + text.slice(0, 200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败(' + r.status + ')');
  return data;
}

async function workerApi(path, method = 'GET', body = null) {
  const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
  const url = WORKER_URL.replace(/\/+$/, '') + path;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  return r.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function tsLog(msg) {
  const now = new Date();
  const t = now.toLocaleString('zh-CN', { hour12: false });
  console.log(`[${t}] ${msg}`);
}

// 登录获取token
async function login(username, password) {
  const machineId = 'cleanup_' + Date.now();
  const loginData = await apiRequest('POST', '/auth/login', '', {
    username, password, machine_id: machineId,
  });
  return loginData.token;
}

// 通过游戏API请求删档确认
async function requestGameAccountDeletion(token, username) {
  try {
    // 调用游戏删档API: POST /player/wipe
    // 需要 confirm_text: "确认删档"
    const result = await apiRequest('POST', '/player/wipe', token, {
      confirm_text: '确认删档',
    });
    tsLog('[' + username + '] ✅ 游戏内已执行删档操作');
    return { success: true, source: 'game_api' };
  } catch (e) {
    tsLog('[' + username + '] ⚠️ 游戏API删档失败: ' + e.message);
    return { success: false, source: 'game_api', error: e.message };
  }
}

// 主函数
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  邀请积分账号清理工具 v2');
  console.log('  时间: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════\n');

  const DAYS_THRESHOLD = parseInt(process.env.DAYS_THRESHOLD || '7', 10);
  const DRY_RUN = process.env.DRY_RUN === 'true';

  tsLog(`查询超过 ${DAYS_THRESHOLD} 天的账号...`);
  if (DRY_RUN) tsLog('⚠️ DRY RUN 模式 - 不会实际执行操作');

  try {
    // 1. 获取旧账号列表
    const oldAccountsData = await workerApi(`/api/gh/old-accounts?days=${DAYS_THRESHOLD}&limit=200`);
    if (!oldAccountsData.ok) {
      tsLog('❌ 获取旧账号失败: ' + (oldAccountsData.error || '未知错误'));
      return;
    }

    const oldAccounts = oldAccountsData.accounts || [];
    tsLog(`找到 ${oldAccounts.length} 个超过 ${DAYS_THRESHOLD} 天的账号`);

    if (oldAccounts.length === 0) {
      tsLog('没有需要清理的旧账号');
      return;
    }

    // 2. 按状态分组统计
    const statusGroups = {};
    for (const acc of oldAccounts) {
      const status = acc.status || 'unknown';
      statusGroups[status] = (statusGroups[status] || 0) + 1;
    }
    tsLog('账号状态分布:');
    for (const [status, count] of Object.entries(statusGroups)) {
      tsLog(`  ${status}: ${count} 个`);
    }

    // 3. 筛选需要处理的账号（排除已完成和失败的）
    const processable = oldAccounts.filter(acc => 
      !['completed', 'failed', 'deleted', 'pending_deletion'].includes(acc.status)
    );
    tsLog(`可处理账号: ${processable.length} 个`);

    if (processable.length === 0) {
      tsLog('没有需要处理的账号');
      return;
    }

    if (DRY_RUN) {
      tsLog('\n将处理以下账号:');
      for (const acc of processable.slice(0, 10)) {
        tsLog(`  - ${acc.username} (创建于 ${acc.created_at}, 状态: ${acc.status})`);
      }
      if (processable.length > 10) {
        tsLog(`  ... 还有 ${processable.length - 10} 个账号`);
      }
      return;
    }

    // 4. 标记账号为待删除
    tsLog('\n正在标记账号为待删除状态...');
    const accountIds = processable.map(acc => acc.id);
    const markResult = await workerApi('/api/gh/mark-for-deletion', 'POST', {
      account_ids: accountIds,
    });

    if (markResult.ok) {
      tsLog(`✅ 已标记 ${markResult.updated} 个账号为待删除`);
    } else {
      tsLog('❌ 标记失败: ' + (markResult.error || '未知错误'));
      return;
    }

    // 5. 尝试通过游戏API请求删档确认
    tsLog('\n正在尝试通过游戏API请求删档确认...');
    let gameApiSuccess = 0;
    let gameApiFailed = 0;

    for (const acc of processable.slice(0, 10)) { // 限制处理数量避免过载
      if (!acc.username || !acc.password) {
        tsLog(`⚠️ 账号 ${acc.id} 缺少凭据，跳过`);
        continue;
      }

      try {
        const token = await login(acc.username, acc.password);
        const result = await requestGameAccountDeletion(token, acc.username);
        if (result.success) {
          gameApiSuccess++;
        } else {
          gameApiFailed++;
        }
        await sleep(1000);
      } catch (e) {
        tsLog(`❌ ${acc.username} 登录失败: ${e.message}`);
        gameApiFailed++;
      }
    }

    // 6. 汇总
    console.log('\n═══════════════════════════════════════');
    console.log('  清理完成');
    console.log('═══════════════════════════════════════');
    console.log(`  总计旧账号: ${oldAccounts.length} 个`);
    console.log(`  可处理账号: ${processable.length} 个`);
    console.log(`  已标记待删除: ${markResult.updated || 0} 个`);
    console.log(`  游戏API请求成功: ${gameApiSuccess} 个`);
    console.log(`  游戏API请求失败: ${gameApiFailed} 个`);
    console.log('═══════════════════════════════════════');
    console.log('\n后续步骤:');
    console.log('1. 在工单系统管理后台确认删除');
    console.log('2. 或通过游戏设置页面手动确认删档');
    console.log('═══════════════════════════════════════');

  } catch (e) {
    tsLog('❌ 致命错误: ' + e.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(e => {
    console.error('错误:', e.message);
    process.exit(1);
  });
}

module.exports = { main, requestGameAccountDeletion, login };
