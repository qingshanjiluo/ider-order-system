const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const { turnstileMiddleware } = require('../middleware/turnstile');
const config = require('../config');

router.post('/register', turnstileMiddleware, async (req, res) => {
  try {
    const { username, password, nickname, faction } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const db = loadDatabase();
    const existing = db.users.find(u => u.username === username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = getNextId('users');
    db.users.push({ id: userId, username, password: hashedPassword, created_at: new Date().toISOString() });
    const charId = getNextId('characters');
    const charName = nickname || username;
    const factionBonus = { martial: { attack: 3 }, spirit: { mp: 20 }, demon: { speed: 3 } };
    const bonus = factionBonus[faction] || {};
    db.characters.push({
      id: charId, user_id: userId, name: charName, faction: faction || 'martial',
      realm: '炼气', realm_stage: 1,
      level: 1, exp: 0, exp_to_next: 100,
      hp: 100 + (bonus.hp || 0), max_hp: 100 + (bonus.hp || 0),
      mp: 50 + (bonus.mp || 0), max_mp: 50 + (bonus.mp || 0),
      attack: 10 + (bonus.attack || 0), defense: 5, speed: 5 + (bonus.speed || 0),
      spirit_stone: 100, jade: 0,
      total_battles: 0, win_streak: 0, total_kills: 0,
      dungeon_count: 0, boss_kill: 0, arena_points: 0,
      vip_level: 0, vip_exp: 0,
      afk_map: 1, afk_start_time: null,
      season_registered: false, season_points: 0,
      created_at: new Date().toISOString(), last_login: new Date().toISOString()
    });
    saveDatabase(db);
    const token = jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    res.json({ token, userId, username: charName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', turnstileMiddleware, async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = loadDatabase();
    const user = db.users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const char = db.characters.find(c => c.user_id === user.id);
    if (char) {
      char.last_login = new Date().toISOString();
    }
    saveDatabase(db);
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    res.json({ token, userId: user.id, username: user.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请提供旧密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }
    const db = loadDatabase();
    const user = db.users.find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: '旧密码错误' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    saveDatabase(db);
    res.json({ message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
