const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const cultivationService = require('../services/cultivation');
const realmService = require('../services/realm');
const { loadDatabase } = require('../database');

router.post('/cultivate', auth, (req, res) => {
  try {
    const { duration } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    // 阶段7：参与仙盟建设期间不能修炼（机会成本）
    if ((character.guild_build_until || 0) > Date.now()) {
      return res.status(400).json({ error: '参与仙盟建设中，无法修炼' });
    }
    const result = cultivationService.cultivate(character.id, duration || 60);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/offline-cultivate', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const result = cultivationService.offlineCultivate(character.id);
    res.json(result || { message: '无离线收益' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/breakthrough', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const result = realmService.breakthrough(character.id);
    if (!result.success) {
      realmService.handleBreakthroughFailure(character.id);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/can-breakthrough', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const canBreak = realmService.canBreakthrough(character);
    res.json({ canBreakthrough: canBreak });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/realm', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const realm = realmService.getRealmInfo(character);
    res.json(realm);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const isCultivating = character.cultivating || false;
    const progress = character.cultivationProgress || 0;
    const expPerSecond = character.cultivationExpPerSecond || 0;
    const bonus = character.cultivationBonus || 0;
    res.json({ isCultivating, progress, expPerSecond, bonus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/train', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const result = cultivationService.cultivate(character.id, 60);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/train-offline', auth, (req, res) => {
  try {
    const { hours } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const result = cultivationService.offlineCultivate(character.id);
    res.json(result || { message: '无离线收益' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/claim-offline', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const result = cultivationService.offlineCultivate(character.id);
    res.json(result || { exp: 0, spiritStone: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
