const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const proficiencyService = require('../services/proficiency');

const TALISMAN_RECIPES = [
  { id: 1, name: '雷击符', type: 'thunder_strike', quality: '灵品', effect: 'attack_damage_up_30', description: '使用后，下一次攻击伤害提升30%' },
  { id: 2, name: '护盾符', type: 'shield', quality: '灵品', effect: 'defense_up_50_3turns', description: '使用后，防御提升50%，持续3回合' },
  { id: 3, name: '加速符', type: 'speed_boost', quality: '凡品', effect: 'speed_up_40_3turns', description: '使用后，速度提升40%，持续3回合' },
  { id: 4, name: '治愈符', type: 'healing', quality: '凡品', effect: 'heal_30_percent_hp', description: '使用后，恢复30%生命值' },
  { id: 5, name: '传送符', type: 'teleport', quality: '玄品', effect: 'escape_battle', description: '使用后，可从战斗中传送逃离' }
];

const CRAFT_COST_SPIRIT_STONES = 50;
const CRAFT_COST_MATERIAL_QUANTITY = 1;

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const talismans = (db.talismans || []).filter(t => t.character_id === character.id);
    res.json({ talismans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recipes', auth, (req, res) => {
  try {
    res.json({ recipes: TALISMAN_RECIPES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/craft', auth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '请输入符箓名称' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const recipe = TALISMAN_RECIPES.find(r => r.name === name);
    if (!recipe) {
      return res.status(400).json({ error: '未知的符箓类型，可选：雷击符/护盾符/加速符/治愈符/传送符' });
    }

    if ((character.spirit_stone || 0) < CRAFT_COST_SPIRIT_STONES) {
      return res.status(400).json({ error: `灵石不足，需要${CRAFT_COST_SPIRIT_STONES}灵石` });
    }

    const materials = (db.inventory || []).filter(
      i => i.character_id === character.id && i.item_id && (db.items || []).find(it => it.id === i.item_id)?.type === '材料'
    );
    if (materials.length === 0 || (materials[0].quantity || 0) < CRAFT_COST_MATERIAL_QUANTITY) {
      return res.status(400).json({ error: '材料不足' });
    }

    character.spirit_stone -= CRAFT_COST_SPIRIT_STONES;

    const matIdx = materials[0];
    matIdx.quantity = (matIdx.quantity || 1) - CRAFT_COST_MATERIAL_QUANTITY;
    if (matIdx.quantity <= 0) {
      const idx = (db.inventory || []).findIndex(i => i.id === matIdx.id);
      if (idx !== -1) db.inventory.splice(idx, 1);
    }

    const existingTalisman = (db.talismans || []).find(
      t => t.character_id === character.id && t.type === recipe.type
    );

    if (existingTalisman) {
      existingTalisman.quantity = (existingTalisman.quantity || 1) + 1;
    } else {
      const talisman = {
        id: getNextId('talismans'),
        character_id: character.id,
        name: recipe.name,
        type: recipe.type,
        quality: recipe.quality,
        effect: recipe.effect,
        quantity: 1,
        crafted_at: Date.now()
      };
      if (!db.talismans) db.talismans = [];
      db.talismans.push(talisman);
    }

    // 阶段3：制符积累符箓熟练度
    proficiencyService.addExp(character, 'talisman', 5);

    saveDatabase(db);
    res.json({ success: true, message: `${recipe.name}制作成功`, name: recipe.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/use', auth, (req, res) => {
  try {
    const { talismanId } = req.body;
    if (!talismanId) {
      return res.status(400).json({ error: '请指定要使用的符箓' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const talisman = (db.talismans || []).find(
      t => t.id === talismanId && t.character_id === character.id
    );
    if (!talisman || (talisman.quantity || 0) <= 0) {
      return res.status(400).json({ error: '符箓不存在或数量不足' });
    }

    let effectMessage = '';

    switch (talisman.type) {
      case 'thunder_strike':
        character.temp_attack_bonus = 1.3;
        character.temp_attack_bonus_duration = 1;
        effectMessage = '使用雷击符，下次攻击伤害提升30%';
        break;
      case 'shield':
        character.temp_defense_bonus = 1.5;
        character.temp_defense_bonus_duration = 3;
        effectMessage = '使用护盾符，防御提升50%，持续3回合';
        break;
      case 'speed_boost':
        character.temp_speed_bonus = 1.4;
        character.temp_speed_bonus_duration = 3;
        effectMessage = '使用加速符，速度提升40%，持续3回合';
        break;
      case 'healing':
        const maxHp = character.max_hp || 100;
        const healAmount = Math.floor(maxHp * 0.3);
        character.hp = Math.min((character.hp || maxHp) + healAmount, maxHp);
        effectMessage = `使用治愈符，恢复${healAmount}点生命`;
        break;
      case 'teleport':
        effectMessage = '使用传送符，已从战斗中传送逃离';
        break;
      default:
        effectMessage = '使用了符箓';
    }

    talisman.quantity = (talisman.quantity || 1) - 1;
    if (talisman.quantity <= 0) {
      const idx = (db.talismans || []).findIndex(t => t.id === talisman.id);
      if (idx !== -1) db.talismans.splice(idx, 1);
    }

    saveDatabase(db);
    res.json({ success: true, message: effectMessage, talismanName: talisman.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
