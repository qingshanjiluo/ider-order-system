/**
 * 材料品阶分级 + 商店目录（内容富集二期）
 *
 * MATERIAL_CATALOG：采集材料五级分类（tier 1-5），标注 主材/辅材 角色与元素亲和。
 * TIER_EQUIP_CAP：主材 tier → 锻造产物装备品质上限（法器→道器）。
 * ensureAll(db)：幂等回填 db.items 的材料 grade 属性 + 补齐商店货架（含特殊灵石可用化）。
 */
const { getNextId } = require('../database');

const MATERIAL_CATALOG = {
  // ---- tier 1 凡材 ----
  '灵草':     { tier: 1, role: 'aux',  element: 'wood' },
  '清心草':   { tier: 1, role: 'aux',  element: 'wood' },
  '碎石':     { tier: 1, role: 'main', element: 'earth' },
  '粗铁矿':   { tier: 1, role: 'main', element: 'metal' },
  '木材':     { tier: 1, role: 'aux',  element: 'wood' },
  '聚灵草':   { tier: 1, role: 'aux',  element: 'wood' },
  // ---- tier 2 良材 ----
  '精铁矿':   { tier: 2, role: 'main', element: 'metal' },
  '五行草':   { tier: 2, role: 'aux',  element: 'earth' },
  '玄铁矿':   { tier: 2, role: 'main', element: 'metal' },
  '雪莲':     { tier: 2, role: 'aux',  element: 'water' },
  '妖兽内丹': { tier: 2, role: 'aux',  element: 'none' },
  // ---- tier 3 珍材 ----
  '火焰结晶': { tier: 3, role: 'main', element: 'fire' },
  '寒冰结晶': { tier: 3, role: 'main', element: 'water' },
  '雷电结晶': { tier: 3, role: 'main', element: 'metal' },
  '风灵结晶': { tier: 3, role: 'main', element: 'wood' },
  '大地结晶': { tier: 3, role: 'main', element: 'earth' },
  '龙血矿':   { tier: 3, role: 'main', element: 'fire' },
  '冰晶矿':   { tier: 3, role: 'main', element: 'water' },
  '星辰矿':   { tier: 3, role: 'main', element: 'metal' },
  '火灵草':   { tier: 3, role: 'aux',  element: 'fire' },
  '雷灵草':   { tier: 3, role: 'aux',  element: 'metal' },
  '雷霆结晶': { tier: 3, role: 'main', element: 'metal' },
  // ---- tier 4 奇材 ----
  '天外陨铁': { tier: 4, role: 'main', element: 'metal' },
  '万年血参': { tier: 4, role: 'aux',  element: 'wood' },
  '九转灵芝': { tier: 4, role: 'aux',  element: 'wood' },
  '天雷木':   { tier: 4, role: 'main', element: 'metal' },
  '地心火种': { tier: 4, role: 'main', element: 'fire' },
  '灵泉水':   { tier: 4, role: 'aux',  element: 'water' },
  '龙涎香':   { tier: 4, role: 'aux',  element: 'water' },
  '五行结晶': { tier: 4, role: 'main', element: 'earth' },
  '暗影结晶': { tier: 4, role: 'main', element: 'dark' },
  '光明结晶': { tier: 4, role: 'main', element: 'light' },
  // ---- tier 5 仙材 ----
  '混沌矿':   { tier: 5, role: 'main', element: 'none' },
  '混沌结晶': { tier: 5, role: 'main', element: 'none' },
  '仙晶矿':   { tier: 5, role: 'main', element: 'light' },
  '仙灵草':   { tier: 5, role: 'aux',  element: 'light' },
  '仙灵结晶': { tier: 5, role: 'main', element: 'light' },
  '仙兽内丹': { tier: 5, role: 'aux',  element: 'none' },
  '远古妖丹': { tier: 5, role: 'aux',  element: 'dark' },
  // ---- 内容富集四期：灵植/液体/火焰/土石 细分品类 ----
  '龙须草':   { tier: 3, role: 'aux',  element: 'wood' },
  '紫猴花':   { tier: 3, role: 'aux',  element: 'wood' },
  '玉髓芝':   { tier: 4, role: 'aux',  element: 'wood' },
  '万年寒潭水': { tier: 4, role: 'aux', element: 'water' },
  '地髓乳':   { tier: 5, role: 'aux',  element: 'earth' },
  '赤焰髓':   { tier: 4, role: 'main', element: 'fire' },
  '离火精':   { tier: 5, role: 'main', element: 'fire' },
  '太阴玄冰': { tier: 4, role: 'main', element: 'water' },
  '五色土':   { tier: 3, role: 'aux',  element: 'earth' },
  '星陨砂':   { tier: 4, role: 'main', element: 'metal' },
  '混沌土':   { tier: 5, role: 'aux',  element: 'none' },
  '朱砂':     { tier: 3, role: 'aux',  element: 'fire' }
};

