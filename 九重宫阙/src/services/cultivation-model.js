/**
 * 修炼速度九乘区模型（E4 / T0-2）
 *
 * 口径来源：《修炼与寿元系统模型.md》与 balance.js 既有常数
 * （CULTIVATION_V0 / QUALITY_SPEED / AFFINITY / SECLUSION / ENV_CAP / SPEED_CAP_TOTAL）。
 * 本文件**不读库、不写库**：所有输入由调用方（services/cultivation.js）注入，
 * 因此可被纯单元测试覆盖，也便于 E9 直接拿它做曲线模拟。
 *
 * 铁律（REALM_LEVEL_CAP）：**速度只决定"填满本境界"的快慢，绝不能绕过突破瓶颈**。
 * 该闸门在 characterService.addExp 里执行（全仓唯一经验入口），本模块只负责算速度，
 * 并额外提供 fillable() 供调用方自查。
 */
const B = require('../config/balance');

const CM = B.CULTIVATION_MODEL;

/** 九区（+ 门派体系外加成），顺序固定，便于断言与前端展示 */
const ZONES = [
  { key: 'pill', label: '灵植丹药' },
  { key: 'gongfa', label: '功法' },
  { key: 'aptitude', label: '资质根骨' },
  { key: 'density', label: '灵气浓度' },
  { key: 'affinity', label: '属性契合' },
  { key: 'seclusion', label: '闭关' },
  { key: 'toxin', label: '丹毒' },
  { key: 'injury', label: '伤势' },
  { key: 'cave', label: '洞府环境' },
  { key: 'sect', label: '门派（体系外）' }
];

const clampZone = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return CM.minZone;
  return Math.min(Math.max(n, CM.minZone), CM.maxZone);
};

/** 五行相生相克（与 services/elements.js 同口径的最小实现，用于功法契合） */
const GENERATES = { metal: 'water', water: 'wood', wood: 'fire', fire: 'earth', earth: 'metal' };
const OVERCOMES = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };

function affinityOf(rootType, gongfaElement) {
  if (!rootType || !gongfaElement || rootType === 'none' || gongfaElement === 'none') return B.AFFINITY.neutral;
  if (rootType === gongfaElement) return B.AFFINITY.same;
  if (GENERATES[rootType] === gongfaElement) return B.AFFINITY.generate;   // 我生功法：泄，但仍可用
  if (GENERATES[gongfaElement] === rootType) return B.AFFINITY.generate;   // 功法生我：最顺
  if (OVERCOMES[gongfaElement] === rootType) return B.AFFINITY.restrict;   // 功法克我
  if (OVERCOMES[rootType] === gongfaElement) return B.AFFINITY.clash;      // 我克功法：强扭
  return B.AFFINITY.neutral;
}

/** 灵气浓度（地图难度 + 地脉），受 ENV_CAP 封顶 */
function densityOf(ctx) {
  let d = 1.0;
  const diff = Number(ctx.mapDifficulty);
  if (Number.isFinite(diff) && diff > 1) d += (diff - 1) * CM.mapDensityPerDifficulty;
  const vein = Number(ctx.veinLevel) || 0;
  if (vein > 0) d += vein * CM.veinDensityPerLevel;
  return { value: clampZone(Math.min(d, B.ENV_CAP)), capped: d > B.ENV_CAP };
}

/** 闭关档位：按 key 取 SECLUSION；未知档位一律按不入关，绝不给隐藏加成 */
function seclusionOf(key) {
  const list = B.SECLUSION || [];
  const hit = list.find(s => s && s.key === key);
  return { tier: hit || list[0], known: !!hit };
}

/**
 * @param {object} ctx { realm, level, stats, spiritRoots, gongfas:[{quality,level,cultivationSpeed,element}],
 *                       mapDifficulty, veinLevel, seclusion, pillMultiplier, toxinRatio,
 *                       injuryMultiplier, sectMultiplier }
 * @returns {{ baseRate:number, parts:object, speed:number, rawSpeed:number, capped:boolean, pending:string[], blocks:string[] }}
 */
