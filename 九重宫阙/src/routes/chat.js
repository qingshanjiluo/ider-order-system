const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase } = require('../database');

const CHANNELS = [
  { id: 'world', name: '世界频道', description: '所有修士交流之地' },
  { id: 'guild', name: '仙盟频道', description: '同门仙友专属' },
  { id: 'system', name: '系统频道', description: '系统公告与通知' }
];

router.get('/history', auth, (req, res) => {
  try {
    const channel = req.query.channel || 'world';
    const db = loadDatabase();
    let key = channel;
    let mine = null;
    if (channel === 'guild') {
      // 轮96：仙盟史按真盟籍解析（内部键 guild:<id>；旧版读死列 + 全盟同键串音）
      const character = db.characters.find(c => c.user_id === req.userId);
      const member = character && (db.guild_members || []).find(m => m.character_id === character.id);
      if (!member) return res.json({ messages: [] });
      key = mine = `guild:${member.guild_id}`;
    }
    const messages = (db.chat_messages || [])
      .filter(m => m.channel === key || (mine && m.channel === 'guild')) // 兼容历史脏键 'guild'（并档迁移前遗留）
      .slice(-50);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/channels', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    // 轮96：盟籍真源是 guild_members——旧版读角色表上常年为空的死列，此页恒锁
    const member = character && (db.guild_members || []).find(m => m.character_id === character.id);
    const channels = CHANNELS.map(ch => ({
      ...ch,
      hasAccess: ch.id !== 'guild' || !!member
    }));
    res.json({ channels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/report', auth, (req, res) => {
  try {
    const { messageId, reason } = req.body;
    if (!messageId || !reason) {
      return res.status(400).json({ error: '缺少举报信息' });
    }
    const db = loadDatabase();
    if (!db.chat_reports) db.chat_reports = [];
    db.chat_reports.push({
      id: db.chat_reports.length + 1,
      messageId,
      reportedBy: req.userId,
      reason: reason.substring(0, 200),
      timestamp: Date.now(),
      status: 'pending'
    });
    const { saveDatabase } = require('../database');
    saveDatabase(db);
    res.json({ message: '举报已提交' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/online', auth, (req, res) => {
  try {
    res.json({ count: 0, users: [], note: 'Use WebSocket for live data' });
  } catch (error) {
    res.json({ count: 0, users: [] });
  }
});

module.exports = router;
