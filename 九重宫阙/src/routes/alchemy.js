const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const proficiencyService = require('../services/proficiency');

const QUALITY_ORDER = ['废品', '凡品', '灵品', '宝品', '仙品', '道品'];

const FURNACE_LEVELS = [
  { level: 1, name: '石炉', successBonus: 0, speedBonus: 0, maxQuality: '凡品', maxOutput: 2 },
  { level: 2, name: '铜炉', successBonus: 0.05, speedBonus: 0.1, maxQuality: '凡品', maxOutput: 2 },
  { level: 3, name: '铁炉', successBonus: 0.1, speedBonus: 0.15, maxQuality: '灵品', maxOutput: 3 },
  { level: 4, name: '银炉', successBonus: 0.15, speedBonus: 0.2, maxQuality: '灵品', maxOutput: 3 },
  { level: 5, name: '金炉', successBonus: 0.2, speedBonus: 0.25, maxQuality: '宝品', maxOutput: 4 },
  { level: 6, name: '玉炉', successBonus: 0.25, speedBonus: 0.3, maxQuality: '宝品', maxOutput: 4 },
  { level: 7, name: '仙炉', successBonus: 0.3, speedBonus: 0.35, maxQuality: '仙品', maxOutput: 5 },
  { level: 8, name: '神炉', successBonus: 0.4, speedBonus: 0.4, maxQuality: '道品', maxOutput: 6 }
];

const PILL_RECIPES = [
  { id: 1, name: '聚灵丹', quality: '凡品', realm: '炼气', herbId: 38, herbQty: 2, resultId: 30, baseSuccess: 0.8, expGain: 10, desc: '恢复50灵力', aux: { herbId: 59, bonus: 0.05 }, catalyst: { herbId: 64, bonus: 0.12 } },
  { id: 2, name: '疗伤丹', quality: '凡品', realm: '炼气', herbId: 38, herbQty: 3, resultId: 31, baseSuccess: 0.75, expGain: 12, desc: '恢复100生命', aux: { herbId: 60, bonus: 0.05 }, catalyst: { herbId: 64, bonus: 0.12 } },
  { id: 3, name: '培元丹', quality: '凡品', realm: '筑基', herbId: 39, herbQty: 2, resultId: 32, baseSuccess: 0.7, expGain: 15, desc: '提升修为', aux: { herbId: 61, bonus: 0.05 }, catalyst: { herbId: 65, bonus: 0.12 } },
  { id: 4, name: '洗髓丹', quality: '灵品', realm: '筑基', herbId: 39, herbQty: 3, resultId: 33, baseSuccess: 0.6, expGain: 20, desc: '洗髓伐毛', aux: { herbId: 62, bonus: 0.06 }, catalyst: { herbId: 65, bonus: 0.12 } },
  { id: 5, name: '筑基丹', quality: '灵品', realm: '金丹', herbId: 39, herbQty: 5, resultId: 34, baseSuccess: 0.5, expGain: 25, desc: '辅助筑基', aux: { herbId: 63, bonus: 0.06 }, catalyst: { herbId: 65, bonus: 0.12 } },
  { id: 6, name: '金丹丹', quality: '宝品', realm: '金丹', herbId: 40, herbQty: 3, resultId: 35, baseSuccess: 0.4, expGain: 30, desc: '辅助凝丹', aux: { herbId: 59, bonus: 0.08 }, catalyst: { herbId: 65, bonus: 0.15 } },
  { id: 7, name: '大还丹', quality: '宝品', realm: '元婴', herbId: 40, herbQty: 5, resultId: 36, baseSuccess: 0.35, expGain: 35, desc: '大幅提升修为', aux: { herbId: 60, bonus: 0.08 }, catalyst: { herbId: 65, bonus: 0.15 } },
  { id: 8, name: '续命丹', quality: '宝品', realm: '元婴', herbId: 39, herbQty: 4, resultId: 37, baseSuccess: 0.38, expGain: 32, desc: '延长寿命', aux: { herbId: 61, bonus: 0.08 }, catalyst: { herbId: 65, bonus: 0.15 } },
  { id: 9, name: '破境丹', quality: '仙品', realm: '化神', herbId: 40, herbQty: 8, resultId: 30, baseSuccess: 0.25, expGain: 50, desc: '辅助突破境界', aux: { herbId: 62, bonus: 0.1 }, catalyst: { herbId: 65, bonus: 0.18 } },
  { id: 10, name: '化劫丹', quality: '仙品', realm: '化神', herbId: 40, herbQty: 10, resultId: 33, baseSuccess: 0.2, expGain: 60, desc: '抵御天劫', aux: { herbId: 63, bonus: 0.1 }, catalyst: { herbId: 65, bonus: 0.18 } },
  { id: 11, name: '道源丹', quality: '道品', realm: '大乘', herbId: 40, herbQty: 15, resultId: 34, baseSuccess: 0.15, expGain: 80, desc: '悟道之丹', aux: { herbId: 59, bonus: 0.12 }, catalyst: { herbId: 65, bonus: 0.2 } }
];

