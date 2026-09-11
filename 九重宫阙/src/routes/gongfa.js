const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const itemService = require('../services/item');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const GONGFA_TYPES = {
  'cultivation': { name: '修炼功法', maxSlots: 3 },
  'combat': { name: '战斗功法', maxSlots: 6 }
};

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const gongfas = db.gongfa.filter(g => g.character_id === character.id);
    const equippedGongfa = gongfas.map(g => {
      const item = db.items.find(i => i.id === g.item_id);
      return { ...g, item };
    });
    res.json(equippedGongfa);
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

    const slots = {};
    for (const [typeId, typeInfo] of Object.entries(GONGFA_TYPES)) {
      const equipped = db.gongfa.filter(
        g => g.character_id === character.id && g.type === typeId
      );
      slots[typeId] = {
        name: typeInfo.name,
        maxSlots: typeInfo.maxSlots,
        equipped: equipped.map(g => ({
          ...g,
          item: db.items.find(i => i.id === g.item_id)
        }))
      };
    }
    res.json(slots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/equip', auth, (req, res) => {
  try {
    const { itemId, type, slot } = req.body;
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
    if (!item || item.type !== '功法') {
      return res.status(400).json({ error: '无效的功法' });
    }

    const gongfaType = type || (item.description && item.description.includes('修炼') ? 'cultivation' : 'combat');
    const typeConfig = GONGFA_TYPES[gongfaType];
    if (!typeConfig) {
      return res.status(400).json({ error: '无效的功法类型' });
    }

    const currentEquipped = db.gongfa.filter(
      g => g.character_id === character.id && g.type === gongfaType
    );
    if (currentEquipped.length >= typeConfig.maxSlots) {
      return res.status(400).json({ error: `${typeConfig.name}已达上限` });
    }

    const gongfaId = getNextId('gongfa');
    db.gongfa.push({
      id: gongfaId,
      character_id: character.id,
      type: gongfaType,
      item_id: itemId,
      level: 1,
      exp: 0
    });

    const invIdx = db.inventory.findIndex(i => i.id === inventoryItem.id);
    if (invIdx !== -1) db.inventory.splice(invIdx, 1);

    saveDatabase(db);
    res.json({ success: true, gongfaId, type: gongfaType });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unequip', auth, (req, res) => {
  try {
    const { gongfaId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const gongfaIndex = db.gongfa.findIndex(
      g => g.id === gongfaId && g.character_id === character.id
    );
    if (gongfaIndex === -1) {
      return res.status(400).json({ error: '功法不存在' });
    }

    const gongfa = db.gongfa[gongfaIndex];
    db.inventory.push({
      character_id: character.id,
      item_id: gongfa.item_id,
      quantity: 1
    });

    db.gongfa.splice(gongfaIndex, 1);
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', auth, (req, res) => {
  try {
    const { realm, quality, type } = req.body;
    const qualities = ['黄阶', '玄阶', '地阶', '天阶', '圣阶', '仙阶'];
    const types = ['修炼', '战斗'];
    const costMap = { '黄阶': 80, '玄阶': 200, '地阶': 500, '天阶': 1000, '圣阶': 2500, '仙阶': 5000 };
    const selectedQuality = quality || qualities[Math.floor(Math.random() * qualities.length)];
    const cost = costMap[selectedQuality] || 150;

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: `灵石不足，需要${cost}灵石` });
    }

    const gongfa = itemService.generateGongfa(
      realm || '炼气',
      selectedQuality,
      type || types[Math.floor(Math.random() * types.length)]
    );
    if (!gongfa) {
      return res.status(400).json({ error: '生成功法失败' });
    }

    character.spirit_stone -= cost;
    const itemId = getNextId('items');
    db.items.push({ id: itemId, ...gongfa });

    db.inventory.push({
      character_id: character.id,
      item_id: itemId,
      quantity: 1
    });

    saveDatabase(db);
    res.json({ success: true, item: { id: itemId, ...gongfa }, cost, spirit_stone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upgrade', auth, (req, res) => {
  try {
    const { gongfaId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const gongfa = db.gongfa.find(
      g => g.id === gongfaId && g.character_id === character.id
    );
    if (!gongfa) {
      return res.status(400).json({ error: '功法不存在' });
    }

    const expRequired = gongfa.level * 100;
    if ((gongfa.exp || 0) < expRequired) {
      return res.status(400).json({ error: '经验不足', required: expRequired, current: gongfa.exp || 0 });
    }

    const cost = gongfa.level * 10;
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: '灵石不足', required: cost });
    }

    character.spirit_stone -= cost;
    gongfa.exp -= expRequired;
    gongfa.level += 1;

    saveDatabase(db);
    res.json({ success: true, level: gongfa.level, exp: gongfa.exp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
