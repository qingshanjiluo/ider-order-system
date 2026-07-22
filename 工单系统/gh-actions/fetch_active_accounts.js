/**
 * 从 Worker API 获取活跃账号列表
 * 输出格式: username,password (每行一个)
 * 用于 auto-levelup 工作流动态获取账号
 */
const fs = require('fs');

const WORKER_URL = process.env.WORKER_URL || 'https://ider-order-system.sifangzhiji.workers.dev';
const API_KEY = process.env.API_KEY || 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';

// 需要升级的账号状态：farming（挂机中）和 active（活跃）
// 排除：completed（已完成120级）、error/failed（异常）、registering（注册中）
const UPGRADEABLE_STATUSES = ['farming', 'active'];

async function fetchAccounts() {
  console.log(`[配置] Worker API: ${WORKER_URL}`);
  
  try {
    const url = `${WORKER_URL}/api/gh/active-accounts`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    if (!response.ok) {
      throw new Error(`Worker API 返回 ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Worker API 请求失败');
    }

    const accounts = data.accounts || [];
    console.log(`✅ 获取到 ${accounts.length} 个活跃账号`);

    // 过滤可升级的账号
    const upgradeable = accounts.filter(acc => {
      const status = (acc.status || '').toLowerCase();
      return UPGRADEABLE_STATUSES.includes(status);
    });

    console.log(`📋 其中 ${upgradeable.length} 个账号需要升级`);

    if (upgradeable.length === 0) {
      console.log('⚠️ 没有需要升级的账号');
      return [];
    }

    // 按等级排序（低等级优先升级）
    upgradeable.sort((a, b) => (a.level || 0) - (b.level || 0));

    return upgradeable;
  } catch (e) {
    console.error(`❌ 获取账号失败: ${e.message}`);
    return [];
  }
}

function writeAccountsFile(accounts, filepath) {
  if (accounts.length === 0) {
    console.log('⚠️ 无账号可写入');
    return;
  }

  const lines = accounts.map(acc => `${acc.username},${acc.password}`);
  fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf-8');
  console.log(`✅ 已写入 ${accounts.length} 个账号到 ${filepath}`);
  
  // 输出统计信息
  const levelCounts = {};
  for (const acc of accounts) {
    const level = acc.level || 0;
    const range = level < 50 ? '1-49' : level < 100 ? '50-99' : level < 120 ? '100-119' : '120+';
    levelCounts[range] = (levelCounts[range] || 0) + 1;
  }
  console.log('📊 等级分布:');
  for (const [range, count] of Object.entries(levelCounts)) {
    console.log(`   ${range}: ${count} 个账号`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🔄 获取活跃账号列表               ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  const accounts = await fetchAccounts();
  
  const filepath = process.env.OUTPUT_FILE || './alchemy_accounts.txt';
  writeAccountsFile(accounts, filepath);

  // 输出 JSON 摘要
  const summary = {
    timestamp: new Date().toISOString(),
    total: accounts.length,
    levels: accounts.map(a => a.level || 0),
  };
  console.log('');
  console.log('[SUMMARY] ' + JSON.stringify(summary));
}

main().catch(e => {
  console.error('异常:', e.message);
  process.exit(1);
});
