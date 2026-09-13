/**
 * 战斗技能状态机（E3 / T0-3）
 *
 * 现状（轮65 复核）：本模块**已经**是战斗侧唯一的消耗/冷却/效果判定入口 ——, * combat.js 调 skillState.canUse / spend / tick / applyEffect（gen-acceptance.js 的 E3_MP_WIRED 探针, * 与此有锁），灵力不足与冷却中都会退回普攻并写进战报；test-content.js 的 1166–1214 是单元判定、, * 1223–1257 是走真回合的行为判定（`skillUsed === null` 与日志含"灵力不足"）。, * 上面那段"从未传进战斗、主循环也没消费"是**立项时的背景**，早已不成立 —— 本轮我把它当现状读，, * 结果在开发日志里写下了错误的"T0-3 还差一半"。注释不是状态，判缺口之前必须先看断言。
 *
 * 设计约束：
 *   - 不读库、不写库；只在传入的实体对象上维护 mp / cooldowns / statusEffects；
 *   - 由 executeRound 在"该实体自己行动的那一刻"调用 tick，因此**不需要改主循环**；
 *   - 1v1 战斗模型下 aoe/taunt 无额外目标或需多实体协作 ⇒ 不伪造数值，统一走 unimplementedEffects()
 *     显式登记（与修炼模型的 pending 同一口径）。轮70 起九类 1v1 可判效果已实装（见 IMPLEMENTED）。
 */
const IMPLEMENTED = ['damage', 'dot', 'heal', 'lifesteal', 'drain',
  // 轮70：1v1 模型下可机械判定的九类效果落地 —— buff/debuff 全维强化（数据无 stat 字段，
  // 设计解读：attack/defense/speed 各乘 1±value，注释与测试同源）、stun 确定性跳过一次行动
  // （effect_value 0.35 无回合语义，概率化会破坏二十期行为锁与 TTK 确定性锁）、shield/hot 按
  // maxHp 比例、thorns/heal_amp/crit/dodge 按比例。消费点：skillState 与 combat 的
  // runBattleLoop（landDamage 统一结算口）/executeRound（tickHeal 与受疗放大）。
  'buff', 'debuff', 'stun', 'shield', 'hot', 'thorns', 'heal_amp', 'crit', 'dodge'];
const NEEDS_MULTI_TARGET = ['aoe', 'taunt'];   // 1v1 无额外目标/无协作实体 ⇒ 持续挂账（登记不伪造）
const NON_COMBAT = ['craft_amp', 'alchemy_amp', 'discount', 'gather_amp'];

/** 该效果类型是否已被回合制实现（false 时只记日志/登记，不产生假数值） */
function isImplemented(effectType) {
  return IMPLEMENTED.indexOf(effectType) >= 0;
}

function unimplementedEffects() {
  return { implemented: IMPLEMENTED.slice(), needsMultiTarget: NEEDS_MULTI_TARGET.slice(), nonCombat: NON_COMBAT.slice() };
}

/** 可用性判定：MP 足够 且 不在冷却中。缺字段一律按 0 消耗/0 冷却（普攻路径） */
function canUse(skill, actor) {
  if (!skill) return { ok: true, reason: null };
  const mp = Number(actor && actor.mp) || 0;
  const cost = Number(skill.manaCost) || 0;
  if (cost > mp) return { ok: false, reason: 'mp', need: cost, have: mp };
  const cds = (actor && actor.cooldowns) || {};
  const left = Number(cds[skillKey(skill)]) || 0;
  if (left > 0) return { ok: false, reason: 'cooldown', remaining: left };
  return { ok: true, reason: null };
}

function skillKey(skill) {
  return String(skill && (skill.key || skill.name || skill.id || ''));
}

/** 释放：扣 MP、置冷却。返回是否有实际消耗（不可用时零副作用） */
function spend(skill, actor) {
  if (!skill || !actor) return false;
  const cost = Number(skill.manaCost) || 0;
  if (cost > 0) actor.mp = Math.max(0, (Number(actor.mp) || 0) - cost);
  const cd = Number(skill.cooldown) || 0;
  if (cd > 0) {
    if (!actor.cooldowns) actor.cooldowns = {};
    // 冷却按"该实体自己的行动次数"计，1 回合 = 自己行动一次
    actor.cooldowns[skillKey(skill)] = cd;
  }
  return true;
}

