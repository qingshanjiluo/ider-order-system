const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const proficiencyService = require('../services/proficiency');

router.get('/maps', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const maps = (db.maps || []).map(m => ({
      id: m.id,
      name: m.name,
      minLevel: m.min_level,
      maxLevel: m.max_level,
      difficulty: m.difficulty,
      element: m.element,
      monsters: m.monsters || [],
      gatherNodes: m.gather_nodes || [],
      expPerSecond: m.exp_per_second,
      spiritStonePerSecond: m.spirit_stone_per_second,
      description: m.description
    }));
    res.json(maps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/resources', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const resources = (db.items || []).filter(i =>
      i.type === '材料' || (i.type === '消耗品' && i.stats && JSON.parse(i.stats || '{}').pet_exp)
    ).map(item => ({
      id: item.id,
      name: item.name,
      quality: item.quality,
      realm: item.realm,
      type: item.type,
      stats: JSON.parse(item.stats || '{}'),
      description: item.description
    }));
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/gather', auth, (req, res) => {
  try {
    const { mapId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const map = (db.maps || []).find(m => m.id === mapId);
    if (!map) {
      return res.status(400).json({ error: '地图不存在' });
    }

    if ((character.level || 1) < map.min_level) {
      return res.status(400).json({ error: `等级不足，需要${map.min_level}级` });
    }

    const gatherNodes = map.gather_nodes || [];
    if (gatherNodes.length === 0) {
      return res.status(400).json({ error: '该地图没有可采集的资源' });
    }

    const gatheredItems = [];
    const gatherProf = proficiencyService.get(character, 'gathering');
    const baseChance = 0.3 + (character.level || 1) * 0.005 + gatherProf.successBonus * 0.5; // 熟练度加成（阶段3）

    for (const nodeName of gatherNodes) {
      if (Math.random() < baseChance) {
        const item = (db.items || []).find(i => i.name === nodeName);
        if (item) {
          gatheredItems.push({
            id: item.id,
            name: item.name,
            quality: item.quality,
            quantity: 1
          });
        }
      }
    }

    if (gatheredItems.length === 0) {
      const fallbackItem = (db.items || []).find(i => i.name === '灵草');
      if (fallbackItem) {
        gatheredItems.push({
          id: fallbackItem.id,
          name: fallbackItem.name,
          quality: fallbackItem.quality,
          quantity: 1
        });
      }
    }

    for (const gi of gatheredItems) {
      const existingInv = db.inventory.find(
        i => i.character_id === character.id && i.item_id === gi.id
      );
      if (existingInv) {
        existingInv.quantity = (existingInv.quantity || 1) + gi.quantity;
      } else {
        db.inventory.push({
          id: getNextId('inventory'),
          character_id: character.id,
          item_id: gi.id,
          quantity: gi.quantity
        });
      }
    }

    const expGained = Math.floor(5 + map.min_level * 2);
    character.exp = (character.exp || 0) + expGained;
    // 阶段3：采集熟练度
    const gProf = proficiencyService.addExp(character, 'gathering', 2 + (map.difficulty || 1));
    const { updateQuestProgress } = require('./quests');
    updateQuestProgress(character.id, 'gather', 1);

    saveDatabase(db);

    res.json({
      success: true,
      gatheredItems,
      expGained,
      proficiency: { level: gProf.level, levelName: gProf.levelName, levelUp: gProf.levelUp },
      mapName: map.name
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/monsters', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const { mapId } = req.query;
    let monsters = db.monsters || [];
    if (mapId) {
      monsters = monsters.filter(m => m.map_id === parseInt(mapId));
    }
    const result = monsters.map(m => ({
      id: m.id,
      name: m.name,
      levelRange: m.level_range,
      element: m.element,
      stats: JSON.parse(m.stats || '{}'),
      drops: JSON.parse(m.drops || '[]'),
      mapId: m.map_id,
      description: m.description
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/hunt', auth, (req, res) => {
  try {
    const { monsterId, mapId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    let monster;
    if (monsterId) {
      monster = (db.monsters || []).find(m => m.id === monsterId);
    } else if (mapId) {
      const mapMonsters = (db.monsters || []).filter(m => m.map_id === parseInt(mapId));
      if (mapMonsters.length > 0) {
        monster = mapMonsters[Math.floor(Math.random() * mapMonsters.length)];
      }
    }

    if (!monster) {
      return res.status(400).json({ error: '怪物不存在' });
    }

    const charLevel = character.level || 1;
    const monsterLevel = Math.floor(
      Math.random() * (monster.level_range[1] - monster.level_range[0] + 1)
    ) + monster.level_range[0];

    const monsterStats = JSON.parse(monster.stats || '{}');
    const levelDiff = charLevel - monsterLevel;
    const winChance = Math.max(0.1, Math.min(0.95, 0.5 + levelDiff * 0.05));

    const isWin = Math.random() < winChance;

    const drops = [];
    if (isWin) {
      const dropList = JSON.parse(monster.drops || '[]');
      for (const drop of dropList) {
        if (Math.random() < (drop.rate || 0.1)) {
          const item = (db.items || []).find(i => i.id === drop.item_id);
          if (item) {
            drops.push({
              id: item.id,
              name: item.name,
              quality: item.quality,
              quantity: 1
            });
          }
        }
      }

      for (const drop of drops) {
        const existingInv = db.inventory.find(
          i => i.character_id === character.id && i.item_id === drop.id
        );
        if (existingInv) {
          existingInv.quantity = (existingInv.quantity || 1) + drop.quantity;
        } else {
          db.inventory.push({
            id: getNextId('inventory'),
            character_id: character.id,
            item_id: drop.id,
            quantity: drop.quantity
          });
        }
      }
    }

    const expGained = isWin ? Math.floor(10 + monsterLevel * 3) : 0;
    const spiritStoneGained = isWin ? Math.floor(5 + monsterLevel * 1) : 0;

    character.exp = (character.exp || 0) + expGained;
    character.spirit_stone = (character.spirit_stone || 0) + spiritStoneGained;
    character.total_battles = (character.total_battles || 0) + 1;
    if (isWin) {
      character.total_kills = (character.total_kills || 0) + 1;
      character.win_streak = (character.win_streak || 0) + 1;
    } else {
      character.win_streak = 0;
    }

    saveDatabase(db);

    res.json({
      success: true,
      isWin,
      monster: {
        name: monster.name,
        level: monsterLevel,
        element: monster.element
      },
      drops,
      expGained,
      spiritStoneGained,
      winStreak: character.win_streak
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
