const damageCalculator = require('./damage');
const { loadDatabase, saveDatabase } = require('../../database');

class CombatService {
  /**
   * 纯回合循环（**不碰 DB**）：startBattle 与只读 sim 共用这一份战斗数学。
   * 此前 sim-battle / sim-tribulation 各自抄了一遍主循环，等于三套回合数学会各自漂移。
   *
   * opts.winMode:
   *   'kill'（默认，行为与历史完全一致）：打到一方倒下或 50 回合超时；
   *   'survive'（T0-1 扛劫判定）：应劫者撑满 surviveRounds 回合即胜 —— 天劫不必被"杀死"。
   *     同时 strikeVariance=[lo,hi] 会给**应劫者承受的每下伤害**乘以均匀波动系数，
   *     因为本游戏单场战斗近乎确定（随机源只有暴击与克制），不引入波动就没有"胜率"可言。
   */
  runBattleLoop(attacker, defender, opts) {
    const o = Object.assign({ winMode: 'kill', surviveRounds: 0, strikeVariance: null, strikeMul: 1, maxRounds: 50, skillIndex: null }, opts || {});
    const survive = o.winMode === 'survive';
    const cap = survive ? Math.max(1, o.surviveRounds | 0) : o.maxRounds;
    const battleLog = [];
    let round = 0;
    let useSkillIndex = o.skillIndex;

    // E3：先手由速度决定（此前攻方无条件先手，speed 是空转属性）；
    // 攻方的技能索引只在攻方行动那一下生效，不因先手归属而丢失。
    while (attacker.hp > 0 && defender.hp > 0) {
      round++;
      const roll = (survive && Array.isArray(o.strikeVariance) && o.strikeVariance.length === 2)
        ? (Number(o.strikeVariance[0]) + Math.random() * (Number(o.strikeVariance[1]) - Number(o.strikeVariance[0])))
        : 1;
      const attackerFirst = this.decideInitiative(attacker, defender);
      const first = attackerFirst ? attacker : defender;
      const second = attackerFirst ? defender : attacker;

      const r1 = this.executeRound(first, second, attackerFirst ? 'attacker' : 'defender',
        attackerFirst ? useSkillIndex : null);
      battleLog.push(r1.log);
      // 天罚波动只作用在应劫者（攻方）承受的伤上：攻方后手时 r1 打中的就是攻方
      second.hp -= Math.round(r1.damage * (attackerFirst ? 1 : roll));
      if (attackerFirst) useSkillIndex = null;
      if (second.hp <= 0) {
        if (survive) {
          // 天劫之身不可灭：应劫的判据是"顶住几道雷"，不是"杀死天"
          second.hp = 1;
          battleLog.push(`${second.name} 之身乃天劫所化，不可消灭。`);
        } else {
          battleLog.push(`${second.name} 被击败！`);
          break;
        }
      }

      const r2 = this.executeRound(second, first, attackerFirst ? 'defender' : 'attacker', useSkillIndex);
      battleLog.push(r2.log);
      first.hp -= Math.round(r2.damage * (attackerFirst ? roll : 1));
      useSkillIndex = null;
      if (first.hp <= 0) {
        battleLog.push(`${first.name} 被击败！`);
        break;
      }

      if (survive && round >= cap) {
        battleLog.push(`第 ${round} 重劫雷尽数落下，${attacker.name} 硬扛了过去。`);
        break;
      }
      if (!survive && round >= cap) {
        battleLog.push('战斗超时，平局！');
        break;
      }
    }

    const timedOut = attacker.hp > 0 && defender.hp > 0;
    return {
      battleLog, round, timedOut,
      winner: attacker.hp > 0 ? 'attacker' : (defender.hp > 0 ? 'defender' : 'draw')
    };
  }

