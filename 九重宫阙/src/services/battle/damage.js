const elements = require('../elements');

class DamageCalculator {
  calculateBaseDamage(attacker, defender) {
    // 比值减伤（原为线性减法：def ≥ 2.5×atk 时伤害被夹到 1，高防流派近乎无敌）
    const B = require('../../config/balance');
    const baseDamage = (attacker.attack || 0) * 2;
    return B.mitigatedDamage(baseDamage, (defender && defender.defense) || 0, (defender && defender.level) || 1);
  }

  calculateCriticalDamage(damage, critRate) {
    const isCrit = Math.random() < critRate;
    return {
      damage: isCrit ? Math.floor(damage * 1.5) : damage,
      isCritical: isCrit
    };
  }

  /**
   * 元素伤害（决议 D2：7 系金木水火土光明黑暗）
   * 相克 1.3 / 被克 0.7 / 其余 1.0；任意历史命名经 elements.normalize 兼容
   */
  calculateElementDamage(damage, attackerElement, defenderElement) {
    const a = elements.normalize(attackerElement);
    const d = elements.normalize(defenderElement);
    if (a === 'none' || d === 'none') {
      return { damage: Math.floor(damage), effectiveness: 1.0, attackerElement: a, defenderElement: d };
    }
    const effectiveness = elements.effectiveness(a, d);
    return {
      damage: Math.floor(damage * effectiveness),
      effectiveness,
      attackerElement: a,
      defenderElement: d
    };
  }

  calculateSkillDamage(baseDamage, skillMultiplier, skillLevel) {
    return Math.floor(baseDamage * skillMultiplier * (1 + (skillLevel - 1) * 0.1));
  }

  calculateFinalDamage(attacker, defender, skill = null) {
    let damage = this.calculateBaseDamage(attacker, defender);

    if (skill) {
      damage = this.calculateSkillDamage(damage, skill.multiplier || 1.0, skill.level || 1);
    }

        // 修幽灵暴击：`crit_rate || 0.05` 会把**显式的 0** 也吞成 5%，于是声明了不暴击的单位（无 crit 字段的怪物模板、
    // 测试里的期望值测量）每 20 下偷偷多打 1.5 倍。缺字段才该走默认值，显式 0 必须被尊重 —— 用 ?? 而非 ||。
    const critResult = this.calculateCriticalDamage(damage, attacker.crit_rate ?? 0.05);
    damage = critResult.damage;

    const skillElement = skill?.element || attacker.element;
    const elementResult = this.calculateElementDamage(damage, skillElement, defender.element);
    damage = elementResult.damage;

    return {
      damage,
      isCritical: critResult.isCritical,
      effectiveness: elementResult.effectiveness
    };
  }
}

module.exports = new DamageCalculator();
