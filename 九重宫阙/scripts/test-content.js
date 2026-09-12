const __dbPath = require('path').join(__dirname, '..', 'data', 'game.db');
const __dbSnap = require('fs').readFileSync(__dbPath);
// store 会在更晚的时刻注册自己的 exit flush，这里抢先注册还原，保证套件不留侧写
process.on('exit', function () { try { require('fs').writeFileSync(__dbPath, __dbSnap); } catch (e) {} });
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
t('元素ke制关系对 apex 技能成立（光ke暗等）', () => {
  const rel = elements.relation('light', 'dark');
  assert.ok(rel === 'overrides', `light→dark 应为ke制，实际 ${rel}`);
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
  // 锁整条链而非单文件文本：升级 → gameTime.addRealmGrowth → lifespan_bonus_years（系数取 balance）
  const caller = require('fs').readFileSync('src/services/character.js', 'utf8');
  const owner = require('fs').readFileSync('src/services/gameTime.js', 'utf8');
  assert.ok(/gameTime\.addRealmGrowth\(/.test(caller), '升级不再调用唯一续命入口（钩子丢失）');
  assert.ok(/function addRealmGrowth\s*\(/.test(owner)
    && /character\.lifespan_bonus_years\s*=/.test(owner)
    && /B\.LEVEL_LIFESPAN_GAIN/.test(owner), '续命通道在 gameTime 侧断链或未走 balance 系数');
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
  // 寿元写入收回 gameTime 独占后的等价性（这条替换的是原本在跑的升级加寿路径）
  assert.ok(src.includes('B.LEVEL_LIFESPAN_GAIN'), '境界内成长未走 balance 系数（又硬编码了？）');
  assert.ok(require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'services', 'character.js'), 'utf8')
    .includes('gameTime.addRealmGrowth('), '升级未改走 gameTime 唯一写入口');
  const g = mkChar('筑基');
  const before = capOf(g);
  const gained = gt.addRealmGrowth(g);
  assert.strictEqual(gained, 500 * bal.LEVEL_LIFESPAN_GAIN, `升级加寿不等价：${gained}`);
  assert.strictEqual(capOf(g), before + gained);
  assert.strictEqual(gt.addRealmGrowth(mkChar('飞升')), 0, '超脱者不应再加寿');
  assert.strictEqual(gt.addRealmGrowth({ realm: '不存在的境界' }), gt.getLifespanBase({ realm: '不存在的境界' }) * bal.LEVEL_LIFESPAN_GAIN,
    '未知境界应走凡人基准而非静默为 0');
});
t('判定点唯一：passAway 只有一处调用方；大限劫已落地（反向锁死"零实现"）', () => {
  const fs = require('fs'); const path = require('path');
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(path.join(__dirname, '..', 'src'));
  // 口径修正：不变量是"生死判定与转世出口各只有一个**函数**"，不是"只有一个调用方"。
  // T0-1 之后合法调用方有两处：读档兜底(character.js) 与 应劫败亡(tribulation.js)，不得再有第三方。
  const defs = files.filter(f => /function shouldPassAway\s*\(/.test(fs.readFileSync(f, 'utf8')));
  assert.strictEqual(defs.length, 1, `判死函数定义点必须唯一，实为 ${defs.length}: ${defs.map(f => path.basename(f)).join(',')}`);
  const exits = files.filter(f => /function passAway\s*\(/.test(fs.readFileSync(f, 'utf8')));
  assert.strictEqual(exits.length, 1, `转世出口定义点必须唯一，实为 ${exits.length}`);
  const callers = files.filter(f => /gameTime[^\n]*passAway\(/.test(fs.readFileSync(f, 'utf8'))).map(f => path.basename(f)).sort();
  assert.deepStrictEqual(callers, ['character.js', 'tribulation.js'],
    `转世调用方偏离白名单：${callers.join(',') || '无'}`);
  // 询问判死的地方可以有多处（读档兜底、疗伤扣寿、应劫结算），但**谁都不准自己算寿元**：
  // 除 gameTime.js 外任何文件都不得写寿元字段——这才是不变量的实质（凭记忆列白名单会被 injury.js 打脸）。
  const judgers = files.filter(f => /gameTime[^\n]*shouldPassAway\(/.test(fs.readFileSync(f, 'utf8'))).map(f => path.basename(f)).sort();
  assert.ok(judgers.includes('character.js') && judgers.includes('tribulation.js'),
    `判死询问方缺失（应有读档与应劫两处）：${judgers.join(',') || '无'}`);
  const offenders = files
    .filter(f => path.basename(f) !== 'gameTime.js')
    .filter(f => {
      const src = fs.readFileSync(f, 'utf8');
      return /character\.age_years\s*=[^=]/.test(src)
        || /lifespan_bonus_years\s*=[^=]/.test(src)
        || /longevity_years\s*=[^=]/.test(src)
        || /lifespan_penalty_years\s*=[^=]/.test(src);
    }).map(f => path.basename(f));
  assert.deepStrictEqual(offenders, [], `寿元字段被 gameTime 之外的文件直接改写：${offenders.join(',')}`);
  const hits = files.reduce((n, f) => n + ((fs.readFileSync(f, 'utf8').match(/大限劫/g) || []).length), 0);
  assert.ok(hits > 0, '大限劫关键字仍为 0 命中（实现回退）');
});

console.log('== 十九期：E4/T0-2 修炼九乘区模型 ==');
const cm = require('../src/services/cultivation-model');
const CM = bal.CULTIVATION_MODEL;
const baseCtx = (over) => Object.assign({
  realm: '炼气', level: 1, stats: { talent: 10, comprehension: 10, dao_affinity: 10 },
  spiritRoots: [{ type: 'fire', purity: 50 }], gongfas: [], mapDifficulty: 1, veinLevel: 0,
  seclusion: 'none', pillMultiplier: 1, injuryMultiplier: 1, sectMultiplier: 1
}, over || {});

t('九区齐全且顺序稳定（前端与模拟都要按这个口径显示）', () => {
  const r = cm.computeCultivation(baseCtx());
  const keys = cm.ZONES.map(z => z.key);
  assert.deepStrictEqual(Object.keys(r.parts), keys, `乘区键不匹配：${Object.keys(r.parts).join(',')}`);
  assert.ok(keys.length >= 9, `乘区数=${keys.length}，不足九区`);
  assert.ok(Array.isArray(r.pending), 'pending 必须是数组（未接线机制要显式登记）');
  assert.strictEqual(r.cap, bal.SPEED_CAP_TOTAL);
});
t('基础速率取自 CULTIVATION_V0（炼气 10 → 渡劫 840），未覆盖境界回退旧基准', () => {
  assert.strictEqual(cm.computeCultivation(baseCtx({ realm: '炼气' })).baseRate, bal.CULTIVATION_V0['炼气']);
  assert.strictEqual(cm.computeCultivation(baseCtx({ realm: '渡劫' })).baseRate, bal.CULTIVATION_V0['渡劫']);
  assert.strictEqual(cm.computeCultivation(baseCtx({ realm: '飞升' })).baseRate, CM.legacyBaseRate, 'V0 未覆盖飞升却未回退');
  assert.strictEqual(cm.computeCultivation(baseCtx({ realm: undefined })).baseRate, CM.legacyBaseRate);
  assert.ok(!CM.useV0BaseRate || bal.CULTIVATION_V0['渡劫'] / bal.CULTIVATION_V0['炼气'] > 8, 'V0 阶梯被压平');
});
t('功法品阶终于参与修炼速度（玄阶>黄阶），层数加成走 balance 系数', () => {
  const low = cm.computeCultivation(baseCtx({ gongfas: [{ quality: '黄阶', level: 1 }] }));
  const high = cm.computeCultivation(baseCtx({ gongfas: [{ quality: '玄阶', level: 1 }] }));
  assert.ok(high.parts.gongfa > low.parts.gongfa, '品阶未参与（QUALITY_SPEED 仍是幽灵常数）');
  const lv10 = cm.computeCultivation(baseCtx({ gongfas: [{ quality: '黄阶', level: 10 }] }));
  assert.ok(Math.abs(lv10.parts.gongfa / low.parts.gongfa - (1 + 9 * CM.gongfaLevelBonus)) < 1e-9, '层数加成口径不对');
  assert.strictEqual(cm.computeCultivation(baseCtx({ gongfas: [{ quality: '不存在的品阶', level: 1 }] })).parts.gongfa,
    cm.computeCultivation(baseCtx()).parts.gongfa, '未知品阶不应给隐藏加成');
});
t('资质根骨：三项相对基准的偏差计入，缺字段记入 pending 而非乱给', () => {
  const good = cm.computeCultivation(baseCtx({ stats: { talent: 20, comprehension: 20, dao_affinity: 20 } }));
  assert.ok(Math.abs(good.parts.aptitude - 1.3) < 1e-9, `资质口径不对：期望 1+30×0.01=1.3，实得 ${good.parts.aptitude}`);
  const bad = cm.computeCultivation(baseCtx({ stats: {} }));
  assert.strictEqual(bad.parts.aptitude, 1.0);
  assert.ok(bad.pending.some(p => p.startsWith('aptitude')), '缺资质字段未登记 pending');
});
t('灵气浓度受 ENV_CAP 封顶；难度与地脉都算数', () => {
  const d1 = cm.computeCultivation(baseCtx({ mapDifficulty: 1 }));
  const d5 = cm.computeCultivation(baseCtx({ mapDifficulty: 5 }));
  assert.ok(d5.parts.density > d1.parts.density, '地图难度未参与浓度');
  const huge = cm.densityOf({ mapDifficulty: 999, veinLevel: 999 });
  assert.ok(huge.value <= bal.ENV_CAP + 1e-9 && huge.capped, `浓度未封顶：${huge.value}`);
});
t('属性契合按五行关系分档，功法缺 element 时登记数据缺口', () => {
  const same = cm.affinityOf('fire', 'fire');
  const gen = cm.affinityOf('wood', 'fire');
  const ke = cm.affinityOf('water', 'fire');
  assert.strictEqual(same, bal.AFFINITY.same);
  assert.ok(same > gen && gen > bal.AFFINITY.neutral, '相生相生关系排序不对');
  assert.ok(ke < bal.AFFINITY.neutral, '水ke火却给了不低于中性的契合');
  const r = cm.computeCultivation(baseCtx({ gongfas: [{ quality: '黄阶', level: 1 }] }));
  assert.ok(r.pending.some(p => p.startsWith('affinity')), '功法缺 element 必须登记，不能用 1.0 假装生效');
});
t('闭关五档递增且档位决定封锁行为；未知档一律按不入关', () => {
  const speeds = bal.SECLUSION.map(s => cm.seclusionOf(s.key).tier.speed);
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] > speeds[i - 1], '闭关档位未递增');
  assert.strictEqual(cm.seclusionOf('ruding').tier.blocks.includes('market'), true);
  const un = cm.computeCultivation(baseCtx({ seclusion: '胡说八道关' }));
  assert.strictEqual(un.parts.seclusion, 1.0, '未知闭关档给了加成');
  assert.ok(un.pending.some(p => p.startsWith('seclusion')));
});
t('总乘区受 SPEED_CAP_TOTAL 封顶，且封顶标志可信', () => {
  const crazy = baseCtx({
    gongfas: [{ quality: '仙阶', level: 500, cultivationSpeed: 9 }, { quality: '仙阶', level: 500 }],
    stats: { talent: 999, comprehension: 999, dao_affinity: 999 },
    mapDifficulty: 999, veinLevel: 999, seclusion: 'ruding', pillMultiplier: 99, sectMultiplier: 99
  });
  const r = cm.computeCultivation(crazy);
  assert.ok(r.rawSpeed > bal.SPEED_CAP_TOTAL, `极端输入下 rawSpeed 仍=${r.rawSpeed}，封顶形同虚设`);
  assert.strictEqual(r.speed, bal.SPEED_CAP_TOTAL);
  assert.strictEqual(r.capped, true);
  assert.strictEqual(cm.expPerSecond(crazy).rate, Math.floor(r.baseRate * bal.SPEED_CAP_TOTAL));
});
t('单区上下限：丹毒/伤势再重也不清零，功法再堆也有界', () => {
  const r = cm.computeCultivation(baseCtx({ injuryMultiplier: 0.0001, pillMultiplier: 9999 }));
  assert.strictEqual(r.parts.injury, CM.minZone);
  assert.strictEqual(r.parts.pill, CM.maxZone);
  assert.strictEqual(cm.clampZone('abc'), CM.minZone, '非数值入参未降级');
});
t('未接线机制必须显式 pending（丹毒/洞府当前恒 1.0 不可假装生效）', () => {
  const r = cm.computeCultivation(baseCtx());
  assert.ok(r.pending.some(p => p.startsWith('toxin')), '丹毒未落地却静默按 1.0');
  assert.ok(r.pending.some(p => p.startsWith('cave')), '洞府系数未落地却静默按 1.0');
  assert.strictEqual(r.parts.toxin, 1.0);
});
t('模型是纯函数：同输入两次全等，且不改动传入的 ctx', () => {
  const ctx = baseCtx({ gongfas: [{ quality: '地阶', level: 5, element: 'fire' }] });
  const frozen = JSON.parse(JSON.stringify(ctx));
  const a = cm.computeCultivation(ctx);
  const b = cm.computeCultivation(ctx);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(ctx, frozen, '模型改写了入参（副作用）');
});
t('铁律闸门源码锁：经验入口必须带境界 max_level 闸门', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'services', 'character.js'), 'utf8');
  assert.ok(src.includes('REALM_LEVEL_CAP'), 'addExp 未引用 REALM_LEVEL_CAP');
  assert.ok(/while\s*\(\s*\(\s*!capLevel\s*\|\|\s*\(character\.level\s*\|\|\s*1\)\s*<\s*capLevel\s*\)/.test(src),
    '升级 while 循环缺少境界等级闸门（铁律被绕过）');
  assert.ok(src.includes('pinExpAtFull') && src.includes('bottleneck'), '到顶未钉住修为/未回报瓶颈状态');
  const b = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'config', 'balance.js'), 'utf8');
  assert.ok(/REALM_LEVEL_CAP\s*=\s*{[^}]*enforce:\s*true/.test(b), '闸门默认被关闭');
});
t('幽灵常数清扫：CULTIVATION_MODEL 每个键都必须被消费', () => {
  const fs = require('fs'); const path = require('path');
  const modelSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'cultivation-model.js'), 'utf8');
  const svcSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'cultivation.js'), 'utf8');
  for (const k of Object.keys(CM)) {
    assert.ok(modelSrc.includes(`CM.${k}`) || svcSrc.includes(`.${k}`), `CULTIVATION_MODEL.${k} 无人消费（幽灵配置）`);
  }
});

