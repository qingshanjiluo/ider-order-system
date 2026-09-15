const express = require('express');
const skillSvc = require('../services/skill'); // 轮65：被动技（craft_amp/alchemy_amp/discount/gather_amp）常驻生效
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const elements = require('../services/elements');
const proficiencyService = require('../services/proficiency');

const QUALITY_ORDER = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器', '混沌至宝'];

const ELEMENTS = ['金', '木', '水', '火', '土', '光明', '黑暗'];

// 轮78：火焰字典单一真源（锻造计算 + /flames 目录都读它，desc 一并住在这）
const FLAME_TYPES = {
  'basic': { name: '基础火焰', element: 'none', speedBonus: 0, successBonus: 0, desc: '无元素加成' },
  'fire': { name: '烈焰', element: '火', speedBonus: 0.1, successBonus: 0.05, desc: '火属性，提高速度和成功率' },
  'water': { name: '寒冰焰', element: '水', speedBonus: 0.05, successBonus: 0.08, desc: '水属性，大幅提升成功率' },
  'earth': { name: '厚土焰', element: '土', speedBonus: 0.03, successBonus: 0.1, desc: '土属性，最大成功率加成' },
  'metal': { name: '金锐焰', element: '金', speedBonus: 0.08, successBonus: 0.06, desc: '金属性，均衡加成' },
  'wood': { name: '木灵焰', element: '木', speedBonus: 0.06, successBonus: 0.07, desc: '木属性，均衡加成' },
  'dark': { name: '幽暗焰', element: '黑暗', speedBonus: 0.1, successBonus: 0.04, desc: '黑暗属性，大幅提升速度' },
  'light': { name: '神圣焰', element: '光明', speedBonus: 0.07, successBonus: 0.09, desc: '光明属性，大幅提升成功率' },
  // 内容富集四期：高阶火焰（需持有火源材料方可驾驭）
  'samadhi': { name: '三昧真火', element: '火', speedBonus: 0.15, successBonus: 0.18, source_item: '地心火种', tier: '高阶', desc: '高阶火种，需持有「地心火种」方可驾驭' },
  'sunfire': { name: '太阳真火', element: '火', speedBonus: 0.2, successBonus: 0.25, source_item: '离火精', tier: '高阶', desc: '高阶火种，需持有「离火精」方可驾驭' },
  'taiyin': { name: '太阴玄冰焰', element: '水', speedBonus: 0.18, successBonus: 0.15, source_item: '太阴玄冰', tier: '高阶', desc: '高阶火种，需持有「太阴玄冰」方可驾驭' },
  'youming_fire': { name: '九幽冥火', element: '黑暗', speedBonus: 0.15, successBonus: 0.16, source_item: '混沌土', tier: '高阶', desc: '高阶火种，需持有「混沌土」方可驾驭' }
};

// 元素关系委托单一事实源（阶段3）：generates 相生 / overrides 相克 / same / neutral
function getElementRelation(mainElement, materialElement) {
  return elements.relation(mainElement, materialElement);
}

function calcForgeSuccessRate(mainMat, auxMats, catalysts, flame, charStats, profBonus = 0) {
  let base = 0.6;
  const talent = (charStats && charStats.talent) || 10;
  base += talent * 0.01;

  if (mainMat && mainMat.element) {
    for (const aux of auxMats) {
      if (aux.element) {
        const rel = getElementRelation(mainMat.element, aux.element);
        if (rel === 'generates') base += 0.08;
        else if (rel === 'overrides') base -= 0.1;
        else if (rel === 'same') base += 0.03;
      }
    }
  }

  for (const cat of catalysts) {
    base += (cat.successBonus || 0) * 0.01;
  }

  if (flame && flame.element && flame.element !== 'none') {
    base += 0.05;
  }

  base += profBonus; // 炼器熟练度加成（阶段3）

  return Math.min(0.95, Math.max(0.1, base));
}

function calcSuperiorRate(auxMats, catalysts, flame, charStats) {
  let rate = 0.05;
  const luck = (charStats && charStats.luck) || 10;
  rate += luck * 0.005;

  for (const cat of catalysts) {
    rate += (cat.superiorBonus || 0) * 0.01;
  }

  if (flame && flame.element && flame.element !== 'none') {
    rate += 0.03;
  }

  return Math.min(0.5, Math.max(0.01, rate));
}

