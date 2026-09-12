const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');
const sectService = require('../services/sect');
const sectLibrary = require('../services/sect-library');
const store = require('../db/store');

// ---------- 藏书阁（内容富集三期） ----------
router.get('/library', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const membership = store.queryRel('sect_members', { character_id: character.id })[0];
    if (!membership) return res.status(400).json({ error: '未加入宗门' });
    sectLibrary.ensureSectBase(db, membership.sect_id, (store.queryRel('sects', { id: membership.sect_id })[0] || {}).key);
    saveDatabase(db);
    const entries = sectLibrary.entriesOf(membership.sect_id).map(e => ({ ...e, stats: undefined }));
    res.json({ entries, myContribution: membership.contribution || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/library/upload', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectLibrary.upload(db, character, itemId);
    if (!r.ok) return res.status(400).json({ error: r.error });
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/library/learn', auth, (req, res) => {
  try {
    const { name } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectLibrary.learn(db, character, name);
    if (!r.ok) return res.status(400).json({ error: r.error });
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/list', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    res.json({ sects: sectService.listSects(character) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/join', auth, (req, res) => {
  try {
    const { sectId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectService.join(character, sectId);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { saveDatabase } = require('../database');
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/leave', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectService.leave(character);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { saveDatabase } = require('../database');
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const mine = sectService.getMembership(character);
    if (!mine) return res.json({ inSect: false });
    const sectRow = sectService.getSectRow(mine.sect_id);
    res.json({
      inSect: true,
      sect: sectRow ? { id: sectRow.id, name: sectRow.name, faction: sectRow.faction, school: sectRow.school } : null,
      rank: mine.rank,
      contribution: mine.contribution,
      buildings: sectService.listBuildings(mine.sect_id),
      benefits: sectService.getBenefits(character)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/chores/daily', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectService.dailyChore(character);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { saveDatabase } = require('../database');
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contribute', auth, (req, res) => {
  try {
    const { amount } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectService.contribute(character, amount);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { saveDatabase } = require('../database');
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/buildings/upgrade', auth, (req, res) => {
  try {
    const { buildingKey } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectService.upgradeBuilding(character, buildingKey);
    if (!r.ok) return res.status(400).json({ error: r.error, need: r.need });
    const { saveDatabase } = require('../database');
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/exchange', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const benefits = sectService.getBenefits(character);
    const { EXCHANGE_TABLE } = require('../data/sects');
    res.json({
      treasuryLevel: benefits.inSect ? benefits.treasuryLevel : 0,
      contribution: benefits.inSect ? benefits.contribution : 0,
      exchange: EXCHANGE_TABLE
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/exchange', auth, (req, res) => {
  try {
    const { itemName } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const r = sectService.exchange(character, itemName);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { saveDatabase } = require('../database');
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