// 新材料入图（采集可玩性）：材料 → 适合地图名（幂等追加 gather_nodes）
const MAP_GATHER_ADDITIONS = {
  '龙须草':   ['翠竹林', '妖兽森林'],
  '紫猴花':   ['翠竹林', '青云山'],
  '玉髓芝':   ['神兽平原', '天界花园'],
  '万年寒潭水': ['寒冰谷', '冰火两重天'],
  '地髓乳':   ['混沌海', '时空裂缝'],
  '赤焰髓':   ['火焰山', '龙巢'],
  '离火精':   ['龙巢', '冰火两重天'],
  '太阴玄冰': ['寒冰谷', '幽冥地府'],
  '五色土':   ['沙漠遗迹', '神兽平原'],
  '星陨砂':   ['沙漠遗迹', '雷霆峰'],
  '混沌土':   ['混沌海', '魔道深渊'],
  '朱砂':     ['沙漠遗迹', '幽冥地府']
};

function ensureMapNodes(db) {
  let changed = 0;
  for (const map of db.maps || []) {
    if (!Array.isArray(map.gather_nodes)) continue;
    for (const [matName, mapNames] of Object.entries(MAP_GATHER_ADDITIONS)) {
      if (mapNames.includes(map.name) && !map.gather_nodes.includes(matName)) {
        map.gather_nodes.push(matName);
        changed++;
      }
    }
  }
  return changed;
}

/** 主材 tier → 锻造产物品质上限 */
const TIER_EQUIP_CAP = {
  1: '法器',
  2: '灵器',
  3: '法宝',
  4: '古宝',
  5: '道器'
};

const TIER_NAMES = { 1: '凡材', 2: '良材', 3: '珍材', 4: '奇材', 5: '仙材' };
const TIER_QUALITY = { 1: '凡品', 2: '灵品', 3: '宝品', 4: '仙品', 5: '道品' };
const TIER_PRICE = { 1: 20, 2: 80, 3: 300, 4: 1200, 5: 5000 };

function gradeOf(item) {
  if (!item || item.type !== '材料') return null;
  try {
    const st = JSON.parse(item.stats || '{}');
    if (st.tier) return st;
  } catch { /* 忽略 */ }
  const def = MATERIAL_CATALOG[item.name];
  if (!def) return null;
  return { ...def };
}

/** 目录中的材料若尚未入库则创建（修复：新增材料只进目录未入库，导致引用它的图纸无法学习） */
function ensureMaterialItems(db) {
  if (!db.items) db.items = [];
  let created = 0;
  for (const [name, def] of Object.entries(MATERIAL_CATALOG)) {
    if (db.items.find(i => i.name === name)) continue;
    const id = getNextId('items');
    db.items.push({
      id,
      name,
      type: '材料',
      quality: TIER_QUALITY[def.tier],
      stats: JSON.stringify({ tier: def.tier, role: def.role, element: def.element, grade_name: TIER_NAMES[def.tier] }),
      description: `${TIER_NAMES[def.tier]}·${def.role === 'main' ? '主材' : '辅材'}（${def.element}系）`
    });
    created++;
  }
  return created;
}