  async startBattle(attackerId, defenderId, attackerType = 'character', defenderType = 'monster', skillIndex = null, opts = null) {
    const db = loadDatabase();
    const attacker = this.getEntity(attackerId, attackerType, db);
    const defender = this.getEntity(defenderId, defenderType, db);

    if (!attacker || !defender) {
      return { success: false, error: '战斗单位不存在' };
    }

    const loop = this.runBattleLoop(attacker, defender, Object.assign({ skillIndex }, opts || {}));
    const battleLog = loop.battleLog;
    const round = loop.round;
    const winner = loop.winner;
    const rewards = this.calculateRewards(winner, attacker, defender, db);

    return {
      success: true,
      winner,
      rounds: round,
      battleLog,
      rewards,
      attackerMaxHp: attacker.maxHp,
      attackerFinalHp: Math.max(0, attacker.hp),
      defenderMaxHp: defender.maxHp,
      defenderFinalHp: Math.max(0, defender.hp)
    };
  }

  executeRound(attacker, defender, role, skillIndex = null) {
    const skillState = require('./skillState');
    const before = [];

    // 自己行动前结算：冷却递减 + 自身持续伤害（放在这里就不必改主循环）
    const tick = skillState.tick(attacker);
    if (tick.tickDamage > 0) {
      attacker.hp = Math.max(0, (Number(attacker.hp) || 0) - tick.tickDamage);
      before.push(...tick.lines);
    }
    if ((Number(attacker.hp) || 0) <= 0) {
      return {
        damage: 0, statusDamage: tick.tickDamage, skillUsed: null, unimplementedEffect: null,
        log: (before.length ? before.join('；') : `${attacker.name} 死于持续伤害`)
      };
    }

    const skills = attacker.skills || [];
    let skill = null;
    let skipped = null;
    let attempted = null;
    if (skillIndex !== null && skillIndex >= 0 && skillIndex < skills.length) {
      attempted = skills[skillIndex];
      const check = skillState.canUse(attempted, attacker);
      if (check.ok) skill = attempted; else skipped = check;
    } else {
      // 未指定技能：只从**可用**技里取第一个（旧实现是纯随机，会随机到 MP 不足/冷却中的招）
      for (const s of skills) { if (skillState.canUse(s, attacker).ok) { skill = s; break; } }
    }
    if (skipped) {
      // 关键修正：玩家指定的招不可用时退回普通攻击，绝不静默替换成另一招
      before.push(skipped.reason === 'mp'
        ? `${attacker.name} 灵力不足（【${attempted.name}】需 ${skipped.need}，实有 ${skipped.have}），改为普通攻击`
        : `【${attempted.name}】尚在冷却（还需 ${skipped.remaining} 回合），${attacker.name} 改为普通攻击`);
    }

    const result = damageCalculator.calculateFinalDamage(attacker, defender, skill);
    if (skill) skillState.spend(skill, attacker);   // 扣 MP + 置冷却

    let log;
    if (skill) {
      log = role === 'attacker'
        ? `${attacker.name} 施展【${skill.name}】命中 ${defender.name}，造成 ${result.damage} 点伤害`
        : `${attacker.name} 以【${skill.name}】回敬 ${defender.name}，造成 ${result.damage} 点伤害`;
    } else if (role === 'attacker') {
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

    const after = [];
    const eff = skillState.applyEffect(skill, attacker, defender, result.damage);
    if (eff.selfHeal > 0) {
      const cap = Number(attacker.maxHp) || (Number(attacker.hp) || 0) + eff.selfHeal;
      attacker.hp = Math.min(cap, (Number(attacker.hp) || 0) + eff.selfHeal);
      after.push(...eff.lines);
    }
    if (eff.appliedDot && defender) {
      if (!Array.isArray(defender.statusEffects)) defender.statusEffects = [];
      defender.statusEffects.push(eff.appliedDot);
      after.push(...eff.lines);
    }

    return {
      damage: result.damage,
      statusDamage: tick.tickDamage,
      skillUsed: skill ? skill.name : null,
      mpLeft: Number(attacker.mp) || 0,
      unimplementedEffect: eff.unimplemented || null,
      log: before.concat([log], after).join('；')
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

      // 阶段5：伤势战斗 debuff（D5）
      const injuryService = require('../injury');
      const injuryDebuff = injuryService.getDebuffs(char);
      // 阶段5：宗门演武馆战力加成
      let sectCombat = 0;
      try {
        const benefits = require('../sect').getBenefits(char);
        if (benefits.inSect) sectCombat = benefits.combatBonus || 0;
      } catch (_) { /* 宗门异常不阻塞战斗 */ }

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
        attack: Math.floor((baseAttack + equipAttack + petAttack) * realmMultiplier * tempAttackBonus * moodAttack * injuryDebuff.combatMultiplier * (1 + sectCombat)),
        defense: Math.floor((baseDefense + equipDefense + petDefense) * realmMultiplier * tempDefenseBonus * moodDefense * injuryDebuff.combatMultiplier * (1 + sectCombat)),
        speed: Math.floor((baseSpeed + equipSpeed) * realmMultiplier * tempSpeedBonus * moodSpeed * injuryDebuff.combatMultiplier * (1 + sectCombat)),
        crit_rate: (char.crit_rate || 0.05) + (stats.luck || 10) * 0.001,
        crit_damage: char.crit_damage || 1.5,
        element: dominantElement,
        skills: charSkills,
        skillDamageMultiplier: gongfaSkillDamage * rootElementBonus,
        injuryHeavy: injuryDebuff.heavy
      };
    } else if (type === 'monster' || type === 'custom') {
      // E3：先按怪物模板取。此前 id 被直接当成 mapId 传给 generateMonster，
      // 导致 db.monsters 的 86 行模板在战斗中从未使用，且 id > 地图数时整只怪为 null。
      const tpl = (db.monsters || []).find(x => x.id === id);
      if (tpl) return this.buildMonsterFromTemplate(tpl);
      return this.generateMonster(id, db);
    }
    return null;
  }

