/**
 * 批量清理不活跃账号
 * 自动标记并确认删除不活跃账号
 */
const WORKER_URL = process.env.WORKER_URL || 'https://ider-order-system.sifangzhiji.workers.dev';
const API_KEY = process.env.API_KEY || 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';

async function workerApi(path, method = 'GET', body = null) {
  const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
  const url = WORKER_URL.replace(/\/+$/, '') + path;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  return r.json();
}

function tsLog(msg) {
  const now = new Date();
  const t = now.toLocaleString('zh-CN', { hour12: false });
  console.log(`[${t}] ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  批量清理不活跃账号');
  console.log('═══════════════════════════════════════\n');

  const DAYS = parseInt(process.env.DAYS || '3', 10);
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '200', 10);
  const DRY_RUN = process.env.DRY_RUN === 'true';
  const LIMIT = parseInt(process.env.LIMIT || '99999', 10);

  if (DRY_RUN) tsLog('⚠️ DRY RUN 模式');

  try {
    // 1. 获取总数
    tsLog(`查询超过 ${DAYS} 天的不活跃账号...`);
    const countData = await workerApi(`/api/gh/inactive-accounts?days=${DAYS}&count_only=true`);
    const total = Math.min(countData.count || 0, LIMIT);
    tsLog(`找到 ${total} 个不活跃账号`);

    if (total === 0) {
      tsLog('没有需要清理的账号');
      return;
    }

    // 2. 分批获取并标记
    const batches = Math.ceil(total / BATCH_SIZE);
    let markedTotal = 0;
    let deletedTotal = 0;

    for (let batch = 0; batch < batches; batch++) {
      const offset = batch * BATCH_SIZE;
      tsLog(`\n处理第 ${batch + 1}/${batches} 批 (offset: ${offset})...`);

      // 获取一批不活跃账号
      const data = await workerApi(`/api/gh/inactive-accounts?days=${DAYS}&limit=${BATCH_SIZE}`);
      const accounts = data.accounts || [];

      if (accounts.length === 0) {
        tsLog('  没有更多账号');
        break;
      }

      const accountIds = accounts.map(a => a.id);
      tsLog(`  获取到 ${accounts.length} 个账号`);

      if (DRY_RUN) {
        tsLog(`  将标记: ${accounts.slice(0, 5).map(a => a.username).join(', ')}...`);
        markedTotal += accounts.length;
        continue;
      }

      // 标记为待删除
      try {
        const markResult = await workerApi('/api/gh/mark-for-deletion', 'POST', {
          account_ids: accountIds,
        });
        if (markResult.ok) {
          tsLog(`  ✅ 已标记 ${markResult.updated} 个账号`);
          markedTotal += markResult.updated;
        } else {
          tsLog(`  ❌ 标记失败: ${markResult.error}`);
        }
      } catch (e) {
        tsLog(`  ❌ 标记异常: ${e.message}`);
      }

      await sleep(500);
    }

    // 3. 确认删除所有待删除账号
    if (!DRY_RUN && markedTotal > 0) {
      tsLog('\n开始确认删除待删除账号...');

      const pendingData = await workerApi('/api/gh/pending-deletion');
      const pending = pendingData.accounts || [];
      tsLog(`待删除账号: ${pending.length} 个`);

      const deleteBatches = Math.ceil(pending.length / BATCH_SIZE);

      for (let batch = 0; batch < deleteBatches; batch++) {
        const start = batch * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, pending.length);
        const batchIds = pending.slice(start, end).map(a => a.id);

        tsLog(`  确认删除第 ${batch + 1}/${deleteBatches} 批 (${batchIds.length} 个)...`);

        try {
          const deleteResult = await workerApi('/api/gh/confirm-deletion', 'POST', {
            account_ids: batchIds,
          });
          if (deleteResult.ok) {
            tsLog(`  ✅ 已删除 ${deleteResult.deleted} 个`);
            deletedTotal += deleteResult.deleted;
          } else {
            tsLog(`  ❌ 删除失败: ${deleteResult.error}`);
          }
        } catch (e) {
          tsLog(`  ❌ 删除异常: ${e.message}`);
        }

        await sleep(500);
      }
    }

    // 汇总
    console.log('\n═══════════════════════════════════════');
    console.log('  清理完成');
    console.log('═══════════════════════════════════════');
    console.log(`  不活跃账号总数: ${total}`);
    console.log(`  已标记待删除: ${markedTotal}`);
    console.log(`  已确认删除: ${deletedTotal}`);
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
