const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

// ========== 法器系统 ==========
router.get('/weapons', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const weapons = (db.items || []).filter(i => i.type === '法器').map(item => ({
      id: item.id,
      name: item.name,
      subtype: item.subtype,
      quality: item.quality,
      realm: item.realm,
      stats: JSON.parse(item.stats || '{}'),
      description: item.description
    }));
    res.json(weapons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/weapons/my', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const inventory = (db.inventory || []).filter(i => i.character_id === character.id);
    const weapons = [];
    for (const inv of inventory) {
      const item = (db.items || []).find(i => i.id === inv.item_id);
      if (item && item.type === '法器') {
        weapons.push({
          id: inv.id,
          itemId: item.id,
          name: item.name,
          subtype: item.subtype,
          quality: item.quality,
          realm: item.realm,
          stats: JSON.parse(item.stats || '{}'),
          quantity: inv.quantity || 1,
          description: item.description
        });
      }
    }
    res.json(weapons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/weapons/equip', auth, (req, res) => {
  try {
    const { itemId, slot } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = (db.inventory || []).find(
      i => i.character_id === character.id && i.item_id === itemId
    );
    if (!inventoryItem) {
      return res.status(400).json({ error: '物品不在背包中' });
    }

    const item = (db.items || []).find(i => i.id === itemId);
    if (!item || item.type !== '法器') {
      return res.status(400).json({ error: '无效的法器' });
    }

    const validSlot = slot || item.subtype || '飞剑';
    const existingEquip = (db.equipments || []).find(
      e => e.character_id === character.id && e.slot === validSlot
    );
    if (existingEquip) {
      const oldItem = (db.items || []).find(i => i.id === existingEquip.item_id);
      (db.inventory || []).push({
        character_id: character.id,
        item_id: existingEquip.item_id,
        quantity: 1
      });
      const idx = (db.equipments || []).findIndex(e => e.id === existingEquip.id);
      if (idx !== -1) db.equipments.splice(idx, 1);
    }

    const invIdx = (db.inventory || []).findIndex(i => i.id === inventoryItem.id);
    if (invIdx !== -1) db.inventory.splice(invIdx, 1);

    const equipId = getNextId('equipments');
    (db.equipments || []).push({
      id: equipId,
      character_id: character.id,
      slot: validSlot,
      item_id: itemId,
      enhance: 0
    });

    saveDatabase(db);
    res.json({ success: true, equipId, slot: validSlot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 丹药系统 ==========
router.get('/pills', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const pills = (db.items || []).filter(i => i.type === '丹药').map(item => ({
      id: item.id,
      name: item.name,
      subtype: item.subtype,
      quality: item.quality,
      realm: item.realm,
      stats: JSON.parse(item.stats || '{}'),
      description: item.description
    }));
    res.json(pills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pills/my', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const inventory = (db.inventory || []).filter(i => i.character_id === character.id);
    const pills = [];
    for (const inv of inventory) {
      const item = (db.items || []).find(i => i.id === inv.item_id);
      if (item && item.type === '丹药') {
        pills.push({
          id: inv.id,
          itemId: item.id,
          name: item.name,
          subtype: item.subtype,
          quality: item.quality,
          stats: JSON.parse(item.stats || '{}'),
          quantity: inv.quantity || 1,
          description: item.description
        });
      }
    }
    res.json(pills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pills/use', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = (db.inventory || []).find(
      i => i.character_id === character.id && i.item_id === itemId
    );
    if (!inventoryItem || (inventoryItem.quantity || 0) <= 0) {
      return res.status(400).json({ error: '丹药不足' });
    }

    const item = (db.items || []).find(i => i.id === itemId);
    if (!item || item.type !== '丹药') {
      return res.status(400).json({ error: '无效的丹药' });
    }

    const stats = JSON.parse(item.stats || '{}');
    let effect = '';

    if (stats.hp_restore) {
      character.hp = Math.min((character.hp || 0) + stats.hp_restore, character.max_hp || 100);
      effect = `恢复${stats.hp_restore}点生命`;
    }
    if (stats.mp_restore) {
      character.mp = Math.min((character.mp || 0) + stats.mp_restore, character.max_mp || 50);
      effect += (effect ? '，' : '') + `恢复${stats.mp_restore}点灵力`;
    }
    if (stats.hp_full) {
      character.hp = character.max_hp || 100;
      effect = '完全恢复生命';
    }
    if (stats.mp_full) {
      character.mp = character.max_mp || 50;
      effect += (effect ? '，' : '') + '完全恢复灵力';
    }
    if (stats.exp_bonus) {
      character.temp_exp_bonus = stats.exp_bonus;
      character.temp_exp_bonus_duration = stats.duration || 300;
      effect += (effect ? '，' : '') + `经验加成${(stats.exp_bonus - 1) * 100}%`;
    }
    if (stats.attack_bonus) {
      character.temp_attack_bonus = stats.attack_bonus;
      character.temp_attack_bonus_duration = stats.duration || 300;
      effect += (effect ? '，' : '') + `攻击加成${(stats.attack_bonus - 1) * 100}%`;
    }
    if (stats.defense_bonus) {
      character.temp_defense_bonus = stats.defense_bonus;
      character.temp_defense_bonus_duration = stats.duration || 300;
      effect += (effect ? '，' : '') + `防御加成${(stats.defense_bonus - 1) * 100}%`;
    }
    if (stats.speed_bonus) {
      character.temp_speed_bonus = stats.speed_bonus;
      character.temp_speed_bonus_duration = stats.duration || 300;
      effect += (effect ? '，' : '') + `速度加成${(stats.speed_bonus - 1) * 100}%`;
    }

    inventoryItem.quantity = (inventoryItem.quantity || 1) - 1;
    if (inventoryItem.quantity <= 0) {
      const idx = (db.inventory || []).findIndex(i => i.id === inventoryItem.id);
      if (idx !== -1) db.inventory.splice(idx, 1);
    }

    saveDatabase(db);
    res.json({ success: true, effect, hp: character.hp, mp: character.mp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 符箓系统 ==========
router.get('/talismans', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const talismans = (db.items || []).filter(i => i.type === '符箓').map(item => ({
      id: item.id,
      name: item.name,
      subtype: item.subtype,
      quality: item.quality,
      realm: item.realm,
      stats: JSON.parse(item.stats || '{}'),
      description: item.description
    }));
    res.json(talismans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/talismans/my', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const inventory = (db.inventory || []).filter(i => i.character_id === character.id);
    const talismans = [];
    for (const inv of inventory) {
      const item = (db.items || []).find(i => i.id === inv.item_id);
      if (item && item.type === '符箓') {
        talismans.push({
          id: inv.id,
          itemId: item.id,
          name: item.name,
          subtype: item.subtype,
          quality: item.quality,
          stats: JSON.parse(item.stats || '{}'),
          quantity: inv.quantity || 1,
          description: item.description
        });
      }
    }
    res.json(talismans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/talismans/use', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = (db.inventory || []).find(
      i => i.character_id === character.id && i.item_id === itemId
    );
    if (!inventoryItem || (inventoryItem.quantity || 0) <= 0) {
      return res.status(400).json({ error: '符箓不足' });
    }

    const item = (db.items || []).find(i => i.id === itemId);
    if (!item || item.type !== '符箓') {
      return res.status(400).json({ error: '无效的符箓' });
    }

    const stats = JSON.parse(item.stats || '{}');
    let effect = '';

    if (stats.damage) {
      effect = `造成${stats.damage}点${stats.element || ''}伤害`;
    }
    if (stats.defense_bonus) {
      character.temp_defense_bonus = stats.defense_bonus;
      character.temp_defense_bonus_duration = stats.duration || 60;
      effect = `防御增加${(stats.defense_bonus - 1) * 100}%`;
    }
    if (stats.speed_bonus) {
      character.temp_speed_bonus = stats.speed_bonus;
      character.temp_speed_bonus_duration = stats.duration || 60;
      effect = `速度增加${(stats.speed_bonus - 1) * 100}%`;
    }
    if (stats.exp_bonus) {
      character.temp_exp_bonus = stats.exp_bonus;
      character.temp_exp_bonus_duration = stats.duration || 300;
      effect = `经验增加${(stats.exp_bonus - 1) * 100}%`;
    }
    if (stats.teleport) {
      effect = '传送回城';
    }
    if (stats.stealth) {
      character.temp_stealth = true;
      character.temp_stealth_duration = stats.duration || 180;
      effect = '进入隐身状态';
    }
    if (stats.seal_target) {
      effect = `封印目标${stats.duration || 60}秒`;
    }

    inventoryItem.quantity = (inventoryItem.quantity || 1) - 1;
    if (inventoryItem.quantity <= 0) {
      const idx = (db.inventory || []).findIndex(i => i.id === inventoryItem.id);
      if (idx !== -1) db.inventory.splice(idx, 1);
    }

    saveDatabase(db);
    res.json({ success: true, effect });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 阵法系统 ==========
router.get('/formations', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const formations = (db.items || []).filter(i => i.type === '阵法').map(item => ({
      id: item.id,
      name: item.name,
      subtype: item.subtype,
      quality: item.quality,
      realm: item.realm,
      stats: JSON.parse(item.stats || '{}'),
      description: item.description
    }));
    res.json(formations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/formations/my', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const inventory = (db.inventory || []).filter(i => i.character_id === character.id);
    const formations = [];
    for (const inv of inventory) {
      const item = (db.items || []).find(i => i.id === inv.item_id);
      if (item && item.type === '阵法') {
        formations.push({
          id: inv.id,
          itemId: item.id,
          name: item.name,
          subtype: item.subtype,
          quality: item.quality,
          stats: JSON.parse(item.stats || '{}'),
          quantity: inv.quantity || 1,
          description: item.description
        });
      }
    }
    res.json(formations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/formations/activate', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = (db.inventory || []).find(
      i => i.character_id === character.id && i.item_id === itemId
    );
    if (!inventoryItem || (inventoryItem.quantity || 0) <= 0) {
      return res.status(400).json({ error: '阵法不足' });
    }

    const item = (db.items || []).find(i => i.id === itemId);
    if (!item || item.type !== '阵法') {
      return res.status(400).json({ error: '无效的阵法' });
    }

    const stats = JSON.parse(item.stats || '{}');
    let effect = '';

    if (stats.attack_bonus) {
      character.temp_attack_bonus = stats.attack_bonus;
      character.temp_attack_bonus_duration = 300;
      effect = `攻击增加${(stats.attack_bonus - 1) * 100}%`;
    }
    if (stats.defense_bonus) {
      character.temp_defense_bonus = stats.defense_bonus;
      character.temp_defense_bonus_duration = 300;
      effect += (effect ? '，' : '') + `防御增加${(stats.defense_bonus - 1) * 100}%`;
    }
    if (stats.aoe_damage) {
      effect += (effect ? '，' : '') + `造成${stats.aoe_damage}点范围伤害`;
    }
    if (stats.damage_reduce) {
      character.temp_damage_reduce = stats.damage_reduce;
      character.temp_damage_reduce_duration = 300;
      effect += (effect ? '，' : '') + `伤害减免${stats.damage_reduce * 100}%`;
    }
    if (stats.exp_bonus) {
      character.temp_exp_bonus = stats.exp_bonus;
      character.temp_exp_bonus_duration = 300;
      effect += (effect ? '，' : '') + `经验增加${(stats.exp_bonus - 1) * 100}%`;
    }
    if (stats.hp_regen) {
      character.temp_hp_regen = stats.hp_regen;
      character.temp_hp_regen_duration = 300;
      effect += (effect ? '，' : '') + `生命回复${(stats.hp_regen - 1) * 100}%`;
    }

    inventoryItem.quantity = (inventoryItem.quantity || 1) - 1;
    if (inventoryItem.quantity <= 0) {
      const idx = (db.inventory || []).findIndex(i => i.id === inventoryItem.id);
      if (idx !== -1) db.inventory.splice(idx, 1);
    }

    saveDatabase(db);
    res.json({ success: true, effect });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 套装系统 ==========
router.get('/sets', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const sets = {};
    const items = (db.items || []).filter(i => i.stats && JSON.parse(i.stats || '{}').set);
    for (const item of items) {
      const stats = JSON.parse(item.stats || '{}');
      const setName = stats.set;
      if (!sets[setName]) {
        sets[setName] = {
          name: setName,
          items: [],
          bonuses: []
        };
      }
      sets[setName].items.push({
        id: item.id,
        name: item.name,
        type: item.type,
        subtype: item.subtype,
        quality: item.quality
      });
    }

    for (const [setName, set] of Object.entries(sets)) {
      const itemCount = set.items.length;
      if (itemCount >= 2) set.bonuses.push('2件套：攻击+10%');
      if (itemCount >= 3) set.bonuses.push('3件套：防御+15%');
      if (itemCount >= 4) set.bonuses.push('4件套：全属性+20%');
      if (itemCount >= 5) set.bonuses.push('5件套：技能伤害+30%');
    }

    res.json(Object.values(sets));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
