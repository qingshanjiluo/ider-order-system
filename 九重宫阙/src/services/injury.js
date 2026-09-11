/**
 * 伤势系统（阶段2 · 决议 D5 定稿）
 *
 * 规则：
 *   - 伤势 0-100：战斗中按「承受伤害÷最大生命」积累；挂机与手动同系数；PVP ×2
 *   - 伤势不直接扣寿，仅阶梯施压：≥30 战力-5%；≥60 战力-15%+修炼-10%；重伤状态 战力-30%+修炼-30%
 *   - 唯一扣寿来源 = 重伤事件：单场战败（×2%）或濒死（HP<10% 幸存，×1%），
 *     扣当前寿元上限的 1%/2%（经 gameTime.subtractLifespan，永久）
 *   - 自动调息（可配置，默认开，阈值 80）：伤势达阈值自动停战休整，
 *     每游戏日 -20（洞府中 ×2）；关闭则重伤风险自负
 *   - 疗伤丹清空伤势/解除重伤；寿元扣至耗尽 → 坐化转世（衔接 D1）
 */
const gameTime = require('./gameTime');

const HEAVY_INJURY_LOST_PCT = { defeat: 0.02, nearDeath: 0.01 };
const MEDITATE_RECOVER_PER_GAME_DAY = 20; // 每游戏日恢复伤势
const GAME_HOURS_PER_GAME_DAY = 2.4;      // 1游戏日 = 24/10 小时现实

class InjuryService {
  /** 战斗伤势积累。返回当前伤势值。 */
  accumulate(character, damageTaken, maxHp, isPvp = false) {
    if (!maxHp || maxHp <= 0) maxHp = character.max_hp || 1;
    const base = (damageTaken / maxHp) * 100;
    const amount = base * (isPvp ? 2 : 1);
    character.injury = Math.min(100, (character.injury || 0) + amount);
    return character.injury;
  }

  /** 阶梯 debuff（战斗/修炼读取） */
  getDebuffs(character) {
    const injury = character.injury || 0;
    if (character.injury_status === '重伤' || injury >= 100) {
      return { combatMultiplier: 0.7, cultivateMultiplier: 0.7, heavy: true };
    }
    if (injury >= 60) return { combatMultiplier: 0.85, cultivateMultiplier: 0.9, heavy: false };
    if (injury >= 30) return { combatMultiplier: 0.95, cultivateMultiplier: 1.0, heavy: false };
    return { combatMultiplier: 1.0, cultivateMultiplier: 1.0, heavy: false };
  }

  /** 是否应进入自动调息 */
  shouldAutoMeditate(character) {
    if (character.auto_meditate === false) return false;
    const threshold = character.auto_meditate_threshold || 80;
    return (character.injury || 0) >= threshold;
  }

  /**
   * 调息推进（按现实流逝小时换算游戏日恢复；洞府休养 ×2）。
   * 返回恢复量。
   */
  meditateRecover(character, elapsedRealHours, inCave = false) {
    if (!(character.injury > 0)) return 0;
    const gameDays = elapsedRealHours / GAME_HOURS_PER_GAME_DAY;
    const rate = MEDITATE_RECOVER_PER_GAME_DAY * (inCave ? 2 : 1);
    const recover = Math.min(character.injury, gameDays * rate);
    character.injury = Math.max(0, character.injury - recover);
    if (character.injury < 100 && character.injury_status === '重伤' && character.injury <= 0) {
      character.injury_status = 'none';
    }
    return recover;
  }

  /**
   * 重伤事件（唯一扣寿来源）。
   * @param {'defeat'|'nearDeath'} kind
   * @returns {{lostYears, remaining, died}}
   */
  triggerHeavyInjury(character, kind) {
    const pct = HEAVY_INJURY_LOST_PCT[kind] || HEAVY_INJURY_LOST_PCT.nearDeath;
    const cap = gameTime.effectiveLifespan(character) || 0;
    const lost = gameTime.subtractLifespan(character, cap * pct);
    character.injury = 100;
    character.injury_status = '重伤';
    const died = gameTime.shouldPassAway(character);
    gameTime.logEvent(
      character,
      'battle_injury',
      kind === 'defeat' ? '战败重伤' : '濒死重伤',
      `寿元折损 ${Math.round(lost)} 年`
    );
    return { lostYears: lost, remaining: gameTime.effectiveLifespan(character), died };
  }

  /** 疗伤（丹药）：立即清空伤势并解除重伤状态 */
  fullHeal(character) {
    character.injury = 0;
    character.injury_status = 'none';
  }
}

module.exports = new InjuryService();
