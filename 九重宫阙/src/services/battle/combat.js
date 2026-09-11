const damageCalculator = require('./damage');
const { loadDatabase, saveDatabase } = require('../../database');

class CombatService {
  async startBattle(attackerId, defenderId, attackerType = 'character', defenderType = 'monster', skillIndex = null) {
    const db = loadDatabase();
    const attacker = this.getEntity(attackerId, attackerType, db);
    const defender = this.getEntity(defenderId, defenderType, db);

    if (!attacker || !defender) {
      return { success: false, error: '战斗单位不存在' };
    }

    const battleLog = [];
    let round = 1;
    let useSkillIndex = skillIndex;

    while (attacker.hp > 0 && defender.hp > 0) {
      const attackerResult = this.executeRound(attacker, defender, 'attacker', useSkillIndex);
      battleLog.push(attackerResult.log);
      defender.hp -= attackerResult.damage;

      if (defender.hp <= 0) {
        battleLog.push(`${defender.name} 被击败！`);
        break;
      }

      const defenderResult = this.executeRound(defender, attacker, 'defender', null);
      battleLog.push(defenderResult.log);
      attacker.hp -= defenderResult.damage;

      if (attacker.hp <= 0) {
        battleLog.push(`${attacker.name} 被击败！`);
        break;
      }

      round++;
      useSkillIndex = null;
      if (round > 50) {
        battleLog.push('战斗超时，平局！');
        break;
      }
    }

    const winner = attacker.hp > 0 ? 'attacker' : (defender.hp > 0 ? 'defender' : 'draw');
    const rewards = this.calculateRewards(winner, attacker, defender, db);

    return {
      success: true,
      winner,
      rounds: round - 1,
      battleLog,
      rewards,
      attackerMaxHp: attacker.maxHp,
      attackerFinalHp: Math.max(0, attacker.hp),
      defenderMaxHp: defender.maxHp,
      defenderFinalHp: Math.max(0, defender.hp)
    };
  }

  executeRound(attacker, defender, role, skillIndex = null) {
    const skills = attacker.skills || [];
    let skill = null;
    if (skillIndex !== null && skillIndex >= 0 && skillIndex < skills.length) {
      skill = skills[skillIndex];
    } else if (skills.length > 0) {
      skill = skills[Math.floor(Math.random() * skills.length)];
    }

    const result = damageCalculator.calculateFinalDamage(attacker, defender, skill);

    let log = '';
    if (role === 'attacker') {
      log = `${attacker.name} 攻击 ${defender.name}，造成 ${result.damage} 点伤害`;
    } else {
      log = `${attacker.name} 反击 ${defender.name}，造成 ${result.damage} 点伤害`;
    }

    if (result.isCritical) {
      log += '（暴击！）';
    }
    if (result.effectiveness > 1.0) {
      log += '（效果拔群！）';
    } else if (result.effectiveness < 1.0) {
      log += '（效果不佳）';
    }

    return {
      damage: result.damage,
      log
    };
  }

