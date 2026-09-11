const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const characterService = require('../services/character');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

function getCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, name: `${year}年${month}月赛季` };
}

function getSeasonRewards(rank) {
  const rewards = {
    1: { exp: 10000, spiritStone: 5000, title: '赛季冠军' },
    2: { exp: 8000, spiritStone: 4000, title: '赛季亚军' },
    3: { exp: 6000, spiritStone: 3000, title: '赛季季军' },
    top10: { exp: 4000, spiritStone: 2000, title: '赛季前十' },
    top50: { exp: 2000, spiritStone: 1000, title: '赛季前五十' },
    top100: { exp: 1000, spiritStone: 500, title: '赛季前一百' },
    all: { exp: 500, spiritStone: 200, title: '赛季参与者' }
  };

  if (rank === 1) return rewards[1];
  if (rank === 2) return rewards[2];
  if (rank === 3) return rewards[3];
  if (rank <= 10) return rewards.top10;
  if (rank <= 50) return rewards.top50;
  if (rank <= 100) return rewards.top100;
  return rewards.all;
}

router.get('/current', auth, (req, res) => {
  try {
    const season = getCurrentSeason();
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const lastSeasonSettlement = character.last_season_settlement || 0;
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const daysUntilReset = Math.ceil((monthMs - (now % monthMs)) / (24 * 60 * 60 * 1000));

    const seasonRegistered = character.season_registered || false;

    res.json({
      season,
      daysUntilReset,
      seasonRegistered,
      registrationFee: 1000
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/register', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    if (character.season_registered) {
      return res.status(400).json({ error: '已报名本赛季' });
    }

    if (character.spirit_stone < 1000) {
      return res.status(400).json({ error: '灵石不足' });
    }

    character.spirit_stone -= 1000;
    character.season_registered = true;
    character.season_points = 0;

    saveDatabase(db);

    res.json({ success: true, spiritStone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rankings', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const rankings = db.characters
      .filter(c => c.season_registered)
      .sort((a, b) => (b.season_points || 0) - (a.season_points || 0))
      .slice(0, 100)
      .map((c, index) => ({
        rank: index + 1,
        name: c.name,
        realm: c.realm,
        level: c.level,
        points: c.season_points || 0,
        combatPower: c.attack + c.defense + c.hp
      }));

    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/settle', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const lastSettlement = character.last_season_settlement || 0;
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    if (now - lastSettlement < monthMs) {
      const nextSettlement = lastSettlement + monthMs;
      const daysLeft = Math.ceil((nextSettlement - now) / (24 * 60 * 60 * 1000));
      return res.json({ settled: false, daysLeft });
    }

    if (!character.season_registered) {
      return res.json({ settled: false, message: '未报名本赛季' });
    }

    const rankings = db.characters
      .filter(c => c.season_registered)
      .sort((a, b) => (b.season_points || 0) - (a.season_points || 0));

    const rank = rankings.findIndex(c => c.id === character.id) + 1;
    const rewards = getSeasonRewards(rank);

    characterService.addExp(character.id, rewards.exp);
    character.spirit_stone += rewards.spiritStone;
    character.season_registered = false;
    character.season_points = 0;
    character.last_season_settlement = now;

    if (!character.titles) character.titles = [];
    character.titles.push(rewards.title);

    db.characters.forEach(c => {
      if (c.id === character.id) {
        c.spirit_stone = character.spirit_stone;
        c.season_registered = character.season_registered;
        c.season_points = character.season_points;
        c.last_season_settlement = character.last_season_settlement;
        c.titles = character.titles;
      }
    });

    saveDatabase(db);

    res.json({
      settled: true,
      rank,
      rewards
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
