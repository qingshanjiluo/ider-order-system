/**
 * 确认删除旧账号脚本
 * 用于在管理后台确认删除待删除的账号
 */
const WORKER_URL = process.env.WORKER_URL || 'https://ider-order-system.sifangzhiji.workers.dev';
const API_KEY = process.env.API_KEY || 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';

async function workerApi(path, method = 'GET', body = null) {
  const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
  const url = WORKER_URL.replace(/\/+$/, '') + path;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  return r.json();
}

function tsLog(msg) {
  const now = new Date();
  const t = now.toLocaleString('zh-CN', { hour12: false });
  console.log(`[${t}] ${msg}`);
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  确认删除旧账号工具');
  console.log('═══════════════════════════════════════\n');

  const DRY_RUN = process.env.DRY_RUN === 'true';
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);

  if (DRY_RUN) tsLog('⚠️ DRY RUN 模式 - 不会实际执行删除');

  try {
    // 获取待删除账号
    tsLog('获取待删除账号列表...');
    const pendingData = await workerApi('/api/gh/pending-deletion');
    if (!pendingData.ok) {
      tsLog('❌ 获取待删除账号失败: ' + (pendingData.error || '未知错误'));
      return;
    }

    const pendingAccounts = pendingData.accounts || [];
    tsLog(`找到 ${pendingAccounts.length} 个待删除账号`);

    if (pendingAccounts.length === 0) {
      tsLog('没有待删除的账号');
      return;
    }

    // 分批处理
    const batches = [];
    for (let i = 0; i < pendingAccounts.length; i += BATCH_SIZE) {
      batches.push(pendingAccounts.slice(i, i + BATCH_SIZE));
    }

    tsLog(`将分 ${batches.length} 批处理，每批 ${BATCH_SIZE} 个`);

    let totalDeleted = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      tsLog(`\n处理第 ${batchIdx + 1} 批 (${batch.length} 个)...`);

      const accountIds = batch.map(acc => acc.id);

      if (DRY_RUN) {
        tsLog(`  将删除: ${batch.map(a => a.username).join(', ')}`);
        totalDeleted += batch.length;
        continue;
      }

      try {
        const result = await workerApi('/api/gh/confirm-deletion', 'POST', {
          account_ids: accountIds,
        });

        if (result.ok) {
          tsLog(`  ✅ 已确认删除 ${result.deleted} 个账号`);
          totalDeleted += result.deleted;
        } else {
          tsLog(`  ❌ 删除失败: ${result.error || '未知错误'}`);
        }
      } catch (e) {
        tsLog(`  ❌ 批次处理失败: ${e.message}`);
      }

      // 批次间延迟
      if (batchIdx < batches.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // 汇总
    console.log('\n═══════════════════════════════════════');
    console.log('  删除完成');
    console.log('═══════════════════════════════════════');
    console.log(`  总计待删除: ${pendingAccounts.length} 个`);
    console.log(`  已确认删除: ${totalDeleted} 个`);
    console.log('═══════════════════════════════════════');

  } catch (e) {
    tsLog('❌ 致命错误: ' + e.message);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});
