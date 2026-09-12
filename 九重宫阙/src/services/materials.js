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
  '朱砂':     { tier: 3, role: 'aux',  element: 'fire' },
  // ---- P1 T1-2：材料 77 -> 86（差口 +9，五级各有补充；名称经全库查重，不与任何定义重名）----
  '赤铜矿':   { tier: 1, role: 'main', element: 'metal' },
  '云母片':   { tier: 1, role: 'aux',  element: 'earth' },
  '碧灵藤':   { tier: 2, role: 'aux',  element: 'wood' },
  '寒铁矿':   { tier: 2, role: 'main', element: 'metal' },
  '紫晶砂':   { tier: 3, role: 'main', element: 'metal' },
  '炎阳花':   { tier: 3, role: 'aux',  element: 'fire' },
  '太乙神泥': { tier: 4, role: 'main', element: 'earth' },
  '九幽寒髓': { tier: 4, role: 'main', element: 'water' },
  '涅槃火精': { tier: 5, role: 'main', element: 'fire' },
  // ---- P1 修死链：这 7 种老材料本就在 items 里、也被丹方/锻造消耗，却从未进目录（无 tier、
  //      图纸与采集解析不了）。补进目录后 ensureMaterialGrades 会给存量行回填分级。----
  '玄铁':     { tier: 2, role: 'main', element: 'metal' },
  '寒铁':     { tier: 2, role: 'main', element: 'water' },
  '火铜':     { tier: 2, role: 'main', element: 'fire' },
  '紫金矿':   { tier: 3, role: 'main', element: 'metal' },
  '紫金':     { tier: 3, role: 'main', element: 'metal' },
  '雷银':     { tier: 3, role: 'main', element: 'metal' },
  '冰晶石':   { tier: 3, role: 'aux',  element: 'water' }
};

