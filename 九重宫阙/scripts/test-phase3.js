/* 阶段3 验收测试：统一熟练度 + 相生环 + 生产接线 */
const assert = require('assert');
const prof = require('../src/services/proficiency');
const elements = require('../src/services/elements');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

console.log('== 统一熟练度（10级阶梯）==');
t('阶梯名称 0-9', () => {
  assert.deepStrictEqual(prof.LADDER, ['无', '学徒', '工匠', '精通', '大师', '宗师', '大宗师', '无上大宗师', '道主', '主宰']);
});
t('初始读取：无级 0 exp', () => {
  const c = {};
  const g = prof.get(c, 'crafting');
  assert.strictEqual(g.level, 0);
  assert.strictEqual(g.levelName, '无');
  assert.strictEqual(g.successBonus, 0);
});
t('经验积累与升级', () => {
  const c = {};
  let r = prof.addExp(c, 'crafting', 60);
  assert.strictEqual(r.level, 0);
  assert.strictEqual(r.exp, 60);
  r = prof.addExp(c, 'crafting', 40); // 0→1 需 100
  assert.strictEqual(r.level, 1);
  assert.strictEqual(r.levelUp, true);
  assert.strictEqual(r.levelName, '学徒');
});
t('成功率加成 +2%/级', () => {
  const c = {};
  // 0→1:100, 1→2:302, 2→3:580（合计982）
  prof.addExp(c, 'crafting', 1000);
  const g = prof.get(c, 'crafting');
  assert.strictEqual(g.level, 3);
  assert.ok(Math.abs(g.successBonus - 0.06) < 1e-9);
});
t('主宰封顶后不再积累', () => {
  const c = {};
  // 一次性灌入巨量经验
  const r = prof.addExp(c, 'alchemy', 1e9);
  assert.strictEqual(r.level, prof.MAX_LEVEL);
  assert.strictEqual(r.levelName, '主宰');
  const r2 = prof.addExp(c, 'alchemy', 99999);
  assert.strictEqual(r2.exp, 0);
  assert.strictEqual(r2.level, prof.MAX_LEVEL);
});
t('五类别相互独立', () => {
  const c = {};
  prof.addExp(c, 'gathering', 100);
  assert.strictEqual(prof.get(c, 'gathering').level, 1);
  assert.strictEqual(prof.get(c, 'talisman').level, 0);
  assert.strictEqual(prof.get(c, 'formation').level, 0);
});

console.log('== 相生环（元素单一事实源扩展）==');
t('金生水→水生木→木生火→火生土→土生金', () => {
  assert.strictEqual(elements.relation('金', '水'), 'generates');
  assert.strictEqual(elements.relation('水', '木'), 'generates');
  assert.strictEqual(elements.relation('木', '火'), 'generates');
  assert.strictEqual(elements.relation('火', '土'), 'generates');
  assert.strictEqual(elements.relation('土', '金'), 'generates');
});
t('相克/同气/无关', () => {
  assert.strictEqual(elements.relation('金', '木'), 'overrides');
  assert.strictEqual(elements.relation('火', '金'), 'overrides');
  assert.strictEqual(elements.relation('金', '金'), 'same');
  assert.strictEqual(elements.relation('金', '土'), 'neutral');
  assert.strictEqual(elements.relation('光明', '黑暗'), 'overrides');
  assert.strictEqual(elements.relation('混沌', '金'), 'neutral');
});

console.log(`\n单元测试: ${pass} 通过, ${fail} 失败`);
process.exitCode = fail > 0 ? 1 : 0;
