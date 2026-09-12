/**
 * 好友路由（P2 · 章程 E8；轮48）
 * 挂载：/api/friend —— 申请 / 回应 / 删除 / 访问洞府 四端点 + 列表与搜道号。
 * 全部经 auth 中间件，因此天然在 `withCharacterLock(本角色)` 之内（见 services/friend.js 的并发口径注释）。
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');
const friend = require('../services/friend');

function getChar(req, res) {
  const db = loadDatabase();
  const character = db.characters.find(c => c.user_id === req.userId);
  if (!character) {
    res.status(404).json({ error: '角色不存在' });
    return null;
  }
  return character;
}

router.get('/list', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    res.json(friend.overview(character.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    res.json({ results: friend.search(character.id, req.query.name || req.query.kw || '') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/request', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    const { target } = req.body;
    if (target === undefined || target === null || String(target).trim() === '') {
      return res.status(400).json({ error: '缺少目标角色（id 或道号）' });
    }
    const r = friend.request(character.id, target);
    if (!r.ok) return res.status(400).json(r);
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/respond', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    const { requestId, accept } = req.body;
    if (!Number(requestId)) return res.status(400).json({ error: '缺少申请 id' });
    const r = friend.respond(character.id, requestId, Boolean(accept));
    if (!r.ok) return res.status(400).json(r);
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/remove', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    const { friendId } = req.body;
    if (!Number(friendId)) return res.status(400).json({ error: '缺少好友角色 id' });
    const r = friend.remove(character.id, friendId);
    if (!r.ok) return res.status(400).json(r);
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/visit', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    const { hostId } = req.body;
    if (!Number(hostId)) return res.status(400).json({ error: '缺少洞府主人 id' });
    const r = friend.visit(character.id, hostId);
    if (!r.ok) return res.status(400).json(r);
    saveDatabase(loadDatabase());
    res.json(r);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
