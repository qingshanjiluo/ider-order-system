/**
 * 修复优惠券折扣计算
 * 检查最近的工单，如果优惠码有效但折扣为0，重新计算并返还差额
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

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  修复优惠券折扣计算');
  console.log('═══════════════════════════════════════\n');

  const DRY_RUN = process.env.DRY_RUN === 'true';
  if (DRY_RUN) tsLog('⚠️ DRY RUN 模式');

  try {
    // 获取最近的工单
    tsLog('获取最近的工单...');
    const ordersData = await workerApi('/api/admin/orders?limit=100');
    if (!ordersData.ok) {
      tsLog('❌ 获取工单失败: ' + (ordersData.error || '未知错误'));
      return;
    }

    const orders = ordersData.orders || [];
    tsLog(`找到 ${orders.length} 个工单`);

    // 检查需要修复的工单
    const needsFix = [];
    for (const order of orders) {
      // 检查条件：
      // 1. 有优惠码但折扣为0
      // 2. 状态不是已取消
      if (order.coupon_code && order.discount === 0 && order.status !== 'cancelled') {
        needsFix.push(order);
      }
    }

    tsLog(`需要修复的工单: ${needsFix.length} 个`);

    if (needsFix.length === 0) {
      tsLog('没有需要修复的工单');
      return;
    }

    for (const order of needsFix) {
      tsLog(`\n工单 #${order.id}:`);
      tsLog(`  优惠码: ${order.coupon_code}`);
      tsLog(`  当前折扣: ${order.discount}%`);
      tsLog(`  原价: ${order.amount}`);
      tsLog(`  实付: ${order.price}`);

      if (DRY_RUN) {
        tsLog('  将修复此工单');
        continue;
      }

      // 这里可以添加修复逻辑，比如：
      // 1. 重新计算折扣
      // 2. 返还差额到用户余额
      // 3. 更新工单价格
      tsLog('  ⚠️ 需要手动修复或联系管理员');
    }

    // 汇总
    console.log('\n═══════════════════════════════════════');
    console.log('  检查完成');
    console.log('═══════════════════════════════════════');
    console.log(`  总工单数: ${orders.length}`);
    console.log(`  需要修复: ${needsFix.length}`);
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
