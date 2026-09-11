const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getMilestoneBonus(count) {
  const milestones = { 5: 500, 10: 1200, 20: 3000, 50: 10000 };
  return milestones[count] || 0;
}

router.get('/code', auth, (req, res) => {
  try {
    const db = loadDatabase();
    if (!db.invite_codes) db.invite_codes = [];
    let entry = db.invite_codes.find(c => c.userId === req.userId);
    if (!entry) {
      entry = {
        id: getNextId('invite_codes'),
        code: generateCode(),
        userId: req.userId,
        usedBy: [],
        createdAt: Date.now()
      };
      db.invite_codes.push(entry);
      saveDatabase(db);
    }
    res.json({ code: entry.code, usedCount: entry.usedBy.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', auth, (req, res) => {
  try {
    const db = loadDatabase();
    if (!db.invite_codes) db.invite_codes = [];
    const entry = db.invite_codes.find(c => c.userId === req.userId);
    if (!entry) {
      return res.json({ code: null, totalInvited: 0, rewardsEarned: 0, milestoneBonus: 0 });
    }
    const totalInvited = entry.usedBy.length;
    const rewardsEarned = totalInvited * 100;
    const milestoneBonus = getMilestoneBonus(totalInvited);
    res.json({ code: entry.code, totalInvited, rewardsEarned, milestoneBonus, totalRewards: rewardsEarned + milestoneBonus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/use', auth, (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.length !== 8) {
      return res.status(400).json({ error: '无效的邀请码' });
    }
    const db = loadDatabase();
    if (!db.invite_codes) db.invite_codes = [];
    const entry = db.invite_codes.find(c => c.code === code.toUpperCase());
    if (!entry) {
      return res.status(404).json({ error: '邀请码不存在' });
    }
    if (entry.userId === req.userId) {
      return res.status(400).json({ error: '不能使用自己的邀请码' });
    }
    if (entry.usedBy.includes(req.userId)) {
      return res.status(400).json({ error: '已使用过该邀请码' });
    }
    entry.usedBy.push(req.userId);

    const character = db.characters.find(c => c.user_id === req.userId);
    if (character) {
      if (!character.spirit_stone) character.spirit_stone = 0;
      character.spirit_stone += 100;
      const milestoneBonus = getMilestoneBonus(entry.usedBy.length);
      if (milestoneBonus > 0) {
        const inviter = db.characters.find(c => c.user_id === entry.userId);
        if (inviter) {
          if (!inviter.spirit_stone) inviter.spirit_stone = 0;
          inviter.spirit_stone += milestoneBonus;
        }
      }
    }

    saveDatabase(db);
    res.json({ message: '邀请码使用成功', reward: 100 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/list', auth, (req, res) => {
  try {
    const db = loadDatabase();
    if (!db.invite_codes) db.invite_codes = [];
    const entry = db.invite_codes.find(c => c.userId === req.userId);
    if (!entry) {
      return res.json({ invited: [] });
    }
    const invited = entry.usedBy.map(userId => {
      const char = db.characters.find(c => c.user_id === userId);
      return char ? { id: char.id, name: char.name, realm: char.realm, level: char.level } : { userId };
    });
    res.json({ invited });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
