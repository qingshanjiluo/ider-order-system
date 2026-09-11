/**
 * 统一熟练度系统（阶段3 · 原始设定 04）
 *
 * 10 级阶梯（全生产技艺通用）：无0 → 学徒1 → 工匠2 → 精通3 → 大师4 → 宗师5
 *   → 大宗师6 → 无上大宗师7 → 道主8 → 主宰9
 * 升级经验：next(level) = 100 × level^1.6
 * 等级效果：成功率加成 +2%/级（主宰 +18%）；高阶技艺门槛由各系统自行以 level 把关
 *
 * 类别：crafting 炼器 / alchemy 炼丹 / talisman 符箓 / formation 阵法 / gathering 采集
 * 存储：character.proficiency = { [category]: { exp, level } }（随调用方 saveDatabase 落盘）
 */
const LADDER = ['无', '学徒', '工匠', '精通', '大师', '宗师', '大宗师', '无上大宗师', '道主', '主宰'];
const MAX_LEVEL = 9;
const SUCCESS_BONUS_PER_LEVEL = 0.02;

const CATEGORIES = {
  crafting: '炼器',
  alchemy: '炼丹',
  talisman: '符箓',
  formation: '阵法',
  gathering: '采集'
};

function expForLevel(level) {
  // 从 level 升到 level+1 所需经验（level+1 次幂，避免 0→1 零门槛）
  if (level >= MAX_LEVEL) return Infinity;
  return Math.floor(100 * Math.pow(level + 1, 1.6));
}

function ensure(character) {
  if (!character.proficiency || typeof character.proficiency !== 'object') character.proficiency = {};
  return character.proficiency;
}

/** 读取（不存在则返回 0 级结构） */
function get(character, category) {
  const store = ensure(character);
  const rec = store[category] || { exp: 0, level: 0 };
  return {
    category,
    name: CATEGORIES[category] || category,
    level: rec.level || 0,
    levelName: LADDER[rec.level || 0],
    exp: Math.floor(rec.exp || 0),
    nextExp: expForLevel(rec.level || 0),
    successBonus: (rec.level || 0) * SUCCESS_BONUS_PER_LEVEL
  };
}

/** 增加经验并自动升级。返回完整状态 + levelUp 标记 */
function addExp(character, category, amount) {
  if (!(amount > 0)) return { ...get(character, category), levelUp: false, gained: 0 };
  const store = ensure(character);
  const rec = store[category] || (store[category] = { exp: 0, level: 0 });
  const gained = Math.floor(amount);
  rec.exp = (rec.exp || 0) + gained;

  let levelUp = false;
  while (rec.level < MAX_LEVEL && rec.exp >= expForLevel(rec.level)) {
    rec.exp -= expForLevel(rec.level);
    rec.level += 1;
    levelUp = true;
  }
  if (rec.level >= MAX_LEVEL) rec.exp = 0; // 主宰后不再积累

  return { ...get(character, category), levelUp, gained };
}

module.exports = { LADDER, MAX_LEVEL, CATEGORIES, get, addExp, expForLevel };
