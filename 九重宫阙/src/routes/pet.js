const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const itemService = require('../services/item');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const pets = db.pets.filter(p => p.character_id === character.id);
    const petDetails = pets.map(p => {
      const item = db.items.find(i => i.id === p.item_id || i.id === p.pet_id);
      return {
        ...p,
        item,
        stats: item ? JSON.parse(item.stats || '{}') : {}
      };
    });
    res.json(petDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const activePets = db.pets.filter(p => p.character_id === character.id && p.is_active);
    const petDetails = activePets.map(p => {
      const item = db.items.find(i => i.id === p.item_id || i.id === p.pet_id);
      return {
        ...p,
        item,
        stats: item ? JSON.parse(item.stats || '{}') : {}
      };
    });
    res.json(petDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/equip', auth, (req, res) => {
  try {
    const { itemId, petId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const activePets = db.pets.filter(
      p => p.character_id === character.id && p.is_active
    );
    if (activePets.length >= 3) {
      return res.status(400).json({ error: '最多出战3只灵宠' });
    }

    if (petId) {
      const existingPet = db.pets.find(
        p => p.character_id === character.id && p.id === petId
      );
      if (existingPet) {
        existingPet.is_active = 1;
        saveDatabase(db);
        return res.json({ success: true });
      }
    }

    const targetId = itemId || petId;
    const inventoryItem = db.inventory.find(
      i => i.character_id === character.id && i.item_id === targetId
    );

    const item = db.items.find(i => i.id === targetId);
    if (!item || item.type !== '灵宠') {
      return res.status(400).json({ error: '无效的灵宠' });
    }

    const petId2 = getNextId('pets');
    db.pets.push({
      id: petId2,
      character_id: character.id,
      item_id: targetId,
      pet_id: targetId,
      name: item.name,
      level: 1,
      exp: 0,
      contract_type: '血契',
      is_active: 1
    });

    if (inventoryItem) {
      const invIdx = db.inventory.findIndex(i => i.id === inventoryItem.id);
      if (invIdx !== -1) db.inventory.splice(invIdx, 1);
    }

    saveDatabase(db);
    res.json({ success: true, petId: petId2 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unequip', auth, (req, res) => {
  try {
    const { petId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const pet = db.pets.find(
      p => p.character_id === character.id && p.id === petId
    );
    if (!pet) {
      return res.status(400).json({ error: '灵宠不存在' });
    }

    pet.is_active = 0;
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/release', auth, (req, res) => {
  try {
    const { petId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const petIndex = db.pets.findIndex(
      p => p.character_id === character.id && p.id === petId
    );
    if (petIndex === -1) {
      return res.status(400).json({ error: '灵宠不存在' });
    }

    db.pets.splice(petIndex, 1);
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', auth, (req, res) => {
  try {
    const { realm, quality } = req.body;
    const qualities = ['凡兽', '灵兽', '玄兽', '地兽', '天兽', '圣兽', '仙兽'];
    const costMap = { '凡兽': 100, '灵兽': 300, '玄兽': 600, '地兽': 1000, '天兽': 2000, '圣兽': 5000, '仙兽': 10000 };
    const selectedQuality = quality || qualities[Math.floor(Math.random() * Math.min(3, qualities.length))];
    const cost = costMap[selectedQuality] || 200;

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: `灵石不足，需要${cost}灵石` });
    }

    const pet = itemService.generatePet(realm || '炼气', selectedQuality);
    if (!pet) {
      return res.status(400).json({ error: '生成灵宠失败' });
    }

    character.spirit_stone -= cost;
    const itemId = getNextId('items');
    db.items.push({ id: itemId, ...pet });

    db.inventory.push({
      character_id: character.id,
      item_id: itemId,
      quantity: 1
    });

    saveDatabase(db);
    res.json({ success: true, item: { id: itemId, ...pet }, cost, spirit_stone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/feed', auth, (req, res) => {
  try {
    const { petId, itemId, quantity } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const pet = db.pets.find(p => p.id === petId && p.character_id === character.id);
    if (!pet) {
      return res.status(400).json({ error: '灵宠不存在' });
    }

    if (itemId) {
      const inventoryItem = db.inventory.find(
        i => i.character_id === character.id && i.item_id === itemId
      );
      if (!inventoryItem) {
        return res.status(400).json({ error: '物品不在背包中' });
      }
      const feedQty = quantity || 1;
      inventoryItem.quantity -= feedQty;
      if (inventoryItem.quantity <= 0) {
        const idx = db.inventory.findIndex(i => i.id === inventoryItem.id);
        if (idx !== -1) db.inventory.splice(idx, 1);
      }
    }

    const expGain = (quantity || 1) * 10;
    pet.exp = (pet.exp || 0) + expGain;

    while (pet.exp >= (pet.level || 1) * 100) {
      pet.exp -= (pet.level || 1) * 100;
      pet.level = (pet.level || 1) + 1;
    }

    saveDatabase(db);
    res.json({ success: true, level: pet.level, exp: pet.exp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
