/**
 * 数值单点（AD-5 落地 · 首批：寿元与突破）
 * 依据：方案规划v2/02-对比分析/04-决议记录与实施影响.md §D1/§D5（2026-09-11 裁决）
 *      + 2025-01-16 A 案确认（渡劫 = 100 万年为顶，与 gameTime.js 现行曲线一致）
 * 原则：**cap 横跨 100→100万 六个数量级，一切寿元增减一律用比例（占 cap 的百分比），禁用绝对年数。**
 */

// ===== D5 定稿：寿元曲线（A 案，与 gameTime.LIFESPAN_BY_REALM 全等，禁止漂移）=====
const LIFESPAN_YEARS = {
  凡人: 100, 炼气: 200, 筑基: 500, 金丹: 1500, 元婴: 5000,
  化神: 20000, 炼虚: 50000, 合体: 100000, 大乘: 300000, 渡劫: 1000000, 飞升: null
};
const LIFESPAN_CAP = 1000000;          // 不飞升上限（D5）
const LEVEL_LIFESPAN_GAIN = 0.01;      // 境界内每升 1 级：+当前境界基础寿元的 1%（已实现于 character.js 升级钩子）
const LONGEVITY_BONUS_CAP_RATIO = 0.35; // 延寿丹/灵植/赏赐 累计不超过当前境界基础寿元的 35%（边际递减硬闸）

// ===== D5 已定稿：战斗损寿（现行唯一扣寿来源）=====
const INJURY_LIFE_COST = { defeat: 0.02, nearDeath: 0.01 };  // 战败 −2% cap；濒死 −1% cap
const INJURY_THRESHOLDS = { light: 30, medium: 60, severe: 80 };
const INJURY_DEBUFF = { light: { power: 0.95 }, medium: { power: 0.85, cultivate: 0.90 }, severe: { power: 0.70, cultivate: 0.70 } };
const RECOVERY_PER_GAME_DAY = 20;      // 自动调息：每游戏日 −20 伤势（洞府加倍）

// ===== D5 增补提案（比例制；待你逐条批准后再接线）=====
const BREAKTHROUGH_LIFE_COST = { base: 0.015, perFail: 0.005, max: 0.05 };  // 突破失败：1.5% cap，每次累进 +0.5%，封顶 5%
const PILL_LIFE_COST = { fierce: 0.005, forbidden: 0.015 };                  // 猛药/禁药 折寿比例（另加丹毒层）
const EVIL_ART_LIFE_COST_PER_YEAR = { min: 0.0002, max: 0.001 };             // 邪功副作用（占 cap / 游戏年）
const LIFE_BURN_TIERS = {
  1: { costRatio: 0.005, speedMult: 1.35, expPerBurn: 0.25 },
  2: { costRatio: 0.010, speedMult: 1.70, expPerBurn: 0.25 },
  3: { costRatio: 0.020, speedMult: 2.05, expPerBurn: 0.25 }
};

// ===== 延寿四档（比例制，受 LONGEVITY_BONUS_CAP_RATIO 封顶）=====
const LIFE_GAIN = {
  pills: [0.01, 0.03, 0.06, 0.10],      // 延寿丹 一至四档
  plants: { 万年血参: { ratio: 0.005, perLife: 3 }, 九转灵芝: { ratio: 0.015, perLife: 2 }, 仙灵草: { ratio: 0.05, perLife: 1 } },
  sectBoon: { ratio: 0.01, perLife: 1, contribution: 5000 },
  longLifeArtPerYear: 0.0002            // 正道长生功：+0.02% cap / 游戏年，代价 V×0.8
};

// ===== 枯竭分级（"停滞会死"的可感知化）=====
const DEPLETION_TIERS = [
  { key: 'safe', below: 0.40, speedMult: 1, breakPenalty: 0 },
  { key: 'warn', below: 0.30, speedMult: 1, breakPenalty: 0 },
  { key: 'danger', below: 0.15, speedMult: 1, breakPenalty: 10 },
  { key: 'dying', below: 0.05, speedMult: 0.7, breakPenalty: 10, innerDemonPerYear: 1 }
];

