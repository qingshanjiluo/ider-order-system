/**
 * 经验曲线真源（E9 曲线调平 · 轮54）。
 *
 * 为什么单独成模块：`exp_to_next` 一度同时被四处"知道"——
 *   ① `characterService.calculateExpForLevel()`（100×1.5^L 的旧曲线）
 *   ② `routes/auth.js` 建角时硬编码 100
 *   ③ `services/gameTime.js` 转世重置时硬编码 100
 *   ④ **`routes/quests.js` 交任务时自带一套私有循环**：`exp_to_next *= 1.5` + `max_hp += 10` + **无境界封顶**
 *      ⇒ 交任务可以一路把等级刷过 `max_level`，绕开突破判定，直接违反 T0-2 铁律
 *      （"速度只填满境界、不得绕过突破瓶颈"），而且 stat 与真源分叉。
 * 本模块只依赖 `balance.EXP_SHAPE_RATIO`，**不碰数据库、不 require 任何 service**，所以谁都能安全引用（无循环依赖）。
 *
 * 语义：`realms.exp_requirement` = **填满本境界所需的总修为**（唯一真源）。
 * 把它按等比 `EXP_SHAPE_RATIO` 摊到境界内的每次升级上（10 级境界 = 9 次升级），
 * 于是 Σ 境界内各级需求 == exp_requirement（`sim-balance` 有 ±1% 的一致性锁）。
 */
const { EXP_SHAPE_RATIO } = require('../config/balance');

/** 境界内的升级次数（等级区间为 [min_level, max_level]，从 min 升到 max 需要 steps 次）。 */
function stepsOf(realmRow) {
  const min = Number(realmRow && realmRow.min_level) || 1;
  const max = Number(realmRow && realmRow.max_level) || (min + 9);
  return { min, max, steps: Math.max(1, max - min) };
}

/**
 * 从 `level` 升到下一级所需的修为。realmRow 缺失或 exp_requirement 非法时返回 null，
 * 由调用方决定回退策略（保持一个地方算，不各自兜底出不同结果）。
 */
function needForLevel(realmRow, level) {
  if (!realmRow) return null;
  const total = Number(realmRow.exp_requirement);
  if (!Number.isFinite(total) || total <= 0) return null;
  const { min, steps } = stepsOf(realmRow);
  const rho = EXP_SHAPE_RATIO;
  // 境界内第 i 次升级（i 从 1 起），越界钳制：到顶后调用方应当已经走"圆满钉值"分支
  const i = Math.min(steps, Math.max(1, (Number(level) || min) - min + 1));
  const sum = rho === 1 ? steps : (Math.pow(rho, steps) - 1) / (rho - 1);
  return Math.max(1, Math.floor(total * Math.pow(rho, i - 1) / sum));
}

/** 填满整个境界所需的总修为（= Σ 境界内每次升级需求，用于与 exp_requirement 对账）。 */
function fillTotal(realmRow) {
  const { min, max } = stepsOf(realmRow);
  let s = 0;
  for (let L = min; L < max; L++) s += needForLevel(realmRow, L) || 0;
  return s;
}

module.exports = { needForLevel, fillTotal, stepsOf };