// 新材料入图（采集可性）：材料 -> 地图名（幂等追加 gather_nodes）
// 轮44 修 bug：原先 7 条指向 翠竹林/青云山/寒冰谷/混沌海/雷霆峰 —— 那是种子链另一代地图的名字，
// 实机存档里根本没有这些地图，ensureMapNodes 静默零命中，材料白配。现全部改为按元素对位到真实地图。
const MAP_GATHER_ADDITIONS = {
  '龙须草':   ['妖兽森林', '神兽平原'],
  '紫猴花':   ['妖兽森林', '天界花园'],
  '玉髓芝':   ['神兽平原', '天界花园'],
  '万年寒潭水': ['冰雪原', '冰火两重天'],
  '地髓乳':   ['混沌深渊', '时空裂缝'],
  '赤焰髓':   ['火焰山', '龙巢'],
  '离火精':   ['龙巢', '冰火两重天'],
  '太阴玄冰': ['冰雪原', '幽冥地府'],
  '五色土':   ['沙漠遗迹', '神兽平原'],
  '星陨砂':   ['沙漠遗迹', '雷劫谷'],
  '混沌土':   ['混沌深渊', '魔道深渊'],
  '朱砂':     ['沙漠遗迹', '幽冥地府'],
  // ---- P1 新增材料的采集点 ----
  '赤铜矿':   ['青云山麓', '妖兽森林'],
  '云母片':   ['青云山麓', '五行圣地'],
  '碧灵藤':   ['妖兽森林', '天界花园'],
  '寒铁矿':   ['冰雪原', '沙漠遗迹'],
  '紫晶砂':   ['雷劫谷', '深渊裂隙'],
  '炎阳花':   ['火焰山', '龙巢'],
  '太乙神泥': ['五行圣地', '远古战场'],
  '九幽寒髓': ['幽冥地府', '冰雪原'],
  '涅槃火精': ['火焰山', '仙界入口'],
  // ---- P1 修死链：这 8 种材料被丹方/锻造消耗，此前却没有任何获取路径 ----
  '玄铁':     ['青云山麓', '沙漠遗迹'],
  '紫金':     ['神兽平原', '龙巢'],
  '寒铁':     ['冰雪原', '深渊裂隙'],
  '火铜':     ['火焰山', '冰火两重天'],
  '雷银':     ['雷劫谷', '时空裂缝'],
  '冰晶石':   ['冰雪原', '仙界入口'],
  '紫金矿':   ['龙巢', '远古战场'],
  '九转灵芝': ['神兽平原', '仙界秘境']
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
  { name: '破境丹',   type: '丹药',   quality: '古宝', price: 5000,  stats: {}, desc: '持有则下次突破成功率+15%，判定后消耗一枚' },
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
  { name: '灵兽粮', type: '消耗品', quality: '凡品', price: 80,  stats: {}, desc: '喂养灵宠，提升其经验与等级' },
  // ---- P1 修死链：六种"锭"与丹炉灰是锻造/图纸耗材，此前既无采集也无产出路径，只能在坊市买成品 ----
  { name: '凡铁锭', type: '材料', quality: '凡品', price: 60,    stats: { tier: 1, role: 'main', element: 'metal', smelted: true }, desc: '粗铁矿冶炼而成的凡铁锭（锻造主材）' },
  { name: '精钢锭', type: '材料', quality: '凡品', price: 150,   stats: { tier: 2, role: 'main', element: 'metal', smelted: true }, desc: '精铁矿冶炼而成的钢锭（锻造主材）' },
  { name: '玄铁锭', type: '材料', quality: '灵品', price: 400,   stats: { tier: 2, role: 'main', element: 'metal', smelted: true }, desc: '玄铁提炼的锭料，飞剑剑坯（锻造主材）' },
  { name: '紫金锭', type: '材料', quality: '宝品', price: 1200,  stats: { tier: 3, role: 'main', element: 'metal', smelted: true }, desc: '紫金提炼的锭料，雷霆飞剑剑坯（锻造主材）' },
  { name: '星辰锭', type: '材料', quality: '仙品', price: 4000,  stats: { tier: 4, role: 'main', element: 'metal', smelted: true }, desc: '星辰矿炼出的仙料锭，可入高阶器方（原品质词误用装备梯"古宝"，已归物品梯）' },
  { name: '混沌锭', type: '材料', quality: '道品', price: 12000, stats: { tier: 5, role: 'main', element: 'none', smelted: true }, desc: '混沌矿炼出的道料锭，混沌甲阵核心（原品质词误用装备梯"灵宝"，已归物品梯）' },
  { name: '丹炉灰', type: '材料', quality: '凡品', price: 25,    stats: { tier: 1, role: 'aux', element: 'fire' }, desc: '废弃丹炉余灰，含残余药力，可入杂方（坊市贱卖）' }
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
  { name: '驱邪符方', type: 'talisman', quality: '宝品', materials: [{ name: '朱砂', quantity: 3 }, { name: '紫猴花', quantity: 3 }], desc: '画驱邪符之方' },
  // ---- P1 T1-2：图纸 21 -> 40（差口 +19）。每条都消耗本轮新材料或此前无来源的锭料，
  //      这样"补定义"同时把来源链闭上（否则又是造出来没人用的死内容）。rarity 一律给全。----
  { name: '赤铜剑图纸', type: 'weapon', quality: '凡品', rarity: 'common', materials: [{ name: '赤铜矿', quantity: 6 }, { name: '木材', quantity: 3 }], desc: '赤铜锻剑，入门利器' },
  { name: '寒铁刀图纸', type: 'weapon', quality: '灵品', rarity: 'uncommon', materials: [{ name: '寒铁矿', quantity: 6 }, { name: '寒铁', quantity: 4 }], desc: '寒铁凝刀，斩物带霜' },
  { name: '紫晶匕首图纸', type: 'weapon', quality: '宝品', rarity: 'rare', materials: [{ name: '紫晶砂', quantity: 5 }, { name: '玄铁', quantity: 3 }], desc: '紫晶淬刃，短小锋锐' },
  { name: '涅槃弓图纸', type: 'weapon', quality: '仙品', rarity: 'epic', materials: [{ name: '涅槃火精', quantity: 4 }, { name: '仙晶矿', quantity: 4 }], desc: '涅槃之火凝弓，一箭重生' },
  { name: '星辰长枪图纸', type: 'weapon', quality: '道品', rarity: 'legendary', materials: [{ name: '星辰锭', quantity: 4 }, { name: '太乙神泥', quantity: 3 }], desc: '星辰为镝，长枪贯日' },
  { name: '云母盾图纸', type: 'armor', quality: '凡品', rarity: 'common', materials: [{ name: '云母片', quantity: 6 }, { name: '碎石', quantity: 4 }], desc: '云母叠盾，廉价却实用' },
  { name: '碧灵藤甲图纸', type: 'armor', quality: '灵品', rarity: 'uncommon', materials: [{ name: '碧灵藤', quantity: 6 }, { name: '木材', quantity: 4 }], desc: '藤甲轻韧，缠身不滞' },
  { name: '太乙神袍图纸', type: 'armor', quality: '仙品', rarity: 'epic', materials: [{ name: '太乙神泥', quantity: 5 }, { name: '九幽寒髓', quantity: 3 }], desc: '太乙织袍，寒暑不侵' },
  { name: '混沌锭甲图纸', type: 'armor', quality: '道品', rarity: 'legendary', materials: [{ name: '混沌锭', quantity: 4 }, { name: '混沌矿', quantity: 4 }], desc: '混沌重甲，万法难破' },
  { name: '赤焰符方', type: 'talisman', quality: '灵品', rarity: 'uncommon', materials: [{ name: '赤铜矿', quantity: 3 }, { name: '朱砂', quantity: 3 }], desc: '画赤焰符之方' },
  { name: '紫霄符方', type: 'talisman', quality: '宝品', rarity: 'rare', materials: [{ name: '紫晶砂', quantity: 3 }, { name: '朱砂', quantity: 4 }], desc: '画紫霄雷符之方' },
  { name: '寒潭符方', type: 'talisman', quality: '灵品', rarity: 'uncommon', materials: [{ name: '九幽寒髓', quantity: 2 }, { name: '灵草', quantity: 3 }], desc: '画寒潭符之方' },
  { name: '涅槃符方', type: 'talisman', quality: '仙品', rarity: 'epic', materials: [{ name: '涅槃火精', quantity: 3 }, { name: '炎阳花', quantity: 3 }], desc: '画涅槃符之方，可解一次死劫' },
  { name: '赤铜锁阵图纸', type: 'formation', quality: '灵品', rarity: 'uncommon', materials: [{ name: '赤铜矿', quantity: 8 }, { name: '五色土', quantity: 4 }], desc: '赤铜布阵，锁敌身形' },
  { name: '紫晶聚灵阵图纸', type: 'formation', quality: '宝品', rarity: 'rare', materials: [{ name: '紫晶砂', quantity: 6 }, { name: '聚灵草', quantity: 6 }], desc: '紫晶聚灵，阵内修炼加成' },
  { name: '太乙困仙阵图纸', type: 'formation', quality: '仙品', rarity: 'epic', materials: [{ name: '太乙神泥', quantity: 6 }, { name: '星陨砂', quantity: 5 }], desc: '太乙轮转，困仙三炷香' },
  { name: '混沌诛仙剑阵图纸', type: 'formation', quality: '道品', rarity: 'legendary', materials: [{ name: '混沌锭', quantity: 5 }, { name: '混沌结晶', quantity: 5 }], desc: '四剑归一，诛仙剑阵残图' },
  { name: '炎阳续命丹方', type: 'pill', quality: '宝品', rarity: 'rare', materials: [{ name: '炎阳花', quantity: 4 }, { name: '九转灵芝', quantity: 2 }], desc: '续命丹方，燃阳固本' },
  { name: '丹炉筑基丹方', type: 'pill', quality: '凡品', rarity: 'common', materials: [{ name: '丹炉灰', quantity: 3 }, { name: '灵草', quantity: 5 }], desc: '以废炉灰引药性，廉价的筑基辅助丹' }
];

