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
      second.hp -= this.landDamage(second, first, Math.round(r1.damage * (attackerFirst ? 1 : roll)), battleLog);
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
      first.hp -= this.landDamage(first, second, Math.round(r2.damage * (attackerFirst ? roll : 1)), battleLog);
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
      // 轮103 修正：超时（双方都还活着）不再判攻方胜，改判平局。
      //
      // 病因：原实现 `attacker.hp > 0 ? 'attacker' : ...` 让"50 回合磨不死怪"被记成玩家赢，
      //   于是怪的血量越高 → 越容易打满 50 回合 → 玩家"白赢"越多。
      //   实测：给大乘/渡劫的怪加 50% 血，玩家胜率反而从 55.7% 升到 63.9% —— 血量这个旋钮
      //   在高端段位方向是反的，导致"四段胜率带"与"TTK 窗口"两条验收锁无法同时满足（章程 R13）。
      //   修掉超时白胜后，血量恢复成正常的"越厚越难赢"，两个约束才可能同时成立。
      //
      // 影响面：只在 round 达到上限（默认 50）且双方均存活时改变结论。
      //   · survive 口径（大限劫）走的是另一条分支（第 60 行，命中即判玩家扛过），不受影响；
      //   · 倒计时/挂机结算看 winner === 'attacker'，超时局原本也是"玩家没打死怪"，
      //     判平后仍不会发击杀奖励，行为更符合直觉。
      winner: attacker.hp <= 0
        ? (defender.hp <= 0 ? 'draw' : 'defender')
        : (defender.hp <= 0 ? 'attacker' : 'draw')
    };
  }

  /**
   * 轮70：伤害的统一结算口——闪避→护盾→荆棘反噬一条链走完，返回实际掉血量。
   * sim（sim-battle/sim-tribulation/TTK）的实体不带技能，dodgePct/shieldPool/thornsPct 全为空，
   * 本函数对它们恒等于原样扣血 ⇒ 二十期行为锁与 TTK 确定性锁不受影响（门禁实测为证）。
   */
  landDamage(target, attacker, rawDamage, battleLog) {
    let d = Number(rawDamage) || 0;
    if (d <= 0 || !target) return Math.max(0, d);
    if ((Number(target.dodgePct) || 0) > 0 && Math.random() < Number(target.dodgePct)) {
      battleLog.push(`${target.name} 身形一晃，避开了这一击。`);
      return 0;
    }
    const pool = Number(target.shieldPool) || 0;
    if (pool > 0) {
      const absorbed = Math.min(pool, d);
      target.shieldPool = pool - absorbed;
      d -= absorbed;
      battleLog.push(`${target.name} 的护盾抵消 ${absorbed} 点伤害${target.shieldPool <= 0 ? '（护盾破碎）' : ''}`);
    }
    const thorns = Number(target.thornsPct) || 0;
    if (thorns > 0 && attacker) {
      // 反噬按"这一下原始伤害"的比例算（护盾吸收与否不影响反噬基数）
      const reflected = Math.max(1, Math.round(Number(rawDamage) * Math.min(thorns, 1)));
      const backPool = Number(attacker.shieldPool) || 0;
      const backAbsorbed = Math.min(backPool, reflected);
      if (backAbsorbed > 0) attacker.shieldPool = backPool - backAbsorbed;
      attacker.hp = Math.max(0, (Number(attacker.hp) || 0) - (reflected - backAbsorbed));
      battleLog.push(`${target.name} 的荆棘反噬 ${attacker.name} ${reflected} 点伤害`);
    }
    return d;
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
    // 轮79：noLoot 闸门——竞技场/切磋用全仿真定胜负，但产出不走 PVE 掉落线
    // （calculateRewards 会真实把装备推进背包，PVP 双轨发放会绕开经济守恒基线）
    const rewards = (opts && opts.noLoot)
      ? { exp: 0, spiritStone: 0, items: [] }
      : this.calculateRewards(winner, attacker, defender, db);

    // 轮105：把双方的名字与所在地图带出来。剧情委托的目标是具体的
    // （「讨伐 灵兔」「清妖兽森林」），钩子需要怪名/地图名才能对上目标；
    // 前端展示战报也用得上。
    // ⚠ 地图不能从 "mapId" 参数取 —— startBattle 的签名是 (attackerId, defenderId,…)，
    //    作用域里根本没有 mapId。怪的所在图要从 defender.map_id 反查（generateMonster 会带上）。
    const defMap = defender.map_id != null && db.maps
      ? db.maps.find((m) => Number(m.id) === Number(defender.map_id))
      : null;
    return {
      success: true,
      winner,
      rounds: round,
      battleLog,
      rewards,
      attackerMaxHp: attacker.maxHp,
      attackerFinalHp: Math.max(0, attacker.hp),
      defenderMaxHp: defender.maxHp,
      defenderFinalHp: Math.max(0, defender.hp),
      enemy: { name: defender.name, level: defender.level || null },
      map: defMap ? defMap.name : null
    };
  }

  executeRound(attacker, defender, role, skillIndex = null) {
    const skillState = require('./skillState');
    const before = [];

    // 自己行动前结算：冷却递减 + 自身持续伤害（放在这里就不必改主循环）
    const tick = skillState.tick(attacker);
    if (tick.tickDamage > 0) {
      attacker.hp = Math.max(0, (Number(attacker.hp) || 0) - tick.tickDamage);
    }
    // 轮70：hot 的逐回合回复——与 dot 同一"行动前"结算点，且不越过 maxHp
    if ((tick.tickHeal || 0) > 0) {
      const capHp = Number(attacker.maxHp) || 0;
      const healed = (Number(attacker.hp) || 0) + tick.tickHeal;
      attacker.hp = capHp > 0 ? Math.min(capHp, healed) : healed;
    }
    if (tick.lines.length && (tick.tickDamage > 0 || (tick.tickHeal || 0) > 0)) before.push(...tick.lines);
    if ((Number(attacker.hp) || 0) <= 0) {
      return {
        damage: 0, statusDamage: tick.tickDamage, skillUsed: null, unimplementedEffect: null,
        log: (before.length ? before.join('；') : `${attacker.name} 死于持续伤害`)
      };
    }
    // 轮70：眩晕——时间照常流逝（上面冷却/dot/hot 都已结算），但本次不出手。
    // 确定性 1 回合是设计解读：stun 的 effect_value 0.35 无回合/概率可机读语义，
    // 概率化会让二十期行为锁与 TTK 确定性锁变成掷骰子，故不采。
    if ((Number(attacker.stunPending) || 0) > 0) {
      attacker.stunPending = (Number(attacker.stunPending) || 0) - 1;
      before.push(`${attacker.name} 被眩晕，无法行动！`);
      return {
        damage: 0, statusDamage: tick.tickDamage, skillUsed: null, unimplementedEffect: null,
        log: before.join('；')
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
    // 轮70：heal_amp 挂自身（战时临时 statusEffect），所有 selfHeal 通道（heal/lifesteal/drain）都吃它
    const ampEff = Array.isArray(attacker.statusEffects) ? attacker.statusEffects.find((e) => e && e.type === 'heal_amp') : null;
    if (eff.selfHeal > 0 && ampEff) eff.selfHeal = Math.round(eff.selfHeal * (Number(ampEff.mult) || 1));
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
          // 轮92：附魔词条按装备实例合并。此前 enchant 把词条写回共享字典行 item.stats
          // （全服同名装备互染的污染洞）；该路由在轮91 前从未接线、生产档零词条存量，
          // 直接切实例语义无历史债。暴击类词条 getEntity 本就不聚合，如实留在词条册上。
          for (const ench of (e.enchants || [])) {
            const es = ench.stats || {};
            equipAttack += es.attack || 0;
            equipDefense += es.defense || 0;
            equipHp += es.hp || 0;
            equipSpeed += es.speed || 0;
          }
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

      // 轮113：心情加成的**数值 → 心境**桥接。
      //
      // 修前：这里读 `char.mood`（字符串 '愤怒'/'悲伤'…），但**玩家操作改的是
      // `character.stats.mood`（数值 0-100）** —— `/character/mood` 的冥想/饮酒/游历
      // 全部只动数值那个字段。存档实测：**0/32 个角色有 char.mood**，15/32 有
      // `stats.mood`。也就是说这五个分支从来只命中默认值 `'平静'`，玩家花灵石调心情，
      // 战斗**完全不受影响**（永远只吃 防御×1.05）。
      //
      // 现在双轨兼容并优先读数值：
      //   · `stats.mood`（数值，玩家能操作）→ 按档位映射成心境
      //   · 没有数值时退回旧的 `char.mood` 字符串（老存档/别处写入仍生效）
      //
      // 档位与 /character/mood 的单次变动量（+5~+15，上限 100）相称。
      //
      // 边界经过两轮修正，判据是**综合收益必须随心情单调不降**：
      //
      //   v1: 50~69 定「悲伤」→ 玩家花灵石加心情反而变弱（50→65 面板不升），反直觉。
      //   v2: 55~79 定「愤怒」(atk×1.1, spd×1.05)、80~94 定「平静」(仅 def×1.05)
      //       → **综合分从 75 的 205 掉到 85 的 183**。愤怒比平静强，
      //         玩家会学会"刻意停在 75"，这是设计缺陷而非策略深度。
      //
      //   v3: 负向只保留极低谷、中段中性、高档正向 —— 但 40~54 的「悲伤」
      //       (def×0.95, spd×0.95) 仍造成一处非单调：mood=45 的综合分 193
      //       **低于 mood=25 的 198**，玩家从 25 提到 45 反而变弱。
      //
      //   v5（现在）：问题不在档位边界，而在**档位制本身** ——
      //       「悲伤」(def×0.95, spd×0.95) 双降，反而比只降防御的「恐惧」(def×0.9)
      //       更弱。只要惩罚是几组离散乘数，就总能构造出"心情更高却更弱"的相邻档。
      //
      //       改成：**< 40 时按数值线性缩放惩罚**，40 以上用稳定正收益档。
      //       这样任意数值增加都单调不降（惩罚连续趋近 1），且保留了
      //       "长期不打理会变弱"的机制意图。
      const numericMood = char.stats ? Number(char.stats.mood) : NaN;
      let moodAttack = 1, moodDefense = 1, moodSpeed = 1;

      if (Number.isFinite(numericMood)) {
        if (numericMood >= 95) {
          // 极佳：攻速双增（保留原有「兴奋」语义）
          moodAttack = 1.05; moodSpeed = 1.1;
        } else if (numericMood >= 40) {
          // 正常区间：稳定小幅防御加成（保留原有「平静」语义）
          moodDefense = 1.05;
        } else {
          // 低落区间：线性惩罚，40 分时惩罚为 0，0 分时达到满额
          // （防御 -10%、速度 -5%，与原有「恐惧」同量级）
          const t = 1 - numericMood / 40;          // 0 → 1
          moodDefense = 1 - 0.10 * t;
          moodSpeed = 1 - 0.05 * t;
        }
      }

      // 老存档/别处写入的字符串 mood 仍走原有离散分支（保持向后兼容）
      const mood = Number.isFinite(numericMood)
        ? 'by-value'
        : (char.mood || '平静');
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
      // 轮105：模板怪同样要带 map_id —— startBattle 靠它反查地图名喂给剧情钩子
      // （「探明 无相幻境」这类目标需要知道玩家在哪张图打）。模板路径是 defenderType='monster'
      // 且 id 命中模板时的**主路径**，漏了这里会出现"某些战斗推不动探索目标"的鬼故事。
      map_id: tpl.map_id != null ? tpl.map_id : null,
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
        map_id: monsterData.map_id != null ? monsterData.map_id : null,   // 轮105：剧情钩子靠它反查地图名
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
        map_id: monsterData.map_id != null ? monsterData.map_id : mapId,   // 轮105：剧情钩子靠它反查地图名
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
      // 轮107：兜底合成分支同样要带 map_id —— 这是**第三条**怪物构造路径，前两条
      // （buildMonsterFromTemplate / 按图取模板）都已带。漏了它，该路径的战斗 result.map 为 null，
      // 「探明某地」这类剧情目标就永远推不动（独立审计指出前两条修完仍漏这条）。
      map_id: map.id != null ? map.id : null,
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