  /**
   * 由怪物模板实例化战斗单位。
   * 等级在 level_range 内随机；stats 按本仓约定是 JSON 字符串（角色侧同样 JSON.parse）；
   * 模板普遍缺 speed → 按等级推导，使先手判定在 PVE 真正生效（此前恒归攻方）。
   */
  buildMonsterFromTemplate(tpl) {
    const range = Array.isArray(tpl.level_range) ? tpl.level_range : [1, 3];
    const lo = Math.max(1, Number(range[0]) || 1);
    const hi = Math.max(lo, Number(range[1]) || lo);
    const level = lo + Math.floor(Math.random() * (hi - lo + 1));

    let s = tpl.stats;
    if (typeof s === 'string') { try { s = JSON.parse(s || '{}'); } catch (e) { s = {}; } }
    s = s && typeof s === 'object' ? s : {};

    const scale = 1 + (level - 1) * 0.12;
    const hp = Math.floor((Number(s.hp) || 60) * scale);
    const derivedSpeed = Math.floor(Number(s.speed) || (5 + level * 0.4));
    return {
      id: `monster_${tpl.id}_${Date.now()}`,
      templateId: tpl.id,
      name: tpl.name,
      level,
      hp,
      maxHp: hp,
      attack: Math.floor((Number(s.attack) || 8) * scale),
      defense: Math.floor((Number(s.defense) || 5) * scale),
      speed: Math.max(1, derivedSpeed),
      crit_rate: s.crit_rate != null ? Number(s.crit_rate) : 0.03,
      element: this.normalizeElement(tpl.element || s.element),
      skills: [],
      drops: tpl.drops || []
    };
  }

  getCharacterSkills(characterId, db) {
    if (!db) db = loadDatabase();
    // E3/T0-3：技能池唯一真源 = player_skills（章程 E3 原文）。
    // 功法不再是主动技来源：它通过 skill_damage（getEntity 的被动乘区）与修炼速度
    // （cultivation-model）继续生效，避免同一角色存在两套互不知情的主动技池。
    // 旧数据兼容：gongfa 表当前 0 行，删除该分支不改变任何现存战斗。
    const skills = [];
    const skillService = require('../skill');
    const DATA = skillService.SKILLS_DATA || [];
    const equipped = (db.player_skills || []).filter(ps => ps.character_id === characterId && ps.equipped_slot);
    for (const ps of equipped) {
      const def = DATA.find(s => s.id === ps.skill_id);
      if (!def) continue;
      if (def.type === 'passive') continue; // 被动不进回合技池
      skills.push({
        name: def.name,
        multiplier: (def.damage_mult || 1.0) * (1 + ((ps.level || 1) - 1) * 0.1),
        level: ps.level || 1,
        element: def.element,
        slot: ps.equipped_slot,
        keyRounds: def.key_rounds || null,
        // T0-3：214 条技能定义全部带这四个字段，此前在这里被整段丢弃 → 战斗无从消费
        manaCost: Number(def.mana_cost) || 0,
        cooldown: Number(def.cooldown) || 0,
        effectType: def.effect_type || null,
        effectValue: def.effect_value,
        key: def.id,
        source: 'player_skill'
      });
    }
    // 技能池顺序确定化：main < sub < ultimate，保证前端/调用方的 skillIndex=0 恒等于主技
    const SLOT_ORDER = { main: 0, sub: 1, ultimate: 2 };
    skills.sort((a, b) => {
      const oa = SLOT_ORDER[a.slot] != null ? SLOT_ORDER[a.slot] : 9;
      const ob = SLOT_ORDER[b.slot] != null ? SLOT_ORDER[b.slot] : 9;
      return (oa - ob) || String(a.key).localeCompare(String(b.key));
    });
    return skills;
  }

