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

module.exports = { LEGAL_QUALITIES, QUALITY_MAP, normalizeQualities };
