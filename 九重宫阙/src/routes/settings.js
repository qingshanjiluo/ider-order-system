const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');

const DEFAULT_SETTINGS = {
  theme: 'ink',
  soundEnabled: true,
  battleSpeed: 1,
  chatEnabled: true,
  showOnlineStatus: true,
  pushNotifications: true,
  language: 'zh'
};

function getUserSettings(db, userId) {
  const entry = (db.user_settings || []).find(s => s.userId === userId);
  return entry ? { ...DEFAULT_SETTINGS, ...entry.settings } : { ...DEFAULT_SETTINGS };
}

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const settings = getUserSettings(db, req.userId);
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const current = getUserSettings(db, req.userId);
    const updates = req.body;

    const allowed = ['theme', 'soundEnabled', 'battleSpeed', 'chatEnabled', 'showOnlineStatus', 'pushNotifications', 'language'];
    const merged = { ...current };
    for (const key of allowed) {
      if (updates.hasOwnProperty(key)) merged[key] = updates[key];
    }

    if (!db.user_settings) db.user_settings = [];
    const idx = db.user_settings.findIndex(s => s.userId === req.userId);
    if (idx >= 0) {
      db.user_settings[idx].settings = merged;
    } else {
      db.user_settings.push({ userId: req.userId, settings: merged });
    }

    saveDatabase(db);
    res.json({ settings: merged });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
