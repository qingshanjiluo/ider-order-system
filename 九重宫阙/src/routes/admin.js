const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/admin');
// 轮71 修：:185 用 getNextId 却从没解构导入 —— "给角色发送**新**物品"必 ReferenceError→500
// （旧背包行恰含该物品才走得通，26 套门禁从没有一条打这个端点的新建分支，所以从没炸过）。
const { loadDatabase, saveDatabase, getNextId } = require('../database');

router.get('/dashboard', adminAuth, (req, res) => {
  try {
    const db = loadDatabase();
    const totalUsers = (db.users || []).length;
    const totalCharacters = (db.characters || []).length;
    const onlineToday = (db.characters || []).filter(c => {
      if (!c.last_login) return false;
      const d = new Date(c.last_login);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    const totalGuilds = (db.guilds || []).length;
    const totalBattles = (db.characters || []).reduce((sum, c) => sum + (c.total_battles || 0), 0);
    const totalJade = (db.characters || []).reduce((sum, c) => sum + (c.jade || 0), 0);
    const totalRecharged = (db.recharge_log || []).reduce((sum, l) => sum + (l.price || 0), 0);
    const realmDistribution = {};
    (db.characters || []).forEach(c => {
      const r = c.realm || '炼气';
      realmDistribution[r] = (realmDistribution[r] || 0) + 1;
    });
    const recentMessages = (db.chat_messages || []).slice(-20);
    const recentRecharges = (db.recharge_log || []).slice(-10).reverse();
    res.json({
      stats: { totalUsers, totalCharacters, onlineToday, totalGuilds, totalBattles, totalJade, totalRecharged },
      realmDistribution,
      recentMessages,
      recentRecharges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users', adminAuth, (req, res) => {
  try {
    const db = loadDatabase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    let users = (db.users || []).map(u => {
      const char = (db.characters || []).find(c => c.user_id === u.id);
      return {
        id: u.id, username: u.username, created_at: u.created_at,
        is_admin: u.is_admin || false, role: u.role || 'user', locked: u.locked || 0,
        character: char ? {
          id: char.id, name: char.name, level: char.level, realm: char.realm,
          vip_level: char.vip_level || 0, spirit_stone: char.spirit_stone || 0,
          jade: char.jade || 0, attack: char.attack || 0, defense: char.defense || 0,
          hp: char.hp || 0, total_battles: char.total_battles || 0
        } : null
      };
    });
    if (search) {
      users = users.filter(u => u.username.includes(search) || (u.character && u.character.name && u.character.name.includes(search)));
    }
    const total = users.length;
    const start = (page - 1) * limit;
    const paged = users.slice(start, start + limit);
    res.json({ users: paged, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/:id/detail', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    const user = db.users.find(u => u.id === parseInt(id));
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const char = db.characters.find(c => c.user_id === user.id);
    const inventory = char ? db.inventory.filter(i => i.character_id === char.id).map(i => {
      const item = db.items.find(it => it.id === i.item_id);
      return { ...i, itemName: item?.name || '未知', itemType: item?.type || '' };
    }) : [];
    const skills = char ? (char.skills || []) : [];
    const guild = char && char.guild_id ? (db.guilds || []).find(g => g.id === char.guild_id) : null;
    const recharges = (db.recharge_log || []).filter(l => l.user_id === user.id).slice(-10).reverse();
    res.json({
      user: { id: user.id, username: user.username, role: user.role || 'user', locked: user.locked || 0, created_at: user.created_at },
      character: char || null,
      inventory: inventory.slice(0, 50),
      skills,
      guild: guild ? { name: guild.name, level: guild.level } : null,
      recharges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/role', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const db = loadDatabase();
    const user = db.users.find(u => u.id === parseInt(id));
    if (!user) return res.status(404).json({ error: '用户不存在' });
    user.role = role || 'user';
    user.is_admin = role === 'admin' || role === 'super_admin' ? 1 : 0;
    saveDatabase(db);
    res.json({ success: true, message: `已将 ${user.username} 设置为 ${role}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/ban', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    const user = db.users.find(u => u.id === parseInt(id));
    if (!user) return res.status(404).json({ error: '用户不存在' });
    user.locked = user.locked ? 0 : 1;
    saveDatabase(db);
    res.json({ success: true, message: user.locked ? '已封禁用户' : '已解封用户', locked: user.locked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/add-stones', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const db = loadDatabase();
    const char = db.characters.find(c => c.user_id === parseInt(id));
    if (!char) return res.status(404).json({ error: '角色不存在' });
    char.spirit_stone = (char.spirit_stone || 0) + (amount || 0);
    saveDatabase(db);
    res.json({ success: true, spirit_stone: char.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/add-jade', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const db = loadDatabase();
    const char = db.characters.find(c => c.user_id === parseInt(id));
    if (!char) return res.status(404).json({ error: '角色不存在' });
    char.jade = (char.jade || 0) + (amount || 0);
    saveDatabase(db);
    res.json({ success: true, jade: char.jade });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/set-level', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { level, realm } = req.body;
    const db = loadDatabase();
    const char = db.characters.find(c => c.user_id === parseInt(id));
    if (!char) return res.status(404).json({ error: '角色不存在' });
    if (level !== undefined) char.level = Math.max(1, Math.min(999, parseInt(level)));
    if (realm !== undefined) char.realm = realm;
    saveDatabase(db);
    res.json({ success: true, level: char.level, realm: char.realm });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/add-item', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { itemId, quantity } = req.body;
    const db = loadDatabase();
    const char = db.characters.find(c => c.user_id === parseInt(id));
    if (!char) return res.status(404).json({ error: '角色不存在' });
    const item = db.items.find(i => i.id === parseInt(itemId));
    if (!item) return res.status(404).json({ error: '物品不存在' });
    const qty = Math.max(1, Math.min(9999, parseInt(quantity) || 1));
    const existingInv = db.inventory.find(i => i.character_id === char.id && i.item_id === item.id);
    if (existingInv) existingInv.quantity = (existingInv.quantity || 1) + qty;
    else db.inventory.push({ id: getNextId('inventory'), character_id: char.id, item_id: item.id, quantity: qty });
    saveDatabase(db);
    res.json({ success: true, message: `给${char.name}发送${item.name}x${qty}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/characters', adminAuth, (req, res) => {
  try {
    const db = loadDatabase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let chars = (db.characters || []).map(c => ({
      id: c.id, user_id: c.user_id, name: c.name, level: c.level, realm: c.realm,
      spirit_stone: c.spirit_stone, jade: c.jade || 0, attack: c.attack, defense: c.defense,
      hp: c.hp, total_battles: c.total_battles,
      vip_level: c.vip_level || 0, created_at: c.created_at
    }));
    const total = chars.length;
    const start = (page - 1) * limit;
    const paged = chars.slice(start, start + limit);
    res.json({ characters: paged, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/items', adminAuth, (req, res) => {
  try {
    const db = loadDatabase();
    const search = req.query.search || '';
    let items = db.items || [];
    if (search) items = items.filter(i => i.name.includes(search));
    res.json({ items: items.slice(0, 100), total: items.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recharge-logs', adminAuth, (req, res) => {
  try {
    const db = loadDatabase();
    const logs = (db.recharge_log || []).slice(-50).reverse();
    res.json({ logs, total: (db.recharge_log || []).length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/chat-logs', adminAuth, (req, res) => {
  try {
    const db = loadDatabase();
    const limit = parseInt(req.query.limit) || 100;
    const messages = (db.chat_messages || []).slice(-limit);
    res.json({ messages, total: (db.chat_messages || []).length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/broadcast', adminAuth, (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '广播内容不能为空' });
    const { broadcastSystem } = require('../../server');
    broadcastSystem(content);
    res.json({ success: true, message: '广播已发送' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset-character', adminAuth, (req, res) => {
  try {
    const { userId } = req.body;
    const db = loadDatabase();
    const char = db.characters.find(c => c.user_id === userId);
    if (!char) return res.status(404).json({ error: '角色不存在' });
    char.level = 1;
    char.exp = 0;
    char.spirit_stone = 100;
    char.attack = 10;
    char.defense = 5;
    char.hp = 100;
    char.realm = '炼气';
    saveDatabase(db);
    res.json({ success: true, message: `已重置${char.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
