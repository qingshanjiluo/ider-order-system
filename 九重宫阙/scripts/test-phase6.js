/* 阶段6 验收测试：四级灵石换算/2%手续费/格式化/特殊灵石目录 */
const assert = require('assert');
const economy = require('../src/services/economy');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

console.log('== 四级灵石 ==');
t('品级系数 1 / 1000 / 100万 / 10亿', () => {
  assert.strictEqual(economy.TIERS.lower.factor, 1);
  assert.strictEqual(economy.TIERS.middle.factor, 1000);
  assert.strictEqual(economy.TIERS.upper.factor, 1000000);
  assert.strictEqual(economy.TIERS.extreme.factor, 1000000000);
});
t('基准↔品级换算', () => {
  assert.strictEqual(economy.tierToBase(1, 'middle'), 1000);
  assert.strictEqual(economy.baseToTier(1500, 'middle'), 1);
  assert.strictEqual(economy.tierToBase(2, 'upper'), 2000000);
  assert.strictEqual(economy.baseToTier(1.5e9, 'extreme'), 1);
});
t('万/亿/兆 显示层级', () => {
  assert.strictEqual(economy.formatBase(9500), '9500');
  assert.strictEqual(economy.formatBase(15000), '1.50万');
  assert.strictEqual(economy.formatBase(150000000), '1.50亿');
  assert.strictEqual(economy.formatBase(2e12), '2.00兆');
});

console.log('== 兑换（Q8 双向 2% 手续费）==');
t('下品→中品：1000下品 费2%=20', () => {
  const c = { spirit_stone: 2000000 };
  const r = economy.exchange(c, 'lower', 'middle', 1000); // 1000下品 → 费20 → 980下品（不足1中品，余数保留下品）
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.fee.base, 20);
  assert.strictEqual(r.received.count, 0);
  assert.strictEqual(c.spirit_stone, 2000000 - 1000 + 980);
});
t('中品→下品：1000中品=100万下品，费 2万', () => {
  const c = { spirit_stone: 2000000 };
  const r = economy.exchange(c, 'middle', 'lower', 1000);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.fee.base, 20000);
  assert.strictEqual(r.received.count, 980000);
  assert.strictEqual(c.spirit_stone, 2000000 - 1000000 + 980000);
});
t('余额不足拒绝', () => {
  const c = { spirit_stone: 500 };
  const r = economy.exchange(c, 'lower', 'middle', 1000); // 需1000下品
  assert.strictEqual(r.ok, false);
});
t('同品级拒绝', () => {
  const r = economy.exchange({ spirit_stone: 100 }, 'lower', 'lower', 1);
  assert.strictEqual(r.ok, false);
});
t('钱包面板', () => {
  const w = economy.wallet({ spirit_stone: 123456789, jade: 7 });
  assert.strictEqual(w.display, '1.23亿');
  assert.strictEqual(w.tiers.extreme.count, 0);
  assert.strictEqual(w.jade, 7);
});

console.log('== 特殊灵石目录（6 种）==');
t('目录完整性', () => {
  const names = economy.SPECIAL_STONES.map(s => s.name);
  assert.deepStrictEqual(names.sort(), ['上界灵石', '人造灵石', '五行灵石', '太极石', '造化灵石', '血石'].sort());
});
t('未实现灵石拒绝使用', () => {
  const c = { id: 1 };
  const r = economy.useSpecialStone(c, '太极石');
  assert.strictEqual(r.ok, false);
});

console.log(`\n单元测试: ${pass} 通过, ${fail} 失败`);
process.exitCode = fail > 0 ? 1 : 0;
