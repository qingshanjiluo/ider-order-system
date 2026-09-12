/**
 * 超额账号清理（自动化）
 *
 * 背景：历史 bug 让扫描器以为"已有 0 个账号"，对每张已批准工单每轮新建 50 个，
 * 造成 #193 订购 50 → 4924 个账号、#262 → 3693、#292 → 2243、#293 → 383。
 * 这些多余账号会被健康检测/自动升级反复遍历，也是 D1 每日读额度被烧光的主因
 * （report-account 每次都要 COUNT 该工单的账号数，账号越多读得越多）。
 *
 * 本脚本调用 /api/gh/cleanup-excess（API Key 鉴权）：
 *   - 每张超额工单只保留 quantity + 1 个（健康、等级高者优先保留）；
 *   - 其余软清理（status=completed / health_status=cleaned / stop_monitor_at=now），
 *     软清理后不再进入自动升级与健康检测的遍历范围；
 *   - 不指定 ORDER_ID 时循环处理所有超额工单，直到 has_more = false。
 *
 * 用法:
 *   node gh-actions/cleanup_excess.js                 # 清理全部超额工单
 *   ORDER_ID=193 node gh-actions/cleanup_excess.js    # 只清理指定工单
 */
const WORKER_URL = process.env.ORDER_API_URL || 'https://ider-order-system.pages.dev';
const API_KEY = process.env.API_KEY || 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a';
const ORDER_ID = process.env.ORDER_ID || '';
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || '60', 10);
const RETRY_PER_CALL = parseInt(process.env.RETRY_PER_CALL || '4', 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || '60000', 10);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ts(msg) { console.log('[' + new Date().toISOString() + '] ' + msg); }

async function cleanupOnce() {
  const r = await fetch(WORKER_URL.replace(/\/+$/, '') + '/api/gh/cleanup-excess', {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(ORDER_ID ? { order_id: parseInt(ORDER_ID) } : {}),
    signal: AbortSignal.timeout(120000),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('非JSON响应(' + r.status + '): ' + text.slice(0, 150));
  }
  if (!r.ok || data.ok === false) {
    throw new Error('请求失败(' + r.status + '): ' + (data.error || text.slice(0, 150)));
  }
  return data;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  工单超额账号清理');
  console.log('  WORKER_URL: ' + WORKER_URL);
  console.log('  清理目标  : ' + (ORDER_ID ? ('工单 #' + ORDER_ID) : '全部超额工单'));
  console.log('═══════════════════════════════════════');

  let total = 0;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let data = null;
    for (let attempt = 1; attempt <= RETRY_PER_CALL; attempt++) {
      try {
        data = await cleanupOnce();
        break;
      } catch (e) {
        const quota = /exceeded|D1_ERROR/i.test(e.message);
        ts('第 ' + round + ' 轮第 ' + attempt + ' 次失败' + (quota ? '（D1 读额度受限）' : '') + ': ' + e.message.slice(0, 160));
        if (attempt === RETRY_PER_CALL) throw e;
        await sleep(RETRY_DELAY_MS);
      }
    }

    total += data.cleaned || 0;
    const detail = (data.orders || []).map(o => '#' + o.order_id + ' 保留' + o.kept + '/清理' + o.cleaned).join(' , ');
    ts('第 ' + round + ' 轮: ' + (data.message || '') + (detail ? ' | ' + detail : ''));

    // 指定单张工单时，一次调用即清完该单全部超额
    if (ORDER_ID) break;
    if (!data.has_more) break;
    // 有剩余但本轮一个都没清掉 → 停止，避免无限空转
    if (!data.cleaned) { ts('仍有剩余但本轮未清理任何账号，停止（可稍后重跑）'); break; }
  }

  console.log('\n累计清理 ' + total + ' 个超额账号');
  console.log('═══════════════════════════════════════');
}

main().catch(e => {
  ts('❌ 清理失败: ' + e.message);
  process.exit(1);
});