// ===== 突破基础概率（D5/蓝图定案；替换 realm.js:29 的 100−failures×k）=====
const BREAKTHROUGH_BASE = {
  炼气: 90, 筑基: 80, 金丹: 70, 元婴: 60, 化神: 50,
  炼虚: 42, 合体: 35, 大乘: 28, 渡劫: 20, 飞升: 12
};
const BREAKTHROUGH_MODS = {
  perInnerDemon: -5, perFail: -3, heavenShieldFrom: 3, heavenShieldEach: 10, // 连败≥3 后每次 +10%（R11 调参：原 6 打不断心魔螺旋）
  pill: 15, formation: 8, veinPerLevel: 2, artPerfect: 10, epiphany: 20, daoDamage: -10
};
const BREAKTHROUGH_FAIL = { expFallbackRatio: 0.10, daoDamageDays: 3 };     // 不降境界，回落 10% 修为 + 道基受损

/**
 * 契机丹（R11 修正：这些名字此前在游戏里不存在，属空通道）
 * 持有即生效（下次突破 +M.pill），**每次突破结算消耗 1 枚**，不可永久持有。
 */
const BREAKTHROUGH_PILL_NAMES = ['破境丹'];

// ===== 修炼速度乘区（S-2 用；总乘区封顶防失控）=====
const CULTIVATION_V0 = { 炼气: 10, 筑基: 18, 金丹: 32, 元婴: 56, 化神: 96, 炼虚: 165, 合体: 285, 大乘: 490, 渡劫: 840 };
const SPEED_CAP_TOTAL = 12;
const SECLUSION = [
  { key: 'none', label: '不入关', speed: 1.0, blocks: [] },
  { key: 'xinzhaai', label: '心斋', speed: 1.2, blocks: ['offline'] },
  { key: 'zuowang', label: '坐忘', speed: 1.6, blocks: ['gather', 'battle'] },
  { key: 'kurong', label: '枯荣', speed: 2.2, blocks: ['gather', 'battle', 'trade'], demonEveryYears: 5 },
  { key: 'ruding', label: '入定', speed: 3.0, blocks: ['gather', 'battle', 'trade', 'market'], demonEveryYears: 3, afterEffect: 0.85 }
];
const QUALITY_SPEED = { 黄阶: 0.15, 玄阶: 0.30, 地阶: 0.50, 天阶: 0.80, 圣阶: 1.20, 仙阶: 1.80 };
const AFFINITY = { same: 1.35, generate: 1.15, neutral: 1.0, restrict: 0.75, clash: 0.60 };
const ENV_CAP = 2.5;

// ===== 工具 =====
/** 寿元上限（境界基础；飞升为 null=超脱） */
function lifespanOf(realm) {
  return realm in LIFESPAN_YEARS ? LIFESPAN_YEARS[realm] : LIFESPAN_YEARS['凡人'];
}
/** 按 cap 比例折算绝对年数（大数取整，保证后期比例仍生效 → 最小 1 年） */
function yearsOfRatio(cap, ratio) {
  return Math.max(1, Math.floor(cap * ratio));
}
/** 枯竭分级（remaining/cap → 档位定义） */
function depletionTier(cap, remaining) {
  if (!cap) return DEPLETION_TIERS[0];
  const pct = remaining / cap;
  let tier = DEPLETION_TIERS[0];
  for (const t of DEPLETION_TIERS) if (pct < t.below) tier = t;
  return tier;
}

module.exports = {
  LIFESPAN_YEARS, LIFESPAN_CAP, LEVEL_LIFESPAN_GAIN, LONGEVITY_BONUS_CAP_RATIO,
  INJURY_LIFE_COST, INJURY_THRESHOLDS, INJURY_DEBUFF, RECOVERY_PER_GAME_DAY,
  BREAKTHROUGH_LIFE_COST, PILL_LIFE_COST, EVIL_ART_LIFE_COST_PER_YEAR, LIFE_BURN_TIERS,
  LIFE_GAIN, DEPLETION_TIERS, BREAKTHROUGH_BASE, BREAKTHROUGH_MODS, BREAKTHROUGH_FAIL, BREAKTHROUGH_PILL_NAMES,
  CULTIVATION_V0, SPEED_CAP_TOTAL, SECLUSION, QUALITY_SPEED, AFFINITY, ENV_CAP,
  lifespanOf, yearsOfRatio, depletionTier
};
