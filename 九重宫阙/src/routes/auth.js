const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const store = require('../db/store');
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

    // v2 灵根生成：五行 1-3（常见）/ 3-5（稀有）；8% 追加特殊灵根（决议 D2）
    const r = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    const ELEMENT_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];
    const rootCount = Math.random() < 0.2 ? r(3, 5) : r(1, 3);
    const shuffled = [...ELEMENT_KEYS].sort(() => Math.random() - 0.5);
    const spirit_roots = shuffled.slice(0, rootCount).map((t) => ({ type: t, purity: r(20, 100) }));
    if (Math.random() < 0.08) {
      spirit_roots.push({
        type: ['sword', 'dan', 'desire', 'wealth', 'supreme', 'cauldron'][r(0, 5)],
        purity: r(10, 60),
        special: true
      });
    }

    // v2 三层属性 + 时间/寿命/伤势字段（决议 D1/D5）
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    db.characters.push({
      id: charId, user_id: userId, name: charName, faction: faction || 'martial',
      realm: '炼气', realm_stage: 1,
      // 出厂 exp_to_next 取自经验曲线真源（轮54：此前硬编码 100，与"炼气满境需 5.2e6"的量级分叉，
      // 会让新号白送第一级、且前端显示的需求与实收不一致）
      level: 1, exp: 0,
      exp_to_next: require('../services/exp-curve').needForLevel(
        (db.realms || []).find((r) => r.name === '炼气'), 1) || 100,
      hp: 100 + (bonus.hp || 0), max_hp: 100 + (bonus.hp || 0),
      mp: 50 + (bonus.mp || 0), max_mp: 50 + (bonus.mp || 0),
      attack: 10 + (bonus.attack || 0), defense: 5, speed: 5 + (bonus.speed || 0),
      spirit_stone: 100, jade: 0,
      total_battles: 0, win_streak: 0, total_kills: 0,
      dungeon_count: 0, boss_kill: 0, arena_points: 0,
      vip_level: 0, vip_exp: 0,
      afk_map: 1, afk_start_time: null,
      season_registered: false, season_points: 0,
      // v2 属性三层
      stats: {
        constitution: r(5, 10), strength: r(5, 10), physique: r(5, 10),
        wisdom: r(5, 10), soul: r(5, 10), talent: r(5, 15),
        comprehension: r(5, 15), affinity: r(5, 15), luck: r(5, 15),
        daoAffinity: r(1, 5), appearance: r(1, 10), fortune: r(1, 10)
      },
      spirit_roots,
      // v2 时间/寿命/伤势
      age_years: 16,
      lifespan_bonus_years: 0,
      lifespan_penalty_years: 0,
      time_settled_at: now,
      game_birth_at: nowIso,
      reincarnation_count: 0,
      ascended: false,
      injury: 0,
      injury_status: 'none',
      auto_meditate: true,
      auto_meditate_threshold: 80,
      created_at: nowIso, last_login: nowIso
    });
    saveDatabase(db);
    // 编年史：降世
    try {
      store.insertRel('lifespan_events', {
        character_id: charId, game_year: 0, type: 'birth',
        title: '降世', content: `${charName} 降世，凡身百载`, created_at: nowIso
      });
    } catch (e) { console.error('[register] 编年史写入失败:', e.message); }
    const token = jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    res.json({ token, userId, username: charName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', require('../middleware/loginGuard').guard, turnstileMiddleware, async (req, res) => {
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
