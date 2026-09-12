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

// ===== E3 · 技能槽位（修 D2：原 getNextSlot 硬编码 1..2，满槽还 return 1 造成静默撞槽）=====
const SLOT_BASE = 2;   // 炼气起步 2 槽
const SLOT_MAX = 8;    // 封顶 8 槽
/** 槽位上限 = min(2 + 境界序号, 8)；realmIndex 0-based（炼气=0 → 2 槽，渡劫=8 → 8 槽） */
function skillSlotCap(realmIndex) {
  const i = Number.isFinite(realmIndex) && realmIndex >= 0 ? realmIndex : 0;
  return Math.min(SLOT_BASE + i, SLOT_MAX);
}
module.exports.SLOT_BASE = SLOT_BASE;
module.exports.SLOT_MAX = SLOT_MAX;
module.exports.skillSlotCap = skillSlotCap;

// ===== E3 · 掉落与保底（此前 combat.js 写死 30%/10% 且装备固定"凡器"，且 rewards.items 无人消费）=====
const LOOT_PITY = { stoneChance: 0.3, equipChance: 0.1, dryStreakToGuarantee: 5 };
// 按**敌方等级**决定品质档；品质词必须落在装备自有阶梯 QUALITY_ORDER 内
// （注意：装备用 凡器/法器/灵器/法宝/…，与丹药的 凡品/良品/上品/极品 是两套词表，不可混用）
const LOOT_QUALITY_BY_LEVEL = [
  { min: 75, quality: '法宝' },
  { min: 45, quality: '灵器' },
  { min: 15, quality: '法器' },
  { min: 0, quality: '凡器' }
];
/** 敌方等级 → 装备品质档 */
function lootQuality(level) {
  const lv = Number.isFinite(level) && level > 0 ? level : 0;
  const hit = LOOT_QUALITY_BY_LEVEL.find((q) => lv >= q.min);
  return hit ? hit.quality : LOOT_QUALITY_BY_LEVEL[LOOT_QUALITY_BY_LEVEL.length - 1].quality;
}
module.exports.LOOT_PITY = LOOT_PITY;
module.exports.LOOT_QUALITY_BY_LEVEL = LOOT_QUALITY_BY_LEVEL;
module.exports.lootQuality = lootQuality;

// ===== E3 · 减伤公式（修原线性减法 max(1, atk*2 − def*0.8)：def≥2.5atk 时伤害恒为 1，高防近乎无敌）=====
const MITIGATION = {
  baseK: 120,        // 护甲常数：def = baseK 时减伤 50%（同级基准）
  perLevelK: 18,     // 随防守方等级放大 K，避免高等级把减伤堆满
  maxMitigation: 0.75, // **永不免疫**：最多减 75%，杜绝"打不动"的死局
  floorDamage: 1
};
/** 减伤比例 0..maxMitigation */
function mitigationRatio(defense, level) {
  const d = Math.max(0, Number(defense) || 0);
  const lv = Math.max(1, Number(level) || 1);
  const K = MITIGATION.baseK + MITIGATION.perLevelK * lv;
  return Math.min(MITIGATION.maxMitigation, d / (d + K));
}
/** 减伤后的伤害：恒 ≥ floorDamage，且随 def 单调递减、随攻击线性缩放 */
function mitigatedDamage(rawDamage, defense, level) {
  const raw = Math.max(0, Number(rawDamage) || 0);
  return Math.max(MITIGATION.floorDamage, Math.floor(raw * (1 - mitigationRatio(defense, level))));
}
module.exports.MITIGATION = MITIGATION;
module.exports.mitigationRatio = mitigationRatio;
module.exports.mitigatedDamage = mitigatedDamage;

// ===== E5 / T0-1 大限劫（寿元耗尽不再静默坐化，先应劫）=====
const TRIBULATION = {
  // 化神及以上才有"劫"；以下境界寿元耗尽仍按凡人坐化（决议 D5 + 章程 E5）
  eligibleRealms: ['化神', '炼虚', '合体', '大乘', '渡劫'],
  windowYears: 3,      // 应劫窗口（游戏年）：窗口内不判死，逾期视为未曾出手
  renewRatio: 0.10,    // 度劫成功续命 = 当时寿元上限 × 10%（比例制，禁绝对年数）
  bossLevelPerRealm: 3  // 天劫目标等级 = 自身等级 + (境界序号+1)×本值（确定性，不含随机）
  // 注：不设 maxAttemptsPerWindow —— 应劫败即转世，一个窗口内不可能有第二次出手，
  //     留着就是无人消费的幽灵配置（不变量 3）。
};
module.exports.TRIBULATION = TRIBULATION;

// ===== E4/T0-2 修炼九乘区接线参数 =====
const CULTIVATION_MODEL = {
  // 基础速率：true=按境界取 CULTIVATION_V0（炼气 10/秒，渡劫 840/秒）；
  // false=回退旧口径（固定 10/秒 × (1 + 境界序号×0.1)）。保留开关是为了能被一眼回滚。
  useV0BaseRate: true,
  legacyBaseRate: 10,
  legacyRealmPerIndex: 0.1,
  gongfaLevelBonus: 0.02,       // 功法每层 +2%（原硬编码在 cultivation.js）
  mapDensityPerDifficulty: 0.05,// 地图难度每档灵气 +5%（原硬编码）
  veinDensityPerLevel: 0.05,    // 洞府地脉每级灵气 +5%（原硬编码）
  aptitudePerPoint: 0.01,       // 资质每 1 点 +1%（相对基准值）
  aptitudeBaseline: 10,
  aptitudeStats: ['talent', 'comprehension', 'dao_affinity'],
  minZone: 0.2,                 // 单区下限：伤势/丹毒再重也不清零（避免"修炼无意义"死局）
  maxZone: 4.0                  // 单区上限：功法堆到飞起也有界
};
module.exports.CULTIVATION_MODEL = CULTIVATION_MODEL;

// ===== T0-2 铁律：境界等级上限（经验不得越过本境界 max_level）=====
const REALM_LEVEL_CAP = { enforce: true, pinExpAtFull: true };
module.exports.REALM_LEVEL_CAP = REALM_LEVEL_CAP;

// ===== E3/T0-3 战斗数值曲线基准 =====
// 玩家面板按境界乘性增长（原本纯线性，与怪物模板的指数式数值倒挂：渡劫段 0% 胜率）。
// 1.25^8 ≈ 5.0 倍（渡劫），配合攻击额外 1.15 次幂，用来追平手工堆高的怪物数值。
const REALM_STAT_GROWTH = 1.25;
module.exports.REALM_STAT_GROWTH = REALM_STAT_GROWTH;

// 攻击相对生命/防御的独立成长偏置（E3 调参用；1 = 与面板同速）
const ATTACK_GROWTH_BIAS = 1.15;
module.exports.ATTACK_GROWTH_BIAS = ATTACK_GROWTH_BIAS;

// （E3 槽位唯一实现是本文件上方的 skillSlotCap(realmIndex)；轮37 曾在尾部误加同名重复定义把序号 API 盖掉，已删）

// ===== 境界顺序（此前 3 处各自硬编码同一份数组：cultivation.js / character.js / achievement.js）=====
const REALM_ORDER = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'];
module.exports.REALM_ORDER = REALM_ORDER;
