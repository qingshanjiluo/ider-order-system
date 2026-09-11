const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/admin');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const announcements = (db.announcements || [])
      .filter(a => {
        if (a.expires_at && new Date(a.expires_at) < new Date()) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    res.json({ announcements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/unread', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const lastRead = (db.user_settings || []).find(s => s.user_id === req.userId && s.key === 'announcement_last_read');
    const lastReadTime = lastRead ? new Date(lastRead.value).getTime() : 0;
    const unread = (db.announcements || []).filter(a => {
      if (a.expires_at && new Date(a.expires_at) < new Date()) return false;
      if (new Date(a.created_at).getTime() <= lastReadTime) return false;
      return true;
    });
    res.json({ announcements: unread, count: unread.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/read', auth, (req, res) => {
  try {
    const db = loadDatabase();
    if (!db.user_settings) db.user_settings = [];
    const existing = db.user_settings.find(s => s.user_id === req.userId && s.key === 'announcement_last_read');
    if (existing) {
      existing.value = new Date().toISOString();
    } else {
      db.user_settings.push({ user_id: req.userId, key: 'announcement_last_read', value: new Date().toISOString() });
    }
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', adminAuth, (req, res) => {
  try {
    const { title, content, type, priority, pinned, expires_at } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
    const db = loadDatabase();
    const announcement = {
      id: getNextId('announcements'),
      title, content,
      type: type || 'system',
      priority: priority || 'normal',
      pinned: pinned || false,
      author: '管理员',
      created_at: new Date().toISOString(),
      expires_at: expires_at || null
    };
    db.announcements.push(announcement);
    saveDatabase(db);
    res.json({ success: true, announcement });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    const announcement = (db.announcements || []).find(a => a.id === parseInt(id));
    if (!announcement) return res.status(404).json({ error: '公告不存在' });
    const { title, content, type, priority, pinned, expires_at } = req.body;
    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (type) announcement.type = type;
    if (priority) announcement.priority = priority;
    if (pinned !== undefined) announcement.pinned = pinned;
    if (expires_at !== undefined) announcement.expires_at = expires_at;
    saveDatabase(db);
    res.json({ success: true, announcement });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    const idx = (db.announcements || []).findIndex(a => a.id === parseInt(id));
    if (idx === -1) return res.status(404).json({ error: '公告不存在' });
    db.announcements.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true, message: '公告已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