const ALCHEMY_TALENTS = [
  { id: 'flame_control', name: '火焰掌控', desc: '炼丹成功率+5%', levelReq: 5, effect: { type: 'success_bonus', value: 0.05 } },
  { id: 'herb_affinity', name: '灵植亲和', desc: '主材消耗-1', levelReq: 8, effect: { type: 'herb_reduce', value: 1 } },
  { id: 'alchemy_insight', name: '炼丹天赋', desc: '暴击率+10%', levelReq: 12, effect: { type: 'crit_rate', value: 0.1 } },
  { id: 'double_output', name: '一炉双丹', desc: '基础产出+1', levelReq: 15, effect: { type: 'output_bonus', value: 1 } },
  { id: 'quality_master', name: '丹道大师', desc: '品质保底灵品', levelReq: 20, effect: { type: 'quality_floor', value: 1 } },
  { id: 'waste_saver', name: '废品回收', desc: '失败返还50%材料', levelReq: 25, effect: { type: 'fail_return', value: 0.5 } },
  { id: 'catalyst_expert', name: '催化大师', desc: '催化剂效果翻倍', levelReq: 30, effect: { type: 'catalyst_double', value: 1 } }
];

const DAILY_CRAFT_LIMIT = 20;

function getAlchemyLevel(character) {
  const alchemy = character.alchemy || { level: 1, exp: 0, practiceCount: 0, craftCount: 0, dailyCraft: 0, lastCraftDay: '', talents: [], proficiency: {} };
  const expNeeded = alchemy.level * 100;
  return { ...alchemy, expNeeded };
}

function addAlchemyExp(character, amount) {
  if (!character.alchemy) character.alchemy = { level: 1, exp: 0, practiceCount: 0, craftCount: 0, dailyCraft: 0, lastCraftDay: '', talents: [], proficiency: {} };
  character.alchemy.exp += amount;
  while (character.alchemy.exp >= character.alchemy.level * 100) {
    character.alchemy.exp -= character.alchemy.level * 100;
    character.alchemy.level++;
  }
  // 阶段3：同步统一熟练度阶梯（炼丹类别，所有炼丹经验来源单点接入）
  proficiencyService.addExp(character, 'alchemy', amount);
}

function getProficiency(character, recipeId) {
  if (!character.alchemy) character.alchemy = { level: 1, exp: 0, practiceCount: 0, craftCount: 0, dailyCraft: 0, lastCraftDay: '', talents: [], proficiency: {} };
  if (!character.alchemy.proficiency) character.alchemy.proficiency = {};
  return character.alchemy.proficiency[recipeId] || 0;
}

