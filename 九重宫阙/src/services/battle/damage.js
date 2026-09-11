class DamageCalculator {
  calculateBaseDamage(attacker, defender) {
    const baseDamage = attacker.attack * 2;
    const defenseReduction = defender.defense * 0.8;
    return Math.max(1, Math.floor(baseDamage - defenseReduction));
  }

  calculateCriticalDamage(damage, critRate) {
    const isCrit = Math.random() < critRate;
    return {
      damage: isCrit ? Math.floor(damage * 1.5) : damage,
      isCritical: isCrit
    };
  }

  calculateElementDamage(damage, attackerElement, defenderElement) {
    const elementEffectiveness = {
      'fire':      { 'wind': 1.5, 'earth': 1.5, 'water': 0.7, 'fire': 0.5 },
      'water':     { 'fire': 1.5, 'lightning': 1.5, 'earth': 0.7, 'water': 0.5 },
      'earth':     { 'lightning': 1.5, 'water': 1.5, 'wind': 0.7, 'earth': 0.5 },
      'lightning': { 'wind': 1.5, 'holy': 1.5, 'water': 0.7, 'earth': 0.7 },
      'wind':      { 'holy': 1.5, 'dark': 1.5, 'fire': 0.7, 'earth': 0.7 },
      'dark':      { 'holy': 1.5, 'fire': 1.5, 'wind': 0.7, 'dark': 0.5 },
      'holy':      { 'dark': 1.5, 'holy': 0.5, 'wind': 0.7, 'lightning': 0.7 },
      'none':      {}
    };

    if (!attackerElement || !defenderElement || attackerElement === 'none' || defenderElement === 'none') {
      return { damage, effectiveness: 1.0 };
    }

    const effectiveness = elementEffectiveness[attackerElement]?.[defenderElement] || 1.0;
    return {
      damage: Math.floor(damage * effectiveness),
      effectiveness
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

    const critResult = this.calculateCriticalDamage(damage, attacker.crit_rate || 0.05);
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
