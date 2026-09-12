/**
 * E3 · 战斗掉落回归测试（关键：掉落必须真的进背包，且有保底）
 * 背景缺陷：calculateRewards 返回的 rewards.items 在全仓无人消费 —— 战斗掉落是纯装饰；
 * 同时装备品质写死"凡器"（不在合法品质集合内），且 10% 独立掷骰可无限空手。
 */
const assert = require('assert');
const B = require('../src/config/balance');

const m = require('../src/services/battle/combat');
const svc = typeof m === 'function' ? new m() : m;
if (!svc || typeof svc.calculateRewards !== 'function') {
  console.log('  ❌ combat 导出形状未知，无法测 calculateRewards');
  process.exit(1);
}

const realRandom = Math.random;
const seq = (vals) => { let i = 0; Math.random = () => vals[i++ % vals.length]; };
const restore = () => { Math.random = realRandom; };

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { restore(); console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

function mkdb() {
  return { characters: [{ id: 1, realm: '金丹', loot_dry_streak: 0 }], items: [], inventory: [] };
}
const ATK = { id: 1, level: 50 };
const win = (db, defLevel) => svc.calculateRewards('attacker', ATK, { level: defLevel }, db);

console.log('== E3 · 战斗掉落（入包 + 保底 + 品质分档）==');

t('未达保底且掷骰未中：不得产生背包行', () => {
  const db = mkdb();
  for (let i = 0; i < 4; i++) { seq([0.99, 0.99]); win(db, 30); restore(); }
  assert.strictEqual(db.characters[0].loot_dry_streak, 4, '空手计数应为 4');
  assert.strictEqual(db.inventory.length, 0, '未到保底却发了装备');
  assert.strictEqual(db.items.length, 0, '未到保底却造了物品');
});

t('第 5 次空手仍不出；到保底阈值那次必出且真的入包', () => {
  const db = mkdb();
  const ch = db.characters[0];
  for (let i = 0; i < B.LOOT_PITY.dryStreakToGuarantee; i++) { seq([0.99, 0.99]); win(db, 30); restore(); }
  assert.strictEqual(ch.loot_dry_streak, B.LOOT_PITY.dryStreakToGuarantee, '保底前计数不符');
  assert.strictEqual(db.inventory.length, 0);
  seq([0.99, 0.99]); const r = win(db, 30); restore();
  const drop = (r.items || []).find(x => x.type === '装备');
  assert.ok(drop, '到达保底仍未掉装备');
  assert.ok(db.inventory.length >= 1, '保底掉落未写入背包');
  assert.strictEqual(ch.loot_dry_streak, 0, '出货后空手计数未清零');
  const item = db.items.find(x => x.id === db.inventory[0].item_id);
  assert.ok(item, '背包指向不存在的物品（幽灵行）');
});

t('品质随敌方等级分档（装备自有阶梯，不再恒定凡器）', () => {
  assert.strictEqual(B.lootQuality(10), '凡器');
  assert.strictEqual(B.lootQuality(15), '法器');
  assert.strictEqual(B.lootQuality(44), '法器');
  assert.strictEqual(B.lootQuality(45), '灵器');
  assert.strictEqual(B.lootQuality(75), '法宝');
  assert.strictEqual(B.lootQuality(999), '法宝');
  assert.strictEqual(B.lootQuality(0), '凡器');
  assert.strictEqual(B.lootQuality(undefined), '凡器');
  const equipLadder = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器', '混沌至宝'];
  for (const q of B.LOOT_QUALITY_BY_LEVEL.map(x => x.quality)) {
    assert.ok(equipLadder.includes(q), `品质 ${q} 不在装备阶梯内（generateEquipment 会返回 null）`);
  }
  const db = mkdb();
  db.characters[0].loot_dry_streak = 99;             // 强制触发保底以观察品质
  seq([0.99, 0.99]); const r = win(db, 80); restore();
  const drop = (r.items || []).find(x => x.type === '装备');
  assert.strictEqual(drop.quality, '法宝', `敌方 80 级应掉法宝，实得 ${drop && drop.quality}`);
});

t('掷骰命中的常规掉落同样入包（不只保底）', () => {
  const db = mkdb();
  seq([0.0, 0.0]); const r = win(db, 20); restore();
  assert.ok((r.items || []).some(x => x.type === '灵石'), '命中阈值却未掉灵石');
  assert.ok((r.items || []).some(x => x.type === '装备'), '命中阈值却未掉装备');
  assert.strictEqual(db.inventory.length, 1, '常规掉落未写入背包');
});

t('无 charData（异常入参）不得抛错，也不得伪造保底进度', () => {
  const db = { characters: [], items: [], inventory: [] };
  seq([0.99, 0.99]);
  const r = svc.calculateRewards('attacker', ATK, { level: 5 }, db);
  restore();
  assert.ok(r && typeof r.exp === 'number', '结算返回值形状异常');
  assert.strictEqual(db.inventory.length, 0);
});

console.log(`\nE3 掉落测试: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