/**
 * 该实体行动前结算：冷却 -1、自身持续伤害（dot）结算、回复类 hot 累加。
 * @returns {{ tickDamage:number, lines:string[] }} tickDamage 为需在自身 hp 上扣除的量
 */
function tick(actor) {
  const out = { tickDamage: 0, tickHeal: 0, lines: [] };
  if (!actor) return out;
  if (actor.cooldowns) {
    for (const k of Object.keys(actor.cooldowns)) {
      actor.cooldowns[k] = Math.max(0, (Number(actor.cooldowns[k]) || 0) - 1);
      if (actor.cooldowns[k] === 0) delete actor.cooldowns[k];
    }
  }
  const list = Array.isArray(actor.statusEffects) ? actor.statusEffects : [];
  const keep = [];
  for (const eff of list) {
    if (eff && eff.type === 'dot') {
      const dmg = Math.max(1, Math.floor(Number(eff.perRound) || 0));
      out.tickDamage += dmg;
      eff.roundsLeft = (Number(eff.roundsLeft) || 0) - 1;
      out.lines.push(`${actor.name} 受【${eff.source || '灼烧'}】侵蚀，损失 ${dmg} 点生命`);
      if (eff.roundsLeft > 0) keep.push(eff);
    } else if (eff && eff.type === 'hot') {
      // 轮70：持续回复（hot）——与 dot 同构，perRound 按施放时折算的固定值逐回合回血
      const heal = Math.max(1, Math.floor(Number(eff.perRound) || 0));
      out.tickHeal += heal;
      eff.roundsLeft = (Number(eff.roundsLeft) || 0) - 1;
      out.lines.push(`${actor.name} 受【${eff.source || '回春'}】滋养，回复 ${heal} 点生命`);
      if (eff.roundsLeft > 0) keep.push(eff);
    } else {
      keep.push(eff);
    }
  }
  actor.statusEffects = keep;
  return out;
}

/**
 * 命中后的附加效果。只处理已实现类型，其余返回 unimplemented 由上层登记。
 * @returns {{ lines:string[], selfHeal:number, appliedDot:object|null, unimplemented:string|null }}
 */
