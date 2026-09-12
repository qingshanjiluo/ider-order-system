/* 内容富集完整性验收：技能库/功法生成器/灵宠生成器 */
const assert = require('assert');
const skillService = require('../src/services/skill');
const itemService = require('../src/services/item');
const elements = require('../src/services/elements');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

const DATA = skillService.SKILLS_DATA || [];

console.log('== 技能库完整性 ==');
t(`技能总量 ≥ 90（实际 ${DATA.length}）`, () => {
  assert.ok(DATA.length >= 90, `仅 ${DATA.length}`);
});
t('id 全局唯一', () => {
  const ids = DATA.map(s => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
t('前置技能全部存在', () => {
  const ids = new Set(DATA.map(s => s.id));
  const missing = [];
  for (const s of DATA) for (const p of (s.prerequisites || [])) if (!ids.has(p)) missing.push(`${s.id}→${p}`);
  assert.deepStrictEqual(missing, []);
});
t('元素全部规范（七系+none）', () => {
  const bad = DATA.filter(s => !['metal','wood','water','fire','earth','light','dark','none'].includes(s.element));
  assert.deepStrictEqual(bad.map(s => s.id), []);
});
t('品质阶梯合法（黄→仙）', () => {
  const LEGAL = ['黄阶','玄阶','地阶','天阶','圣阶','仙阶'];
  const bad = DATA.filter(s => !LEGAL.includes(s.quality));
  assert.deepStrictEqual(bad.map(s => s.id), []);
});
t('槽位/类型合法', () => {
  const bad = DATA.filter(s => !['main','sub','ultimate'].includes(s.slot) || !['active','passive','key'].includes(s.type));
  assert.deepStrictEqual(bad.map(s => s.id), []);
});
t('被动技能 ≥ 12（原 5）', () => {
  const n = DATA.filter(s => s.type === 'passive').length;
  assert.ok(n >= 12, `仅 ${n}`);
});
t('每系 ≥ 10 个技能', () => {
  for (const el of ['metal','wood','water','fire','earth','light','dark']) {
    const n = DATA.filter(s => s.element === el).length;
    assert.ok(n >= 10, `${el} 仅 ${n}`);
  }
});
t('圣阶+仙阶顶层技能 ≥ 14（新增阶梯）', () => {
  const n = DATA.filter(s => ['圣阶','仙阶'].includes(s.quality)).length;
  assert.ok(n >= 14, `仅 ${n}`);
});
t('生产联动被动存在（锻造/炼丹/采集）', () => {
  for (const id of ['forge_master', 'dan_heart', 'tianji_sense']) {
    assert.ok(DATA.find(s => s.id === id), `缺 ${id}`);
  }
});
t('元素克制关系对 apex 技能成立（光克暗等）', () => {
  const rel = elements.relation('light', 'dark');
  assert.ok(rel === 'overrides', `light→dark 应为克制，实际 ${rel}`);
  assert.strictEqual(elements.relation('metal', 'wood'), 'overrides');
  assert.strictEqual(elements.relation('wood', 'fire'), 'generates');
});

console.log('== 功法生成器富集 ==');
t('生成 50 个功法：全部有元素亲和+词库名+四维属性', () => {
  const REALMS = ['炼气', '筑基', '金丹', '元婴'];
  const QUALITIES = ['黄阶', '玄阶', '地阶', '天阶', '圣阶', '仙阶'];
  for (let i = 0; i < 50; i++) {
    const g = itemService.generateGongfa(REALMS[i % 4], QUALITIES[i % 6], i % 2 === 0 ? '修炼' : '战斗');
    assert.ok(g && g.name, '生成失败');
    assert.ok(g.name.includes('·') && g.name.includes('系'), `命名未富集: ${g.name}`);
    const st = JSON.parse(g.stats);
    assert.ok(['metal','wood','water','fire','earth','light','dark'].includes(st.element), '缺元素亲和');
    assert.ok(typeof st.cultivation_speed === 'number' && typeof st.skill_damage === 'number', '缺基础属性');
    assert.ok(typeof st.element_boost === 'number' && 'comprehension_req' in st, '缺新属性');
    assert.ok(g.description.length > 15, '描述未富集');
  }
});
t('战斗功法高品阶概率带技能槽', () => {
  let withSlot = 0;
  for (let i = 0; i < 60; i++) {
    const g = itemService.generateGongfa('化神', '圣阶', '战斗');
    if (JSON.parse(g.stats).skill_slots > 0) withSlot++;
  }
  assert.ok(withSlot > 0, '60个圣阶战斗功法无一有槽（概率异常）');
});

console.log('== 灵宠生成器物种化 ==');
t('生成 30 只灵宠：全部物种+元素+天赋', () => {
  const names = new Set();
  const QUALITIES = ['凡兽', '灵兽', '玄兽', '地兽', '天兽', '圣兽', '仙兽'];
  for (let i = 0; i < 30; i++) {
    const p = itemService.generatePet('筑基', QUALITIES[i % 7]);
    assert.ok(p && p.name, '生成失败');
    const st = JSON.parse(p.stats);
    assert.ok(st.species && st.element && st.trait, `缺物种信息: ${p.name}`);
    assert.ok(['metal','wood','water','fire','earth','light','dark'].includes(st.element));
    names.add(st.species);
  }
  assert.ok(names.size >= 5, `物种多样性不足: ${names.size}`);
});

console.log('== 材料分级 + 商店目录（内容富集二期） ==');
const materials = require('../src/services/materials');
t('材料目录 35+ 种、五级完整', () => {
  const n = Object.keys(materials.MATERIAL_CATALOG).length;
  assert.ok(n >= 35, `仅 ${n}`);
  for (const [name, def] of Object.entries(materials.MATERIAL_CATALOG)) {
    assert.ok(def.tier >= 1 && def.tier <= 5, `${name} tier 非法`);
    assert.ok(['main', 'aux'].includes(def.role), `${name} role 非法`);
  }
});
t('地图采集节点全部有分级定义', () => {
  const fixMaps = require('fs').readFileSync('src/scripts/fix-maps.js', 'utf8');
  const expand = require('fs').readFileSync('src/scripts/expand-data.js', 'utf8');
  const nodes = new Set();
  for (const m of (fixMaps + expand).matchAll(/gather_nodes: \[([^\]]+)\]/g)) {
    for (const n of m[1].matchAll(/'([^']+)'/g)) nodes.add(n[1]);
  }
  const missing = [...nodes].filter(n => !materials.MATERIAL_CATALOG[n]);
  assert.deepStrictEqual(missing, [], `未分级节点: ${missing.join(',')}`);
});
t('tier→装备品质封顶单调递增', () => {
  const Q = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器'];
  const caps = [1, 2, 3, 4, 5].map(t => Q.indexOf(materials.TIER_EQUIP_CAP[t]));
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i] > caps[i - 1], '封顶未单调递增');
});
t('商店目录幂等：ensureAll 二次执行零变更', () => {
  const fakeDb = { items: [], shop: [], id_counters: {} };
  materials.ensureAll(fakeDb);
  const before = JSON.stringify(fakeDb.shop.length) + '/' + fakeDb.items.filter(i => i.type === '丹药').length;
  const r2 = materials.ensureAll(fakeDb);
  assert.strictEqual(r2.changed, 0, '二次 ensure 应零变更');
  assert.ok(fakeDb.shop.length >= 9, `货架不足: ${fakeDb.shop.length}`);
});
t('特殊灵石/仙盟令上架且可用化链路完整', () => {
  for (const name of ['血石', '五行灵石', '造化灵石', '初级仙盟令']) {
    assert.ok(materials.SHOP_CATALOG.find(s => s.name === name), `缺 ${name}`);
  }
});
t('锻造品质封顶逻辑：tier3 主材产物 ≤ 法宝', () => {
  const Q = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器'];
  const db = {
    items: [{ id: 1, name: '火焰结晶', type: '材料', quality: '凡品', stats: JSON.stringify({ tier: 3, role: 'main', element: 'fire' }) }],
    inventory: [], id_counters: {}
  };
  const main = db.items[0];
  const mainStats = JSON.parse(main.stats);
  let qualityIdx = Q.indexOf(main.quality || '凡器');
  const capIdx = Q.indexOf(materials.TIER_EQUIP_CAP[mainStats.tier]);
  qualityIdx = qualityIdx < 0 ? capIdx : Math.min(qualityIdx, capIdx);
  assert.strictEqual(Q[qualityIdx], '法宝', `tier3 封顶应为法宝，实际 ${Q[qualityIdx]}`);
});

console.log(`\n内容完整性: ${pass} 通过, ${fail} 失败`);
process.exitCode = fail > 0 ? 1 : 0;