// 品质 -> 稀有度（物品系阶梯）。图纸此前有 11 行 rarity 缺失，前端图鉴按 rarity 分组会落到 undefined 桶。
const RARITY_BY_QUALITY = { 凡品: 'common', 灵品: 'uncommon', 宝品: 'rare', 仙品: 'epic', 道品: 'legendary' };

function ensureBlueprints(db) {
  let added = 0;
  let healed = 0;
  if (!db.blueprints) db.blueprints = [];
  for (const def of BLUEPRINT_CATALOG) {
    if (db.blueprints.find(b => b.name === def.name)) continue;
    const id = db.blueprints.length ? Math.max(...db.blueprints.map(b => Number(b.id) || 0)) + 1 : 1;
    db.blueprints.push({
      id, name: def.name, type: def.type, quality: def.quality,
      rarity: def.rarity || RARITY_BY_QUALITY[def.quality] || 'common',
      materials: def.materials, desc: def.desc
    });
    added++;
  }
  // 轮44：存档里 11 行历史图纸没有 rarity，前端图鉴按 rarity 分组会全落进 undefined 桶 —— 按品质补齐
  for (const b of db.blueprints) {
    if (b.rarity) continue;
    b.rarity = RARITY_BY_QUALITY[b.quality] || 'common';
    healed++;
  }
  return added + healed;
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
  try {
    const hyg = require('./data-hygiene');
    // 轮43：卫生检查同时归一 quality 与 realm（realm 曾被词条炼器写成 '未知'，污染 items 定义）
    hy = hyg.normalizeQualities(db) + hyg.normalizeRealms(db) + hyg.normalizeItemQualities(db);
  } catch { /* 卫生检查异常不阻断 */ }
  let m = 0;
  try { m = require('../data/monster-library').ensureMonsters(db); } catch { /* 怪物库异常不阻断 boot */ }
  let d = 0;
  try { const alchemy = require('../routes/alchemy'); if (alchemy.__ensureRecipes) { d = alchemy.__ensureRecipes(db) || 0; } } catch { /* alchemy 未就绪则跳过 */ }
  return { materialItems: a0, materialGrades: a, shopEntries: b, mapNodes: c, blueprints: e, equipment: f, pills: g, dungeons: du, hygiene: hy, monsters: m, recipes: d, changed: a0 + a + b + c + e + f + g + du + hy + m + d };
}

module.exports = { MATERIAL_CATALOG, TIER_EQUIP_CAP, TIER_NAMES, SHOP_CATALOG, MAP_GATHER_ADDITIONS, BLUEPRINT_CATALOG, gradeOf, ensureAll, ensureMaterialGrades, ensureMaterialItems, ensureShopStock, ensureBlueprints, ensureEquipmentItems };