function applyEffect(skill, actor, target, damageDealt) {
  const res = { lines: [], selfHeal: 0, appliedDot: null, unimplemented: null };
  const type = skill && skill.effectType;
  if (!type || type === 'damage') return res;
  if (!isImplemented(type)) {
    res.unimplemented = type;
    return res;
  }
  const value = Number(skill.effectValue);
  const ratio = Number.isFinite(value) ? Math.abs(value) : 0.3;

  if (type === 'dot') {
    res.appliedDot = { type: 'dot', source: skill.name || '灼烧', perRound: Math.max(1, Math.floor(damageDealt * (ratio > 1 ? 0.3 : ratio) / 3)), roundsLeft: 3 };
    res.lines.push(`${target && target.name} 被【${res.appliedDot.source}】缠上（每回合 ${res.appliedDot.perRound} 点，共 ${res.appliedDot.roundsLeft} 回合）`);
    return res;
  }
  if (type === 'heal') {
    // effect_value 语义按"占施法者生命上限的比例"（数据里多为 0.3 一类小数）
    const cap = Number(actor && actor.maxHp) || 0;
    const amount = Math.max(1, Math.floor(cap * Math.min(ratio, 1)));
    res.selfHeal = amount;
    res.lines.push(`${actor && actor.name} 运功疗伤，回复 ${amount} 点生命`);
    return res;
  }
  if (type === 'lifesteal' || type === 'drain') {
    const amount = Math.max(1, Math.floor((Number(damageDealt) || 0) * Math.min(ratio || 0.3, 1)));
    res.selfHeal = amount;
    res.lines.push(`${actor && actor.name} ${type === 'drain' ? '汲取' : '嗜血'}回复 ${amount} 点生命`);
    return res;
  }
  // ===== 轮70：九类 1v1 可判效果 =====
  // buff/debuff：数据里没有字段指明强化哪一维（21+7 条只有 effect_value 比例），设计解读为
  // "攻防速全维"乘 1±value，只改战时临时实体（getEntity 每次从 db 现算，不落库）。
  if (type === 'buff') {
    const mult = 1 + Math.min(Math.max(ratio, 0), 2);
    if (actor) {
      actor.attack = Math.floor((Number(actor.attack) || 0) * mult);
      actor.defense = Math.floor((Number(actor.defense) || 0) * mult);
      actor.speed = Math.floor((Number(actor.speed) || 0) * mult);
    }
    res.lines.push(`${actor && actor.name} 气劲鼓荡（攻防速各提升 ${Math.round((mult - 1) * 100)}%）`);
    return res;
  }
  if (type === 'debuff') {
    const mult = 1 - Math.min(Math.max(ratio, 0), 0.9);
    if (target) {
      target.attack = Math.floor((Number(target.attack) || 0) * mult);
      target.defense = Math.floor((Number(target.defense) || 0) * mult);
      target.speed = Math.floor((Number(target.speed) || 0) * mult);
    }
    res.lines.push(`${target && target.name} 气势受挫（攻防速各降低 ${Math.round((1 - mult) * 100)}%）`);
    return res;
  }
  // stun：确定性跳过一次行动（value 0.35 无回合/概率可机读语义；概率化会破坏二十期行为锁
  // 与 TTK 确定性锁）。消费点在 combat.executeRound 顶部。
  if (type === 'stun') {
    if (target) target.stunPending = Math.max(Number(target.stunPending) || 0, 1);
    res.lines.push(`${target && target.name} 被震慑，下次行动无法出手`);
    return res;
  }
  // shield：按施法者 maxHp 比例凝池，消费点在 combat.landDamage（掉血前先扣池）。
  if (type === 'shield') {
    const pool = Math.max(1, Math.floor((Number(actor && actor.maxHp) || 0) * Math.min(ratio, 1)));
    if (actor) actor.shieldPool = (Number(actor.shieldPool) || 0) + pool;
    res.lines.push(`${actor && actor.name} 凝起护盾（可抵 ${pool} 点伤害）`);
    return res;
  }
  // hot：持续回复挂 statusEffects，tick 逐回合结算（与 dot 同构，3 回合）。
  if (type === 'hot') {
    const per = Math.max(1, Math.floor((Number(actor && actor.maxHp) || 0) * Math.min(ratio, 1)));
    if (actor) {
      if (!Array.isArray(actor.statusEffects)) actor.statusEffects = [];
      actor.statusEffects.push({ type: 'hot', source: skill.name || '回春', perRound: per, roundsLeft: 3 });
    }
    res.lines.push(`${actor && actor.name} 生机流转（每回合回复 ${per} 点，共 3 回合）`);
    return res;
  }
  // thorns / heal_amp / crit / dodge：比例语义直读，消费点在 combat.landDamage 与 executeRound。
  if (type === 'thorns') {
    if (actor) actor.thornsPct = Math.min(Math.max(ratio, 0), 1);
    res.lines.push(`${actor && actor.name} 周身荆棘倒竖（受击反噬 ${Math.round(ratio * 100)}%）`);
    return res;
  }
  if (type === 'heal_amp') {
    if (actor) {
      if (!Array.isArray(actor.statusEffects)) actor.statusEffects = [];
      actor.statusEffects.push({ type: 'heal_amp', mult: 1 + Math.min(Math.max(ratio, 0), 2) });
    }
    res.lines.push(`${actor && actor.name} 生息汇聚（受疗效果提升 ${Math.round(ratio * 100)}%）`);
    return res;
  }
  if (type === 'crit') {
    if (actor) actor.crit_rate = Math.min((Number(actor.crit_rate) || 0) + Math.min(ratio, 1), 1);
    res.lines.push(`${actor && actor.name} 气机锐利（暴击率提升 ${Math.round(ratio * 100)}%）`);
    return res;
  }
  if (type === 'dodge') {
    if (actor) actor.dodgePct = Math.min(Math.max(ratio, 0), 1);
    res.lines.push(`${actor && actor.name} 身法虚影幢幢（闪避率 ${Math.round(ratio * 100)}%）`);
    return res;
  }
  res.unimplemented = type;
  return res;
}

module.exports = { canUse, spend, tick, applyEffect, skillKey, isImplemented, unimplementedEffects };
