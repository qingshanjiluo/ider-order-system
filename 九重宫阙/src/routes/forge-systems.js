const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const {
  REFINE_LEVELS,
  PILLS,
  refinePill,
  BLUEPRINTS,
  checkBlueprintComplete,
  LEGENDARY_EQUIPMENT,
  getCodexEntries,
  AFFIX_POOLS,
  NAME_PARTS,
  STYLE_MARKS,
  generateEquipmentName,
} = require('../data/forge-systems');
// 轮43：词条炼器原先把 realm 硬编码成 '未知'，且不校验 quality ——
// 结果 items 里混进 realm:"未知" 的脏定义（引用完整性审计抓到 3 件）。
// 品质与境界一律取自装备库的真源，价格表补齐整条品质梯（原先 法宝 不在表内，前端标 2000 实收 100）。
const { QUALITY_LADDER, REALM_BY_QUALITY } = require('../data/equipment-library');

router.get('/refine-info', auth, (req, res) => {
  try {
    res.json({
      levels: REFINE_LEVELS,
      pills: Object.entries(PILLS).map(([id, pill]) => ({
        id,
        name: pill.name,
        baseEffect: pill.baseEffect,
        maxLevel: pill.maxLevel,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refine', auth, (req, res) => {
  try {
    const { targetType, targetId } = req.body;
    if (!targetType || !targetId) {
      return res.status(400).json({ error: '缺少参数 targetType 或 targetId' });
    }

    const db = loadDatabase();
    const character = db.characters.find((c) => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    if (targetType === 'pill') {
      if (!character.refined_pills) character.refined_pills = {};
      const currentLevel = character.refined_pills[targetId] || 0;
      if (currentLevel >= REFINE_LEVELS.length - 1) {
        return res.status(400).json({ error: '已达最高精炼等级' });
      }

      const nextLevel = currentLevel + 1;
      const refineData = REFINE_LEVELS[nextLevel];
      const baseCost = PILLS[targetId] ? PILLS[targetId].baseEffect : 10;
      const cost = Math.floor(baseCost * refineData.costMultiplier);
      if ((character.spirit_stone || 0) < cost) {
        return res.status(400).json({ error: '灵石不足', required: cost });
      }

      character.spirit_stone -= cost;
      const result = refinePill(targetId, currentLevel);
      if (result.success) {
        character.refined_pills[targetId] = result.newLevel;
      }
      saveDatabase(db);
      res.json({ ...result, cost });
    } else if (targetType === 'equipment') {
      const equip = db.equipments.find(
        (e) => String(e.id) === String(targetId) && e.character_id === character.id
      );
      if (!equip) {
        return res.status(404).json({ error: '装备不存在' });
      }
      const currentLevel = equip.refine_level || 0;
      if (currentLevel >= REFINE_LEVELS.length - 1) {
        return res.status(400).json({ error: '已达最高精炼等级' });
      }

      const nextLevel = currentLevel + 1;
      const refineData = REFINE_LEVELS[nextLevel];
      const cost = Math.floor(50 * refineData.costMultiplier);
      if ((character.spirit_stone || 0) < cost) {
        return res.status(400).json({ error: '灵石不足', required: cost });
      }

      character.spirit_stone -= cost;
      const roll = Math.random();
      const success = roll < refineData.successRate;
      if (success) {
        equip.refine_level = nextLevel;
      }
      saveDatabase(db);
      res.json({
        success,
        message: success
          ? `精炼成功！${REFINE_LEVELS[nextLevel].name}完成`
          : '精炼失败！装备保持当前品质',
        newLevel: success ? nextLevel : currentLevel,
        cost,
      });
    } else {
      return res.status(400).json({ error: '无效的精炼目标类型' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/blueprints', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find((c) => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const unlockedIds = new Set(character.blueprints || []);
    const list = Object.entries(BLUEPRINTS).map(([id, bp]) => ({
      id: bp.id,
      name: bp.name,
      type: bp.type,
      rarity: bp.rarity,
      materials: bp.materials,
      unlocked: unlockedIds.has(id),
    }));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/blueprint/unlock', auth, (req, res) => {
  try {
    const { blueprintId } = req.body;
    if (!blueprintId) {
      return res.status(400).json({ error: '缺少参数 blueprintId' });
    }

    const db = loadDatabase();
    const character = db.characters.find((c) => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const bp = BLUEPRINTS[blueprintId];
    if (!bp) {
      return res.status(400).json({ error: '图纸不存在' });
    }

    if (!character.blueprints) character.blueprints = [];
    if (character.blueprints.includes(blueprintId)) {
      return res.status(400).json({ error: '图纸已解锁' });
    }

    const inventory = db.inventory.filter((i) => i.character_id === character.id);
    for (const [material, required] of Object.entries(bp.materials)) {
      const owned = inventory
        .filter((i) => i.item_id === material || i.name === material)
        .reduce((sum, i) => sum + (i.quantity || 1), 0);
      if (owned < required) {
        return res.status(400).json({
          error: `材料不足：${material} 需要 ${required}，拥有 ${owned}`,
          material,
          required,
          owned,
        });
      }
    }

    for (const [material, required] of Object.entries(bp.materials)) {
      let remaining = required;
      for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
        if (inventory[i].item_id === material || inventory[i].name === material) {
          const take = Math.min(remaining, inventory[i].quantity || 1);
          inventory[i].quantity = (inventory[i].quantity || 1) - take;
          remaining -= take;
          if (inventory[i].quantity <= 0) {
            const idx = db.inventory.findIndex((x) => x.id === inventory[i].id);
            if (idx !== -1) db.inventory.splice(idx, 1);
          }
        }
      }
    }

    character.blueprints.push(blueprintId);
    saveDatabase(db);
    res.json({ success: true, message: `${bp.name} 已解锁` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/codex', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find((c) => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const unlockedBlueprints = character.blueprints || [];
    const entries = getCodexEntries(unlockedBlueprints);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/codex/unlock', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: '缺少参数 itemId' });
    }

    const db = loadDatabase();
    const character = db.characters.find((c) => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const item = LEGENDARY_EQUIPMENT.find((e) => e.id === itemId);
    if (!item) {
      return res.status(400).json({ error: '图鉴条目不存在' });
    }

    if (item.blueprintRequired) {
      const bpId = `bp_${itemId.split('_')[1]}`;
      if (!character.blueprints || !character.blueprints.includes(bpId)) {
        return res.status(400).json({ error: '需要先解锁对应图纸' });
      }
    }

    const unlockCost = item.quality === '神阶' ? 10000 : item.quality === '仙阶' ? 5000 : 2000;
    if ((character.spirit_stone || 0) < unlockCost) {
      return res.status(400).json({ error: '灵石不足', required: unlockCost });
    }

    character.spirit_stone -= unlockCost;

    if (!character.unlocked_codex) character.unlocked_codex = [];
    if (character.unlocked_codex.includes(itemId)) {
      return res.status(400).json({ error: '已解锁该图鉴条目' });
    }

    const itemIdNum = getNextId('items');
    db.items.push({
      id: itemIdNum,
      name: item.name,
      type: '装备',
      quality: item.quality,
      realm: item.realm,
      stats: JSON.stringify(item.stats),
      description: item.description,
      subtype: item.slot,
    });

    db.equipments.push({
      id: getNextId('equipments'),
      character_id: character.id,
      item_id: itemIdNum,
      slot: item.slot,
      enhance: 0,
      refine_level: 0,
      named: item.name,
      affixes: item.affixes || [],
    });

    character.unlocked_codex.push(itemId);
    saveDatabase(db);
    res.json({
      success: true,
      message: `${item.name} 已锻造入库`,
      item: { id: itemIdNum, name: item.name, quality: item.quality, slot: item.slot },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/affixes', auth, (req, res) => {
  try {
    const affixList = Object.entries(AFFIX_POOLS).map(([name, data]) => ({
      name,
      ...data,
    }));
    res.json({
      affixes: affixList,
      styleMarks: STYLE_MARKS,
      nameParts: NAME_PARTS,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate-named', auth, (req, res) => {
  try {
    const { slot, quality, affixes, styleMark } = req.body;
    if (!slot || !quality) {
      return res.status(400).json({ error: '缺少参数 slot 或 quality' });
    }

    const db = loadDatabase();
    const character = db.characters.find((c) => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    // 品质必须是装备梯上的合法值（前端只提供 凡器/法器/灵器/法宝，全部在梯上）；
    // 非法品质直接 400，不再静默造出 realm:"未知" 的脏物品。
    const qIdx = QUALITY_LADDER.indexOf(quality);
    if (qIdx < 0) {
      return res.status(400).json({ error: `品质非法: ${quality}`, allowed: QUALITY_LADDER });
    }
    // 整条装备品质梯都有价，且与前端标价一致（旧表漏了 法宝/古宝/灵宝/道器，选 法宝 标 2000 实收 100）
    const qualityMap = { 凡器: 100, 法器: 300, 灵器: 800, 法宝: 2000, 古宝: 5000, 灵宝: 12000, 道器: 30000, 仙器: 80000 };
    const cost = qualityMap[quality];
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: '灵石不足', required: cost });
    }

    const validAffixes = Array.isArray(affixes) ? affixes.filter((a) => AFFIX_POOLS[a]) : [];
    if (validAffixes.length === 0) {
      const poolKeys = Object.keys(AFFIX_POOLS);
      validAffixes.push(poolKeys[Math.floor(Math.random() * poolKeys.length)]);
    }

    const validStyle = STYLE_MARKS.includes(styleMark) ? styleMark : '三文';
    const affixData = {};
    validAffixes.forEach((a) => {
      affixData.element = a;
    });
    affixData.styleMark = validStyle;

    const name = generateEquipmentName(slot, quality, affixData);

    character.spirit_stone -= cost;

    const itemIdNum = getNextId('items');
    const statsMap = {};
    validAffixes.forEach((a) => {
      const pool = AFFIX_POOLS[a];
      Object.entries(pool).forEach(([key, val]) => {
        if (key === 'desc') return;
        statsMap[key] = (statsMap[key] || 0) + val;
      });
    });

    db.items.push({
      id: itemIdNum,
      name,
      type: '装备',
      quality,
      realm: REALM_BY_QUALITY[qIdx],
      stats: JSON.stringify(statsMap),
      description: `由锻造坊精心打造的${name}`,
      subtype: slot,
    });

    db.equipments.push({
      id: getNextId('equipments'),
      character_id: character.id,
      item_id: itemIdNum,
      slot,
      enhance: 0,
      refine_level: 0,
      named: name,
      affixes: validAffixes,
      styleMark: validStyle,
    });

    saveDatabase(db);
    res.json({
      success: true,
      name,
      slot,
      quality,
      affixes: validAffixes,
      styleMark: validStyle,
      cost,
      item: { id: itemIdNum, name, quality, slot },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
