const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');
const economy = require('../services/economy');
const market = require('../services/market');

function getChar(req, res) {
  const db = loadDatabase();
  const character = db.characters.find(c => c.user_id === req.userId);
  if (!character) {
    res.status(404).json({ error: '角色不存在' });
    return null;
  }
  return character;
}

// ---------- 灵石钱包与兑换（Q8 双向 2%） ----------
router.get('/wallet', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    res.json(economy.wallet(character));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/exchange', auth, (req, res) => {
  try {
    const { fromTier, toTier, amount } = req.body;
    const character = getChar(req, res);
    if (!character) return;
    const r = economy.exchange(character, fromTier, toTier, amount);
    if (!r.ok) return res.status(400).json({ error: r.error });
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- 特殊灵石 ----------
router.get('/stones', auth, (req, res) => {
  res.json({ stones: economy.SPECIAL_STONES });
});

router.post('/stones/use', auth, (req, res) => {
  try {
    const { name } = req.body;
    const character = getChar(req, res);
    if (!character) return;
    const r = economy.useSpecialStone(character, name);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
