const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const characterService = require('../services/character');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const DAILY_REWARDS = [
  { day: 1, exp: 50, spiritStone: 10 },
  { day: 2, exp: 75, spiritStone: 15 },
  { day: 3, exp: 100, spiritStone: 20 },
  { day: 4, exp: 125, spiritStone: 25 },
  { day: 5, exp: 150, spiritStone: 30 },
  { day: 6, exp: 175, spiritStone: 35 },
  { day: 7, exp: 200, spiritStone: 50 }
];

router.get('/status', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const today = new Date().toISOString().split('T')[0];
    const todayCheckin = db.checkin.find(
      c => c.character_id === character.id && c.checkin_date === today
    );

    const recentCheckins = db.checkin
      .filter(c => c.character_id === character.id)
      .sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date))
      .slice(0, 7);

    let streak = 0;
    if (recentCheckins.length > 0) {
      const lastCheckin = new Date(recentCheckins[0].checkin_date);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastCheckin.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0] ||
          lastCheckin.toISOString().split('T')[0] === today) {
        streak = recentCheckins[0].streak;
      }
    }

    res.json({
      checkedToday: !!todayCheckin,
      streak,
      nextReward: DAILY_REWARDS[streak % 7]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const today = new Date().toISOString().split('T')[0];
    const todayCheckin = db.checkin.find(
      c => c.character_id === character.id && c.checkin_date === today
    );
    if (todayCheckin) {
      return res.status(400).json({ error: '今日已签到' });
    }

    const recentCheckins = db.checkin
      .filter(c => c.character_id === character.id)
      .sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date))
      .slice(0, 7);

    let streak = 1;
    if (recentCheckins.length > 0) {
      const lastCheckin = new Date(recentCheckins[0].checkin_date);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastCheckin.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]) {
        streak = recentCheckins[0].streak + 1;
      }
    }

    const dayIndex = (streak - 1) % 7;
    const reward = DAILY_REWARDS[dayIndex];

    db.checkin.push({
      id: getNextId('checkin'),
      character_id: character.id,
      checkin_date: today,
      streak
    });

    characterService.addExp(character.id, reward.exp);
    character.spirit_stone += reward.spiritStone;

    db.characters.forEach(c => {
      if (c.id === character.id) {
        c.spirit_stone = character.spirit_stone;
      }
    });

    saveDatabase(db);
    // 轮83 批5任务钩子：任务 4「每日签到」的进度源（此前无）；补签档刻意不计——补的是过去，不是今天的勤
    require('./quests').updateQuestProgress(character.id, 'checkin', 1);

    res.json({
      success: true,
      streak,
      reward: {
        exp: reward.exp,
        spiritStone: reward.spiritStone
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/makeup', auth, (req, res) => {
  try {
    const { date } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const checkinDate = db.checkin.find(
      c => c.character_id === character.id && c.checkin_date === date
    );
    if (checkinDate) {
      return res.status(400).json({ error: '该日期已签到' });
    }

    const today = new Date();
    const makeupDate = new Date(date);
    const daysDiff = Math.floor((today - makeupDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 7 || daysDiff < 0) {
      return res.status(400).json({ error: '只能补签7天内的签到' });
    }

    const recentCheckins = db.checkin
      .filter(c => c.character_id === character.id && c.checkin_date < date)
      .sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date));

    let streak = 1;
    if (recentCheckins.length > 0) {
      const lastCheckin = new Date(recentCheckins[0].checkin_date);
      const targetDate = new Date(date);
      targetDate.setDate(targetDate.getDate() - 1);
      if (lastCheckin.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0]) {
        streak = recentCheckins[0].streak + 1;
      }
    }

    const dayIndex = (streak - 1) % 7;
    const reward = DAILY_REWARDS[dayIndex];

    db.checkin.push({
      id: getNextId('checkin'),
      character_id: character.id,
      checkin_date: date,
      streak
    });

    characterService.addExp(character.id, reward.exp);
    character.spirit_stone += reward.spiritStone;

    db.characters.forEach(c => {
      if (c.id === character.id) {
        c.spirit_stone = character.spirit_stone;
      }
    });

    saveDatabase(db);

    res.json({
      success: true,
      streak,
      reward: {
        exp: reward.exp,
        spiritStone: reward.spiritStone
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/daily', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const today = new Date().toISOString().split('T')[0];
    const todayCheckin = db.checkin.find(
      c => c.character_id === character.id && c.checkin_date === today
    );

    const recentCheckins = db.checkin
      .filter(c => c.character_id === character.id)
      .sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date))
      .slice(0, 7);

    let streak = 0;
    if (recentCheckins.length > 0) {
      const lastCheckin = new Date(recentCheckins[0].checkin_date);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastCheckin.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0] ||
          lastCheckin.toISOString().split('T')[0] === today) {
        streak = recentCheckins[0].streak;
      }
    }

    res.json({
      checkin: { checked: !!todayCheckin },
      cultivation: { completed: false },
      dungeon: { count: 0 },
      arena: { count: 0 },
      streak
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