function ensureMaterialGrades(db) {
  let changed = 0;
  for (const item of db.items || []) {
    if (item.type !== '材料') continue;
    let st = {};
    try { st = JSON.parse(item.stats || '{}'); } catch { st = {}; }
    if (st.tier) continue; // 已分级
    const def = MATERIAL_CATALOG[item.name];
    if (!def) continue;
    st.tier = def.tier;
    st.role = def.role;
    st.element = st.element || def.element;
    st.grade_name = TIER_NAMES[def.tier];
    item.stats = JSON.stringify(st);
    changed++;
  }
  return changed;
}

// ---------- 商店目录（丹药/材料包/特殊灵石/凭证） ----------
const SHOP_CATALOG = [
  { name: '回气丹',   type: '丹药',   quality: '凡品', price: 50,     stats: { effect_type: 'mp', effect_value: 50 },  desc: '恢复50点灵力' },
  { name: '培元丹',   type: '丹药',   quality: '凡品', price: 120,    stats: { effect_type: 'hp', effect_value: 100 }, desc: '恢复100点气血' },
  { name: '疗伤丹',   type: '丹药',   quality: '灵品', price: 500,    stats: { effect_type: 'heal_all' },              desc: '清空全部伤势（阶段5 疗伤丹）' },
  { name: '血石',     type: '特殊灵石', quality: '灵品', price: 2000,  stats: {}, desc: '魔教秘石，使用后修炼效率-30%（24游戏小时）' },
  { name: '五行灵石', type: '特殊灵石', quality: '仙品', price: 50000, stats: {}, desc: '五行俱全：3-5灵根增益，1-2灵根反噬' },
  { name: '造化灵石', type: '特殊灵石', quality: '宝品', price: 12000, stats: {}, desc: '使用有概率获得功法/物品/灵石机缘' },
  { name: '初级仙盟令', type: '凭证', quality: '凡品', price: 3000,  stats: {}, desc: '创建仙盟的稀缺凭证（亦可拍卖行流通）' },
  { name: '精铁包',   type: '材料', quality: '灵品', price: 800,    stats: { tier: 2, role: 'main', element: 'metal', bundle: 5 }, desc: '精铁矿×5（良材·主材）' },
  { name: '玄铁包',   type: '材料', quality: '灵品', price: 1500,   stats: { tier: 2, role: 'main', element: 'metal', bundle: 8 }, desc: '玄铁矿×8（良材·主材）' },
  // ---- 内容富集四期：进阶丹药 + 阵法（使用后走 buff 管线） ----
  { name: '淬体丹',   type: '丹药', quality: '灵品', price: 800,    stats: {}, desc: '淬炼体魄：防御提升15%（120分钟）' },
  { name: '凝神丹',   type: '丹药', quality: '灵品', price: 900,    stats: {}, desc: '凝神静气：修炼效率提升30%（120分钟）' },
  { name: '龙血丹',   type: '丹药', quality: '宝品', price: 2500,   stats: {}, desc: '龙血洗礼：攻击提升35%（60分钟）' },
  { name: '聚灵阵',   type: '阵法', quality: '灵品', price: 3000,   stats: {}, desc: '布下聚灵阵：修炼效率提升15%（480分钟）' },
  { name: '固元阵',   type: '阵法', quality: '灵品', price: 3200,   stats: {}, desc: '布下固元阵：防御提升15%（480分钟）' },
  { name: '破军杀阵', type: '阵法', quality: '宝品', price: 8000,   stats: {}, desc: '杀阵冲霄：攻击提升25%（240分钟）' },
  { name: '五行大阵', type: '阵法', quality: '仙品', price: 20000,  stats: {}, desc: '五行轮转：全属性提升10%（720分钟）' },
  // ---- 内容富集五期：符箓（成品可购可用；符方图纸入图纸库可学） ----
  { name: '烈火符', type: '符箓', quality: '灵品', price: 600, stats: {}, desc: '燃烧符纸：攻击提升20%（30分钟）' },
  { name: '寒冰符', type: '符箓', quality: '灵品', price: 600, stats: {}, desc: '寒气入体：速度提升20%（30分钟）' },
  { name: '护身符', type: '符箓', quality: '灵品', price: 700, stats: {}, desc: '金光护体：防御提升25%（30分钟）' },
  { name: '驱邪符', type: '符箓', quality: '宝品', price: 1500, stats: {}, desc: '百邪不侵：全属性提升5%（120分钟）' },
  // ---- 内容富集六期：灵兽捕捉/养成 ----
  { name: '驯兽符', type: '符箓', quality: '灵品', price: 1200, stats: {}, desc: '野外捕捉灵兽之用（各大地图遇兽投符）' },
  { name: '灵兽粮', type: '消耗品', quality: '凡品', price: 80,  stats: {}, desc: '喂养灵宠，提升其经验与等级' }
];

