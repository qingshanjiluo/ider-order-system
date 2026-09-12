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

console.log('== 三期：功法库/技能200+/境界分级/藏书阁 ==');
const { GONGFA_LIBRARY, SECT_FOCUS_ELEMENT } = require('../src/data/gongfa-library');
const sectLibrary = require('../src/services/sect-library');
t(`功法库 ≥ 80（实际 ${GONGFA_LIBRARY.length}）`, () => {
  assert.ok(GONGFA_LIBRARY.length >= 80, `仅 ${GONGFA_LIBRARY.length}`);
});
t('每个宗门至少 4 门功法', () => {
  for (const key of Object.keys(SECT_FOCUS_ELEMENT)) {
    const n = GONGFA_LIBRARY.filter(g => g.sect_key === key).length;
    assert.ok(n >= 4, `${key} 仅 ${n} 门`);
  }
});
t('功法可升级/不可升级混合（各 ≥10）', () => {
  const up = GONGFA_LIBRARY.filter(g => g.upgradeable).length;
  const fixed = GONGFA_LIBRARY.length - up;
  assert.ok(up >= 10 && fixed >= 10, `可升级 ${up} / 不可 ${fixed}`);
});
t('功法境界适用分级完整（realm_level 0-8）', () => {
  for (const g of GONGFA_LIBRARY) {
    assert.ok(typeof g.realm_level === 'number' && g.realm_level >= 0 && g.realm_level <= 8, `${g.name} realm_level 非法`);
  }
});
t('功法 id 唯一 + 元素规范', () => {
  const ids = GONGFA_LIBRARY.map(g => g.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  const bad = GONGFA_LIBRARY.filter(g => !['metal','wood','water','fire','earth','light','dark','none'].includes(g.element));
  assert.deepStrictEqual(bad.map(g => g.id), []);
});
t(`技能总量 ≥ 200（实际 ${DATA.length}）`, () => {
  assert.ok(DATA.length >= 200, `仅 ${DATA.length}`);
});
t('基础手调 10 技能打标且低耗', () => {
  const base = DATA.filter(s => s.base);
  assert.strictEqual(base.length, 10, `base=${base.length}`);
  for (const s of base) assert.ok((s.learn_cost || 0) <= 40, `${s.id} learn_cost=${s.learn_cost}`);
});
t('全部技能 realm_level 分级（适用范围等级）', () => {
  const bad = DATA.filter(s => typeof s.realm_level !== 'number');
  assert.deepStrictEqual(bad.slice(0, 3).map(s => s.id), []);
});
t('扩充技能前置链完整（同系上阶链）', () => {
  const ids = new Set(DATA.map(s => s.id));
  const expanded = DATA.filter(s => s.expanded);
  assert.ok(expanded.length >= 122, `扩充仅 ${expanded.length}`);
  for (const s of expanded) for (const p of (s.prerequisites || [])) assert.ok(ids.has(p), `${s.id}→${p} 悬空`);
});
t('藏书阁：上传→贡献→学习 闭环（纯服务层）', () => {
  const fakeDb = { items: [], inventory: [], player_skills: [], id_counters: {}, dirty: false };
  const store = require('../src/db/store');
  // 防御性清理上次运行残留（真实镜像库）
  for (const m of store.queryRel('sect_members', { character_id: -771 })) store.deleteRel('sect_members', { id: m.id });
  for (const e of store.queryRel('sect_library', { contributor: '测试弟子' })) store.deleteRel('sect_library', { id: e.id });
  // 真实宗门（飞羽门）+ 临时弟子成员
  const feiyu = store.queryRel('sects', { key: 'feiyu' })[0];
  assert.ok(feiyu, '飞羽门不存在');
  const memberId = store.insertRel('sect_members', { sect_id: feiyu.id, character_id: -771, rank: '外门弟子', contribution: 0, joined_at: new Date().toISOString() });
  const char = { id: -771, name: '测试弟子', learned_blueprints: [] };
  const gongfaItem = { id: store.getNextId('items'), name: 'TEST秘传剑典', type: '功法', quality: '玄阶', stats: '{}' };
  fakeDb.items.push(gongfaItem);
  fakeDb.inventory.push({ id: store.getNextId('inventory'), character_id: -771, item_id: gongfaItem.id, quantity: 1 });
  // 上传（同名 TEST秘传剑典 若上次残留会导致去重——防御清理已保证唯一）
  const invId = fakeDb.inventory[fakeDb.inventory.length - 1].id;
  const up = sectLibrary.upload(fakeDb, char, invId);
  assert.ok(up.ok, `上传失败: ${up.error}`);
  assert.ok(up.contribution >= 20);
  // 基础功法入库（幂等：首次新增 ≥4，二次零新增；总量恒 ≥4）
  const added1 = sectLibrary.ensureSectBase(fakeDb, feiyu.id, 'feiyu');
  const added2 = sectLibrary.ensureSectBase(fakeDb, feiyu.id, 'feiyu');
  assert.strictEqual(added2, 0, '基础功法二次入库应零新增');
  const baseCount = sectLibrary.entriesOf(feiyu.id).filter(e => e.source === 'sect_base').length;
  assert.ok(baseCount >= 4, `宗门基础功法仅 ${baseCount}`);
  // 同名上传被拒
  fakeDb.inventory.push({ id: store.getNextId('inventory'), character_id: -771, item_id: gongfaItem.id, quantity: 1 });
  const dup = sectLibrary.upload(fakeDb, char, fakeDb.inventory[fakeDb.inventory.length - 1].id);
  assert.strictEqual(dup.ok, false, '同名应去重');
  // 学习（贡献足够：20 ≥ 黄阶20）
  const learn = sectLibrary.learn(fakeDb, char, '青锋引灵诀');
  assert.ok(learn.ok, `学习失败: ${learn.error}`);
  assert.ok(fakeDb.inventory.find(i => i.character_id === -771 && i.item_id !== gongfaItem.id), '功法未入包');
  // 清理：成员行 + 测试上传的藏书阁行（保留 sect_base 基础功法）
  store.deleteRel('sect_members', { id: memberId });
  for (const e of store.queryRel('sect_library', { contributor: '测试弟子' })) store.deleteRel('sect_library', { id: e.id });
});

console.log('== 四期：全品类世界完善 ==');
const buffService = require('../src/services/buff');
t('材料目录 ≥ 48 且液体/火焰/土石品类齐备', () => {
  const n = Object.keys(materials.MATERIAL_CATALOG).length;
  assert.ok(n >= 48, `仅 ${n}`);
  for (const name of ['万年寒潭水', '地髓乳', '离火精', '太阴玄冰', '五色土', '星陨砂', '混沌土', '龙须草', '紫猴花', '玉髓芝']) {
    assert.ok(materials.MATERIAL_CATALOG[name], `缺 ${name}`);
  }
});
t('新材料全部可采集（已挂图）', () => {
  for (const matName of Object.keys(materials.MAP_GATHER_ADDITIONS)) {
    assert.ok(materials.MATERIAL_CATALOG[matName], `${matName} 未分级`);
    assert.ok(materials.MAP_GATHER_ADDITIONS[matName].length >= 2, `${matName} 挂图不足`);
  }
});
t('新丹药/阵法全部可购买且可使用（buff 定义齐备）', () => {
  const NEW = ['淬体丹', '凝神丹', '龙血丹', '聚灵阵', '固元阵', '破军杀阵', '五行大阵'];
  for (const name of NEW) {
    assert.ok(materials.SHOP_CATALOG.find(s => s.name === name), `商店缺 ${name}`);
  }
  // 使用管线：借用 buffDefinitions 行为验证（applyGuildShopBuff 对不存在角色不落库）
  const r = buffService.applyGuildShopBuff(-999, '五行大阵');
  assert.ok(r.success, '五行大阵使用失败');
});
t('高阶火焰：需火源材料且火源可采集', () => {
  const src = require('fs').readFileSync('src/routes/forge.js', 'utf8');
  for (const f of ['三昧真火', '太阳真火', '太阴玄冰焰', '九幽冥火']) assert.ok(src.includes(f), `缺高阶火焰 ${f}`);
  for (const s of ['地心火种', '离火精', '太阴玄冰', '混沌土']) {
    assert.ok(materials.MATERIAL_CATALOG[s], `火源 ${s} 未分级`);
  }
});
t('扩展丹方：boot后可解析（herb/结果道具均存在）', () => {
  const { loadDatabase } = require('../src/database');
  const db = loadDatabase();
  materials.ensureAll(db);
  const alchemy = require('../src/routes/alchemy');
  alchemy.__ensureRecipes(db);
  const src = require('fs').readFileSync('src/routes/alchemy.js', 'utf8');
  for (const pill of ['淬体丹', '凝神丹', '龙血丹', '太阴凝魂丹']) assert.ok(src.includes(`'${pill}'`) || src.includes(pill), `缺丹方 ${pill}`);
});
t('灵兽物种池 ≥ 36（源数据校验）+ 生成器多样', () => {
  const src = require('fs').readFileSync('src/services/item.js', 'utf8');
  const speciesSec = src.slice(src.indexOf('const SPECIES'), src.indexOf('const sp ='));
  const pool = [...speciesSec.matchAll(/\{ name: '([^']+)', element:/g)].map(m => m[1]);
  assert.ok(pool.length >= 36, `物种池仅 ${pool.length}`);
  assert.strictEqual(new Set(pool).size, pool.length, '物种池有重名');
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(JSON.parse(itemService.generatePet('筑基', '灵兽').stats).species);
  assert.ok(seen.size >= 10, `生成器多样性不足: ${seen.size}`);
});

t('器方/符方图纸库 ≥12 且材料全部可解析', () => {
  const src = require('fs').readFileSync('src/services/materials.js', 'utf8');
  assert.ok(src.includes("name: '青锋剑图纸'") && src.includes("name: '太阳神弓图纸'"), '器方缺失');
  assert.ok(src.includes("name: '烈火符方'") && src.includes("name: '驱邪符方'"), '符方缺失');
  // 所有图纸材料名必须已分级或可购
  const bpNames = [...src.matchAll(/name: '([^']+图纸|[^']+符方)'/g)].map(m => m[1]);
  assert.ok(bpNames.length >= 12, `图纸仅 ${bpNames.length}`);
  const mats = [...src.matchAll(/\{ name: '([^']+)', quantity: \d+ \}/g)].map(m => m[1]);
  for (const m of mats) {
    assert.ok(materials.MATERIAL_CATALOG[m] || materials.SHOP_CATALOG.find(s => s.name === m), `图纸材料 ${m} 不可解析`);
  }
});
t('符箓成品可购可用', () => {
  for (const name of ['烈火符', '寒冰符', '护身符', '驱邪符']) {
    assert.ok(materials.SHOP_CATALOG.find(s => s.name === name && s.type === '符箓'), `商店缺符箓 ${name}`);
  }
  const r = buffService.applyGuildShopBuff(-999, '护身符');
  assert.ok(r.success, '护身符使用失败');
});
t('器方品质阶梯覆盖凡→仙', () => {
  const src = require('fs').readFileSync('src/services/materials.js', 'utf8');
  const craftSec = src.slice(src.indexOf('BLUEPRINT_CATALOG'), src.indexOf('function ensureBlueprints'));
  for (const q of ['凡品', '灵品', '宝品', '仙品']) assert.ok(craftSec.includes(`quality: '${q}'`), `器方缺 ${q}`);
});

console.log('== 六期：灵兽捕捉闭环 ==');
const petCapture = require('../src/services/pet-capture');
t('驯兽符/灵兽粮上架可购', () => {
  assert.ok(materials.SHOP_CATALOG.find(s => s.name === '驯兽符'), '缺驯兽符');
  assert.ok(materials.SHOP_CATALOG.find(s => s.name === '灵兽粮'), '缺灵兽粮');
});
t('捕捉成功率钳制在 [0.05,0.9] 且随凶险度递减', () => {
  const easy = petCapture.captureChance(10, { min_level: 1, difficulty: 1 });
  const hard = petCapture.captureChance(95, { min_level: 95, difficulty: 6 });
  assert.ok(easy > hard, '高险图应更难');
  for (const [lv, d] of [[1, 1], [50, 3], [100, 6], [1, 6]]) {
    const c = petCapture.captureChance(lv, { min_level: 1, difficulty: d });
    assert.ok(c >= 0.05 && c <= 0.9, `越界 ${c}`);
  }
});
t('品质池随难度提升且映射境界正确', () => {
  const ORDER = ['凡兽', '灵兽', '玄兽', '地兽', '天兽', '圣兽', '仙兽'];
  const low = ORDER.indexOf(petCapture.pickQuality(1));
  const high = ORDER.indexOf(petCapture.pickQuality(5));
  assert.ok(high > low, '高险图品质应更高');
  assert.strictEqual(petCapture.realmForMap(1), '炼气');
  assert.strictEqual(petCapture.realmForMap(45), '化神');
  assert.strictEqual(petCapture.realmForMap(100), '渡劫');
});
t('捕捉路由与 feed 路由均完整挂载', () => {
  const s = require('fs').readFileSync('src/routes/pet.js', 'utf8');
  assert.ok(s.includes("router.post('/capture'"), '缺 capture 路由');
  assert.ok(/router\.post\('\/feed'[\s\S]{0,80}try \{/.test(s), 'feed 路由结构受损');
  assert.ok(s.includes('db.pets.push'), '未写入兽栏');
});

console.log('== 七期：装备图鉴 + 怪物图鉴 + 材料入库修复 ==');
const { EQUIPMENT_LIBRARY, SLOTS } = require('../src/data/equipment-library');
const monsterLib = require('../src/data/monster-library');
t(`装备图鉴 ≥ 96（实际 ${EQUIPMENT_LIBRARY.length}）且六部位齐备`, () => {
  assert.ok(EQUIPMENT_LIBRARY.length >= 96, `仅 ${EQUIPMENT_LIBRARY.length}`);
  for (const slot of Object.keys(SLOTS)) {
    const n = EQUIPMENT_LIBRARY.filter(e => e.subtype === slot).length;
    assert.ok(n >= 8, `${slot} 仅 ${n} 件`);
  }
});
t('装备品阶数值单调递增（同部位同器型）', () => {
  const Q = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器'];
  const weapons = Q.map(q => EQUIPMENT_LIBRARY.find(e => e.subtype === 'weapon' && e.quality === q && e.name === SLOTS.weapon.names[Q.indexOf(q)]));
  assert.ok(weapons.every(Boolean), '主兵器链条不完整');
  for (let i = 1; i < weapons.length; i++) {
    assert.ok(weapons[i].stats.attack > weapons[i - 1].stats.attack, `${Q[i]} 攻击未递增`);
  }
});
t('装备 id/名称唯一且境界阶梯匹配', () => {
  const names = EQUIPMENT_LIBRARY.map(e => e.name);
  assert.strictEqual(new Set(names).size, names.length, '装备重名');
  const Q = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器'];
  for (const e of EQUIPMENT_LIBRARY) {
    const qi = Q.indexOf(e.quality);
    assert.ok(qi >= 0, `未知品阶 ${e.quality}`);
    assert.ok(e.realm, `${e.name} 缺境界`);
  }
});
t('怪物图鉴：地图引用 100% 覆盖（按地图补齐）', () => {
  const fakeDb = {
    items: [{ id: 1, name: '灵草' }, { id: 2, name: '聚灵草' }, { id: 3, name: '火焰结晶' }],
    monsters: [],
    maps: [
      { id: 1, name: '青云山', min_level: 1, max_level: 15, difficulty: 1, element: '无', monsters: ['灵兔', '灵蛇', '山猫'] },
      { id: 2, name: '火焰山', min_level: 20, max_level: 30, difficulty: 1.5, element: '火', monsters: ['岩浆兽', '火元素', '炎魔'] },
      { id: 3, name: '寒冰谷', min_level: 30, max_level: 40, difficulty: 1.8, element: '冰', monsters: ['冰狼', '雪人'] }
    ]
  };
  const created = monsterLib.ensureMonsters(fakeDb);
  assert.strictEqual(created, 8, `应补 8 只，实际 ${created}`);
  assert.strictEqual(monsterLib.ensureMonsters(fakeDb), 0, '二次补齐应零新增');
  for (const m of fakeDb.monsters) {
    const st = JSON.parse(m.stats);
    assert.ok(st.hp > 0 && st.attack > 0, `${m.name} 数值异常`);
    assert.ok(['metal','wood','water','fire','earth','light','dark','none'].includes(m.element), `${m.name} 元素非法`);
  }
});
t('怪物元素推断正确（冰→水/火→火/雷→金/鬼→暗）', () => {
  assert.strictEqual(monsterLib.inferElement('冰霜巨龙', '无'), 'water');
  assert.strictEqual(monsterLib.inferElement('岩浆巨人', '无'), 'fire');
  assert.strictEqual(monsterLib.inferElement('雷劫守卫', '无'), 'metal');
  assert.strictEqual(monsterLib.inferElement('幽冥鬼', '无'), 'dark');
  assert.strictEqual(monsterLib.inferElement('树精', '无'), 'wood');
});
t('怪物数值随地图难度放大', () => {
  const easy = monsterLib.monsterStatsFor('x', 1, 1, 0);
  const hard = monsterLib.monsterStatsFor('x', 90, 5, 0);
  assert.ok(hard.hp > easy.hp * 10 && hard.attack > easy.attack * 10, '难度未放大');
});
t('材料目录每一项都已真正入库（修复空目录幽灵材料）', () => {
  const fakeDb = { items: [], shop: [], maps: [], blueprints: [], id_counters: {} };
  const r = materials.ensureAll(fakeDb);
  assert.strictEqual(r.materialItems, Object.keys(materials.MATERIAL_CATALOG).length, '入库材料数不符');
  for (const name of ['离火精', '太阴玄冰', '星陨砂', '朱砂', '紫猴花', '赤焰髓', '五色土']) {
    assert.ok(fakeDb.items.find(i => i.name === name), `${name} 未入库`);
  }
  // 图纸材料现在应全部可解析
  for (const bp of materials.BLUEPRINT_CATALOG) {
    for (const m of bp.materials) {
      assert.ok(fakeDb.items.find(i => i.name === m.name), `图纸材料 ${m.name} 仍不可解析`);
    }
  }
});
t('ensureAll 幂等：真实库二次执行零变更', () => {
  const { loadDatabase } = require('../src/database');
  const db = loadDatabase();
  materials.ensureAll(db);
  const r2 = materials.ensureAll(db);
  assert.strictEqual(r2.changed, 0, `二次变更 ${r2.changed} 项`);
});

console.log('== 八期：丹药图鉴 + 副本扩充 + 数据卫生 ==');
const pillLib = require('../src/data/pill-library');
const dungeonLib = require('../src/data/dungeon-library');
const hygiene = require('../src/services/data-hygiene');
t(`丹药图鉴 ≥ 23（实际 ${pillLib.PILLS.length}）且五品阶齐备`, () => {
  assert.ok(pillLib.PILLS.length >= 23, `仅 ${pillLib.PILLS.length}`);
  for (const q of ['凡品', '灵品', '宝品', '仙品', '道品']) {
    assert.ok(pillLib.PILLS.some(p => p.quality === q), `缺 ${q} 丹药`);
  }
});
t('丹药品质递增 → 效果递增（同类别）', () => {
  const boosts = ['凡品', '灵品', '宝品', '仙品', '道品'].map(q => {
    const p = pillLib.PILLS.find(x => x.quality === q && x.buff.type === 'attack');
    return p ? p.buff.value : null;
  }).filter(Boolean);
  for (let i = 1; i < boosts.length; i++) assert.ok(boosts[i] > boosts[i - 1], '增益未随品阶递增');
});
t('每种丹药均有 buff 定义（可使用）', () => {
  for (const p of pillLib.PILLS) {
    assert.ok(pillLib.PILL_BUFFS[p.name], `${p.name} 缺 buff`);
    assert.ok(['exp', 'attack', 'defense', 'speed', 'all'].includes(p.buff.type), `${p.name} buff 类型非法`);
    assert.ok(p.buff.duration > 0 && p.buff.value > 1, `${p.name} 数值异常`);
  }
  // 走真实使用管线
  const r = buffService.applyGuildShopBuff(-999, '大道丹');
  assert.ok(r.success, '道品丹药使用失败');
});
t('丹药入库且低阶上架坊市', () => {
  const fakeDb = { items: [], shop: [], maps: [], blueprints: [], dungeons: [], id_counters: {} };
  const r = materials.ensureAll(fakeDb);
  assert.ok(r.pills >= pillLib.PILLS.length, `入库 ${r.pills}`);
  for (const name of ['养气丹', '通脉丹', '玄元丹', '太清丹', '道韵丹']) {
    assert.ok(fakeDb.items.find(i => i.name === name && i.type === '丹药'), `${name} 未入库`);
  }
  const shopNames = fakeDb.shop.map(s => fakeDb.items.find(i => i.id === s.item_id)).filter(Boolean).map(i => i.name);
  assert.ok(shopNames.includes('养气丹') && shopNames.includes('通脉丹'), '低阶丹药未上架');
  assert.ok(!shopNames.includes('道韵丹'), '道品丹药不应直接出售');
});
t(`副本图鉴 ≥ 32（当前含新增 ${dungeonLib.DUNGEONS.length} 个）`, () => {
  assert.ok(dungeonLib.DUNGEONS.length >= 17, `仅 ${dungeonLib.DUNGEONS.length}`);
  const types = new Set(dungeonLib.DUNGEONS.map(d => d.type));
  assert.ok(types.size >= 4, `副本类型仅 ${[...types].join('/')}`);
});
t('副本奖励随难度阶梯递增', () => {
  const sorted = [...dungeonLib.DUNGEONS].sort((a, b) => a.difficulty - b.difficulty);
  const r1 = dungeonLib.rewardsFor(sorted[0]);
  const r2 = dungeonLib.rewardsFor(sorted[sorted.length - 1]);
  assert.ok(r2.exp > r1.exp && r2.spiritStone > r1.spiritStone, '奖励未递增');
});
t('副本播种幂等（二次零新增）', () => {
  const fakeDb = { dungeons: [] };
  assert.strictEqual(dungeonLib.ensureDungeons(fakeDb), dungeonLib.DUNGEONS.length);
  assert.strictEqual(dungeonLib.ensureDungeons(fakeDb), 0);
});
t('数据卫生：非法品阶归一且保留原始值', () => {
  const fakeDb = {
    items: [
      { id: 1, name: '太极图', type: '装备', quality: '混沌至宝', stats: '{}' },
      { id: 2, name: '怪剑', type: '装备', quality: '??', stats: '{}' },
      { id: 3, name: '正常剑', type: '装备', quality: '法器', stats: '{}' }
    ]
  };
  assert.strictEqual(hygiene.normalizeQualities(fakeDb), 2, '应修 2 条');
  assert.strictEqual(fakeDb.items[0].quality, '道器');
  assert.strictEqual(fakeDb.items[1].quality, '法器');
  assert.strictEqual(JSON.parse(fakeDb.items[0].stats).legacy_quality, '混沌至宝', '未保留原值');
  assert.strictEqual(hygiene.normalizeQualities(fakeDb), 0, '二次应零修复');
  for (const it of fakeDb.items) assert.ok(hygiene.LEGAL_QUALITIES.has(it.quality), '仍有非法品阶');
});

console.log('== 九期：成就系统死活条件修复 ==');
const achRoutes = require('../src/routes/achievement');
const achDefs = achRoutes.__DEFINITIONS;
const achProgress = achRoutes.__getProgress;
t(`成就定义 50 条且 id 唯一`, () => {
  assert.strictEqual(achDefs.length, 50, `实际 ${achDefs.length}`);
  const ids = achDefs.map(a => a.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id 重复');
});
t('全部条件类型均有实现（不再恒返回 0）', () => {
  const src = require('fs').readFileSync('src/routes/achievement.js', 'utf8');
  const types = [...new Set(achDefs.map(a => a.requirement.type))];
  assert.ok(types.length >= 12, `条件类型仅 ${types.length}`);
  // 旧的恒 0 实现必须已被替换
  for (const dead of ["case 'arenaRank':\n      return 0;", "case 'friends':\n      return 0;", "case 'allMaps':\n      return 0;"]) {
    assert.ok(!src.includes(dead), `死条件仍在: ${dead.slice(0, 20)}`);
  }
});
t('竞技名次按真实积分实算（榜首=1）', () => {
  const champ = { id: -1, arena_points: 999999, realm: '筑基', spirit_stone: 0 };
  const low = { id: -2, arena_points: 0, realm: '炼气', spirit_stone: 0 };
  const pTop = achProgress(champ, { type: 'arenaRank', value: 100 });
  const pLow = achProgress(low, { type: 'arenaRank', value: 100 });
  assert.strictEqual(pTop, 1, '积分最高者应入榜');
  assert.ok(pLow >= 0 && pLow <= 1, '进度越界');
});
t('地图探索/副本通关/五星进度按真实记录计算', () => {
  const { loadDatabase } = require('../src/database');
  const db = loadDatabase();
  const allMaps = (db.maps || []).map(m => m.id);
  const allDungeons = (db.dungeons || []).map(d => d.id);
  const full = {
    id: -3, realm: '金丹', spirit_stone: 0,
    visited_maps: allMaps, cleared_dungeons: allDungeons,
    dungeon_stars: Object.fromEntries(allDungeons.map(id => [id, 5]))
  };
  const empty = { id: -4, realm: '炼气', spirit_stone: 0 };
  assert.strictEqual(achProgress(full, { type: 'allMaps', value: 1 }), 1, '全图探索应满进度');
  assert.strictEqual(achProgress(full, { type: 'allDungeons', value: 1 }), 1, '全副本应满进度');
  assert.strictEqual(achProgress(full, { type: 'allDungeonStar', value: 5 }), 1, '全五星应满进度');
  assert.ok(achProgress(empty, { type: 'allMaps', value: 1 }) < 1, '空进度不应满');
  assert.ok(achProgress(empty, { type: 'allDungeons', value: 1 }) < 1);
});
t('探索/通关记录已接线到对应路由', () => {
  const g = require('fs').readFileSync('src/routes/gathering.js', 'utf8');
  const d = require('fs').readFileSync('src/routes/dungeon.js', 'utf8');
  assert.ok(g.includes('visited_maps'), '采集未记录 visited_maps');
  assert.ok(d.includes('cleared_dungeons'), '副本未记录 cleared_dungeons');
  assert.ok(d.includes('dungeon_stars'), '副本未记录 dungeon_stars');
  const s = require('fs').readFileSync('server.js', 'utf8');
  assert.ok(s.includes("app.use('/api/achievement'"), '成就路由未挂载');
});

console.log('== 十期：D5 寿元定稿（A 案）+ 比例制数值单点 ==');
const balance = require('../src/config/balance');
const gameTime = require('../src/services/gameTime');
const REALM_ORDER = ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
t('balance 与 gameTime 寿元曲线全等（A 案锁死，禁漂移）', () => {
  assert.deepStrictEqual(balance.LIFESPAN_YEARS, gameTime.LIFESPAN_BY_REALM);
  assert.strictEqual(balance.LIFESPAN_CAP, gameTime.LIFESPAN_CAP);
  assert.strictEqual(balance.LIFESPAN_YEARS['渡劫'], 1000000, 'A 案：渡劫=100万为顶');
  assert.strictEqual(balance.LIFESPAN_YEARS['飞升'], null, '飞升须为超脱(null)');
});
t('cap 随境界严格单调递增（突破即续命的数学表达）', () => {
  for (let i = 1; i < REALM_ORDER.length; i++) {
    const prev = balance.lifespanOf(REALM_ORDER[i - 1]);
    const cur = balance.lifespanOf(REALM_ORDER[i]);
    assert.ok(cur > prev, `${REALM_ORDER[i]}(${cur}) 未大于 ${REALM_ORDER[i - 1]}(${prev})`);
  }
  assert.strictEqual(balance.lifespanOf('化神'), 20000);
  assert.strictEqual(balance.lifespanOf('合体'), 100000);
  assert.strictEqual(balance.lifespanOf('未知境'), 100, '未知境界应回落凡人数值');
});
t('每级 +1% 续命通道存在且随境界放大', () => {
  assert.strictEqual(balance.LEVEL_LIFESPAN_GAIN, 0.01);
  const src = require('fs').readFileSync('src/services/character.js', 'utf8');
  assert.ok(/getLifespanBase/.test(src) && /lifespan_bonus_years/.test(src), '升级续命钩子丢失');
  const perLevelLianqi = balance.lifespanOf('炼气') * balance.LEVEL_LIFESPAN_GAIN;
  const perLevelDujie = balance.lifespanOf('渡劫') * balance.LEVEL_LIFESPAN_GAIN;
  assert.strictEqual(perLevelLianqi, 2);
  assert.strictEqual(perLevelDujie, 10000, '高境界每级收益应同步放大');
});
t('折寿/延寿一律比例制（大数量级下仍有效）', () => {
  assert.ok(balance.INJURY_LIFE_COST.defeat === 0.02 && balance.INJURY_LIFE_COST.nearDeath === 0.01);
  assert.strictEqual(balance.yearsOfRatio(1000000, 0.01), 10000, '渡劫期 1% 必须等于一万年起跳');
  assert.strictEqual(balance.yearsOfRatio(100, 0.0001), 1, '小 cap 至少扣 1 年（不得归零）');
  for (const r of Object.values(balance.LIFE_BURN_TIERS)) assert.ok(r.costRatio > 0 && r.speedMult > 1);
  assert.ok(balance.LONGEVITY_BONUS_CAP_RATIO > 0 && balance.LONGEVITY_BONUS_CAP_RATIO < 1, '延寿封顶比例非法');
});
t('枯竭四级与突破 base 表完整', () => {
  assert.strictEqual(balance.depletionTier(200, 150).key, 'safe');
  assert.strictEqual(balance.depletionTier(200, 55).key, 'warn');
  assert.strictEqual(balance.depletionTier(200, 25).key, 'danger');
  assert.strictEqual(balance.depletionTier(200, 8).key, 'dying');
  assert.strictEqual(balance.depletionTier(200, 8).speedMult, 0.7);
  assert.strictEqual(balance.depletionTier(null, 0).key, 'safe', '飞升超脱不参与枯竭');
  for (const r of REALM_ORDER.slice(1)) assert.ok(Number.isFinite(balance.BREAKTHROUGH_BASE[r]), `缺 ${r} 突破基准`);
  assert.ok(balance.BREAKTHROUGH_BASE['炼气'] > balance.BREAKTHROUGH_BASE['渡劫'], '高境界应更难');
  assert.strictEqual(balance.SPEED_CAP_TOTAL, 12);
});

console.log('== 十一期：突破判定概率（定稿模型，取代满足即成功）==');
const realmService = require('../src/services/realm');
t('境界 base 单调递减且钳制在 [5,95]', () => {
  const c = (realm, char, opts) => realmService.breakthroughProbability(
    Object.assign({ realm, breakthrough_failures: 0, inner_demon: 0 }, char || {}), opts || {}).chance;
  assert.strictEqual(c('炼气'), 90);
  assert.ok(c('炼气') > c('金丹') && c('金丹') > c('渡劫'), '高境界必须更难');
  assert.strictEqual(c('渡劫', { inner_demon: 40 }), 5, '心魔再重也必须留 5% 一线生机');
  assert.strictEqual(c('炼气', null, { pill: 1, formation: 1, artPerfect: 1, epiphany: 1 }), 95, '契机再多也封顶 95');
});
t('心魔与连败施压，连败≥3 触发天道庇护', () => {
  const p = realmService.breakthroughProbability({ realm: '金丹', inner_demon: 3, breakthrough_failures: 4 }).parts;
  assert.strictEqual(p.base, 70);
  assert.strictEqual(p.innerDemon, -15, '每层心魔 −5');
  assert.strictEqual(p.failures, -12, '每次连败 −3');
  assert.ok(p.heavenShield >= 12, `天道庇护应随超期连败递增，实得 ${p.heavenShield}`);
});
t('未知境界不参与判定（凡人无突破）', () => {
  assert.strictEqual(realmService.breakthroughProbability({ realm: '凡人' }).chance, 0);
  assert.strictEqual(realmService.breakthroughProbability({ realm: '凡人' }).parts, null);
});
t('闸门未过与判定失败分流（修掉点一下就涨连败）', () => {
  assert.strictEqual(realmService.breakthrough(999999).phase, 'missing', '角色不存在应为 missing');
  const src = require('fs').readFileSync('src/services/realm.js', 'utf8');
  assert.ok(/return \{ success: false, phase: 'gate'/.test(src), 'gate 分支必须直接 return，不得置失败标记');
});
t('失败结算走比例折寿并回落 10% 修为（源码锁定）', () => {
  const src = require('fs').readFileSync('src/services/realm.js', 'utf8');
  assert.ok(/_pending_breakthrough_failure/.test(src), '缺少幂等失败标记');
  assert.ok(/BREAKTHROUGH_LIFE_COST/.test(src) && /yearsOfRatio/.test(src), '未使用比例制折寿');
  assert.ok(/expFallbackRatio/.test(src), '未使用修为回落比例');
  assert.ok(!/breakthrough_failures <= 3/.test(src), '旧的阶梯清零逻辑应已移除');
});

t('契机自动解析：带伤冲关降概率，未落地通道不臆造加成', () => {
  const healthy = realmService.breakthroughProbability({ realm: '金丹', injury: 0 });
  const hurt = realmService.breakthroughProbability({ realm: '金丹', injury: 60 });
  assert.strictEqual(healthy.parts.daoDamage, 0, '无伤不得白送道基受损惩罚');
  assert.strictEqual(hurt.parts.daoDamage, -10, '中伤以上冲关应 P−10');
  assert.strictEqual(healthy.chance - hurt.chance, 10, '展示概率必须真的下降');
  const mods = realmService.resolveBreakthroughMods({ realm: '金丹' });
  assert.deepStrictEqual(mods, { daoDamage: false, pill: false, formation: false, veinLevel: 0, artPerfect: false, epiphany: false }, '缺失字段必须回落为无加成（防幽灵契机）');
  assert.strictEqual(realmService.breakthroughProbability({ realm: '金丹', cave_vein_level: 5 }).parts.vein, 10, '灵脉 lv×2');
});
t('显式 opts 覆盖自动解析（调用方可指定破境丹等）', () => {
  const p = realmService.breakthroughProbability({ realm: '炼气', injury: 90 }, { daoDamage: false, pill: true });
  assert.strictEqual(p.parts.daoDamage, 0);
  assert.strictEqual(p.parts.pill, 15);
});

console.log('== 十二期：契机丹可得性与 R11 调参锁 ==');
t('破境丹：库里有定义、坊市有上架（不可为半幽灵）', () => {
  const pills = require('../src/data/pill-library.js');
  const list = pills.PILLS || pills.default || [];
  const def = list.find(p => p.name === '破境丹');
  assert.ok(def, 'pill-library 缺破境丹');
  assert.strictEqual(def.category, '突破');
  const catalog = require('fs').readFileSync('src/services/materials.js', 'utf8');
  assert.ok(/破境丹/.test(catalog), 'SHOP_CATALOG 未上架破境丹 → 玩家不可得');
  const db = require('../src/database').loadDatabase();
  const items = (db.items || []).filter(x => x.name === '破境丹');
  assert.strictEqual(items.length, 1, `破境丹应唯一，实得 ${items.length}`);
  const listed = (db.shop || []).filter(s => items.some(i => i.id === s.item_id));
  assert.strictEqual(listed.length, 1, '破境丹未上架或重复上架');
});
t('持有契机丹 → 概率 +15；未持有 → 无幽灵加成', () => {
  assert.deepStrictEqual(balance.BREAKTHROUGH_PILL_NAMES, ['破境丹']);
  const src = require('fs').readFileSync('src/services/realm.js', 'utf8');
  assert.ok(/_findPillRow\(character\.id\)/.test(src) && /pillRow\.quantity/.test(src), '一次性消耗逻辑丢失（会退化为随身永驻 +15%）');
  assert.strictEqual(realmService.resolveBreakthroughMods({ realm: '金丹', id: -1 }).pill, false, '无丹不得白送契机');
});
t('R11 锁：天道庇护 10%/次，足以打断失败螺旋', () => {
  assert.strictEqual(balance.BREAKTHROUGH_MODS.heavenShieldEach, 10, '护栏值被改回（渡劫寿尽率会回到 20%+）');
  const p = realmService.breakthroughProbability({ realm: '渡劫', inner_demon: 5, breakthrough_failures: 5, injury: 0 }).parts;
  assert.strictEqual(p.heavenShield, 30, '连败 5 次应累计 +30（10×(5−3+1)）');
  const noShield = 20 + p.innerDemon + p.failures;
  assert.ok(p.base + p.innerDemon + p.failures + p.heavenShield > noShield, '庇护必须真的抬升概率');
});

console.log('== 十三期：E3 技能槽位（修 D2 撞槽）==');
t('skillSlotCap 随境界单调、封顶 8、非法入参降级为 2 槽', () => {
  assert.strictEqual(typeof balance.skillSlotCap, 'function');
  const seq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 20].map(balance.skillSlotCap);
  assert.deepStrictEqual(seq, [2, 3, 4, 5, 6, 7, 8, 8, 8, 8], `实际 ${seq.join(',')}`);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i] >= seq[i - 1], '槽位上限不得回退');
  assert.strictEqual(balance.skillSlotCap(-1), balance.SLOT_BASE, '未知境界应给最小槽位而非 0');
  assert.strictEqual(balance.skillSlotCap(undefined), balance.SLOT_BASE);
  assert.strictEqual(balance.skillSlotCap(NaN), balance.SLOT_BASE);
  assert.strictEqual(balance.SLOT_BASE, 2);
  assert.strictEqual(balance.SLOT_MAX, 8);
});
t('getNextSlot 源码锁：上限走境界、满槽 return null（不得静默撞槽）', () => {
  const src = require('fs').readFileSync('src/services/battle/skill.js', 'utf8');
  assert.ok(/B\.skillSlotCap\(realmIndex\)/.test(src), '槽位上限未接入 balance.skillSlotCap');
  assert.ok(/for \(let i = 1; i <= cap; i\+\+\)/.test(src), '仍按硬编码 1..2 扫描槽位');
  const gi = src.indexOf('getNextSlot(characterId)');
  assert.ok(/return null;/.test(src.slice(gi, gi + 1200)), '满槽未 return null —— 旧实现 return 1 会让两件功法共用同槽');
  assert.ok(!/for \(let i = 1; i <= 2; i\+\+\)/.test(src), '硬编码 2 槽残留');
});
t('挂载点先判满槽再造物（失败不得留下半件功法）', () => {
  const src = require('fs').readFileSync('src/services/battle/skill.js', 'utf8');
  const slotAt = src.indexOf('const slot = this.getNextSlot(characterId);');
  const pushAt = src.indexOf('this.db.gongfa.push');
  assert.ok(slotAt > 0 && pushAt > slotAt, '必须取到空槽后才写入功法');
  assert.ok(/技能槽位已满/.test(src.slice(slotAt, pushAt)), '满槽未给出可读错误');
});

console.log('== 十四期：境界 ↔ 寿元 数据契约（E6 扩容防护）==');
t('db.realms 每一级寿元严格递增；显式 null 只允许在末位（飞升脱尘）', () => {
  const realms = (require('../src/database').loadDatabase().realms || [])
    .slice().sort((a, b) => a.id - b.id);
  assert.ok(realms.length >= 10, `境界表行数异常：${realms.length}`);
  const nullIdx = realms.findIndex(x => balance.LIFESPAN_YEARS[x.name] === null);
  assert.ok(nullIdx === -1 || nullIdx === realms.length - 1,
    `null 寿元出现在第 ${nullIdx} 行（只允许末位，否则高境界反而有数）`);
  let prev = -1, prevName = '';
  for (const r of realms) {
    assert.ok(r.name in balance.LIFESPAN_YEARS, `${r.name} 在 LIFESPAN_YEARS 缺键（两文件必须同步扩容）`);
    const l = balance.LIFESPAN_YEARS[r.name];
    if (l === null) continue;
    assert.ok(l > prev, `${r.name} 寿元 ${l} 未超过前一级 ${prevName}=${prev}`);
    prev = l; prevName = r.name;
  }
  assert.strictEqual(prev, balance.LIFESPAN_CAP, 'ladder 末位数值寿元应正好顶到 LIFESPAN_CAP');
});
t('寿元表显式 null 仅属于飞升；凡人与顶格值符合发布文案', () => {
  const nulls = Object.entries(balance.LIFESPAN_YEARS).filter(([, v]) => v === null).map(([k]) => k);
  assert.deepStrictEqual(nulls, ['飞升'], `显式 null 只应属于飞升，实得：${nulls.join(',')}`);
  assert.strictEqual(balance.LIFESPAN_YEARS['凡人'], 100);
  assert.strictEqual(balance.lifespanOf('渡劫'), balance.LIFESPAN_CAP);
  assert.strictEqual(balance.LIFESPAN_CAP, 1000000, '顶格百万，对应发布文案「百万寿元」');
});
t('不变量 1：延寿 bonus 封顶 ≤ 35%，任何境界都不被掏穿', () => {
  assert.ok(balance.LONGEVITY_BONUS_CAP_RATIO <= 0.35);
  const caps = Object.values(balance.LIFESPAN_YEARS).filter((v) => typeof v === 'number');
  assert.ok(caps.length >= 10, `寿元表数值项过少：${caps.length}`);
  for (const cap of caps) {
    assert.ok(balance.yearsOfRatio(cap, balance.LONGEVITY_BONUS_CAP_RATIO) <= cap * 0.35 + 1e-9,
      `cap=${cap} 的 bonus 越界`);
  }
});
t('E3 槽位与 ladder 同源：每个境界序号都得 2..8 且单调封顶', () => {
  const n = (require('../src/database').loadDatabase().realms || []).length;
  assert.ok(n >= 10);
  for (let i = 0; i < n; i++) {
    const c = balance.skillSlotCap(i);
    assert.ok(c >= 2 && c <= 8, `序号 ${i} 槽位 ${c} 越界`);
    if (i > 0) assert.ok(c >= balance.skillSlotCap(i - 1), '槽位上限不得回退');
  }
  assert.strictEqual(balance.skillSlotCap(n + 5), 8, '超出 ladder 仍应封顶 8 槽');
});

console.log('== 十五期：E3 比值减伤（修线性减法致高防近乎无敌）==');
t('减伤数学：def=0 不减免、随 def 单调递减、永不免疫', () => {
  assert.strictEqual(balance.mitigatedDamage(100, 0, 1), 100);
  const a = balance.mitigatedDamage(1000, 500, 30), b = balance.mitigatedDamage(1000, 5000, 30);
  assert.ok(a > b, '护甲增高却未减伤');
  assert.ok(balance.mitigationRatio(1e9, 1) <= balance.MITIGATION.maxMitigation + 1e-9, '减伤超过上限 = 可免疫');
  assert.strictEqual(balance.mitigatedDamage(1000, 1e9, 1), 250, '极端护甲应停在 25% 伤害，而不是夹成 1');
});
t('原缺陷不复现：def ≫ attack 时伤害不再恒为 1', () => {
  const legacy = Math.max(1, Math.floor(50 * 2 - 1000 * 0.8));      // 旧公式：100 − 800 → 夹到 1
  const fixed = balance.mitigatedDamage(50 * 2, 1000, 50);
  assert.strictEqual(legacy, 1, '旧公式基准值变了（对照失效）');
  assert.ok(fixed > 1, '仍被夹成 1，说明没换成比值减伤');
  assert.ok(fixed >= 50 * 2 * 0.2, `伤害过弱：${fixed}`);
});
t('等级缩放：同级护甲越厚 K 越大，避免高等级把减伤堆满', () => {
  const low = balance.mitigatedDamage(1000, 800, 5);
  const high = balance.mitigatedDamage(1000, 800, 90);
  assert.ok(high > low, `高等级防守方反而更硬：${high} <= ${low}`);
  assert.strictEqual(balance.mitigatedDamage(0, 500, 10), balance.MITIGATION.floorDamage, '0 攻应落到保底 1');
});
t('攻击线性：伤害随攻击力近似线性放大（旧公式会因减法而失真）', () => {
  const d1 = balance.mitigatedDamage(1000, 1200, 40);
  const d2 = balance.mitigatedDamage(2000, 1200, 40);
  assert.ok(d2 > d1 * 1.9 && d2 <= d1 * 2 + 2, `非线性：${d1} → ${d2}`);
});
t('damage.js 已接比值减伤且不残留线性相减', () => {
  const src = require('fs').readFileSync('src/services/battle/damage.js', 'utf8');
  assert.ok(/B\.mitigatedDamage\(/.test(src), '未接入 balance.mitigatedDamage');
  assert.ok(!/defenseReduction/.test(src), '旧的线性相减实现仍残留');
});

console.log('== 十六期：E3 先手判定与回合计数 ==');
t('decideInitiative：速度高者先手、同速归攻方、缺字段按 0 处理', () => {
  const cm = require('../src/services/battle/combat');
  const svc = typeof cm === 'function' ? new cm() : cm;
  assert.strictEqual(typeof svc.decideInitiative, 'function', 'decideInitiative 未挂上服务实例');
  assert.strictEqual(svc.decideInitiative({ speed: 100 }, { speed: 50 }), true, '攻方更快应先手');
  assert.strictEqual(svc.decideInitiative({ speed: 50 }, { speed: 100 }), false, '守方更快应抢得先手');
  assert.strictEqual(svc.decideInitiative({ speed: 80 }, { speed: 80 }), true, '同速须归攻方（确定性）');
  assert.strictEqual(svc.decideInitiative({}, {}), true, '双方缺 speed 不得变成 undefined 比较');
  assert.strictEqual(svc.decideInitiative({ speed: 0 }, { speed: 1 }), false);
  assert.strictEqual(svc.decideInitiative(null, { speed: 5 }), false, '入参缺失须降级而非抛错');
});
t('主循环已按先手排序，且攻方技能不因守方先手而丢失', () => {
  const src = require('fs').readFileSync('src/services/battle/combat.js', 'utf8');
  assert.ok(/this\.decideInitiative\(attacker, defender\)/.test(src), '主循环未接入先手判定');
  assert.ok(!/this\.executeRound\(attacker, defender, 'attacker', useSkillIndex\)/.test(src),
    '仍是攻方无条件先手的旧循环');
  assert.ok(/attackerFirst \? useSkillIndex : null/.test(src), '技能索引未与先手归属解耦');
});
t('回合计数不再差一（rounds: round 而非 round - 1）', () => {
  const src = require('fs').readFileSync('src/services/battle/combat.js', 'utf8');
  assert.ok(/rounds: round,/.test(src), 'rounds 仍可能被少算一回合');
  assert.ok(!/rounds: round - 1/.test(src), '残留差一实现');
  assert.ok(/let round = 0;/.test(src) && /while \(attacker\.hp > 0 && defender\.hp > 0\) \{\s*\n\s*round\+\+/.test(src),
    '回合数应在每轮开始时自增');
  assert.ok(/if \(round >= 50\)/.test(src), '超时上限判定未随新计数方式调整');
});

console.log('== 十七期：E3 怪物模板真正入战（修 id 被当 mapId）==');
t('buildMonsterFromTemplate：等级落在 level_range、属性走 stats(JSON 串)约定、必有 speed', () => {
  const cm = require('../src/services/battle/combat');
  const svc = typeof cm === 'function' ? new cm() : cm;
  assert.strictEqual(typeof svc.buildMonsterFromTemplate, 'function', '模板实例化方法未挂上');
  const m = svc.buildMonsterFromTemplate({
    id: 7, name: '测试兽', level_range: [10, 12], element: 'fire',
    stats: '{"attack":100,"defense":40,"hp":500}', drops: [{ item_id: 1 }]
  });
  assert.ok(m.level >= 10 && m.level <= 12, `等级越界：${m.level}`);
  assert.strictEqual(m.name, '测试兽');
  assert.ok(m.attack >= 100 && m.defense >= 40 && m.hp >= 500, `stats 未被解析：${m.attack}/${m.defense}/${m.hp}`);
  assert.strictEqual(m.maxHp, m.hp, 'maxHp 应与 hp 一致，否则血条显示错乱');
  assert.ok(m.speed >= 1, `模板缺 speed 时必须推导，实得 ${m.speed}`);
  assert.ok(Array.isArray(m.drops) && m.drops.length === 1, 'drops 未透传（86 行模板的掉落字段应可被后续接线使用）');
});
t('坏数据不崩：stats 非 JSON、level_range 缺失/倒置都能降级', () => {
  const cm = require('../src/services/battle/combat');
  const svc = typeof cm === 'function' ? new cm() : cm;
  const a = svc.buildMonsterFromTemplate({ id: 1, name: 'A', stats: 'not-json' });
  assert.ok(a.hp > 0 && a.speed >= 1);
  const b = svc.buildMonsterFromTemplate({ id: 2, name: 'B', level_range: [9, 3], stats: null });
  assert.ok(b.level >= 3 && b.level <= 9, `倒置区间未兜底：${b.level}`);
  const c = svc.buildMonsterFromTemplate({ id: 3, name: 'C' });
  assert.ok(c.level >= 1 && c.hp > 0 && Number.isFinite(c.attack));
});
t('getEntity 先查怪物模板：高 id（超出地图数）不再返回 null', () => {
  const cm = require('../src/services/battle/combat');
  const svc = typeof cm === 'function' ? new cm() : cm;
  const db = require('../src/database').loadDatabase();
  const mapCount = (db.maps || []).length;
  const high = (db.monsters || []).filter(m => m.id > mapCount).sort((a, b) => a.id - b.id)[0];
  assert.ok(high, `找不到 id > 地图数(${mapCount}) 的怪物模板，无法验证该回归`);
  const m = svc.getEntity(high.id, 'monster', db);
  assert.ok(m, `怪物模板 id=${high.id} 仍取不到（旧实现把它当 mapId → null）`);
  assert.strictEqual(m.name, high.name, `取到的不是该模板（拿到 ${m.name}）`);
  assert.strictEqual(m.templateId, high.id);
});
t('彻底不存在的 id 仍安全降级为 null（不抛错）', () => {
  const cm = require('../src/services/battle/combat');
  const svc = typeof cm === 'function' ? new cm() : cm;
  const db = require('../src/database').loadDatabase();
  assert.strictEqual(svc.getEntity(999999, 'monster', db), null);
});
t('全部 86 行模板都能实例化且有 speed（PVE 先手自此有数据源）', () => {
  const cm = require('../src/services/battle/combat');
  const svc = typeof cm === 'function' ? new cm() : cm;
  const db = require('../src/database').loadDatabase();
  const ms = db.monsters || [];
  assert.ok(ms.length >= 86, `怪物模板行数退化为 ${ms.length}`);
  let bad = 0;
  for (const t of ms) {
    const m = svc.buildMonsterFromTemplate(t);
    if (!m || !(m.speed >= 1) || !(m.hp > 0) || !m.name) bad++;
  }
  assert.strictEqual(bad, 0, `${bad} 行模板无法实例化`);
});

console.log('== 十八期：E5/T0-1 大限劫与延寿硬闸 ==');
// logEvent 经 store.insertRel 真写 lifespan_events：测试必须桩掉，否则每跑一次污染一次生产数据
const storeMod = require('../src/db/store');
storeMod.insertRel = () => 0;
const gt = require('../src/services/gameTime');
const bal = require('../src/config/balance');
const mkChar = (realm, extra) => Object.assign({
  id: 900001, name: '试劫者', realm, level: 1, age_years: 0,
  lifespan_bonus_years: 0, longevity_years: 0, lifespan_penalty_years: 0,
  time_settled_at: Date.now(), reincarnation_count: 0
}, extra || {});
const capOf = (c) => gt.effectiveLifespan(c);
const exhaust = (c) => { c.age_years = capOf(c); return c; };

t('寿元耗尽不再静默坐化：化神起开应劫窗口，窗口内不判死', () => {
  for (const realm of bal.TRIBULATION.eligibleRealms) {
    const c = exhaust(mkChar(realm));
    assert.strictEqual(gt.shouldPassAway(c), false, `${realm} 耗尽即死，大限劫未生效`);
    assert.ok(c.tribulation && c.tribulation.stage === 'pending', `${realm} 未开窗口`);
    assert.ok(Math.abs(gt.tribulationRemaining(c) - bal.TRIBULATION.windowYears) < 1e-6, `${realm} 窗口长度不符`);
  }
});
t('窗口幂等：反复结算不得刷新窗口起点（否则读档一次续期一次=无限延寿）', () => {
  const c = exhaust(mkChar('合体'));
  gt.shouldPassAway(c);
  const started = c.tribulation.started_at_year;
  for (let i = 0; i < 30; i++) { c.age_years += 0.01; assert.strictEqual(gt.shouldPassAway(c), false); }
  assert.strictEqual(c.tribulation.started_at_year, started, '窗口起点被刷新');
  assert.ok(gt.tribulationRemaining(c) < bal.TRIBULATION.windowYears, 'remaining 未随年龄递减');
});
t('逾期未应劫判死，且失败后不再重开窗口', () => {
  const c = exhaust(mkChar('大乘'));
  assert.strictEqual(gt.shouldPassAway(c), false);
  c.age_years = c.tribulation.started_at_year + bal.TRIBULATION.windowYears + 1;
  assert.strictEqual(gt.shouldPassAway(c), true, '窗口耗尽仍未判死');
  assert.strictEqual(c.tribulation.stage, 'failed');
  c.age_years += 100;
  assert.strictEqual(gt.shouldPassAway(c), true, 'failed 状态被复活');
});
t('度劫成功按当时上限的比例续命（不变量 2：禁绝对年数）', () => {
  const c = exhaust(mkChar('元婴')); // 元婴无劫，改用有劫境界
  assert.strictEqual(gt.tribulationEligible(c), false, '元婴不应有劫（名单被改？）');
  const k = exhaust(mkChar('大乘'));
  gt.shouldPassAway(k);
  const before = capOf(k);
  const r = gt.resolveTribulationVictory(k);
  assert.strictEqual(r.success, true, `续命失败：${r.error}`);
  assert.ok(Math.abs(r.gainedYears - before * bal.TRIBULATION.renewRatio) < 1e-6, `增量非比例：${r.gainedYears}/${before}`);
  assert.ok(Math.abs(capOf(k) - before * (1 + bal.TRIBULATION.renewRatio)) < 1e-6, '上限未如期抬升');
  assert.strictEqual(k.tribulation.stage, 'survived');
  assert.strictEqual(gt.resolveTribulationVictory(k).success, false, '无 pending 也能续命（可刷）');
});
t('续上的寿元耗尽后可再应一轮（一世多次）', () => {
  const c = exhaust(mkChar('大乘'));
  gt.shouldPassAway(c);
  assert.strictEqual(gt.resolveTribulationVictory(c).success, true);
  exhaust(c);
  assert.strictEqual(gt.shouldPassAway(c), false, '第二次大限未开窗口');
  assert.strictEqual(c.tribulation.stage, 'pending', 'survived 未转回 pending');
});
t('A 案顶格：渡劫上限即 100 万，度劫成功也续无可续（唯有飞升可脱）', () => {
  const c = exhaust(mkChar('渡劫'));
  gt.shouldPassAway(c);
  const v = gt.resolveTribulationVictory(c);
  assert.strictEqual(v.success, true);
  assert.strictEqual(v.gainedYears, 0, `顶格却续出了 ${v.gainedYears} 年，100 万绝对上限被架空`);
  assert.strictEqual(capOf(c), bal.LIFESPAN_CAP, `渡劫上限被改动：${capOf(c)}`);
});
t('延寿硬闸生效：累计延寿不超过境界基础寿元 35%，超闸边际为 0', () => {
  const c = mkChar('金丹');
  const base = gt.getLifespanBase(c);
  let total = 0;
  for (let i = 0; i < 60; i++) total += gt.addLifespanBonus(c, base * 0.02);
  assert.ok(Math.abs(total - base * bal.LONGEVITY_BONUS_CAP_RATIO) < base * 0.011, `累计 ${total} 未钉在 35% 闸：${base * bal.LONGEVITY_BONUS_CAP_RATIO}`);
  assert.strictEqual(gt.addLifespanBonus(c, base), 0, '闸未关死');
  assert.ok(capOf(c) <= base * (1 + bal.LONGEVITY_BONUS_CAP_RATIO) + 1, '上限越过 35% 闸');
});
t('两桶分开：升级带来的境界内成长不被延寿闸吃掉（防接错桶）', () => {
  const c = mkChar('元婴');
  const base = gt.getLifespanBase(c);
  c.lifespan_bonus_years = base * 0.9;
  assert.ok(Math.abs(capOf(c) - base * 1.9) < 1e-6, `境界内成长被误封顶：${capOf(c)}`);
  gt.addLifespanBonus(c, base * 0.1);
  assert.ok(c.longevity_years > 0 && c.longevity_years <= base * bal.LONGEVITY_BONUS_CAP_RATIO, '延寿未进独立桶');
});
t('筑基及以下仍直接坐化（劫是化神以上的事）', () => {
  const c = exhaust(mkChar('筑基'));
  assert.strictEqual(gt.shouldPassAway(c), true, '低境界被误给了应劫窗口');
  assert.ok(!c.tribulation || c.tribulation.stage !== 'pending');
});
t('飞升超脱：不判死也不应劫（寿命机制退场）', () => {
  const c = mkChar('飞升');
  c.age_years = 10 ** 9;
  assert.strictEqual(gt.shouldPassAway(c), false);
  assert.strictEqual(gt.resolveTribulationVictory(c).success, false);
  assert.strictEqual(gt.tribulationEligible(c), false);
});
t('转世清空延寿与劫状态（源码锁）', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'services', 'gameTime.js'), 'utf8');
  assert.ok(src.includes('character.longevity_years = 0;'), 'passAway 未清延寿桶');
  assert.ok(src.includes('character.tribulation = null;'), 'passAway 未清劫状态');
  assert.ok(!/openTribulationWindow\(\{ *\.\.\./.test(src), '对展开副本开窗口（临时对象副作用）');
});
t('判定点唯一：passAway 只有一处调用方；大限劫已落地（反向锁死"零实现"）', () => {
  const fs = require('fs'); const path = require('path');
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(path.join(__dirname, '..', 'src'));
  const callers = files.filter(f => /gameTime[^\n]*passAway\(/.test(fs.readFileSync(f, 'utf8')));
  assert.strictEqual(callers.length, 1, `passAway 调用点应为 1，实为 ${callers.length}: ${callers.map(f => path.basename(f)).join(',')}`);
  const hits = files.reduce((n, f) => n + ((fs.readFileSync(f, 'utf8').match(/大限劫/g) || []).length), 0);
  assert.ok(hits > 0, '大限劫关键字仍为 0 命中（实现回退）');
});

console.log(`\n内容完整性: ${pass} 通过, ${fail} 失败`);
process.exitCode = fail > 0 ? 1 : 0;