  getEntity(id, type, db) {
    if (!db) db = loadDatabase();
    if (type === 'character') {
      const char = db.characters.find(c => c.id === id);
      if (!char) return null;

      let equipAttack = 0, equipDefense = 0, equipHp = 0, equipSpeed = 0;
      const equips = (db.equipments || []).filter(e => e.character_id === char.id);
      for (const e of equips) {
        const item = (db.items || []).find(i => i.id === e.item_id);
        if (item) {
          const stats = JSON.parse(item.stats || '{}');
          const enhanceBonus = 1 + (e.enhance || 0) * 0.1;
          equipAttack += Math.floor((stats.attack || 0) * enhanceBonus);
          equipDefense += Math.floor((stats.defense || 0) * enhanceBonus);
          equipHp += Math.floor((stats.hp || 0) * enhanceBonus);
          equipSpeed += Math.floor((stats.speed || 0) * enhanceBonus);
        }
      }

      let gongfaSkillDamage = 1.0;
      const gongfas = (db.gongfa || []).filter(g => g.character_id === char.id && g.type === '战斗');
      for (const gf of gongfas) {
        const item = (db.items || []).find(i => i.id === gf.item_id);
        if (item) {
          const stats = JSON.parse(item.stats || '{}');
          gongfaSkillDamage *= stats.skill_damage || 1.0;
        }
        gongfaSkillDamage *= 1 + ((gf.level || 1) - 1) * 0.03;
      }

      let petAttack = 0, petDefense = 0, petHp = 0;
      const activePets = (db.pets || []).filter(p => p.character_id === char.id && p.is_active);
      for (const pet of activePets) {
        const item = (db.items || []).find(i => i.id === pet.item_id || i.id === pet.pet_id);
        if (item) {
          const stats = JSON.parse(item.stats || '{}');
          petAttack += stats.attack || 0;
          petDefense += stats.defense || 0;
          petHp += stats.hp || 0;
        }
        petAttack += ((pet.level || 1) - 1) * 2;
        petDefense += ((pet.level || 1) - 1) * 1;
        petHp += ((pet.level || 1) - 1) * 5;
      }

      const realmIndex = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'].indexOf(char.realm);
      const realmMultiplier = 1 + realmIndex * 0.15;

      const stats = char.stats || {};
      const constitution = stats.constitution || 10;
      const strength = stats.strength || 10;
      const physique = stats.physique || 10;
      const wisdom = stats.wisdom || 10;
      const soul = stats.soul || 10;

      const baseAttack = 10 + (char.level || 1) * 2 + strength * 0.5;
      const baseDefense = 5 + (char.level || 1) * 1 + physique * 0.3;
      const baseHp = 100 + (char.level || 1) * 10 + constitution * 2 + physique * 1.5;
      const baseSpeed = 5 + Math.floor((char.level || 1) / 5) + soul * 0.2;
      const baseMp = 50 + (char.level || 1) * 3 + wisdom * 1.5 + soul * 0.5;

      const buffService = require('../buff');
      const tempAttackBonus = buffService.getBuffMultiplier(char.id, 'attack');
      const tempDefenseBonus = buffService.getBuffMultiplier(char.id, 'defense');
      const tempSpeedBonus = buffService.getBuffMultiplier(char.id, 'speed');

      const mood = char.mood || '平静';
      let moodAttack = 1, moodDefense = 1, moodSpeed = 1;
      if (mood === '愤怒') { moodAttack = 1.1; moodSpeed = 1.05; }
      else if (mood === '悲伤') { moodDefense = 0.95; moodSpeed = 0.95; }
      else if (mood === '恐惧') { moodDefense = 0.9; }
      else if (mood === '兴奋') { moodAttack = 1.05; moodSpeed = 1.1; }
      else if (mood === '平静') { moodDefense = 1.05; }

      const charSkills = this.getCharacterSkills(char.id, db);
      const dominantElement = this.getDominantElement(charSkills);

      const spiritRoots = char.spirit_roots || [];
      let rootElementBonus = 1.0;
      for (const root of spiritRoots) {
        const purity = root.purity || 50;
        if (root.type === dominantElement) {
          rootElementBonus += purity * 0.003;
        }
      }

      const totalHp = Math.floor((baseHp + equipHp + petHp) * realmMultiplier);
      return {
        id: char.id,
        name: char.name,
        hp: char.hp || totalHp,
        maxHp: totalHp,
        mp: char.mp || Math.floor(baseMp * realmMultiplier),
        maxMp: Math.floor(baseMp * realmMultiplier),
        attack: Math.floor((baseAttack + equipAttack + petAttack) * realmMultiplier * tempAttackBonus * moodAttack),
        defense: Math.floor((baseDefense + equipDefense + petDefense) * realmMultiplier * tempDefenseBonus * moodDefense),
        speed: Math.floor((baseSpeed + equipSpeed) * realmMultiplier * tempSpeedBonus * moodSpeed),
        crit_rate: (char.crit_rate || 0.05) + (stats.luck || 10) * 0.001,
        crit_damage: char.crit_damage || 1.5,
        element: dominantElement,
        skills: charSkills,
        skillDamageMultiplier: gongfaSkillDamage * rootElementBonus
      };
    } else if (type === 'monster' || type === 'custom') {
      return this.generateMonster(id, db);
    }
    return null;
  }

  getCharacterSkills(characterId, db) {
    if (!db) db = loadDatabase();
    const gongfas = (db.gongfa || []).filter(g => g.character_id === characterId && g.type === '战斗');
    const skills = [];
    for (const gf of gongfas) {
      const item = (db.items || []).find(i => i.id === gf.item_id);
      if (item) {
        const stats = JSON.parse(item.stats || '{}');
        skills.push({
          name: item.name,
          multiplier: stats.skill_damage || 1.0,
          level: gf.level || 1,
          element: stats.element
        });
      }
    }
    return skills;
  }

