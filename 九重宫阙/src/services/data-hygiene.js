/**
 * 数据卫生（内容富集八期）
 * 归一历史脏品阶（混沌至宝/?? 等非法值），原始值保留在 stats.legacy_quality 以便追溯。幂等。
 */

const LEGAL_QUALITIES = new Set([
  // 装备
  '凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器',
  // 物品/丹药/图纸
  '凡品', '灵品', '宝品', '仙品', '道品',
  // 灵兽
  '凡兽', '灵兽', '玄兽', '地兽', '天兽', '圣兽', '仙兽',
  // 技能/功法
  '黄阶', '玄阶', '地阶', '天阶', '圣阶', '仙阶'
]);

const QUALITY_MAP = {
  '混沌至宝': '道器',
  '??': '法器',
  '???': '法器',
  '未知': '凡品'
};

function normalizeQualities(db) {
  let fixed = 0;
  for (const item of db.items || []) {
    if (!item.quality || LEGAL_QUALITIES.has(item.quality)) continue;
    let st = {};
    try { st = JSON.parse(item.stats || '{}'); } catch { st = {}; }
    st.legacy_quality = item.quality;
    item.stats = JSON.stringify(st);
    const mapped = QUALITY_MAP[item.quality] || (item.type === '装备' ? '法器' : '凡品');
    item.quality = mapped;
    fixed++;
  }
  return fixed;
}

/**
 * 归一物品的 realm 引用：必须是 db.realms 里存在的境界名。
 * 轮43 由内容引用完整性审计发现 items 里混进 `realm:"未知"` 的脏定义
 * （词条炼器接口把 realm 硬编码成 '未知' 且不校验品质，源头已在 forge-systems 修掉）。
 * 原始值留在 stats.legacy_realm 以便追溯；幂等。
 */
function normalizeRealms(db) {
  const legal = new Set((db.realms || []).map((r) => String(r.name)));
  if (!legal.size) return 0;   // 境界表缺失时一个字段都不改：宁可不修，也不用猜出来的集合改写存档
  const { QUALITY_LADDER, REALM_BY_QUALITY } = require('../data/equipment-library');
  let fixed = 0;
  for (const item of db.items || []) {
    if (!item.realm || legal.has(String(item.realm))) continue;
    let st = {};
    try { st = JSON.parse(item.stats || '{}'); } catch { st = {}; }
    st.legacy_realm = item.realm;
    item.stats = JSON.stringify(st);
    const qi = QUALITY_LADDER.indexOf(item.quality);
    item.realm = qi >= 0 ? REALM_BY_QUALITY[qi] : REALM_BY_QUALITY[0];
    fixed++;
  }
  return fixed;
}

/**
 * 跨阶梯品质词归一（轮44 · P1 规划硬要求②："品质词必须落在该品类自己的阶梯内"）。
 * normalizeQualities 只拦"完全非法"的品质词，拦不住"合法但用错了品类"：
 * 实测存档 77 件材料里有 12 件挂着装备梯的词（古宝×5 / 灵宝×3 / 仙器×4），丹药也有（破境丹=古宝）。
 * 只处理"物品系"类型（装备/灵宠/功法各有自己的阶梯，一律不碰）；原值留 stats.legacy_quality。幂等。
 */
const ITEM_LADDER = ['凡品', '灵品', '宝品', '仙品', '道品'];
const ITEM_LADDER_TYPES = new Set(['材料', '丹药', '符箓', '阵法', '消耗品', '道具', '礼包', '凭证', '特殊灵石', '功法书']);
const OTHER_LADDER_TO_ITEM = {
  凡器: '凡品', 法器: '凡品', 灵器: '灵品', 法宝: '宝品', 古宝: '宝品', 灵宝: '仙品', 道器: '道品', 仙器: '道品',
  黄阶: '凡品', 玄阶: '灵品', 地阶: '宝品', 天阶: '仙品', 圣阶: '道品', 仙阶: '道品',
  凡兽: '凡品', 灵兽: '灵品', 玄兽: '宝品', 地兽: '仙品', 天兽: '道品', 圣兽: '道品'
};

function normalizeItemQualities(db) {
  let fixed = 0;
  for (const item of db.items || []) {
    if (!ITEM_LADDER_TYPES.has(item.type)) continue;
    if (!item.quality || ITEM_LADDER.indexOf(item.quality) >= 0) continue;
    let st = {};
    try { st = JSON.parse(item.stats || '{}'); } catch { st = {}; }
    st.legacy_quality = item.quality;
    item.stats = JSON.stringify(st);
    item.quality = OTHER_LADDER_TO_ITEM[item.quality] || ITEM_LADDER[0];
    fixed++;
  }
  return fixed;
}

module.exports = { LEGAL_QUALITIES, QUALITY_MAP, ITEM_LADDER, ITEM_LADDER_TYPES, normalizeQualities, normalizeRealms, normalizeItemQualities };