  /**
   * 阶段5：战后结算（伤势积累 + 重伤扣寿）。
   * opts.arena=true → 擂台规则：伤势减半积累、免扣寿（评审决议）
   */
  aftermath(character, result, opts = {}) {
    const injuryService = require('../injury');
    if (!result || !result.success) return result;
    const dmgTaken = Math.max(0, (result.attackerMaxHp || 0) - (result.attackerFinalHp || 0));
    if (opts.arena) {
      injuryService.accumulate(character, dmgTaken * 0.5, result.attackerMaxHp, false);
    } else {
      injuryService.accumulate(character, dmgTaken, result.attackerMaxHp, false);
      if (result.winner === 'defender') {
        result.heavyInjury = injuryService.triggerHeavyInjury(character, 'defeat');
      } else if (result.attackerFinalHp >= 0 && result.attackerFinalHp < (result.attackerMaxHp || 1) * 0.1) {
        result.heavyInjury = injuryService.triggerHeavyInjury(character, 'nearDeath');
      }
    }
    result.injury = { value: Math.round(character.injury || 0), status: character.injury_status || 'none' };
    return result;
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

  /**
   * E3 · 先手判定：速度高者先手；同速则攻方先手（保证结果确定、可复现）。
   * speed 缺失或为 0 按 0 处理，不允许 undefined 比较把先手随机化。
   */
  decideInitiative(attacker, defender) {
    const as = (attacker && attacker.speed) || 0;
    const ds = (defender && defender.speed) || 0;
    return as >= ds;
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

    const B = require('../../config/balance');
    const drops = [];
    if (Math.random() < B.LOOT_PITY.stoneChance) {
      drops.push({ type: '灵石', quantity: spiritStone });
    }

    // E3：装备掉落此前只返回描述对象，**全仓无人消费 rewards.items → 玩家永远拿不到**（机制空转）。
    // 现在真正入包，并按敌方等级决定品质，连续空手到达保底则必出。
    const dry = charData ? (charData.loot_dry_streak || 0) : 0;
    const rolled = Math.random() < B.LOOT_PITY.equipChance;
    const pity = dry >= B.LOOT_PITY.dryStreakToGuarantee;
    if (rolled || pity) {
      const quality = (B.LOOT_QUALITY_BY_LEVEL.find(q => level >= q.min) || B.LOOT_QUALITY_BY_LEVEL[B.LOOT_QUALITY_BY_LEVEL.length - 1]).quality;
      let granted = null;
      try {
        const itemService = require('../item');
        const eq = itemService.generateEquipment((charData && charData.realm) || '炼气', quality);
        if (eq && db) {
          const itemId = require('../../database').getNextId('items');
          db.items.push(Object.assign({ id: itemId }, eq));
          db.inventory.push({ character_id: attacker.id, item_id: itemId, quantity: 1 });
          granted = { type: '装备', quality, name: eq.name || null, itemId };
        }
      } catch (e) { /* 生成失败：不计入掉落，按空手累计保底 */ }
      if (granted) {
        drops.push(granted);
        if (charData) charData.loot_dry_streak = 0;
      } else if (charData) {
        charData.loot_dry_streak = dry + 1;
      }
    } else if (charData) {
      charData.loot_dry_streak = dry + 1;
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