  getDominantElement(skills) {
    if (!skills || skills.length === 0) return 'none';
    const elementCount = {};
    for (const sk of skills) {
      if (sk.element && sk.element !== 'none') {
        elementCount[sk.element] = (elementCount[sk.element] || 0) + 1;
      }
    }
    let maxCount = 0;
    let dominant = 'none';
    for (const [el, count] of Object.entries(elementCount)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = el;
      }
    }
    return dominant;
  }

  normalizeElement(element) {
    // 阶段2：统一委托元素单一事实源（修复旧表 金→earth 的映射冲突）
    return require('../elements').normalize(element);
  }

  generateMonster(mapId, db) {
    if (!db) db = loadDatabase();

    if (typeof mapId === 'object' && mapId.monsters) {
      const monsterData = mapId;
      const stats = JSON.parse(monsterData.stats || '{}');
      return {
        id: `monster_${Date.now()}`,
        name: monsterData.name,
        level: Math.floor(Math.random() * (monsterData.level_range[1] - monsterData.level_range[0] + 1)) + monsterData.level_range[0],
        hp: stats.hp || 50,
        maxHp: stats.hp || 50,
        attack: stats.attack || 5,
        defense: stats.defense || 3,
        speed: stats.speed || 3,
        crit_rate: 0.03,
        element: this.normalizeElement(monsterData.element),
        skills: []
      };
    }

    const monsters = (db.monsters || []).filter(m => m.map_id === mapId);
    if (monsters.length > 0) {
      const monsterData = monsters[Math.floor(Math.random() * monsters.length)];
      const stats = JSON.parse(monsterData.stats || '{}');
      const level = Math.floor(Math.random() * (monsterData.level_range[1] - monsterData.level_range[0] + 1)) + monsterData.level_range[0];
      const levelScale = 1 + (level - monsterData.level_range[0]) * 0.1;
      return {
        id: `monster_${Date.now()}`,
        name: monsterData.name,
        level,
        hp: Math.floor((stats.hp || 50) * levelScale),
        maxHp: Math.floor((stats.hp || 50) * levelScale),
        attack: Math.floor((stats.attack || 5) * levelScale),
        defense: Math.floor((stats.defense || 3) * levelScale),
        speed: Math.floor((stats.speed || 3) * levelScale),
        crit_rate: 0.03,
        element: this.normalizeElement(monsterData.element),
        skills: []
      };
    }

    const map = (db.maps || []).find(m => m.id === mapId);
    if (!map) return null;

    const level = Math.floor(Math.random() * (map.max_level - map.min_level + 1)) + map.min_level;
    const difficulty = map.difficulty;

    return {
      id: `monster_${Date.now()}`,
      name: `${map.name}妖兽`,
      level,
      hp: Math.floor(50 + level * 5 * difficulty),
      maxHp: Math.floor(50 + level * 5 * difficulty),
      attack: Math.floor(5 + level * 1.5 * difficulty),
      defense: Math.floor(3 + level * 1 * difficulty),
      speed: Math.floor(3 + level * 0.5 * difficulty),
      crit_rate: 0.03,
      element: this.normalizeElement(map.element),
      skills: []
    };
  }

  calculateRewards(winner, attacker, defender, db) {
    if (winner !== 'attacker') {
      return { exp: 0, spiritStone: 0, items: [] };
    }

    const level = defender.level || 1;
    const exp = Math.floor(20 + level * 5);
    const baseSpiritStone = Math.floor(10 + level * 2);

    const charService = require('../character');
    const charData = db ? db.characters.find(c => c.id === attacker.id) : null;
    const vipBonus = charService.getVipBonus(charData?.vip_level || 0);
    const spiritStone = Math.floor(baseSpiritStone * vipBonus.spiritStoneBonus);

    const drops = [];
    if (Math.random() < 0.3) {
      drops.push({ type: '灵石', quantity: spiritStone });
    }
    if (Math.random() < 0.1) {
      drops.push({ type: '装备', quality: '凡器' });
    }

    return { exp, spiritStone, items: drops, vipExpBonus: vipBonus.expBonus, vipStoneBonus: vipBonus.spiritStoneBonus };
  }

  generateEnemy(character) {
    const charLevel = character.level || 1;
    const variance = Math.floor(Math.random() * 3) - 1;
    const enemyLevel = Math.max(1, charLevel + variance);

    const enemies = [
      { name: '黑风妖', element: 'earth' },
      { name: '血魔', element: 'fire' },
      { name: '幽冥鬼', element: 'dark' },
      { name: '天雷兽', element: 'lightning' },
      { name: '玄冰蛇', element: 'water' },
      { name: '烈焰鸟', element: 'fire' },
      { name: '木灵', element: 'wind' },
      { name: '土行孙', element: 'earth' },
      { name: '风行者', element: 'wind' },
      { name: '光明使者', element: 'holy' }
    ];

    const enemy = enemies[Math.floor(Math.random() * enemies.length)];
    const scale = 1 + enemyLevel * 0.1;

    return {
      id: `enemy_${Date.now()}`,
      name: `${enemy.name} Lv.${enemyLevel}`,
      level: enemyLevel,
      hp: Math.floor(50 * scale),
      maxHp: Math.floor(50 * scale),
      attack: Math.floor(5 * scale),
      defense: Math.floor(3 * scale),
      speed: Math.floor(3 * scale),
      element: enemy.element,
      skills: []
    };
  }
}

module.exports = new CombatService();
