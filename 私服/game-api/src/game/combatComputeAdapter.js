/**
 * 伤害计算适配器（Worker 版）
 * 原 server/game/combatComputeAdapter.js 支持 Go 二进制加速（child_process），
 * Worker 环境无 Go 二进制，直接降级为纯 JS combatDamage 计算。
 */
import * as CD from './combatDamage.js';

export function calcDamage(state, attacker, defender, mode, valOrMul, isSpell, skill, skillLevel, opts) {
  return CD.calcDamage(state, attacker, defender, mode, valOrMul, isSpell, skill, skillLevel, opts);
}