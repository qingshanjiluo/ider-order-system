const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const itemService = require('../services/item');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const SLOT_NAMES = {
  'weapon': '主武器',
  'head': '头',
  'chest': '上身',
  'legs': '裤子',
  'gloves': '手套',
  'boots': '鞋子',
  'necklace': '项链',
  'ring': '戒指'
};

const SLOT_ICONS = {
  'weapon': '剑',
  'head': '盔',
  'chest': '甲',
  'legs': '腿',
  'gloves': '套',
  'boots': '靴',
  'necklace': '链',
  'ring': '戒'
};

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const equipments = db.equipments.filter(e => e.character_id === character.id);
    const equippedItems = equipments.map(e => {
      const item = db.items.find(i => i.id === e.item_id);
      return {
        ...e,
        slot_name: SLOT_NAMES[e.slot] || e.slot,
        item
      };
    });
    res.json(equippedItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/slots', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const equipments = db.equipments.filter(e => e.character_id === character.id);
    const slots = {};
    for (const [slotId, slotName] of Object.entries(SLOT_NAMES)) {
      const equip = equipments.find(e => e.slot === slotId);
      if (equip) {
        const item = db.items.find(i => i.id === equip.item_id);
        slots[slotId] = { equipped: true, equip, item, icon: SLOT_ICONS[slotId] };
      } else {
        slots[slotId] = { equipped: false, slotName, icon: SLOT_ICONS[slotId] };
      }
    }
    res.json(slots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/equip', auth, (req, res) => {
  try {
    const { itemId, slot } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = db.inventory.find(
      i => i.character_id === character.id && i.item_id === itemId
    );
    if (!inventoryItem) {
      return res.status(400).json({ error: '物品不在背包中' });
    }

    const item = db.items.find(i => i.id === itemId);
    if (!item || item.type !== '装备') {
      return res.status(400).json({ error: '无效的装备' });
    }

    const validSlot = slot || item.slot || 'weapon';
    if (!SLOT_NAMES[validSlot]) {
      return res.status(400).json({ error: '无效的装备槽位' });
    }

    const existingEquip = db.equipments.find(
      e => e.character_id === character.id && e.slot === validSlot
    );
    if (existingEquip) {
      const oldItem = db.items.find(i => i.id === existingEquip.item_id);
      db.inventory.push({
        character_id: character.id,
        item_id: existingEquip.item_id,
        quantity: 1
      });
      const idx = db.equipments.findIndex(e => e.id === existingEquip.id);
      if (idx !== -1) db.equipments.splice(idx, 1);
    }

    const invIdx = db.inventory.findIndex(i => i.id === inventoryItem.id);
    if (invIdx !== -1) db.inventory.splice(invIdx, 1);

    const equipId = getNextId('equipments');
    db.equipments.push({
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

router.post('/unequip', auth, (req, res) => {
  try {
    const { slot, equipmentId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    let equipIndex;
    if (equipmentId) {
      equipIndex = db.equipments.findIndex(
        e => e.id === equipmentId && e.character_id === character.id
      );
    } else {
      equipIndex = db.equipments.findIndex(
        e => e.character_id === character.id && e.slot === slot
      );
    }

    if (equipIndex === -1) {
      return res.status(400).json({ error: '该位置没有装备' });
    }

    const equip = db.equipments[equipIndex];
    db.inventory.push({
      character_id: character.id,
      item_id: equip.item_id,
      quantity: 1
    });

    db.equipments.splice(equipIndex, 1);
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/enhance', auth, (req, res) => {
  try {
    const { equipmentId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const equip = db.equipments.find(
      e => e.id === equipmentId && e.character_id === character.id
    );
    if (!equip) {
      return res.status(400).json({ error: '装备不存在' });
    }

    const item = db.items.find(i => i.id === equip.item_id);
    if (!item) {
      return res.status(400).json({ error: '装备信息不存在' });
    }

    if ((equip.enhance || 0) >= (item.enhanceMax || 25)) {
      return res.status(400).json({ error: '已达强化上限' });
    }

    const cost = (equip.enhance || 0) + 1;
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: '灵石不足', required: cost });
    }

    character.spirit_stone -= cost;
    const successRate = Math.max(0.3, 1 - (equip.enhance || 0) * 0.05);
    if (Math.random() > successRate) {
      saveDatabase(db);
      return res.json({ success: false, message: '强化失败', enhanceLevel: equip.enhance });
    }

    equip.enhance = (equip.enhance || 0) + 1;
    saveDatabase(db);
    res.json({ success: true, enhanceLevel: equip.enhance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', auth, (req, res) => {
  try {
    const { realm, quality, slot } = req.body;
    const costMap = { '凡器': 50, '法器': 150, '灵器': 400, '仙器': 800, '神器': 1500 };
    const cost = costMap[quality] || 100;

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: `灵石不足，需要${cost}灵石` });
    }

    let equipment;
    if (realm && quality) {
      equipment = itemService.generateEquipment(realm, quality, slot);
    } else {
      equipment = itemService.generateRandomEquipment(realm || '炼气');
    }
    if (!equipment) {
      return res.status(400).json({ error: '生成装备失败' });
    }

    character.spirit_stone -= cost;
    const itemId = getNextId('items');
    db.items.push({ id: itemId, ...equipment });

    db.inventory.push({
      character_id: character.id,
      item_id: itemId,
      quantity: 1
    });

    saveDatabase(db);
    res.json({ success: true, item: { id: itemId, ...equipment }, cost, spirit_stone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
