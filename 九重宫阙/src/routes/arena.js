const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const combatService = require('../services/battle/combat');
const characterService = require('../services/character');
const { loadDatabase, saveDatabase } = require('../database');

function calculateArenaRewards(character) {
  const combatPower = character.attack + character.defense + character.hp;
  let rank = 'bronze';
  if (combatPower > 1000) rank = 'silver';
  if (combatPower > 5000) rank = 'gold';
  if (combatPower > 20000) rank = 'platinum';
  const rewards = {
    bronze: { exp: 100, spiritStone: 50 },
    silver: { exp: 200, spiritStone: 100 },
    gold: { exp: 400, spiritStone: 200 },
    platinum: { exp: 800, spiritStone: 400 }
  };
  return rewards[rank];
}

router.get('/opponents', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const opponents = db.characters
      .filter(c => c.id !== character.id)
      .map(c => ({
        id: c.id,
        name: c.name,
        realm: c.realm || '炼气',
        level: c.level || 1,
        combatPower: (c.attack || 0) + (c.defense || 0) + (c.hp || 0)
      }))
      .sort((a, b) => Math.abs(a.combatPower - ((character.attack || 0) + (character.defense || 0) + (character.hp || 0))) - 
                       Math.abs(b.combatPower - ((character.attack || 0) + (character.defense || 0) + (character.hp || 0))))
      .slice(0, 10);
    res.json(opponents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rankings', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const creationDate = new Date(character.created_at);
    const now = new Date();
    const daysSinceCreation = Math.floor((now - creationDate) / (1000 * 60 * 60 * 24));
    let rankType = '人榜';
    if (daysSinceCreation > 30) rankType = '地榜';
    if (daysSinceCreation > 90) rankType = '天榜';
    const filteredChars = db.characters.filter(c => {
      const cDate = new Date(c.created_at);
      const cDays = Math.floor((now - cDate) / (1000 * 60 * 60 * 24));
      if (rankType === '人榜') return cDays <= 30;
      if (rankType === '地榜') return cDays > 30 && cDays <= 90;
      return cDays > 90;
    });
    filteredChars.sort((a, b) => {
      const powerA = a.attack + a.defense + a.hp;
      const powerB = b.attack + b.defense + b.hp;
      return powerB - powerA;
    });
    const rankings = filteredChars.slice(0, 100).map((c, index) => ({
      rank: index + 1,
      name: c.name,
      realm: c.realm,
      level: c.level,
      combatPower: c.attack + c.defense + c.hp
    }));
    res.json({ rankType, rankings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/challenge', auth, async (req, res) => {
  try {
    const { targetId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const target = db.characters.find(c => c.id === targetId);
    if (!target) {
      return res.status(400).json({ error: '目标不存在' });
    }
    const result = await combatService.startBattle(character.id, target.id, 'character', 'character');
    if (!result.success) {
      return res.status(500).json({ error: '战斗失败' });
    }
    if (result.winner === 'attacker') {
      const rewards = { exp: 50, spiritStone: 20 };
      characterService.addExp(character.id, rewards.exp);
      character.spirit_stone += rewards.spiritStone;
      character.total_battles = (character.total_battles || 0) + 1;
      character.win_streak = (character.win_streak || 0) + 1;
      character.arena_points = (character.arena_points || 0) + 10;
      saveDatabase(db);
      result.rewards = rewards;
    } else {
      character.total_battles = (character.total_battles || 0) + 1;
      character.win_streak = 0;
      saveDatabase(db);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/match', auth, async (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const opponents = db.characters.filter(c => c.id !== character.id);
    if (opponents.length === 0) {
      return res.status(400).json({ error: '没有可匹配的对手' });
    }
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
    // 阶段5：自动调息闸门
    const injuryService = require('../services/injury');
    if (injuryService.shouldAutoMeditate(character)) {
      return res.status(400).json({ error: '伤势过重，调息休整中（可关闭自动调息或使用疗伤丹）' });
    }
    // 阶段7：参与仙盟建设期间不能切磋（机会成本）
    if ((character.guild_build_until || 0) > Date.now()) {
      return res.status(400).json({ error: '参与仙盟建设中，无法战斗' });
    }
    const result = await combatService.startBattle(character.id, opponent.id, 'character', 'character');
    if (!result.success) {
      return res.status(500).json({ error: '战斗失败' });
    }
    // 阶段5：擂台规则——伤势减半积累、免扣寿
    combatService.aftermath(character, result, { arena: true });
    if (result.winner === 'attacker') {
      const rewards = { exp: 50, spiritStone: 20 };
      characterService.addExp(character.id, rewards.exp);
      character.spirit_stone += rewards.spiritStone;
      character.total_battles = (character.total_battles || 0) + 1;
      character.win_streak = (character.win_streak || 0) + 1;
      character.arena_points = (character.arena_points || 0) + 10;
      result.rewards = rewards;
    } else {
      character.total_battles = (character.total_battles || 0) + 1;
      character.win_streak = 0;
    }
    saveDatabase(db);
    result.opponent = { name: opponent.name, realm: opponent.realm, level: opponent.level };
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/settlement', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const lastSettlement = character.last_arena_settlement || 0;
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    if (now - lastSettlement < weekMs) {
      const nextSettlement = lastSettlement + weekMs;
      const daysLeft = Math.ceil((nextSettlement - now) / (24 * 60 * 60 * 1000));
      return res.json({ settled: false, daysLeft });
    }
    const rewards = calculateArenaRewards(character);
    character.spirit_stone += rewards.spiritStone;
    characterService.addExp(character.id, rewards.exp);
    character.last_arena_settlement = now;
    saveDatabase(db);
    res.json({ settled: true, rewards });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
