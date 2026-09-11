const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const characterService = require('../services/character');
const { loadDatabase, saveDatabase } = require('../database');

const MAP_REWARDS = {
  1: { expPerSecond: 5, spiritStonePerSecond: 1, dropRate: 1.0 },
  2: { expPerSecond: 10, spiritStonePerSecond: 2, dropRate: 1.2 },
  3: { expPerSecond: 20, spiritStonePerSecond: 4, dropRate: 1.5 },
  4: { expPerSecond: 40, spiritStonePerSecond: 8, dropRate: 1.8 },
  5: { expPerSecond: 80, spiritStonePerSecond: 16, dropRate: 2.0 },
  6: { expPerSecond: 160, spiritStonePerSecond: 32, dropRate: 2.5 }
};

router.get('/status', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const afkMap = character.afk_map || 1;
    const afkStartTime = character.afk_start_time || null;
    const isAfk = afkStartTime && (Date.now() - afkStartTime) < 250 * 60 * 60 * 1000;

    let offlineRewards = null;
    if (!isAfk && afkStartTime) {
      const offlineSeconds = Math.floor((Date.now() - afkStartTime) / 1000);
      const maxOffline = 250 * 60 * 60;
      const actualOffline = Math.min(offlineSeconds, maxOffline);
      const mapReward = MAP_REWARDS[afkMap] || MAP_REWARDS[1];

      offlineRewards = {
        time: actualOffline,
        exp: Math.floor(mapReward.expPerSecond * actualOffline),
        spiritStone: Math.floor(mapReward.spiritStonePerSecond * actualOffline)
      };
    }

    res.json({
      isAfk,
      afkMap,
      afkStartTime,
      offlineRewards,
      maxOfflineHours: 250
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/start', auth, (req, res) => {
  try {
    const { mapId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    if (character.afk_start_time) {
      return res.status(400).json({ error: '已在挂机中' });
    }

    character.afk_map = mapId || 1;
    character.afk_start_time = Date.now();

    saveDatabase(db);

    res.json({ success: true, mapId: character.afk_map });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    if (!character.afk_start_time) {
      return res.status(400).json({ error: '未在挂机中' });
    }

    const afkSeconds = Math.floor((Date.now() - character.afk_start_time) / 1000);
    const mapReward = MAP_REWARDS[character.afk_map] || MAP_REWARDS[1];

    const expGained = Math.floor(mapReward.expPerSecond * afkSeconds);
    const spiritStoneGained = Math.floor(mapReward.spiritStonePerSecond * afkSeconds);

    characterService.addExp(character.id, expGained);
    character.spirit_stone += spiritStoneGained;
    character.afk_start_time = null;

    saveDatabase(db);

    res.json({
      success: true,
      afkTime: afkSeconds,
      expGained,
      spiritStoneGained
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/collect', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    if (!character.afk_start_time) {
      return res.status(400).json({ error: '无离线收益' });
    }

    const offlineSeconds = Math.floor((Date.now() - character.afk_start_time) / 1000);
    const maxOffline = 250 * 60 * 60;
    const actualOffline = Math.min(offlineSeconds, maxOffline);
    const mapReward = MAP_REWARDS[character.afk_map] || MAP_REWARDS[1];

    const expGained = Math.floor(mapReward.expPerSecond * actualOffline);
    const spiritStoneGained = Math.floor(mapReward.spiritStonePerSecond * actualOffline);

    characterService.addExp(character.id, expGained);
    character.spirit_stone += spiritStoneGained;
    character.afk_start_time = null;

    saveDatabase(db);

    res.json({
      success: true,
      offlineTime: actualOffline,
      expGained,
      spiritStoneGained
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
