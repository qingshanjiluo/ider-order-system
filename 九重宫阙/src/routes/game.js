const express = require('express');
const router = express.Router();
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const auth = require('../middleware/auth');

router.get('/realms', (req, res) => {
  try {
    const db = loadDatabase();
    res.json(db.realms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/maps', (req, res) => {
  try {
    const db = loadDatabase();
    res.json(db.maps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dungeons', (req, res) => {
  try {
    const db = loadDatabase();
    res.json(db.dungeons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/items', (req, res) => {
  try {
    const db = loadDatabase();
    res.json(db.items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/guilds', (req, res) => {
  try {
    const db = loadDatabase();
    res.json(db.guilds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
