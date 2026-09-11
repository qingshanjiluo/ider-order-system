const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');
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

router.get('/listings', auth, (req, res) => {
  try {
    getChar(req, res) && res.json({ listings: market.listings({ status: 'open' }) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/list', auth, (req, res) => {
  try {
    const { inventoryId, quantity, price } = req.body;
    const character = getChar(req, res);
    if (!character) return;
    const r = market.list(character, inventoryId, quantity, price);
    if (!r.ok) return res.status(400).json({ error: r.error });
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/buy', auth, (req, res) => {
  try {
    const { listingId, quantity } = req.body;
    const character = getChar(req, res);
    if (!character) return;
    const r = market.buy(character, listingId, quantity);
    if (!r.ok) return res.status(400).json({ error: r.error });
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cancel', auth, (req, res) => {
  try {
    const { listingId } = req.body;
    const character = getChar(req, res);
    if (!character) return;
    const r = market.cancel(character, listingId);
    if (!r.ok) return res.status(400).json({ error: r.error });
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    res.json({ listings: market.myListings(character) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rates', auth, (req, res) => {
  try {
    getChar(req, res);
    const store = require('../db/store');
    res.json({ rates: store.queryRel('market_rates'), bounds: { min: market.RATE_MIN, max: market.RATE_MAX } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