// ---------- 器方/符方图纸库（按名称引用分级材料，学习消耗材料） ----------
const BLUEPRINT_CATALOG = [
  { name: '青锋剑图纸', type: 'crafting', quality: '凡品', materials: [{ name: '粗铁矿', quantity: 5 }, { name: '木材', quantity: 2 }], desc: '入门剑器，法器品质' },
  { name: '玄铁重剑图纸', type: 'crafting', quality: '灵品', materials: [{ name: '玄铁矿', quantity: 8 }, { name: '精铁矿', quantity: 4 }], desc: '重剑无锋，灵器品质' },
  { name: '寒冰法杖图纸', type: 'crafting', quality: '灵品', materials: [{ name: '寒冰结晶', quantity: 4 }, { name: '冰晶矿', quantity: 6 }], desc: '寒气凝杖，法修所爱' },
  { name: '炎鳞甲图纸', type: 'crafting', quality: '宝品', materials: [{ name: '龙血矿', quantity: 5 }, { name: '火焰结晶', quantity: 4 }], desc: '火龙鳞甲，宝器品质' },
  { name: '山岳重盾图纸', type: 'crafting', quality: '宝品', materials: [{ name: '五色土', quantity: 6 }, { name: '星辰矿', quantity: 4 }], desc: '厚重如山，护体大盾' },
  { name: '星陨剑图纸', type: 'crafting', quality: '宝品', materials: [{ name: '星陨砂', quantity: 6 }, { name: '天外陨铁', quantity: 3 }], desc: '星陨铸剑，锋芒毕露' },
  { name: '混沌灵甲图纸', type: 'crafting', quality: '仙品', materials: [{ name: '混沌矿', quantity: 6 }, { name: '混沌结晶', quantity: 4 }], desc: '混沌之气织甲，仙器品质' },
  { name: '太阳神弓图纸', type: 'crafting', quality: '仙品', materials: [{ name: '离火精', quantity: 4 }, { name: '仙晶矿', quantity: 4 }], desc: '射日之弓，一击焚天' },
  { name: '烈火符方', type: 'talisman', quality: '灵品', materials: [{ name: '赤焰髓', quantity: 2 }, { name: '灵草', quantity: 3 }], desc: '画烈火符之方' },
  { name: '寒冰符方', type: 'talisman', quality: '灵品', materials: [{ name: '太阴玄冰', quantity: 2 }, { name: '灵草', quantity: 3 }], desc: '画寒冰符之方' },
  { name: '护身符方', type: 'talisman', quality: '灵品', materials: [{ name: '五色土', quantity: 3 }, { name: '清心草', quantity: 3 }], desc: '画护身符之方' },
  { name: '驱邪符方', type: 'talisman', quality: '宝品', materials: [{ name: '朱砂', quantity: 3 }, { name: '紫猴花', quantity: 3 }], desc: '画驱邪符之方' }
];

function ensureBlueprints(db) {
  let added = 0;
  if (!db.blueprints) db.blueprints = [];
  for (const def of BLUEPRINT_CATALOG) {
    if (db.blueprints.find(b => b.name === def.name)) continue;
    const id = db.blueprints.length ? Math.max(...db.blueprints.map(b => Number(b.id) || 0)) + 1 : 1;
    db.blueprints.push({ id, name: def.name, type: def.type, quality: def.quality, materials: def.materials, desc: def.desc });
    added++;
  }
  return added;
}

