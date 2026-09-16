const express = require('express');
const skillSvc = require('../services/skill'); // 轮65：被动技（craft_amp/alchemy_amp/discount/gather_amp）常驻生效
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
    // 轮65：被动技"天机感应"等在此常驻生效（不占槽、无需装备），封顶 0.95 防堆成必出。
    const gatherBonus = skillSvc.getPassiveBonus(character.id, 'gather_amp');
    const nodeChance = Math.min(0.95, baseChance + gatherBonus);


    for (const nodeName of gatherNodes) {
      if (Math.random() < nodeChance) {
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
    // 成就「地图探索者」：记录已探索地图（内容富集九期接线）
    if (!Array.isArray(character.visited_maps)) character.visited_maps = [];
    if (!character.visited_maps.includes(map.id)) character.visited_maps.push(map.id);
    // 阶段3：采集熟练度
    const gProf = proficiencyService.addExp(character, 'gathering', 2 + (map.difficulty || 1));
    const { updateQuestProgress } = require('./quests');
    // 轮105：带上**地图名 + 采到的物品名**。剧情委托写的是「在药王谷采 6 次」「凑齐镜心砂 3 件」，
    // 不带名字就分不开在哪采的、采到了什么。collect 同源：采到即算"凑齐"。
    const gatherCtx = {
      map: map && map.name ? map.name : undefined,
      item: Array.isArray(gatheredItems) && gatheredItems.length
        ? gatheredItems.map((g) => (g && (g.name || (g.item && g.item.name))) || null).filter(Boolean)
        : undefined
    };
    updateQuestProgress(character.id, 'gather', 1, gatherCtx);
    // collect：**按物品名聚合件数**再一次报上去。
    // 为什么不是 for 循环逐个调用：updateQuestProgress 内部 loadDatabase+saveDatabase，
    // 循环 N 次就是 N 次全量读写存档（慢且无意义）。
    // 为什么不是"一次带总件数 + 全部物品名"：increment 会加到**每个**命中的目标上，
    // 那样「凑齐 镜心砂 3 件」会被采到 2 件别的东西时误加 2。聚合到"每件物品一次调用"才精确。
    // （同种物品采到多件时 gatheredItems 有多个同名元素，聚合后 increment = 该件数，正确。）
    if (gatherCtx.item && gatherCtx.item.length) {
      const byName = new Map();
      for (const nm of gatherCtx.item) byName.set(nm, (byName.get(nm) || 0) + 1);
      for (const [nm, cnt] of byName) updateQuestProgress(character.id, 'collect', cnt, { item: nm });
    }

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