function addProficiency(character, recipeId, amount) {
  if (!character.alchemy.proficiency) character.alchemy.proficiency = {};
  const current = character.alchemy.proficiency[recipeId] || 0;
  character.alchemy.proficiency[recipeId] = Math.min(100, current + amount);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getTalents(character) {
  if (!character.alchemy) return [];
  return character.alchemy.talents || [];
}

function hasTalent(character, talentId) {
  return getTalents(character).includes(talentId);
}

function getTalentBonus(character, effectType) {
  let total = 0;
  for (const t of ALCHEMY_TALENTS) {
    if (hasTalent(character, t.id) && t.effect.type === effectType) {
      total += t.effect.value;
    }
  }
  return total;
}

router.get('/recipes', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const alchemyInfo = getAlchemyLevel(character);
    const furnace = FURNACE_LEVELS[(character.furnace_level || 1) - 1] || FURNACE_LEVELS[0];

    const recipes = PILL_RECIPES.map(r => {
      const herb = db.items.find(i => i.id === r.herbId);
      const aux = r.aux ? db.items.find(i => i.id === r.aux.herbId) : null;
      const catalyst = r.catalyst ? db.items.find(i => i.id === r.catalyst.herbId) : null;
      const result = db.items.find(i => i.id === r.resultId);
      const prof = getProficiency(character, r.id);

      const profBonus = prof * 0.001;
      const talentSuccess = getTalentBonus(character, 'success_bonus');
      const herbReduce = getTalentBonus(character, 'herb_reduce');
      const adjustedSuccess = Math.min(0.95, r.baseSuccess + alchemyInfo.level * 0.02 + furnace.successBonus + profBonus + talentSuccess);
      const adjustedHerbQty = Math.max(1, r.herbQty - Math.floor(herbReduce));

      return {
        id: r.id, name: r.name, quality: r.quality, realm: r.realm,
        herb: herb ? { id: herb.id, name: herb.name, quantity: adjustedHerbQty } : { id: r.herbId, name: '未知', quantity: adjustedHerbQty },
        aux: aux ? { id: aux.id, name: aux.name, bonus: `+${Math.floor(r.aux.bonus * 100)}%成功率` } : null,
        catalyst: catalyst ? { id: catalyst.id, name: catalyst.name, bonus: `+${Math.floor(r.catalyst.bonus * 100)}%成功率，品质提升` } : null,
        result: result ? { id: result.id, name: result.name } : { id: r.resultId, name: '未知' },
        baseResultQty: r.resultQty,
        successRate: Math.floor(adjustedSuccess * 100),
        expGain: r.expGain,
        proficiency: prof,
        proficiencyNext: prof >= 100 ? 'MAX' : Math.floor(100 - prof),
        desc: r.desc
      };
    });

    res.json({ recipes, alchemyLevel: alchemyInfo.level, alchemyExp: alchemyInfo.exp, expNeeded: alchemyInfo.expNeeded, furnace });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/craft', auth, (req, res) => {
  try {
    const { recipeId, useAux, useCatalyst } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const recipe = PILL_RECIPES.find(r => r.id === recipeId);
    if (!recipe) return res.status(400).json({ error: '丹方不存在' });

    const alchemyInfo = getAlchemyLevel(character);
    const furnace = FURNACE_LEVELS[(character.furnace_level || 1) - 1] || FURNACE_LEVELS[0];
    const qualityIdx = QUALITY_ORDER.indexOf(recipe.quality);
    const furnaceQualityIdx = QUALITY_ORDER.indexOf(furnace.maxQuality);
    if (qualityIdx > furnaceQualityIdx) return res.status(400).json({ error: `丹炉品阶不足，需要${recipe.quality}以上` });

    const today = getToday();
    if (alchemyInfo.lastCraftDay !== today) {
      alchemyInfo.dailyCraft = 0;
      alchemyInfo.lastCraftDay = today;
    }
    if (alchemyInfo.dailyCraft >= DAILY_CRAFT_LIMIT) return res.status(400).json({ error: `今日炼丹次数已达上限${DAILY_CRAFT_LIMIT}次` });

    const inventory = db.inventory.filter(i => i.character_id === character.id);

    const herbReduce = getTalentBonus(character, 'herb_reduce');
    const herbQtyNeeded = Math.max(1, recipe.herbQty - Math.floor(herbReduce));
    const herbOwned = inventory.filter(i => i.item_id === recipe.herbId).reduce((sum, i) => sum + (i.quantity || 1), 0);
    if (herbOwned < herbQtyNeeded) return res.status(400).json({ error: '主材不足', need: herbQtyNeeded, owned: herbOwned });

    let auxBonus = 0;
    if (useAux && recipe.aux) {
      const auxOwned = inventory.filter(i => i.item_id === recipe.aux.herbId).reduce((sum, i) => sum + (i.quantity || 1), 0);
      if (auxOwned < 1) return res.status(400).json({ error: '辅材不足' });
      auxBonus = recipe.aux.bonus;
    }

    let catalystBonus = 0;
    if (useCatalyst && recipe.catalyst) {
      const catOwned = inventory.filter(i => i.item_id === recipe.catalyst.herbId).reduce((sum, i) => sum + (i.quantity || 1), 0);
      if (catOwned < 1) return res.status(400).json({ error: '催化剂不足' });
      catalystBonus = hasTalent(character, 'catalyst_double') ? recipe.catalyst.bonus * 2 : recipe.catalyst.bonus;
    }

    let remaining = herbQtyNeeded;
    for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
      if (inventory[i].item_id === recipe.herbId) {
        const take = Math.min(remaining, inventory[i].quantity || 1);
        inventory[i].quantity = (inventory[i].quantity || 1) - take;
        remaining -= take;
        if (inventory[i].quantity <= 0) {
          const idx = db.inventory.findIndex(x => x.id === inventory[i].id);
          if (idx !== -1) db.inventory.splice(idx, 1);
        }
      }
    }

    if (useAux && recipe.aux) {
      for (let i = inventory.length - 1; i >= 0; i--) {
        if (inventory[i].item_id === recipe.aux.herbId && (inventory[i].quantity || 1) > 0) {
          inventory[i].quantity = (inventory[i].quantity || 1) - 1;
          if (inventory[i].quantity <= 0) {
            const idx = db.inventory.findIndex(x => x.id === inventory[i].id);
            if (idx !== -1) db.inventory.splice(idx, 1);
          }
          break;
        }
      }
    }

    if (useCatalyst && recipe.catalyst) {
      for (let i = inventory.length - 1; i >= 0; i--) {
        if (inventory[i].item_id === recipe.catalyst.herbId && (inventory[i].quantity || 1) > 0) {
          inventory[i].quantity = (inventory[i].quantity || 1) - 1;
          if (inventory[i].quantity <= 0) {
            const idx = db.inventory.findIndex(x => x.id === inventory[i].id);
            if (idx !== -1) db.inventory.splice(idx, 1);
          }
          break;
        }
      }
    }

    const profBonus = getProficiency(character, recipe.id) * 0.001;
    const talentSuccess = getTalentBonus(character, 'success_bonus');
    const successRate = Math.min(0.95, recipe.baseSuccess + alchemyInfo.level * 0.02 + furnace.successBonus + profBonus + talentSuccess + auxBonus + catalystBonus);
    const roll = Math.random();

    alchemyInfo.craftCount = (alchemyInfo.craftCount || 0) + 1;
    alchemyInfo.dailyCraft = (alchemyInfo.dailyCraft || 0) + 1;
    alchemyInfo.lastCraftDay = today;
    if (!character.alchemy) character.alchemy = alchemyInfo;

    if (roll > successRate) {
      addAlchemyExp(character, Math.floor(recipe.expGain * 0.3));
      addProficiency(character, recipe.id, 1);

      if (hasTalent(character, 'waste_saver')) {
        const returnRate = 0.5;
        const returnQty = Math.max(1, Math.floor(herbQtyNeeded * returnRate));
        const existingInv = db.inventory.find(i => i.character_id === character.id && i.item_id === recipe.herbId);
        if (existingInv) existingInv.quantity = (existingInv.quantity || 1) + returnQty;
        else db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: recipe.herbId, quantity: returnQty });
        saveDatabase(db);
        return res.json({ success: false, message: `炼丹失败，返还${returnQty}份主材`, returnHerbs: returnQty, successRate: Math.floor(successRate * 100) });
      }

      saveDatabase(db);
      return res.json({ success: false, message: '炼丹失败', successRate: Math.floor(successRate * 100), alchemyLevel: alchemyInfo.level });
    }

    let quantity = recipe.resultQty;
    const critRate = 0.1 + getTalentBonus(character, 'crit_rate');
    const isCrit = Math.random() < critRate;
    if (isCrit) quantity += 1;

    const outputBonus = getTalentBonus(character, 'output_bonus');
    quantity += outputBonus;

    quantity = Math.min(quantity, furnace.maxOutput);

    let qualityRoll = Math.random();
    let resultQualityIdx = qualityIdx;
    if (useCatalyst && recipe.catalyst) {
      if (qualityRoll < 0.15) resultQualityIdx = Math.min(qualityIdx + 1, QUALITY_ORDER.length - 1);
    }
    const qualityFloor = getTalentBonus(character, 'quality_floor');
    if (qualityFloor > 0 && resultQualityIdx < qualityFloor) resultQualityIdx = qualityFloor;
    const resultQuality = QUALITY_ORDER[resultQualityIdx];

    const existingInv = db.inventory.find(i => i.character_id === character.id && i.item_id === recipe.resultId);
    if (existingInv) existingInv.quantity = (existingInv.quantity || 1) + quantity;
    else db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: recipe.resultId, quantity, quality: resultQuality });

    addAlchemyExp(character, recipe.expGain);
    addProficiency(character, recipe.id, isCrit ? 3 : 2);

    saveDatabase(db);
    const result = db.items.find(i => i.id === recipe.resultId);
    const critMsg = isCrit ? '【暴击！】' : '';
    res.json({
      success: true,
      item: result ? { id: result.id, name: result.name } : { id: recipe.resultId },
      quantity, quality: resultQuality,
      crit: isCrit,
      alchemyLevel: alchemyInfo.level,
      proficiency: getProficiency(character, recipe.id),
      message: `${critMsg}炼丹成功！获得${quantity}颗${resultQuality}${recipe.name}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/practice', auth, (req, res) => {
  try {
    const { recipeId, hours } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const recipe = PILL_RECIPES.find(r => r.id === recipeId);
    if (!recipe) return res.status(400).json({ error: '丹方不存在' });

    const practiceHours = Math.min(Math.max(1, hours || 1), 24);
    const herbReduce = getTalentBonus(character, 'herb_reduce');
    const herbQtyNeeded = Math.max(1, recipe.herbQty - Math.floor(herbReduce));
    const herbCost = herbQtyNeeded * practiceHours;
    const inventory = db.inventory.filter(i => i.character_id === character.id);
    const herbOwned = inventory.filter(i => i.item_id === recipe.herbId).reduce((sum, i) => sum + (i.quantity || 1), 0);
    if (herbOwned < herbCost) return res.status(400).json({ error: '药材不足', need: herbCost, owned: herbOwned });

    let remaining = herbCost;
    for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
      if (inventory[i].item_id === recipe.herbId) {
        const take = Math.min(remaining, inventory[i].quantity || 1);
        inventory[i].quantity = (inventory[i].quantity || 1) - take;
        remaining -= take;
        if (inventory[i].quantity <= 0) {
          const idx = db.inventory.findIndex(x => x.id === inventory[i].id);
          if (idx !== -1) db.inventory.splice(idx, 1);
        }
      }
    }

    const expPerHour = recipe.expGain * 2;
    const totalExp = expPerHour * practiceHours;
    addAlchemyExp(character, totalExp);
    const profGain = practiceHours * 2;
    addProficiency(character, recipe.id, profGain);
    if (!character.alchemy) character.alchemy = { level: 1, exp: 0, practiceCount: 0, craftCount: 0, dailyCraft: 0, lastCraftDay: '', talents: [], proficiency: {} };
    character.alchemy.practiceCount = (character.alchemy.practiceCount || 0) + practiceHours;

    saveDatabase(db);
    res.json({
      success: true, practiceHours, herbCost, expGained: totalExp,
      proficiencyGained: profGain,
      proficiency: getProficiency(character, recipe.id),
      alchemyLevel: character.alchemy.level,
      message: `练习${practiceHours}小时，经验+${totalExp}，熟练度+${profGain}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refine-pill', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const inventoryItem = db.inventory.find(i => i.id === itemId && i.character_id === character.id);
    if (!inventoryItem) return res.status(400).json({ error: '物品不存在' });

    const item = db.items.find(i => i.id === inventoryItem.item_id);
    if (!item || item.type !== '消耗品') return res.status(400).json({ error: '只能重炼丹药' });

    const alchemyInfo = getAlchemyLevel(character);
    const currentQuality = inventoryItem.quality || item.quality || '凡品';
    const qualityIdx = QUALITY_ORDER.indexOf(currentQuality);
    const cost = qualityIdx * 30 + 15;
    if ((character.spirit_stone || 0) < cost) return res.status(400).json({ error: '灵石不足', need: cost });
    character.spirit_stone -= cost;

    const successRate = Math.min(0.8, 0.3 + alchemyInfo.level * 0.05);
    const roll = Math.random();

    if (roll < 0.12) {
      const idx = db.inventory.findIndex(i => i.id === inventoryItem.id);
      if (idx !== -1) db.inventory.splice(idx, 1);
      saveDatabase(db);
      return res.json({ success: false, message: '重炼失败，丹药损毁', spirit_stone: character.spirit_stone });
    }

    if (roll < successRate) {
      if (qualityIdx < QUALITY_ORDER.length - 1) {
        inventoryItem.quality = QUALITY_ORDER[qualityIdx + 1];
      }
      addAlchemyExp(character, 20);
      saveDatabase(db);
      return res.json({ success: true, newQuality: inventoryItem.quality, message: `重炼成功！品阶提升为${inventoryItem.quality}`, spirit_stone: character.spirit_stone });
    }

    addAlchemyExp(character, 8);
    saveDatabase(db);
    res.json({ success: true, message: '重炼完成，品阶未变', spirit_stone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/dissolve', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const inventoryItem = db.inventory.find(i => i.id === itemId && i.character_id === character.id);
    if (!inventoryItem) return res.status(400).json({ error: '物品不存在' });

    const item = db.items.find(i => i.id === inventoryItem.item_id);
    if (!item) return res.status(400).json({ error: '物品不存在' });

    const currentQuality = inventoryItem.quality || item.quality || '凡品';
    const qualityIdx = QUALITY_ORDER.indexOf(currentQuality);
    const herbId = 38;
    const herbQty = Math.max(1, (qualityIdx + 1) * 2);

    const idx = db.inventory.findIndex(i => i.id === inventoryItem.id);
    if (idx !== -1) {
      if (inventoryItem.quantity > 1) inventoryItem.quantity--;
      else db.inventory.splice(idx, 1);
    }

    const existingInv = db.inventory.find(i => i.character_id === character.id && i.item_id === herbId);
    if (existingInv) existingInv.quantity = (existingInv.quantity || 1) + herbQty;
    else db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: herbId, quantity: herbQty });

    addAlchemyExp(character, 5);
    saveDatabase(db);
    res.json({ success: true, herbsGained: herbQty, message: `溶解为${herbQty}份药材` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/info', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const alchemyInfo = getAlchemyLevel(character);
    const furnace = FURNACE_LEVELS[(character.furnace_level || 1) - 1] || FURNACE_LEVELS[0];
    const today = getToday();
    if (alchemyInfo.lastCraftDay !== today) alchemyInfo.dailyCraft = 0;

    res.json({
      alchemyLevel: alchemyInfo.level,
      alchemyExp: alchemyInfo.exp,
      expNeeded: alchemyInfo.expNeeded,
      practiceCount: alchemyInfo.practiceCount || 0,
      craftCount: alchemyInfo.craftCount || 0,
      dailyCraft: alchemyInfo.dailyCraft || 0,
      dailyLimit: DAILY_CRAFT_LIMIT,
      furnace,
      furnaceLevel: character.furnace_level || 1,
      maxFurnaceLevel: FURNACE_LEVELS.length,
      talents: alchemyInfo.talents || [],
      talentTree: ALCHEMY_TALENTS.map(t => ({
        ...t,
        unlocked: (alchemyInfo.talents || []).includes(t.id),
        canUnlock: alchemyInfo.level >= t.levelReq && !(alchemyInfo.talents || []).includes(t.id)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upgrade-furnace', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const currentLevel = character.furnace_level || 1;
    if (currentLevel >= FURNACE_LEVELS.length) return res.status(400).json({ error: '丹炉已达最高品阶' });

    const cost = currentLevel * 300;
    if ((character.spirit_stone || 0) < cost) return res.status(400).json({ error: '灵石不足', need: cost });
    character.spirit_stone -= cost;
    character.furnace_level = currentLevel + 1;

    saveDatabase(db);
    const newFurnace = FURNACE_LEVELS[character.furnace_level - 1];
    res.json({ success: true, furnace: newFurnace, spirit_stone: character.spirit_stone, message: `丹炉升级为${newFurnace.name}，最大产出${newFurnace.maxOutput}颗` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unlock-talent', auth, (req, res) => {
  try {
    const { talentId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const talent = ALCHEMY_TALENTS.find(t => t.id === talentId);
    if (!talent) return res.status(400).json({ error: '天赋不存在' });

    const alchemyInfo = getAlchemyLevel(character);
    if (!character.alchemy) character.alchemy = alchemyInfo;
    if (!character.alchemy.talents) character.alchemy.talents = [];

    if (character.alchemy.talents.includes(talentId)) return res.status(400).json({ error: '已解锁该天赋' });
    if (alchemyInfo.level < talent.levelReq) return res.status(400).json({ error: `炼丹等级需达到${talent.levelReq}级` });

    const cost = talent.levelReq * 50;
    if ((character.spirit_stone || 0) < cost) return res.status(400).json({ error: '灵石不足', need: cost });
    character.spirit_stone -= cost;

    character.alchemy.talents.push(talentId);
    saveDatabase(db);
    res.json({ success: true, talent: { id: talent.id, name: talent.name, desc: talent.desc }, spirit_stone: character.spirit_stone, message: `解锁天赋【${talent.name}】` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/proficiency', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const prof = character.alchemy?.proficiency || {};
    const result = PILL_RECIPES.map(r => ({
      recipeId: r.id,
      name: r.name,
      quality: r.quality,
      proficiency: prof[r.id] || 0,
      masteryLevel: (prof[r.id] || 0) >= 100 ? '精通' : (prof[r.id] || 0) >= 50 ? '熟练' : (prof[r.id] || 0) >= 20 ? '入门' : '未习'
    }));

    res.json({ proficiency: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
