/**
 * E1 写安全 · 互斥锁正确性测试（npm test 套件之一）
 * 证明：同角色临界区不交错、无丢失更新、异常不堵队列、跨角色不死锁。
 */
const assert = require('assert');
const { withCharacterLock, withCharacterLocks, queueDepth, hasPendingLocks } = require('../src/middleware/charLock');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};
const tick = (n = 1) => new Promise(r => setTimeout(r, n));

(async () => {
  console.log('== E1 写安全：角色互斥锁 ==');

  await t('同角色 50 并发读-改-写无丢失更新', async () => {
    const st = { balance: 0 };
    await Promise.all(Array.from({ length: 50 }, () =>
      withCharacterLock(1001, async () => { const v = st.balance; await tick(1); st.balance = v + 1; })
    ));
    assert.strictEqual(st.balance, 50, `丢失更新：${st.balance}/50`);
  });

  await t('临界区严格不交错（同角色）', async () => {
    let inside = 0, maxInside = 0;
    await Promise.all(Array.from({ length: 20 }, () =>
      withCharacterLock(2002, async () => { inside++; maxInside = Math.max(maxInside, inside); await tick(1); inside--; })
    ));
    assert.strictEqual(maxInside, 1, `最大并发进入 ${maxInside}，应恒为 1`);
  });

  await t('不同角色并行（不被全局串行化）', async () => {
    let active = 0, maxActive = 0;
    await Promise.all([1, 2, 3, 4].map((id) =>
      withCharacterLock(id, async () => { active++; maxActive = Math.max(maxActive, active); await tick(8); active--; })
    ));
    assert.ok(maxActive >= 3, `不同角色未并行，峰值并发 ${maxActive}`);
  });

  await t('任务抛错不堵后续队列', async () => {
    const st = { v: 0 };
    const bad = withCharacterLock(3003, () => { throw new Error('boom'); });
    await assert.rejects(bad, /boom/, '异常应回传给调用方');
    await withCharacterLock(3003, () => { st.v = 42; });
    assert.strictEqual(st.v, 42, '异常后队列被卡死');
  });

  await t('队列释放后 depth 归零、无泄漏', async () => {
    await withCharacterLock(4004, () => tick(2));
    await tick(5);
    assert.strictEqual(queueDepth(4004), 0, '锁链未回收');
    assert.strictEqual(hasPendingLocks(), false, '存在未回收的锁条目');
  });

  await t('跨角色锁按序获取，AB/BA 不死锁', async () => {
    const accounts = { 1: 100, 2: 100 };
    const transfer = (from, to, amt) => withCharacterLocks([from, to], () => { accounts[from] -= amt; accounts[to] += amt; });
    await Promise.all([transfer(1, 2, 10), transfer(2, 1, 5), transfer(1, 2, 7), transfer(2, 1, 3)]);
    assert.strictEqual(accounts[1] + accounts[2], 200, '总额不守恒');
    assert.strictEqual(accounts[1], 100 - 10 + 5 - 7 + 3, `结果异常：${accounts[1]}`);
  });

  await t('去重：同一角色重复出现在多锁列表中不死锁', async () => {
    let ran = false;
    await withCharacterLocks([7, 7, 7], () => { ran = true; });
    assert.ok(ran);
  });

  console.log(`\nE1 锁测试: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