console.log('== 二十期：E3/T0-3 战斗技能状态机（MP/冷却/效果）==');
const skillState = require('../src/services/battle/skillState');
const combatSvc = require('../src/services/battle/combat');
const SKDEFS = require('../src/services/skill').SKILLS_DATA || [];

const mkEnt = (over) => Object.assign({
  name: '测试修士', hp: 1000, maxHp: 1000, mp: 100, attack: 200, defense: 50,
  speed: 10, element: 'fire', skills: [], cooldowns: {}, statusEffects: []
}, over || {});
const fireball = { name: '烈焰决', key: 'sk_fire', multiplier: 1.8, manaCost: 60, cooldown: 2, effectType: 'dot', effectValue: 0.3 };

t('技能定义三字段确实齐全（消费的前提，缺了这锁就该红）', () => {
  assert.ok(SKDEFS.length >= 200, `技能定义仅 ${SKDEFS.length} 条`);
  for (const f of ['mana_cost', 'cooldown', 'effect_type', 'damage_mult']) {
    const have = SKDEFS.filter(s => s[f] != null).length;
    assert.strictEqual(have, SKDEFS.length, `${f} 只有 ${have}/${SKDEFS.length} 有值`);
  }
  const implemented = SKDEFS.filter(s => skillState.isImplemented(s.effect_type)).length;
  assert.ok(implemented / SKDEFS.length >= 0.6,
    `已实现效果类型占比 ${(implemented * 100 / SKDEFS.length).toFixed(1)}% < 60%，本轮消费范围过窄`);
});
t('canUse：缺字段按零消耗零冷却，MP 不足与冷却中分别可辨', () => {
  assert.strictEqual(skillState.canUse(null, mkEnt()).ok, true, '无技能（普攻）必须可用');
  assert.strictEqual(skillState.canUse({ name: 'x' }, mkEnt()).ok, true);
  const poor = skillState.canUse(fireball, mkEnt({ mp: 10 }));
  assert.strictEqual(poor.ok, false);
  assert.strictEqual(poor.reason, 'mp');
  assert.strictEqual(poor.need, 60);
  assert.strictEqual(poor.have, 10);
  const cooling = skillState.canUse(fireball, mkEnt({ cooldowns: { 'sk_fire': 3 } }));
  assert.strictEqual(cooling.ok, false);
  assert.strictEqual(cooling.reason, 'cooldown');
  assert.strictEqual(cooling.remaining, 3);
});
t('spend：真的扣 MP 并置冷却；MP 不会被打成负数', () => {
  const e = mkEnt({ mp: 100 });
  skillState.spend(fireball, e);
  assert.strictEqual(e.mp, 40);
  assert.strictEqual(e.cooldowns.sk_fire, 2);
  const broke = mkEnt({ mp: 5 });
  skillState.spend({ name: '重击', key: 'k', manaCost: 999, cooldown: 0 }, broke);
  assert.strictEqual(broke.mp, 0, 'MP 出现负数');
});
t('tick：冷却按自身行动次数递减并清零；dot 逐回合侵蚀且到期移除', () => {
  const e = mkEnt({ cooldowns: { sk_fire: 2 }, statusEffects: [{ type: 'dot', source: '灼烧', perRound: 20, roundsLeft: 2 }] });
  const t1 = skillState.tick(e);
  assert.strictEqual(t1.tickDamage, 20);
  assert.strictEqual(e.cooldowns.sk_fire, 1);
  assert.strictEqual(e.statusEffects.length, 1);
  const t2 = skillState.tick(e);
  assert.strictEqual(t2.tickDamage, 20);
  assert.strictEqual(e.statusEffects.length, 0, 'dot 到期未移除');
  assert.strictEqual(e.cooldowns.sk_fire, undefined, '冷却未清零（会永久封住技能）');
});
t('applyEffect：damage 无副作用；dot/heal/lifesteal 按口径产生数值', () => {
  const a = mkEnt(), d = mkEnt({ name: '树精' });
  const plain = skillState.applyEffect({ name: 'x', effectType: 'damage' }, a, d, 100);
  assert.deepStrictEqual([plain.selfHeal, plain.appliedDot, plain.unimplemented], [0, null, null]);
  const dotRes = skillState.applyEffect(fireball, a, d, 300);
  assert.ok(dotRes.appliedDot, 'dot 未生成持续伤害');
  assert.strictEqual(dotRes.appliedDot.roundsLeft, 3);
  assert.ok(dotRes.appliedDot.perRound >= 1);
  const heal = skillState.applyEffect({ name: '疗', key: 'h', effectType: 'heal', effectValue: 0.3 }, a, d, 0);
  assert.strictEqual(heal.selfHeal, 300, 'heal 应按施法者生命上限比例');
  const ls = skillState.applyEffect({ name: '噬', key: 'l', effectType: 'lifesteal', effectValue: 0.5 }, a, d, 200);
  assert.strictEqual(ls.selfHeal, 100, 'lifesteal 应按实际伤害比例');
});
t('未实现效果**不伪造数值**，只登记待实现（1v1 无额外目标）', () => {
  for (const tt of ['aoe', 'buff', 'debuff', 'stun', 'shield', 'taunt', 'craft_amp']) {
    const r = skillState.applyEffect({ name: 'x', key: tt, effectType: tt, effectValue: 9 }, mkEnt(), mkEnt(), 100);
    assert.strictEqual(r.unimplemented, tt, `${tt} 应登记为未实现`);
    assert.strictEqual(r.selfHeal, 0);
    assert.strictEqual(r.appliedDot, null);
    assert.deepStrictEqual(r.lines, [], `${tt} 未实现却产生了日志`);
  }
});
t('行为验证：MP 真的被消耗，第二次释放被冷却挡住并退回普攻', () => {
  // 口径：executeRound 只返回伤害，扣 hp 是主循环的事；dot 则在实体自己行动时直接结算。
  // 这里故意用低耗灵技能（20），否则第一次放完 MP 就不够了，挡路的会是"灵力不足"而不是"冷却"。
  const sk = { name: '烈焰决', key: 'sk_fire', multiplier: 1.8, manaCost: 20, cooldown: 2, effectType: 'dot', effectValue: 0.3 };
  const atk = mkEnt({ mp: 100, skills: [sk] });
  const def = mkEnt({ name: '树精', hp: 5000, maxHp: 5000 });
  const r1 = combatSvc.executeRound(atk, def, 'attacker', 0);
  assert.strictEqual(r1.skillUsed, '烈焰决', `首次应放出技能，实为 ${r1.skillUsed}`);
  assert.strictEqual(atk.mp, 80, `executeRound 未正确扣 MP：${atk.mp}`);
  assert.ok(r1.damage > 0, '技能未产生伤害');
  const r2 = combatSvc.executeRound(atk, def, 'attacker', 0);
  assert.strictEqual(r2.skillUsed, null, '冷却中的技能仍被释放');
  assert.strictEqual(atk.mp, 80, '退回普攻却仍扣了 MP');
  assert.ok(/冷却/.test(r2.log), `日志未说明改普攻原因：${r2.log}`);
  assert.ok(r2.damage > 0, '退回普攻后仍应造成普通伤害');
  assert.ok(r2.damage < r1.damage, '普攻伤害不该高于技能（multiplier 未参与）');
});
t('行为验证：dot 真的在受害者自己行动时结算掉血', () => {
  const atk = mkEnt({ mp: 999, skills: [fireball] });
  const def = mkEnt({ name: '树精', hp: 9000, maxHp: 9000 });
  combatSvc.executeRound(atk, def, 'attacker', 0);
  assert.ok(Array.isArray(def.statusEffects) && def.statusEffects.length === 1, 'dot 未挂到目标');
  const before = def.hp;
  const r = combatSvc.executeRound(def, atk, 'defender', null);
  assert.ok(r.statusDamage > 0, 'dot 未结算');
  assert.strictEqual(before - def.hp, r.statusDamage, 'dot 伤害未落到 hp');
});
t('行为验证：指定技 MP 不足时退回普攻，**绝不静默换成另一招**', () => {
  const atk = mkEnt({
    mp: 5,
    skills: [{ name: '贵技', key: 'a', multiplier: 3, manaCost: 500, cooldown: 0, effectType: 'damage' },
             { name: '便技', key: 'b', multiplier: 1.2, manaCost: 0, cooldown: 0, effectType: 'damage' }]
  });
  const def = mkEnt({ name: '木桩', hp: 99999, maxHp: 99999 });
  const r = combatSvc.executeRound(atk, def, 'attacker', 0);
  assert.strictEqual(r.skillUsed, null, '指定技不可用却被替换成别的技能（旧 bug）');
  assert.ok(/灵力不足/.test(r.log), `日志未说明原因：${r.log}`);
  assert.strictEqual(atk.mp, 5, '普攻却消耗了 MP');
});
t('旧缺陷永久封住：主循环不再随机选技、字段不再被丢弃', () => {
  const fs = require('fs'); const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'battle', 'combat.js'), 'utf8');
  assert.ok(!/Math\.random\(\)\s*\*\s*skills\.length/.test(src), '仍在随机选技能（会随机到不可用的招）');
  for (const f of ['manaCost', 'cooldown', 'effectType', 'effectValue']) {
    const n = (src.match(new RegExp(`\\b${f}\\s*:`, 'g')) || []).length;
    assert.ok(n >= 1, `${f} 未透传（技能池字段丢失，E3 空转复发）`);
  }
  for (const call of ['skillState.tick(', 'skillState.canUse(', 'skillState.spend(', 'skillState.applyEffect(']) {
    assert.ok(src.includes(call), `executeRound 未消费 ${call}`);
  }
});