function computeCultivation(ctx) {
  const parts = {};
  const pending = [];
  const stats = (ctx && ctx.stats) || {};
  const gongfas = (ctx && ctx.gongfas) || [];

  // 基础速率（不属乘区）：境界 V0 阶梯；V0 未覆盖的境界（凡人/飞升）回退旧基准
  const idx = ctx && ctx.realm ? Object.keys(B.LIFESPAN_YEARS).indexOf(ctx.realm) : -1;
  const v0 = ctx && B.CULTIVATION_V0[ctx.realm] != null ? B.CULTIVATION_V0[ctx.realm] : CM.legacyBaseRate;
  const baseRate = CM.useV0BaseRate
    ? v0
    : CM.legacyBaseRate * (1 + Math.max(0, idx) * CM.legacyRealmPerIndex);

  // 1 灵植丹药（限时 buff）
  parts.pill = clampZone(ctx && ctx.pillMultiplier != null ? ctx.pillMultiplier : 1.0);

  // 2 功法：品阶成长空间 × 功法自身效率 × 层数
  let g = 1.0;
  for (const gf of gongfas) {
    const q = B.QUALITY_SPEED[gf.quality];
    g *= (1 + (Number.isFinite(q) ? q : 0));
    if (gf.cultivationSpeed != null && Number.isFinite(Number(gf.cultivationSpeed))) {
      g *= Number(gf.cultivationSpeed);
    }
    g *= 1 + (Math.max(1, Number(gf.level) || 1) - 1) * CM.gongfaLevelBonus;
  }
  parts.gongfa = clampZone(g);
  if (!gongfas.length) pending.push('gongfa: 未修任何修炼功法（当前 gongfa 表可能为空）');

  // 3 资质根骨：talent + comprehension + dao_affinity 相对基准的偏差
  let pts = 0, have = 0;
  for (const k of CM.aptitudeStats) {
    const v = Number(stats[k]);
    if (Number.isFinite(v)) { pts += v - CM.aptitudeBaseline; have++; }
  }
  parts.aptitude = clampZone(1 + pts * CM.aptitudePerPoint);
  if (!have) pending.push('aptitude: 角色缺资质字段，按基准 1.0');

  // 4 灵气浓度
  const dens = densityOf(ctx || {});
  parts.density = clampZone(dens.value);
  if (dens.capped) pending.push(`density: 触到 ENV_CAP=${B.ENV_CAP}`);

  // 5 属性契合：灵根 vs 功法五行
  const root = Array.isArray(ctx && ctx.spiritRoots) && ctx.spiritRoots.length
    ? ctx.spiritRoots.slice().sort((a, b) => (Number(b.purity) || 0) - (Number(a.purity) || 0))[0]
    : null;
  let aff = B.AFFINITY.neutral;
  let affKnown = false;
  for (const gf of gongfas) {
    if (gf.element) { aff = Math.min(aff, affinityOf(root && root.type, gf.element)); affKnown = true; }
  }
  parts.affinity = clampZone(aff);
  if (!affKnown) pending.push('affinity: 功法条目无 element（数据缺口），本轮按 neutral=1.0');

  // 6 闭关
  const sec = seclusionOf(ctx && ctx.seclusion);
  parts.seclusion = clampZone(sec.tier.speed);
  if (!sec.known && ctx && ctx.seclusion) pending.push(`seclusion: 未知闭关档位 ${ctx.seclusion}，按不入关`);

  // 7 丹毒（E5 未落地 → 无字段时恒 1.0，显式记入 pending 而不是假装生效）
  const toxin = Number(ctx && ctx.toxinRatio);
  parts.toxin = Number.isFinite(toxin) ? clampZone(toxin) : 1.0;
  if (!Number.isFinite(toxin)) pending.push('toxin: 丹毒字段未落地（E5 后续），当前恒 1.0');

  // 8 伤势
  parts.injury = clampZone(ctx && ctx.injuryMultiplier != null ? ctx.injuryMultiplier : 1.0);

  // 9 洞府环境（地脉已计入浓度，此处留给洞府阵法等级）
  const cave = Number(ctx && ctx.caveMultiplier);
  parts.cave = Number.isFinite(cave) ? clampZone(cave) : 1.0;
  if (!Number.isFinite(cave)) pending.push('cave: 洞府阵法未产出修炼系数，当前恒 1.0');

  // 门派（体系外，仍计入总封顶）
  parts.sect = clampZone(ctx && ctx.sectMultiplier != null ? ctx.sectMultiplier : 1.0);

  const rawSpeed = ZONES.reduce((acc, z) => acc * (parts[z.key] || 1), 1);
  const capped = rawSpeed > B.SPEED_CAP_TOTAL;
  const speed = capped ? B.SPEED_CAP_TOTAL : rawSpeed;

  return {
    baseRate,
    parts,
    rawSpeed,
    speed,
    capped,
    cap: B.SPEED_CAP_TOTAL,
    pending,
    blocks: (sec.tier.blocks || []).slice(),
    seclusionLabel: sec.tier.label || '不入关'
  };
}

/** 每秒修为产出（含封顶），供 cultivate/offline/afk 统一使用 */
function expPerSecond(ctx) {
  const m = computeCultivation(ctx);
  return { ...m, rate: Math.max(1, Math.floor(m.baseRate * m.speed)) };
}

module.exports = { computeCultivation, expPerSecond, affinityOf, densityOf, seclusionOf, ZONES, clampZone };
