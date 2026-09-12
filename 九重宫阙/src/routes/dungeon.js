const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const combatService = require('../services/battle/combat');
const damageCalculator = require('../services/battle/damage');
const characterService = require('../services/character');
const itemService = require('../services/item');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

function calculateRating(result) {
  if (!result.attackerMaxHp) return 3;
  const hpPercent = result.attackerFinalHp / result.attackerMaxHp;
  if (hpPercent > 0.9) return 5;
  if (hpPercent > 0.7) return 4;
  if (hpPercent > 0.5) return 3;
  if (hpPercent > 0.3) return 2;
  return 1;
}

function calculateDungeonRewards(dungeon, rating) {
  const baseExp = 50 + (dungeon.min_level || 1) * 10;
  const baseSpiritStone = 20 + (dungeon.min_level || 1) * 5;
  const ratingMultiplier = 0.5 + rating * 0.1;
  const exp = Math.floor(baseExp * ratingMultiplier * (dungeon.difficulty || 1));
  const spiritStone = Math.floor(baseSpiritStone * ratingMultiplier * (dungeon.difficulty || 1));
  const items = [];
  if (rating >= 4 && Math.random() < 0.3) {
    const qualities = ['凡器', '法器'];
    items.push({ type: '装备', quality: qualities[Math.floor(Math.random() * qualities.length)] });
  }
  if (rating === 5 && Math.random() < 0.1) {
    const qualities = ['黄阶', '玄阶'];
    items.push({ type: '功法', quality: qualities[Math.floor(Math.random() * qualities.length)] });
  }
  if (rating >= 3 && Math.random() < 0.2) {
    items.push({ type: '灵石', quantity: Math.floor(spiritStone * 0.5) });
  }
  return { exp, spiritStone, items };
}