function generateForgeResult(db, mainItem, auxMats, catalysts, flame, charStats, profBonus = 0, craftBonus = 0) {
  const successRate = calcForgeSuccessRate(mainItem, auxMats, catalysts, flame, charStats, profBonus);
  // 轮65：craft_amp（"锻造出高品质器材的概率提升"）常驻生效，加在函数内部封顶之后，避免被 0.5 上限吃掉
  const superiorRate = Math.min(0.95, calcSuperiorRate(auxMats, catalysts, flame, charStats) + (Number(craftBonus) || 0));

  const roll = Math.random();
  if (roll > successRate) {
    return { success: false, message: '锻造失败，材料已消耗' };
  }

  const mainStats = JSON.parse(mainItem.stats || '{}');
  let resultSlot = mainItem.forge_slot || 'weapon';
  let qualityIdx = QUALITY_ORDER.indexOf(mainItem.quality || '凡器');
  // 内容富集二期：主材 tier 决定品质上限（材料 quality 字段多为凡品/灵品体系，indexOf 为 -1 时以 tier 封顶为基准）
  const materials = require('../services/materials');
  if (mainStats.tier) {
    const capIdx = QUALITY_ORDER.indexOf(materials.TIER_EQUIP_CAP[mainStats.tier] || '法器');
    if (capIdx >= 0) {
      qualityIdx = qualityIdx < 0 ? capIdx : Math.min(qualityIdx, capIdx);
    }
  }
  if (qualityIdx < 0) qualityIdx = 0;

  let bonusAttack = 0, bonusDefense = 0, bonusHp = 0, bonusSpeed = 0;
  for (const aux of auxMats) {
    const auxStats = JSON.parse(aux.stats || '{}');
    const auxQualityIdx = QUALITY_ORDER.indexOf(aux.quality || '凡器');
    const auxBonus = auxQualityIdx <= qualityIdx ? 0.3 : 0;
    bonusAttack += (auxStats.attack || 0) * auxBonus;
    bonusDefense += (auxStats.defense || 0) * auxBonus;
    bonusHp += (auxStats.hp || 0) * auxBonus;
    bonusSpeed += (auxStats.speed || 0) * auxBonus;
  }

  const isSuperior = Math.random() < superiorRate;
  let lines = 0;
  if (isSuperior) {
    lines = Math.floor(Math.random() * 5) + 1;
    bonusAttack = Math.floor(bonusAttack * (1 + lines * 0.15));
    bonusDefense = Math.floor(bonusDefense * (1 + lines * 0.15));
    bonusHp = Math.floor(bonusHp * (1 + lines * 0.15));
    bonusSpeed = Math.floor(bonusSpeed * (1 + lines * 0.15));
  }

  const level = (mainItem.forge_level || 1);
  const baseAttack = Math.floor((10 + level * 3 + mainStats.attack || 0) * 1.5) + bonusAttack;
  const baseDefense = Math.floor((5 + level * 2 + mainStats.defense || 0) * 1.2) + bonusDefense;
  const baseHp = Math.floor((20 + level * 5 + mainStats.hp || 0) * 1.3) + bonusHp;
  const baseSpeed = Math.floor((3 + level * 1 + mainStats.speed || 0) * 1.1) + bonusSpeed;

  const element = (mainItem.element || (flame && flame.element) || 'none');

  const resultStats = {};
  if (baseAttack > 0) resultStats.attack = baseAttack;
  if (baseDefense > 0) resultStats.defense = baseDefense;
  if (baseHp > 0) resultStats.hp = baseHp;
  if (baseSpeed > 0) resultStats.speed = baseSpeed;
  if (element !== 'none') resultStats.element = element;
  if (isSuperior) resultStats.lines = lines;

  const newItem = {
    id: getNextId('items'),
    name: (isSuperior ? `${'超'.repeat(Math.min(lines, 5))}` : '') + (mainItem.name || '锻造物品'),
    type: '装备',
    slot: resultSlot,
    quality: mainItem.quality || '凡器',
    realm: mainItem.realm || '炼气',
    stats: JSON.stringify(resultStats),
    description: `锻造获得${isSuperior ? ` (超品${lines}纹)` : ''}`,
    forged_by: true,
    forge_level: level,
    element: element,
    lines: lines
  };

  db.items.push(newItem);

  return {
    success: true,
    item: { id: newItem.id, name: newItem.name, quality: newItem.quality, stats: resultStats },
    isSuperior,
    lines,
    successRate: Math.floor(successRate * 100)
  };
}

