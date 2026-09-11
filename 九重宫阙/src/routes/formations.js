const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const FORMATION_TYPES = [
  { id: 1, name: '天罡北斗阵', type: 'big_dipper', bonus_attack: 15, bonus_defense: 10, bonus_speed: 0, bonus_hp: 0, bonus_exp: 0, description: '攻击力+15%，防御力+10%' },
  { id: 2, name: '七星聚灵阵', type: 'seven_star', bonus_attack: 0, bonus_defense: 0, bonus_speed: 0, bonus_hp: 0, bonus_exp: 30, description: '修炼速度+30%' },
  { id: 3, name: '九宫八卦阵', type: 'nine_palace', bonus_attack: 0, bonus_defense: 20, bonus_speed: 10, bonus_hp: 0, bonus_exp: 0, description: '防御力+20%，速度+10%' },
  { id: 4, name: '万剑归宗阵', type: 'sword_array', bonus_attack: 25, bonus_defense: 0, bonus_speed: 0, bonus_hp: 0, bonus_exp: 0, description: '攻击力+25%，暴击+5%' },
  { id: 5, name: '玄武防御阵', type: 'black_tortoise', bonus_attack: 0, bonus_defense: 30, bonus_speed: 0, bonus_hp: 20, bonus_exp: 0, description: '防御力+30%，生命+20%' }
];

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const formations = (db.formations || []).filter(f => f.character_id === character.id);
    res.json({ formations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/list', auth, (req, res) => {
  try {
    res.json({ formations: FORMATION_TYPES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/activate', auth, (req, res) => {
  try {
    const { formationId } = req.body;
    if (!formationId) {
      return res.status(400).json({ error: '请指定要激活的阵法' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const formationDef = FORMATION_TYPES.find(f => f.id === formationId);
    if (!formationDef) {
      return res.status(400).json({ error: '未知的阵法' });
    }

    const existing = (db.formations || []).find(
      f => f.character_id === character.id && f.type === formationDef.type
    );

    const currentActive = (db.formations || []).find(
      f => f.character_id === character.id && f.active
    );
    if (currentActive) {
      currentActive.active = false;
      currentActive.activated_at = null;
    }

    if (existing) {
      existing.active = true;
      existing.activated_at = Date.now();
    } else {
      const formation = {
        id: getNextId('formations'),
        character_id: character.id,
        name: formationDef.name,
        type: formationDef.type,
        bonus_attack: formationDef.bonus_attack,
        bonus_defense: formationDef.bonus_defense,
        bonus_speed: formationDef.bonus_speed,
        bonus_hp: formationDef.bonus_hp,
        bonus_exp: formationDef.bonus_exp,
        active: true,
        activated_at: Date.now()
      };
      if (!db.formations) db.formations = [];
      db.formations.push(formation);
    }

    saveDatabase(db);
    res.json({ success: true, message: `${formationDef.name}已激活`, formation: formationDef });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deactivate', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const active = (db.formations || []).find(
      f => f.character_id === character.id && f.active
    );

    if (!active) {
      return res.status(400).json({ error: '当前没有激活的阵法' });
    }

    active.active = false;
    active.activated_at = null;

    saveDatabase(db);
    res.json({ success: true, message: `${active.name}已取消激活` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
