const express = require('express');
const B = require('../config/balance');
const router = express.Router();
const auth = require('../middleware/auth');
const skillService = require('../services/skill');
const { loadDatabase } = require('../database');

router.get('/list', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const skills = skillService.getSkills(character.id);

    const level = character.level || 1;
    const talent = (character.stats && character.stats.talent) || 10;
    const baseSlots = 3;
    const levelBonus = Math.floor(level / 10);
    const talentBonus = Math.floor(talent / 15);
    let gongfaBonus = 0;
    const gongfas = db.gongfa.filter(g => g.character_id === character.id);
    for (const gf of gongfas) {
      const item = db.items.find(i => i.id === gf.item_id);
      if (item) {
        const stats = JSON.parse(item.stats || '{}');
        gongfaBonus += stats.skill_slots || 0;
      }
    }
    const maxSlots = B.skillSlotCap((B.REALM_ORDER || []).indexOf(character.realm));   // E3 章程口径：min(2+境界序号, 8)，等级/天赋/功法不再参与
    const equippedCount = skills.filter(s => s.equipped).length;
    const cdPenalty = equippedCount > 5 ? Math.pow(2, equippedCount - 5) : 1;

    const equipSkills = db.equipments.filter(e => e.character_id === character.id);
    const equipmentSkills = [];
    for (const eq of equipSkills) {
      const item = db.items.find(i => i.id === eq.item_id);
      if (item && item.skill_grant) {
        equipmentSkills.push({ source: 'equipment', name: item.name, skill: item.skill_grant });
      }
    }

    const spiritRoots = character.spirit_roots || [];
    const rootPassives = spiritRoots.map(r => ({
      source: 'spirit_root',
      root: r.type,
      purity: r.purity,
      effect: `灵根${r.type}纯度${r.purity}%加成`
    }));

    const activePets = db.pets.filter(p => p.character_id === character.id && p.is_active);
    const petSkills = activePets.map(p => {
      const item = db.items.find(i => i.id === p.item_id || i.id === p.pet_id);
      if (item && item.skill_grant) {
        return { source: 'pet', name: item.name, skill: item.skill_grant };
      }
      return null;
    }).filter(Boolean);

    res.json({
      skills,
      maxSlots,
      slotLimits: { main: 3, sub: 3, ultimate: 1 },
      equippedCount,
      cdPenalty,
      baseSlots,
      levelBonus,
      talentBonus,
      gongfaBonus,
      equipmentSkills,
      rootPassives,
      petSkills
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/all', auth, (req, res) => {
  try {
    const { SKILLS_DATA, ELEMENTS } = skillService;
    const { element, quality, slot, type } = req.query;
    let skills = SKILLS_DATA.filter(s => !s.is_hidden);

    if (element) skills = skills.filter(s => s.element === element);
    if (quality) skills = skills.filter(s => s.quality === quality);
    if (slot) skills = skills.filter(s => s.slot === slot);
    if (type) skills = skills.filter(s => s.type === type);

    const result = skills.map(s => ({
      ...s,
      element_info: ELEMENTS[s.element] || {}
    }));
    res.json({ skills: result, total: result.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/shop', auth, (req, res) => {
  try {
    const shop = skillService.getSkillBookShop();
    res.json({ shop, total: shop.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/learn', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { skillId } = req.body;
    if (!skillId) return res.status(400).json({ error: '缺少技能ID' });

    const result = skillService.learnSkill(character.id, skillId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upgrade', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { playerSkillId } = req.body;
    if (!playerSkillId) return res.status(400).json({ error: '缺少玩家技能ID' });

    const result = skillService.upgradeSkill(character.id, playerSkillId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/equip', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { playerSkillId, slot } = req.body;
    if (!playerSkillId || !slot) return res.status(400).json({ error: '缺少玩家技能ID或槽位' });

    const skills = skillService.getSkills(character.id);
    const level = character.level || 1;
    const talent = (character.stats && character.stats.talent) || 10;
    const baseSlots = 3;
    const levelBonus = Math.floor(level / 10);
    const talentBonus = Math.floor(talent / 15);
    let gongfaBonus = 0;
    const gongfas = db.gongfa.filter(g => g.character_id === character.id);
    for (const gf of gongfas) {
      const item = db.items.find(i => i.id === gf.item_id);
      if (item) {
        const stats = JSON.parse(item.stats || '{}');
        gongfaBonus += stats.skill_slots || 0;
      }
    }
    const maxSlots = B.skillSlotCap((B.REALM_ORDER || []).indexOf(character.realm));   // E3 章程口径：min(2+境界序号, 8)，等级/天赋/功法不再参与
    const equippedCount = skills.filter(s => s.equipped).length;
    if (equippedCount >= maxSlots) {
      return res.status(400).json({ error: `技能槽已满（${maxSlots}个）`, maxSlots, equippedCount });
    }

    const result = skillService.equipSkill(character.id, playerSkillId, slot);
    if (!result.success) return res.status(400).json(result);

    const newSkills = skillService.getSkills(character.id);
    const newEquipped = newSkills.filter(s => s.equipped).length;
    const newCdPenalty = newEquipped > 5 ? Math.pow(2, newEquipped - 5) : 1;
    result.maxSlots = maxSlots;
    result.equippedCount = newEquipped;
    result.cdPenalty = newCdPenalty;
    if (newEquipped > 5) {
      result.warning = `技能数量超过5个，冷却时间翻倍（${newCdPenalty}x）`;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unequip', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { playerSkillId } = req.body;
    if (!playerSkillId) return res.status(400).json({ error: '缺少玩家技能ID' });

    const result = skillService.unequipSkill(character.id, playerSkillId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/forget', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { playerSkillId } = req.body;
    if (!playerSkillId) return res.status(400).json({ error: '缺少玩家技能ID' });

    const result = skillService.forgetSkill(character.id, playerSkillId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/synthesize', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { skillId1, skillId2 } = req.body;
    if (!skillId1 || !skillId2) return res.status(400).json({ error: '缺少要合成的技能ID' });

    const result = skillService.synthesizeSkills(character.id, skillId1, skillId2);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/buy', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { skillId } = req.body;
    if (!skillId) return res.status(400).json({ error: '缺少技能ID' });

    const result = skillService.buySkillBook(character.id, skillId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unlock-hidden', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const { skillId, condition } = req.body;
    if (!skillId) return res.status(400).json({ error: '缺少技能ID' });

    const result = skillService.unlockHiddenSkill(character.id, skillId, condition);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/elements', auth, (req, res) => {
  try {
    const { ELEMENTS } = skillService;
    const advantages = {};
    for (const [key, el] of Object.entries(ELEMENTS)) {
      advantages[key] = {
        name: el.name,
        strong: el.strong,
        weak: el.weak,
        strong_names: el.strong.map(e => ELEMENTS[e]?.name || e),
        weak_names: el.weak.map(e => ELEMENTS[e]?.name || e)
      };
    }
    res.json({ elements: advantages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/drops', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const maps = db.maps || [];
    const availableDrops = maps.map(m => ({
      map_id: m.id,
      map_name: m.name,
      min_level: m.min_level,
      max_level: m.max_level,
      element: m.element || null,
      drop_rate: m.drop_rate || 1.0
    }));

    res.json({ drops: availableDrops });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
