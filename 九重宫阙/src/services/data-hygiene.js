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

module.exports = { LEGAL_QUALITIES, QUALITY_MAP, normalizeQualities, normalizeRealms };