function ensureShopStock(db) {
  let changed = 0;
  if (!db.shop) db.shop = [];
  for (const def of SHOP_CATALOG) {
    let item = (db.items || []).find(i => i.name === def.name && i.type === def.type);
    if (!item) {
      const id = getNextId('items');
      db.items.push({ id, name: def.name, type: def.type, quality: def.quality, stats: JSON.stringify(def.stats || {}), description: def.desc });
      item = db.items.find(i => i.id === id);
      changed++;
    }
    if (!db.shop.find(s => s.item_id === item.id)) {
      db.shop.push({ id: getNextId('shop'), item_id: item.id, price: def.price, stock: 999, description: def.desc });
      changed++;
    }
  }
  return changed;
}

/** 装备图鉴入库（内容富集七期）：六部位八品阶 96 件，低阶上架坊市 */
function ensureEquipmentItems(db) {
  const { EQUIPMENT_LIBRARY, EQUIPMENT_SHOP } = require('../data/equipment-library');
  if (!db.items) db.items = [];
  if (!db.shop) db.shop = [];
  let changed = 0;
  for (const def of EQUIPMENT_LIBRARY) {
    let item = db.items.find(i => i.name === def.name);
    if (!item) {
      const id = getNextId('items');
      db.items.push({
        id, name: def.name, type: '装备', subtype: def.subtype, quality: def.quality,
        realm: def.realm, stats: JSON.stringify(def.stats), description: def.desc
      });
      item = db.items.find(i => i.id === id);
      changed++;
    }
    const price = EQUIPMENT_SHOP[def.quality];
    if (price && !db.shop.find(s => s.item_id === item.id)) {
      db.shop.push({ id: getNextId('shop'), item_id: item.id, price, stock: 999, description: def.desc });
      changed++;
    }
  }
  return changed;
}

/** 丹药图鉴入库（内容富集八期）：五品阶 23 种，凡品/灵品上架坊市 */
function ensurePills(db) {
  const { PILLS, PILL_SHOP_QUALITIES } = require('../data/pill-library');
  if (!db.items) db.items = [];
  if (!db.shop) db.shop = [];
  let changed = 0;
  for (const def of PILLS) {
    let item = db.items.find(i => i.name === def.name && i.type === '丹药');
    if (!item) {
      const id = getNextId('items');
      db.items.push({
        id, name: def.name, type: '丹药', quality: def.quality,
        stats: JSON.stringify({ category: def.category, buff: def.buff }), description: def.desc
      });
      item = db.items.find(i => i.id === id);
      changed++;
    }
    if (PILL_SHOP_QUALITIES.includes(def.quality) && !db.shop.find(s => s.item_id === item.id)) {
      db.shop.push({ id: getNextId('shop'), item_id: item.id, price: def.price, stock: 999, description: def.desc });
      changed++;
    }
  }
  return changed;
}

function ensureAll(db) {
  const a0 = ensureMaterialItems(db);
  const a = ensureMaterialGrades(db);
  const b = ensureShopStock(db);
  const c = ensureMapNodes(db);
  const e = ensureBlueprints(db);
  const f = ensureEquipmentItems(db);
  const g = ensurePills(db);
  let du = 0;
  try { du = require('../data/dungeon-library').ensureDungeons(db); } catch { /* 副本库异常不阻断 */ }
  let hy = 0;
  try { hy = require('./data-hygiene').normalizeQualities(db); } catch { /* 卫生检查异常不阻断 */ }
  let m = 0;
  try { m = require('../data/monster-library').ensureMonsters(db); } catch { /* 怪物库异常不阻断 boot */ }
  let d = 0;
  try { const alchemy = require('../routes/alchemy'); if (alchemy.__ensureRecipes) { d = alchemy.__ensureRecipes(db) || 0; } } catch { /* alchemy 未就绪则跳过 */ }
  return { materialItems: a0, materialGrades: a, shopEntries: b, mapNodes: c, blueprints: e, equipment: f, pills: g, dungeons: du, hygiene: hy, monsters: m, recipes: d, changed: a0 + a + b + c + e + f + g + du + hy + m + d };
}

module.exports = { MATERIAL_CATALOG, TIER_EQUIP_CAP, TIER_NAMES, SHOP_CATALOG, MAP_GATHER_ADDITIONS, BLUEPRINT_CATALOG, gradeOf, ensureAll, ensureMaterialGrades, ensureMaterialItems, ensureShopStock, ensureBlueprints, ensureEquipmentItems };