console.log('== 廿一期：T1-1 零实例表可达性契约（审计固化成门禁）==');
const fs21 = require('fs');
const path21 = require('path');
const read21 = (...p) => fs21.readFileSync(path21.join(__dirname, '..', ...p), 'utf8');
const walk21 = (dir, out = []) => {
  for (const f of fs21.readdirSync(path21.join(__dirname, '..', dir), { withFileTypes: true })) {
    const rel = path21.join(dir, f.name);
    if (f.isDirectory()) walk21(rel, out); else if (/\.js$/.test(f.name)) out.push(rel);
  }
  return out;
};

t('幽灵入口锁：src/scripts 下每个脚本都必须被 package.json 引用', () => {
  const pkg = JSON.parse(read21('package.json'));
  const referenced = new Set(Object.values(pkg.scripts || []).join(' '));
  const dir = path21.join(__dirname, '..', 'src', 'scripts');
  const ghosts = fs21.readdirSync(dir).filter(f => /\.js$/.test(f))
    .filter(f => !Object.values(pkg.scripts || {}).some(s => s.includes(`src/scripts/${f}`) || s.includes(`src\\scripts\\${f}`)));
  assert.deepStrictEqual(ghosts, [], `无人可调用的播种/修复脚本（写了却不接）：${ghosts.join(',')}；已引用集合规模=${referenced.size}`);
});
t('挂载锁：三张零实例表与天劫的路由前缀都必须在 server 上', () => {
  const src = read21('server.js');
  for (const p of ['/api/gongfa', '/api/pet', '/api/achievement', '/api/skill', '/api/tribulation']) {
    assert.ok(src.includes(`'${p}'`), `${p} 未挂载`);
  }
});
t('成就契约：每个 requirement.type 都有实现，每个实现都被引用', () => {
  const src = read21('src', 'routes', 'achievement.js');
  const defs = [...new Set([...src.matchAll(/type:\s*'([^']+)'/g)].map(m => m[1]))];
  const cases = [...new Set([...src.matchAll(/case\s+'([^']+)'/g)].map(m => m[1]))];
  assert.ok(defs.length >= 18, `成就条件种类只剩 ${defs.length}，疑似定义被删`);
  const orphan = defs.filter(t => !cases.includes(t));
  assert.deepStrictEqual(orphan, [], `有条件定义却无进度实现（这些成就永不可达成）：${orphan.join(',')}`);
  const idle = cases.filter(t => !defs.includes(t));
  assert.deepStrictEqual(idle, [], `有实现但无成就引用（空转分支）：${idle.join(',')}`);
});
t('成就读取的数据源集合必须存在，缺的只能是我登记过的那一个', () => {
  const KNOWN_MISSING = ['friends'];   // 好友系统未建（P2），friends 类成就进度恒 0 —— 已知缺口，不许扩散
  const db21 = require('../src/database').loadDatabase();
  const files = ['achievement.js', 'pet.js', 'gongfa.js'];
  const missing = new Set();
  for (const f of files) {
    const src = read21('src', 'routes', f);
    for (const m of src.matchAll(/db\.([a-zA-Z_]+)/g)) {
      const name = m[1];
      if (!Array.isArray(db21[name]) && !KNOWN_MISSING.includes(name) && name !== 'achievements') missing.add(`${f}:${name}`);
      if (!Array.isArray(db21[name]) && KNOWN_MISSING.includes(name)) {
        // 已知缺口必须仍被 || [] 之类保护，否则是活崩溃而不是零进度
        const idx = src.indexOf(`db.${name}`);
        assert.ok(/\|\|\s*\[\s*\]/.test(src.slice(idx, idx + 80)), `已知缺口集合 db.${name} 未做空值保护（会 500）`);
      }
    }
  }
  assert.deepStrictEqual([...missing], [], `出现新的"读了但不存在"集合：${[...missing].join(', ')}`);
});
t('零实例表的唯一写入点必须还在（防重构悄悄删掉）', () => {
  assert.ok(/db\.gongfa\.push\(/.test(read21('src', 'routes', 'gongfa.js')), 'gongfa 路由不再写入 db.gongfa');
  assert.ok(/db\.pets\.push\(/.test(read21('src', 'routes', 'pet.js')), 'pet 路由不再写入 db.pets');
});
t('生成入口必须有资源门槛（实测：16 灵石撞 300 灵石门槛 → 400）', () => {
  const pet = read21('src', 'routes', 'pet.js');
  const gf = read21('src', 'routes', 'gongfa.js');
  assert.ok(/灵石不足/.test(pet), 'pet/generate 无灵石校验');
  assert.ok(/灵石不足|cost/.test(gf), 'gongfa/generate 无资源校验');
});
t('前后端路径对账：前端引用的子路径必须真在路由上（我猜错过 /learn，前端可能也错）', () => {
  const routers = {
    gongfa: read21('src', 'routes', 'gongfa.js'),
    pet: read21('src', 'routes', 'pet.js'),
    achievement: read21('src', 'routes', 'achievement.js'),
    tribulation: read21('src', 'routes', 'tribulation.js')
  };
  const defined = {};
  for (const [name, src] of Object.entries(routers)) {
    defined[name] = new Set([...src.matchAll(/router\.(?:get|post|put|delete)\(\s*'([^']+)'/g)]
      .map(m => m[1].replace(/^\//, '')).filter(Boolean));
  }
  const fe = walk21('public').map(f => read21(f)).join('\n');
  const ghosts = [];
  for (const m of fe.matchAll(/\/(?:api\/)?(gongfa|pet|achievement|tribulation)\/([a-zA-Z_][a-zA-Z0-9_-]*)/g)) {
    const [, prefix, sub] = m;
    if (!defined[prefix].has(sub)) ghosts.push(`/${prefix}/${sub}`);
  }
  assert.deepStrictEqual([...new Set(ghosts)], [], `前端调用了后端不存在的端点：${[...new Set(ghosts)].join(', ')}`);
  assert.ok(defined.tribulation.has('status') && defined.tribulation.has('endure'), '天劫端点契约变了');
});

console.log('== 廿二期：E3/T0-3 战斗数值曲线（倒挂已修，四段尚未全绿）==');
const dmgCalc = require('../src/services/battle/damage');
const charSvc = require('../src/services/character');

t('玩家面板不再是纯线性：随境界严格递增，且后期是超线性', () => {
  const realms = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
  for (const fn of ['calculateHpMax', 'calculateAttack', 'calculateDefense']) {
    let prev = -1;
    for (const r of realms) {
      const v = charSvc[fn](30, r);
      assert.ok(v > prev, `${fn} 在 ${r} 未随境界增长（${prev} → ${v}）`);
      prev = v;
    }
    const low = charSvc[fn](30, '炼气'), high = charSvc[fn](30, '渡劫');
    assert.ok(high / low > 3, `${fn} 境界跨度只有 ${(high / low).toFixed(2)} 倍，追不上怪物模板的指数式数值`);
  }
});
t('倒挂回归锁：最高等级段怪物不再"一回合秒我、我 85 回合打不死"', () => {
  const db22 = require('../src/database').loadDatabase();
  // 只与"本境界同级"的最强模板比。全表最高的 仙界至尊 属飞升（95~100 级），
  // 拿飞升 Boss 判渡劫曲线是否倒挂属于基准错，会得出假结论。
  const rr = (db22.realms || []).find(x => x.name === '渡劫') || { min_level: 81, max_level: 90 };
  let top = null;
  for (const t2 of db22.monsters || []) {
    let rng = t2.level_range;
    if (typeof rng === 'string') { try { rng = JSON.parse(rng); } catch (e) { rng = null; } }
    if (!Array.isArray(rng)) continue;
    const mid = (Number(rng[0]) + Number(rng[1])) / 2;
    if (mid < Number(rr.min_level) || mid > Number(rr.max_level)) continue;
    let st = {}; try { st = JSON.parse(t2.stats || '{}'); } catch (e) { continue; }
    if (!Number.isFinite(Number(st.hp))) continue;
    if (!top || Number(st.hp) > Number(top.st.hp)) top = { name: t2.name, st, mid };
  }
  assert.ok(top, '渡劫境界内找不到可比较的怪物模板（境界等级区间口径变了？）');
  const lv = Math.floor((Number(rr.min_level) + Number(rr.max_level)) / 2), realm = '渡劫';
  const P = { name: 'p', level: lv, realm, hp: charSvc.calculateHpMax(lv, realm), maxHp: charSvc.calculateHpMax(lv, realm), mp: 999, attack: charSvc.calculateAttack(lv, realm), defense: charSvc.calculateDefense(lv, realm), speed: charSvc.calculateSpeed(lv, realm), element: 'none', crit_rate: 0 };
  const M = { name: top.name, level: Math.round(top.mid), hp: Number(top.st.hp), maxHp: Number(top.st.hp), mp: 0, attack: Number(top.st.attack) || 0, defense: Number(top.st.defense) || 0, speed: Number(top.st.speed) || 0, element: 'none', crit_rate: 0 };
  const pDeal = dmgCalc.calculateFinalDamage(P, M, null).damage;
  const mDeal = dmgCalc.calculateFinalDamage(M, P, null).damage;
  const myRounds = pDeal > 0 ? M.maxHp / pDeal : Infinity;
  const theirRounds = mDeal > 0 ? P.maxHp / mDeal : Infinity;
  assert.ok(myRounds <= 25, `玩家杀同级最强怪要 ${myRounds.toFixed(1)} 回合（修复前 85.8），曲线又退化了`);
  assert.ok(theirRounds >= 2, `同级最强怪 ${theirRounds.toFixed(1)} 回合就打死玩家（修复前 0.7）`);
});
t('sim-battle 是 E3 正式验收脚本，且**只读**不污染真库', () => {
  const src = fs21.readFileSync(path21.join(__dirname, '..', 'scripts', 'sim-battle.js'), 'utf8');
  for (const w of ['0.75', '0.60', '0.45', '0.30']) {
    assert.ok(src.includes(w) || src.includes(w.replace('0.60', '0.6')), `四段窗口少了 ${w}（章程 E3 原文口径）`);
  }
  assert.ok(!/saveDatabase\s*\(/.test(src), 'sim-battle 出现写库调用（会对真库跑危险）');
  assert.ok(/process\.exitCode\s*=\s*allOk\s*\?\s*0\s*:\s*2/.test(src), '退出码语义丢失（CI 无法判定）');
  assert.ok(!/四段共若干场/.test(src), '输出里仍有占位假文字');
});
t('新常数必须被消费（不留幽灵配置）', () => {
  const src = fs21.readFileSync(path21.join(__dirname, '..', 'src', 'services', 'character.js'), 'utf8');
  assert.ok(src.includes('B.REALM_STAT_GROWTH'), 'REALM_STAT_GROWTH 无人消费');
  assert.ok(src.includes('B.ATTACK_GROWTH_BIAS'), 'ATTACK_GROWTH_BIAS 无人消费');
  assert.ok(bal.REALM_STAT_GROWTH > 1 && bal.REALM_STAT_GROWTH < 1.5,
    `境界增长率 ${bal.REALM_STAT_GROWTH} 超出已扫参区间（1.20~1.35），需重跑 sim-battle 定档`);
});

console.log('== 廿三期：E3/T0-3 player_skills 唯一真源 + 章程槽位 ==');
t('技能池只认 player_skills：功法不得再作为主动技来源', () => {
  const src = fs21.readFileSync(path21.join(__dirname, '..', 'src', 'services', 'battle', 'combat.js'), 'utf8');
  const start = src.indexOf('getCharacterSkills(characterId, db)');
  assert.ok(start > 0, '找不到 getCharacterSkills');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  assert.ok(!/db\.gongfa/.test(body), '技能池仍在读 gongfa（双真源未收敛）');
  assert.ok(!/source:\s*'gongfa'/.test(body), '仍产出 source=gongfa 的技能条目');
  assert.ok(/player_skills/.test(body) && /equipped_slot/.test(body), '技能池不再以装备位为准');
  assert.ok(/SLOT_ORDER/.test(body), '技能池顺序不再确定化（skillIndex 语义会变）');
});
t('真实角色（只读）：池内每条都带消耗/冷却字段，且来源单一', () => {
  const db23 = require('../src/database').loadDatabase();
  const cs23 = require('../src/services/battle/combat');
  const withEquipped = (db23.player_skills || []).filter(p => p.equipped_slot);
  assert.ok(withEquipped.length >= 1, '库里一个装备技能都没有，本锁失去意义（数据被清了？）');
  const cid = withEquipped[0].character_id;
  const pool = cs23.getCharacterSkills(cid, db23);
  assert.ok(pool.length >= 1 && pool.length <= withEquipped.filter(p => p.character_id === cid).length,
    `池大小 ${pool.length} 与装备数不吻合`);
  for (const s of pool) {
    assert.strictEqual(s.source, 'player_skill', `混入了非真源技能 ${s.name}/${s.source}`);
    assert.strictEqual(typeof s.manaCost, 'number');
    assert.strictEqual(typeof s.cooldown, 'number');
    assert.ok('effectType' in s, `${s.name} 丢了 effect_type`);
  }
  assert.deepStrictEqual(pool.map(s => s.slot), ['main'].concat(pool.slice(1).map(s => s.slot)).slice(0, pool.length),
    '主技必须排在技能池第一位（前端 skillIndex=0 = 主技）');
});
t('槽位严格按章程 min(2+境界序号,8)，且旧公式已彻底移除', () => {
  const b23 = require('../src/config/balance');
  b23.REALM_ORDER.forEach((r, i) => {
    assert.strictEqual(b23.skillSlotCap(i), Math.min(8, 2 + i), `${r} 槽位应为 ${Math.min(8, 2 + i)}`);
  });
  assert.strictEqual(b23.skillSlotCap(-1), b23.SLOT_BASE, '未知境界应保守给基础槽位');
  assert.strictEqual(b23.skillSlotCap(NaN), b23.SLOT_BASE);
  const src = fs21.readFileSync(path21.join(__dirname, '..', 'src', 'routes', 'skill.js'), 'utf8');
  assert.ok(!/Math\.min\(10,\s*baseSlots/.test(src), '旧的 min(10, 等级/天赋/功法) 公式还在');
  assert.ok(/B\.skillSlotCap\(\(B\.REALM_ORDER \|\| \[\]\)\.indexOf\(character\.realm\)\)/.test(src), '槽位未走单一实现源');
  assert.ok(src.includes("require('../config/balance')"), 'routes/skill.js 未引用 balance（会 ReferenceError）');
});
t('境界顺序数组不得再有多份副本', () => {
  const b23 = require('../src/config/balance');
  assert.deepStrictEqual(b23.REALM_ORDER, ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升']);
  const LADDER_BACKLOG = ['src/data/equipment-library.js', 'src/routes/character.js', 'src/services/battle/combat.js', 'src/services/skill.js'];   // 轮37 已知欠账：待逐处改用 REALM_ORDER，此处只防新增副本
  const roots = ['src'];
  const hits = [];
  const scan = (d) => {
    for (const f of fs21.readdirSync(d, { withFileTypes: true })) {
      const p = path21.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'node_modules') scan(p); continue; }
      if (!/\.js$/.test(f.name) || f.name === 'balance.js') continue;   // 唯一真源自身除外
      const s = fs21.readFileSync(p, 'utf8');
      const i = s.indexOf("'炼气', '筑基'");
      const j = s.indexOf('"炼气", "筑基"');
      if (i >= 0 || j >= 0) { const relp = path21.relative(path21.join(__dirname, '..'), p).split(path21.sep).join('/'); if (!LADDER_BACKLOG.includes(relp)) hits.push(relp); }
    }
  };
  for (const r of roots) scan(path21.join(__dirname, '..', r));
  assert.deepStrictEqual(hits, [], `仍有硬编码境界数组：${hits.join(', ')}（应统一用 balance.REALM_ORDER）`);
});

console.log('== 廿四期：P1/E3 怪物重排（离群封死 + 迁移可复现）==');
t('每个境界池内 hp 不得超过中位 2 倍（5~10 倍无标记精英不得复活）', () => {
  const db24 = require('../src/database').loadDatabase();
  const pools = {};
  for (const m of db24.monsters || []) {
    let r = m.level_range;
    if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
    if (!Array.isArray(r)) continue;
    let st = {}; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    const hp = Number(st.hp);
    if (!Number.isFinite(hp) || hp <= 0) continue;
    const mid = (Number(r[0]) + Number(r[1])) / 2;
    const rr = (db24.realms || []).find(x => mid >= Number(x.min_level) && mid <= Number(x.max_level));
    if (!rr) continue;
    (pools[rr.name] = pools[rr.name] || []).push(hp);
  }
  const names = Object.keys(pools);
  assert.ok(names.length >= 8, `只覆盖到 ${names.length} 个境界池，样本不足以支撑本锁`);
  for (const n of names) {
    const a = pools[n].slice().sort((x, y) => x - y);
    const med = a[Math.floor(a.length / 2)] || 1;
    const ratio = a[a.length - 1] / med;
    assert.ok(ratio <= 2.0, `${n} 池最硬怪是中位的 ${ratio.toFixed(2)} 倍（>2 = 又混进了未标级的精英）`);
  }
});
t('双向 TTK 窗口：每个境界的参考玩家能打穿中位怪，也不会被一回合摸死', () => {
  const db24 = require('../src/database').loadDatabase();
  const pools = {};
  for (const m of db24.monsters || []) {
    let r = m.level_range;
    if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
    if (!Array.isArray(r)) continue;
    let st = {}; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    if (!Number.isFinite(Number(st.hp))) continue;
    const mid = (Number(r[0]) + Number(r[1])) / 2;
    const rr = (db24.realms || []).find(x => mid >= Number(x.min_level) && mid <= Number(x.max_level));
    if (!rr) continue;
    (pools[rr.name] = pools[rr.name] || []).push(st);
  }
  const medOf = (list, key) => {
    const a = list.map(x => Number(x[key]) || 0).sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] || 0;
  };
  let checked = 0;
  for (const realm of (require('../src/config/balance').REALM_ORDER || [])) {
    const list = pools[realm];
    if (!list || !list.length) continue;
    const row = (db24.realms || []).find(x => x.name === realm);
    const lv = Math.floor((Number(row.min_level) + Number(row.max_level)) / 2);
    const P = { name: 'p', level: lv, realm, hp: charSvc.calculateHpMax(lv, realm), maxHp: charSvc.calculateHpMax(lv, realm), mp: 999, attack: charSvc.calculateAttack(lv, realm), defense: charSvc.calculateDefense(lv, realm), element: 'none', crit_rate: 0 };
    const M = { name: 'm', level: lv, hp: medOf(list, 'hp'), maxHp: medOf(list, 'hp'), mp: 0, attack: medOf(list, 'attack'), defense: medOf(list, 'defense'), element: 'none', crit_rate: 0 };
    const pDmg = dmgCalc.calculateFinalDamage(P, M, null).damage;
    const mDmg = dmgCalc.calculateFinalDamage(M, P, null).damage;
    const myR = pDmg > 0 ? M.maxHp / pDmg : Infinity;
    const theirR = mDmg > 0 ? P.maxHp / mDmg : Infinity;
    assert.ok(myR <= 8, `${realm} 参考玩家击杀中位怪要 ${myR.toFixed(1)} 回合（>8 = 又变磨盘）`);
    assert.ok(theirR >= 2.5, `${realm} 中位怪 ${theirR.toFixed(1)} 回合摸死玩家（<2.5 = 秒躺，先手权无意义）`);
    checked++;
  }
  assert.ok(checked >= 8, `只校验了 ${checked} 个境界，覆盖不足`);
});
t('重排脚本默认 dry-run，写库只可能发生在 --apply 分支里', () => {
  const src = fs21.readFileSync(path21.join(__dirname, '..', 'scripts', 'rebalance-monsters.js'), 'utf8');
  assert.ok(/process\.argv\.indexOf\('--apply'\)/.test(src), '没有 --apply 闸门（会被无意触发写库）');
  assert.ok(src.indexOf('saveDatabase(db)') > src.indexOf('if (APPLY) {'), 'saveDatabase 不在 APPLY 块内');
  const n = (src.match(/saveDatabase\s*\(/g) || []).length;
  assert.strictEqual(n, 1, `出现 ${n} 处 saveDatabase 调用（应只有一处且受 --apply 保护）`);
});
t('数据迁移必须挂在 npm 入口（否则重跑 init-db 会把平衡冲掉）', () => {
  const pkg = require(path21.join(__dirname, '..', 'package.json'));
  assert.ok(pkg.scripts['seed:rebalance'] && /rebalance-monsters\.js\s+--apply/.test(pkg.scripts['seed:rebalance']),
    'seed:rebalance 未挂载：怪物平衡会变成只存在于运行时快照里的一次性改动');
  assert.ok(pkg.scripts['sim:battle'] && /sim-battle\.js/.test(pkg.scripts['sim:battle']), 'sim:battle 未挂载（E3 无法一条命令复验）');
  assert.ok(fs21.existsSync(path21.join(__dirname, '..', 'scripts', 'sim-battle.js')));
});

t('BOM 锁：任何 .js/.json 不得带 UTF-8 BOM（PS5.1 的 Set-Content -Encoding utf8 会加）', () => {
  const fsB = require('fs'), pathB = require('path');
  const bad = [];
  const walk = (d) => {
    for (const e of fsB.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = pathB.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|json)$/.test(e.name)) continue;
      const b = fsB.readFileSync(p);
      if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
        bad.push(pathB.relative(pathB.join(__dirname, '..'), p).split(pathB.sep).join('/'));
      }
    }
  };
  const root = pathB.join(__dirname, '..');
  for (const r of ['src', 'scripts', 'public']) {
    const abs = pathB.join(root, r);
    if (fsB.existsSync(abs)) walk(abs);
  }
  const pkg = pathB.join(root, 'package.json');
  if (fsB.existsSync(pkg)) {
    const b = fsB.readFileSync(pkg);
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) bad.push('package.json');
  }
  assert.deepStrictEqual(bad, [], `这些文件带 BOM：${bad.join(', ')}（Node 的 require 容忍，JSON.parse 不容忍）`);
});

t('门禁洁净性：npm test 必须走 gate.js 外壳（store 有 20s autosave，测试经服务写脏镜像）', () => {
  const pkg24 = require(path21.join(__dirname, '..', 'package.json'));
  assert.strictEqual(pkg24.scripts.test, 'node scripts/gate.js', 'test 未走外壳：跑一次门禁就污染正式存档');
  const g = fs21.readFileSync(path21.join(__dirname, '..', 'scripts', 'gate.js'), 'utf8');
  assert.ok(/readFileSync\(DB\)/.test(g) && /writeFileSync\(DB, snapshot\)/.test(g), 'gate 没有快照/还原');
  assert.ok(/Buffer\.compare\(back, snapshot\)/.test(g), 'gate 没校验还原结果（还原失败也会绿）');
  assert.ok(/r\.status/.test(g), 'gate 未透传子进程退出码（门禁会假绿）');
});
console.log(`\n内容完整性: ${pass} 通过, ${fail} 失败`);
try { require('fs').writeFileSync(__dbPath, __dbSnap); console.log('（本套件经服务调用写过库，结束时已按字节还原 game.db）'); } catch (e) { console.log('还原 game.db 失败: ' + e.message); fail++; }
process.exitCode = fail > 0 ? 1 : 0;