router.get('/recipes', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const recipes = (db.recipes || []).map(r => {
      const materials = (r.materials || []).map(m => {
        const item = db.items.find(i => i.id === (m.item_id || m.id || m));
        return {
          item_id: m.item_id || m.id || m,
          name: item ? item.name : '未知',
          quantity: m.quantity || 1
        };
      });
      const resultItem = db.items.find(i => i.id === r.result);
      return {
        id: r.id, name: r.name, type: r.type || '炼丹',
        materials,
        resultItem: resultItem ? { id: resultItem.id, name: resultItem.name, quality: resultItem.quality } : null,
        resultQuantity: r.quantity || 1
      };
    });
    res.json(recipes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/craft', auth, (req, res) => {
  try {
    const { recipeId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const recipe = (db.recipes || []).find(r => r.id === recipeId);
    if (!recipe) return res.status(400).json({ error: '配方不存在' });

    const inventory = db.inventory.filter(i => i.character_id === character.id);
    const hasAllMaterials = (recipe.materials || []).every(m => {
      const itemId = m.item_id || m.id || m;
      const required = m.quantity || 1;
      const owned = inventory.filter(i => i.item_id === itemId).reduce((sum, i) => sum + (i.quantity || 1), 0);
      return owned >= required;
    });
    if (!hasAllMaterials) return res.status(400).json({ error: '材料不足' });

    const cost = recipe.cost || 0;
    if (cost > 0 && (character.spirit_stone || 0) < cost) return res.status(400).json({ error: '灵石不足', required: cost });
    if (cost > 0) character.spirit_stone -= cost;

    for (const m of (recipe.materials || [])) {
      const itemId = m.item_id || m.id || m;
      const required = m.quantity || 1;
      let remaining = required;
      for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
        if (inventory[i].item_id === itemId) {
          const take = Math.min(remaining, inventory[i].quantity || 1);
          inventory[i].quantity = (inventory[i].quantity || 1) - take;
          remaining -= take;
          if (inventory[i].quantity <= 0) {
            const idx = db.inventory.findIndex(x => x.id === inventory[i].id);
            if (idx !== -1) db.inventory.splice(idx, 1);
          }
        }
      }
    }

    const resultItem = db.items.find(i => i.id === recipe.result);
    if (resultItem && resultItem.type === '装备') {
      const prof = proficiencyService.addExp(character, 'crafting', 6);
      db.equipments.push({ id: getNextId('equipments'), character_id: character.id, item_id: resultItem.id, slot: resultItem.subtype || 'weapon', enhance: 0, profLevel: prof.level });
    } else {
      const resultQty = recipe.quantity || 1;
      const existingInv = db.inventory.find(i => i.character_id === character.id && i.item_id === recipe.result);
      if (existingInv) { existingInv.quantity = (existingInv.quantity || 1) + resultQty; }
      else { db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: recipe.result, quantity: resultQty }); }
    }

    saveDatabase(db);
    res.json({ success: true, item: resultItem ? { id: resultItem.id, name: resultItem.name, quality: resultItem.quality } : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/forge-recipes', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const recipes = (db.forge_recipes || []).map(r => {
      const materials = (r.materials || []).map(m => {
        const item = db.items.find(i => i.id === (m.item_id || m.id || m));
        return { item_id: m.item_id || m.id || m, name: item ? item.name : '未知', quantity: m.quantity || 1 };
      });
      const resultItem = db.items.find(i => i.id === r.result);
      return { id: r.id, name: r.name, materials, resultItem: resultItem ? { id: resultItem.id, name: resultItem.name, quality: resultItem.quality } : null };
    });
res.json(recipes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/forge', auth, (req, res) => {
  try {
    const { mainMaterialId, auxMaterialIds, catalystIds, flameType, recipeId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    // 轮78 · 配方锻造主链接通：FE 锻造按钮一直发 {recipeId}（app.js:2253 → api.js:377），
    // 旧 BE 只认自由式主材参数 ⇒ 每次点击必 400"请指定主材"，前后端从未通过一次。
    // 语义：配方=已研透的谱录，产出确定性（不掷骰）；自由式锻造（下方）保留概率与火焰加成。
    if (recipeId) {
      const recipe = (db.forge_recipes || []).find(r => r.id === recipeId);
      if (!recipe) return res.status(400).json({ error: '锻造配方不存在' });
      const out = db.items.find(i => Number(i.id) === Number(recipe.result));
      if (!out) return res.status(400).json({ error: '配方产物不在物品表' });
      const needed = (recipe.materials || []).map((m) => {
        const iid = Number(m && m.item_id != null ? m.item_id : (m && m.id != null ? m.id : m));
        return { item_id: iid, qty: Math.max(1, Number(m && m.quantity) || 1), item: db.items.find(i => Number(i.id) === iid) };
      });
      if (needed.length === 0) return res.status(400).json({ error: '配方未定义材料' });
      const bad = needed.find(n => !Number.isFinite(n.item_id) || !n.item);
      if (bad) return res.status(400).json({ error: '配方材料定义异常：#' + (bad.item_id || '?') });
      const inv = db.inventory.filter(i => i.character_id === character.id);
      const owned = {};
      for (const row of inv) owned[Number(row.item_id)] = (owned[Number(row.item_id)] || 0) + (row.quantity || 0);
      for (const n of needed) {
        if ((owned[n.item_id] || 0) < n.qty)
          return res.status(400).json({ error: `材料不足：${n.item.name} 需 ${n.qty}，持有 ${owned[n.item_id] || 0}` });
      }
      for (const n of needed) {
        let left = n.qty;
        for (const row of inv) {
          if (left <= 0) break;
          if (Number(row.item_id) !== n.item_id) continue;
          const take = Math.min(left, row.quantity || 0);
          row.quantity = (row.quantity || 0) - take;
          left -= take;
          if (row.quantity <= 0) {
            const di = db.inventory.findIndex(x => x.id === row.id);
            if (di !== -1) db.inventory.splice(di, 1);
          }
        }
      }
      const ex = db.inventory.find(i => i.character_id === character.id && Number(i.item_id) === Number(out.id));
      if (ex) ex.quantity = (ex.quantity || 0) + 1;
      else db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: out.id, quantity: 1 });
      proficiencyService.addExp(character, 'crafting', 10);
      saveDatabase(db);
      res.json({ success: true, result: 'forged', item: { id: out.id, name: out.name, quality: out.quality }, message: `锻造${out.name}成功` });
      return;
    }

    if (!mainMaterialId) return res.status(400).json({ error: '请指定主材' });

    const mainItem = db.items.find(i => i.id === mainMaterialId);
    if (!mainItem) return res.status(400).json({ error: '主材不存在' });
    if (mainItem.type !== '材料' && mainItem.type !== '装备') return res.status(400).json({ error: '主材类型错误' });

    // 图纸门槛（阶段3）：灵品及以上主材需已学会至少一张锻造图纸
    const PREMIUM_QUALITIES = ['灵品', '宝品', '仙品'];
    if (PREMIUM_QUALITIES.includes(mainItem.quality)) {
      const learned = character.learned_blueprints || [];
      if (learned.length === 0) {
        return res.status(400).json({ error: `锻造${mainItem.quality}主材需先学习对应图纸` });
      }
    }

    const inventory = db.inventory.filter(i => i.character_id === character.id);
    const auxItems = (auxMaterialIds || []).map(id => db.items.find(i => i.id === id)).filter(Boolean);
    const catItems = (catalystIds || []).map(id => db.items.find(i => i.id === id)).filter(Boolean);

    // 轮78：火焰门槛必须在**扣料之前**判——旧顺序先扣后验，被 400 拒了材料照丢
    // （镜像 diff 式自动保存连"没调 saveDatabase"都救不回来，轮70 就栽过这机制）。
    const flame = FLAME_TYPES[flameType] || FLAME_TYPES['basic'];
    if (flame.source_item) {
      const hasSource = inventory.some(i => {
        const it = db.items.find(x => x.id === i.item_id);
        return it && it.name === flame.source_item;
      });
      if (!hasSource) {
        return res.status(400).json({ error: `需持有「${flame.source_item}」方可驾驭${flame.name}` });
      }
    }

    const allNeeded = [mainMaterialId, ...(auxMaterialIds || []), ...(catalystIds || [])];
    const hasAll = allNeeded.every(id => inventory.some(i => i.item_id === id && (i.quantity || 1) >= 1));
    if (!hasAll) return res.status(400).json({ error: '材料不足' });

    for (const id of allNeeded) {
      const idx = inventory.findIndex(i => i.item_id === id);
      if (idx !== -1) {
        inventory[idx].quantity = (inventory[idx].quantity || 1) - 1;
        if (inventory[idx].quantity <= 0) {
          const dbIdx = db.inventory.findIndex(x => x.id === inventory[idx].id);
          if (dbIdx !== -1) db.inventory.splice(dbIdx, 1);
        }
      }
    }

    // 轮78：火焰解析与火源门槛已整体前移到扣料之前（防"被拒还丢料"）；
    // 旧代码在此处 `const flame` 声明之前 if (flame…)——TDZ 让每个锻造请求都 500，
    // 且锻造字典曾是 /flames 之外的第二份手抄真源，已提升为模块级 FLAME_TYPES。

    const charStats = character.stats || {};
    const prof = proficiencyService.get(character, 'crafting');
    const result = generateForgeResult(db, mainItem, auxItems, catItems, flame, charStats, prof.successBonus, skillSvc.getPassiveBonus(character.id, 'craft_amp'));

    if (result.success) {
      const profResult = proficiencyService.addExp(character, 'crafting', result.isSuperior ? 25 : 10);
      result.proficiency = { level: profResult.level, levelName: profResult.levelName, levelUp: profResult.levelUp };
      db.equipments.push({
        id: getNextId('equipments'),
        character_id: character.id,
        item_id: result.item.id,
        slot: mainItem.forge_slot || 'weapon',
        enhance: 0,
        lines: result.lines || 0,
        element: result.item.stats.element || 'none'
      });
      saveDatabase(db);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/temper', auth, (req, res) => {
  try {
    const { equipmentId, materialIds } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const equip = db.equipments.find(e => e.id === equipmentId && e.character_id === character.id);
    if (!equip) return res.status(400).json({ error: '装备不存在' });

    const item = db.items.find(i => i.id === equip.item_id);
    if (!item) return res.status(400).json({ error: '物品不存在' });

    const inventory = db.inventory.filter(i => i.character_id === character.id);
    const mats = (materialIds || []).map(id => db.items.find(i => i.id === id)).filter(Boolean);
    if (mats.length === 0) return res.status(400).json({ error: '需要淬炼材料' });

    // 轮77 修白嫖：旧循环对"玩家根本没有这件材料"静默跳过——传真实存在但未持有的
    // itemId 零消耗照样淬炼，还白拿 :373 按 mats.length 加成的重洗概率。
    // 新规则：按 item 聚合需求量，持有量不足任一种即整单拒绝（先验后扣，不扣一半）。
    const need = {};
    for (const m of mats) need[m.id] = (need[m.id] || 0) + 1;
    const owned = {};
    for (const row of inventory) owned[row.item_id] = (owned[row.item_id] || 0) + (row.quantity || 0);
    for (const mid of Object.keys(need)) {
      if ((owned[mid] || 0) < need[mid]) {
        const nm = (db.items.find(i => i.id === Number(mid)) || {}).name || ('#' + mid);
        return res.status(400).json({ error: `材料不足：${nm} 需 ${need[mid]}，持有 ${owned[mid] || 0}` });
      }
    }
    for (const mid of Object.keys(need)) {
      let left = need[mid];
      for (const row of inventory) {
        if (left <= 0) break;
        if (row.item_id !== Number(mid)) continue;
        const take = Math.min(left, row.quantity || 0);
        row.quantity = (row.quantity || 0) - take;
        left -= take;
        if (row.quantity <= 0) {
          const dbIdx = db.inventory.findIndex(x => x.id === row.id);
          if (dbIdx !== -1) db.inventory.splice(dbIdx, 1);
        }
      }
    }

    const luck = (character.stats && character.stats.luck) || 10;
    const destroyChance = 0.05;
    const downgradeChance = 0.15;
    const rerollChance = 0.3 + mats.length * 0.1;

    const roll = Math.random();
    if (roll < destroyChance) {
      // 轮77：销毁也带 character_id——id 跨角色撞号时不误炸别人的装备
      const eqIdx = db.equipments.findIndex(e => e.id === equipmentId && e.character_id === character.id);
      if (eqIdx !== -1) db.equipments.splice(eqIdx, 1);
      saveDatabase(db);
      return res.json({ success: false, result: 'destroyed', message: '淬炼失败，法器报废' });
    }

    if (roll < destroyChance + downgradeChance) {
      const qualityIdx = QUALITY_ORDER.indexOf(item.quality || '凡器');
      if (qualityIdx > 0) {
        item.quality = QUALITY_ORDER[qualityIdx - 1];
      }
      saveDatabase(db);
      return res.json({ success: true, result: 'downgrade', newQuality: item.quality, message: '淬炼失败，品阶下降' });
    }

    const stats = JSON.parse(item.stats || '{}');
    const statKeys = ['attack', 'defense', 'hp', 'speed'];
    const changed = {};
    for (const key of statKeys) {
      if (stats[key]) {
        const change = Math.floor(Math.random() * 7) - 3;
        stats[key] = Math.max(1, stats[key] + change);
        changed[key] = change;
      }
    }

    const totalChange = Object.values(changed).reduce((s, v) => s + v, 0);
    item.stats = JSON.stringify(stats);
    equip.temper_count = (equip.temper_count || 0) + 1;
    saveDatabase(db);

    res.json({
      success: true, result: 'rerolled', changes: changed, totalChange,
      message: totalChange > 0 ? '淬炼成功，属性提升' : '淬炼完成，属性变化'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/spirit-infuse', auth, (req, res) => {
  try {
    const { equipmentId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const equip = db.equipments.find(e => e.id === equipmentId && e.character_id === character.id);
    if (!equip) return res.status(400).json({ error: '装备不存在' });

    const qualityIdx = QUALITY_ORDER.indexOf((db.items.find(i => i.id === equip.item_id) || {}).quality || '凡器');
    if (qualityIdx < 2) return res.status(400).json({ error: '只有灵器及以上品质才能韵灵' });

    equip.spirit_affinity = (equip.spirit_affinity || 0) + 1;
    const affinityThreshold = 50;
    let spiritUnlocked = false;

    if (equip.spirit_affinity >= affinityThreshold && !equip.has_spirit) {
      equip.has_spirit = true;
      spiritUnlocked = true;
      const spiritSkill = `spirit_${equip.item_id}`;
      // 轮64：这里曾往 player_skills push 一行"器灵技"，但该行**没有 equipped_slot 键**，
      // 且 skill_id 形如 spirit_<itemId> 从不在 SKILLS_DATA 注册 ⇒ 战斗侧 find(def) 落空，
      // 成为永久孤儿行（占集合不产出任何玩法，还会污染"每行都可解析"的完整性扫描）。
      // 器灵的解锁仍然如实记在装备上（has_spirit / spirit_affinity），响应照旧返回 spiritUnlocked；
      // 真要让它进战斗，应当把器灵技注册成技能定义并补齐字段 —— 那是功能设计，不该由一行 push 冒名顶替。
      console.log(`器灵已唤醒（${spiritSkill}）：当前未注册为可出战技能定义，故不写入 player_skills`);
    }

    saveDatabase(db);
    res.json({
      success: true,
      spirit_affinity: equip.spirit_affinity,
      spiritUnlocked,
      has_spirit: equip.has_spirit || false,
      message: spiritUnlocked ? '器灵觉醒！获得器灵技能' : `契合度+1 (${equip.spirit_affinity}/${affinityThreshold})`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/enchant', auth, (req, res) => {
  try {
    const { equipmentId, enchantType } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const equip = db.equipments.find(e => e.id === equipmentId && e.character_id === character.id);
    if (!equip) return res.status(400).json({ error: '装备不存在' });

    const item = db.items.find(i => i.id === equip.item_id);
    if (!item) return res.status(400).json({ error: '物品不存在' });

    const cost = 50 * (QUALITY_ORDER.indexOf(item.quality || '凡器') + 1);
    if ((character.spirit_stone || 0) < cost) return res.status(400).json({ error: '灵石不足', need: cost });
    character.spirit_stone -= cost;

    const enchantPool = [
      { name: '紫雷', stats: { critDamage: 15 } },
      { name: '烈焰', stats: { attack: 10 } },
      { name: '寒冰', stats: { defense: 8, speed: 3 } },
      { name: '玄风', stats: { speed: 12 } },
      { name: '厚土', stats: { defense: 15 } },
      { name: '幽暗', stats: { critChance: 8 } },
      { name: '神圣', stats: { hp: 50 } }
    ];

    const enchant = enchantPool.find(e => e.name === enchantType) || enchantPool[Math.floor(Math.random() * enchantPool.length)];

    if (!equip.enchants) equip.enchants = [];
    equip.enchants.push({ name: enchant.name, stats: enchant.stats, timestamp: Date.now() });

    const stats = JSON.parse(item.stats || '{}');
    for (const [k, v] of Object.entries(enchant.stats)) {
      stats[k] = (stats[k] || 0) + v;
    }
    item.stats = JSON.stringify(stats);

    saveDatabase(db);
    res.json({
      success: true,
      enchant: { name: enchant.name, stats: enchant.stats },
      message: `附魔成功：${enchant.name}`,
      spirit_stone: character.spirit_stone
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/flames', auth, (req, res) => {
  // 轮78：从 FLAME_TYPES 渲染（旧版是手抄的 8 条目目录，与锻造侧 12 款字典漂移——
  // 高阶三昧真火/太阳真火等玩家永远看不到）。新增 tier/source_item 供前端画门槛。
  res.json(Object.entries(FLAME_TYPES).map(([id, f]) => ({
    id, name: f.name, element: f.element, tier: f.tier || '基础',
    source_item: f.source_item || null, desc: f.desc
  })));
});

// ---------- 图纸系统（阶段3 · 原始设定 04/07）----------
router.get('/blueprints', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const learned = character.learned_blueprints || [];
    res.json({
      blueprints: (db.blueprints || []).map(b => ({
        ...b,
        learned: learned.includes(b.id),
        category: b.type === 'pill' ? 'alchemy' : 'crafting'
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/blueprints/learn', auth, (req, res) => {
  try {
    const { blueprintId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const bp = (db.blueprints || []).find(b => b.id === blueprintId);
    if (!bp) return res.status(400).json({ error: '图纸不存在' });

    character.learned_blueprints = character.learned_blueprints || [];
    if (character.learned_blueprints.includes(bp.id)) {
      return res.status(400).json({ error: '该图纸已学会' });
    }

    // 按图纸材料清单（按名称）消耗库存
    const inventory = db.inventory.filter(i => i.character_id === character.id);
    const nameToItem = new Map((db.items || []).map(i => [i.name, i]));
    const needs = (bp.materials || []).map(m => ({ item: nameToItem.get(m.name), qty: m.quantity || 1 }));
    const missing = needs.filter(n => !n.item);
    if (missing.length) return res.status(400).json({ error: `图纸材料定义异常: ${missing.map(n => n.item).join(',')}` });
    for (const n of needs) {
      const owned = inventory.filter(i => i.item_id === n.item.id).reduce((s, i) => s + (i.quantity || 1), 0);
      if (owned < n.qty) return res.status(400).json({ error: `材料不足: ${n.item.name} ×${n.qty}` });
    }
    for (const n of needs) {
      let remaining = n.qty;
      for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
        if (inventory[i].item_id === n.item.id) {
          const take = Math.min(remaining, inventory[i].quantity || 1);
          inventory[i].quantity -= take;
          remaining -= take;
          if (inventory[i].quantity <= 0) {
            const idx = db.inventory.findIndex(x => x.id === inventory[i].id);
            if (idx !== -1) db.inventory.splice(idx, 1);
          }
        }
      }
    }

    character.learned_blueprints.push(bp.id);
    const category = bp.type === 'pill' ? 'alchemy' : 'crafting';
    const prof = proficiencyService.addExp(character, category, 15);

    saveDatabase(db);
    res.json({
      success: true,
      learned: bp.name,
      proficiency: { level: prof.level, levelName: prof.levelName, levelUp: prof.levelUp },
      message: `已学会「${bp.name}」，${prof.levelName}经验+15`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