function grantDungeonItems(character, items, db) {
  const granted = [];
  for (const item of items) {
    if (item.type === '灵石') {
      character.spirit_stone = (character.spirit_stone || 0) + (item.quantity || 0);
      granted.push({ type: '灵石', quantity: item.quantity });
    } else if (item.type === '装备') {
      const realm = character.realm || '炼气';
      const equipment = itemService.generateRandomEquipment(realm);
      if (equipment) {
        const itemId = getNextId('items');
        db.items.push({ id: itemId, ...equipment });
        db.inventory.push({ character_id: character.id, item_id: itemId, quantity: 1 });
        granted.push({ type: '装备', name: equipment.name, quality: equipment.quality, id: itemId });
      }
    } else if (item.type === '功法') {
      const realm = character.realm || '炼气';
      const types = ['修炼', '战斗'];
      const gongfa = itemService.generateGongfa(realm, item.quality || '黄阶', types[Math.floor(Math.random() * types.length)]);
      if (gongfa) {
        const itemId = getNextId('items');
        db.items.push({ id: itemId, ...gongfa });
        db.inventory.push({ character_id: character.id, item_id: itemId, quantity: 1 });
        granted.push({ type: '功法', name: gongfa.name, quality: gongfa.quality, id: itemId });
      }
    }
  }
  return granted;
}

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    res.json(db.dungeons || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/list', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const dungeons = (db.dungeons || []).map(d => ({
      id: d.id,
      name: d.name,
      minLevel: d.min_level,
      maxLevel: d.max_level,
      difficulty: d.difficulty,
      element: d.element || '无',
      boss: d.boss || '未知',
      type: d.type || '公共副本',
      description: d.description || ''
    }));
    res.json(dungeons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/enter', auth, async (req, res) => {
  try {
    const { dungeonId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const dungeon = (db.dungeons || []).find(d => d.id === dungeonId);
    if (!dungeon) {
      return res.status(400).json({ error: '副本不存在' });
    }
    if ((character.level || 1) < (dungeon.min_level || 1)) {
      return res.status(400).json({ error: `等级不足，需要${dungeon.min_level}级` });
    }

    const bossLevel = Math.floor(((dungeon.min_level || 1) + (dungeon.max_level || dungeon.min_level || 10)) / 2);
    const diff = dungeon.difficulty || 1;
    const bossStats = {
      hp: Math.floor((200 + bossLevel * 20) * diff),
      attack: Math.floor((15 + bossLevel * 3) * diff),
      defense: Math.floor((10 + bossLevel * 2) * diff),
      speed: Math.floor(5 + bossLevel * 0.5)
    };

    const customMonster = {
      id: `dungeon_boss_${Date.now()}`,
      name: dungeon.boss || `${dungeon.name}守卫`,
      level: bossLevel,
      hp: bossStats.hp,
      maxHp: bossStats.hp,
      attack: bossStats.attack,
      defense: bossStats.defense,
      speed: bossStats.speed,
      crit_rate: 0.05,
      element: combatService.normalizeElement(dungeon.element || 'earth'),
      skills: []
    };

    const attacker = combatService.getEntity(character.id, 'character', db);
    if (!attacker) {
      return res.status(500).json({ error: '获取角色数据失败' });
    }

    const battleLog = [];
    let round = 1;
    const defender = { ...customMonster };

    while (attacker.hp > 0 && defender.hp > 0 && round <= 50) {
      const atkResult = damageCalculator.calculateFinalDamage(attacker, defender, null);
      defender.hp -= atkResult.damage;
      let atkLog = `${attacker.name} 攻击 ${defender.name}，造成 ${atkResult.damage} 点伤害`;
      if (atkResult.isCritical) atkLog += '（暴击！）';
      if (atkResult.effectiveness > 1.0) atkLog += '（效果拔群！）';
      else if (atkResult.effectiveness < 1.0) atkLog += '（效果不佳）';
      battleLog.push(atkLog);

      if (defender.hp <= 0) {
        battleLog.push(`${defender.name} 被击败！`);
        break;
      }

      const defResult = damageCalculator.calculateFinalDamage(defender, attacker, null);
      attacker.hp -= defResult.damage;
      let defLog = `${defender.name} 反击 ${attacker.name}，造成 ${defResult.damage} 点伤害`;
      if (defResult.isCritical) defLog += '（暴击！）';
      battleLog.push(defLog);

      if (attacker.hp <= 0) {
        battleLog.push(`${attacker.name} 被击败！`);
        break;
      }
      round++;
    }

    const winner = attacker.hp > 0 ? 'attacker' : 'defender';
    // 阶段5：副本战后伤势结算（PVE 全额积累 + 重伤扣寿）
    const battleResult = {
      success: true,
      winner,
      attackerMaxHp: attacker.maxHp,
      attackerFinalHp: Math.max(0, attacker.hp)
    };
    const combatService = require('../services/battle/combat');
    combatService.aftermath(character, battleResult);
    const rating = winner === 'attacker' ? calculateRating({
      attackerMaxHp: attacker.maxHp,
      attackerFinalHp: Math.max(0, attacker.hp)
    }) : 0;

    let rewards = { exp: 0, spiritStone: 0, items: [] };
    if (winner === 'attacker') {
      rewards = calculateDungeonRewards(dungeon, rating);
      characterService.addExp(character.id, rewards.exp);
      character.spirit_stone = (character.spirit_stone || 0) + rewards.spiritStone;
      character.dungeon_count = (character.dungeon_count || 0) + 1;
      if (rating >= 4) character.dungeon_star = Math.max(character.dungeon_star || 0, rating);
      if (dungeon.boss) character.boss_kill = (character.boss_kill || 0) + 1;
      // 成就「世界征服者 / 全五星」：记录通关副本与最高星级（内容富集九期接线）
      if (!Array.isArray(character.cleared_dungeons)) character.cleared_dungeons = [];
      if (!character.cleared_dungeons.includes(dungeon.id)) character.cleared_dungeons.push(dungeon.id);
      if (!character.dungeon_stars || typeof character.dungeon_stars !== 'object') character.dungeon_stars = {};
      character.dungeon_stars[dungeon.id] = Math.max(Number(character.dungeon_stars[dungeon.id]) || 0, rating);
      rewards.grantedItems = grantDungeonItems(character, rewards.items, db);
      const { updateQuestProgress } = require('./quests');
      updateQuestProgress(character.id, 'dungeon', 1);
    }
    saveDatabase(db);

    res.json({
      success: true,
      winner,
      rounds: round - 1,
      battleLog,
      rewards,
      rating,
      injury: battleResult.injury,
      heavyInjury: battleResult.heavyInjury || null,
      attackerMaxHp: attacker.maxHp,
      attackerFinalHp: Math.max(0, attacker.hp),
      defenderMaxHp: customMonster.maxHp,
      defenderFinalHp: Math.max(0, defender.hp)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sweep', auth, (req, res) => {
  try {
    const { dungeonId, times } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const dungeon = (db.dungeons || []).find(d => d.id === dungeonId);
    if (!dungeon) {
      return res.status(400).json({ error: '副本不存在' });
    }
    if ((character.level || 1) < (dungeon.min_level || 1)) {
      return res.status(400).json({ error: `等级不足，需要${dungeon.min_level}级` });
    }
    const sweepTimes = Math.min(times || 1, 10);
    const totalRewards = { exp: 0, spiritStone: 0, items: [], grantedItems: [] };
    for (let i = 0; i < sweepTimes; i++) {
      const rewards = calculateDungeonRewards(dungeon, 5);
      totalRewards.exp += rewards.exp;
      totalRewards.spiritStone += rewards.spiritStone;
      totalRewards.items.push(...rewards.items);
    }
    characterService.addExp(character.id, totalRewards.exp);
    character.spirit_stone = (character.spirit_stone || 0) + totalRewards.spiritStone;
    character.dungeon_count = (character.dungeon_count || 0) + sweepTimes;
    totalRewards.grantedItems = grantDungeonItems(character, totalRewards.items, db);
    const { updateQuestProgress } = require('./quests');
    updateQuestProgress(character.id, 'dungeon', sweepTimes);
    saveDatabase(db);
    res.json({ success: true, rewards: totalRewards, sweepTimes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
