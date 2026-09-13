const express = require('express');
const B = require('../config/balance');
const router = express.Router();
const auth = require('../middleware/auth');
const skillService = require('../services/skill');
const opportunity = require('../services/opportunity'); // 轮67：事件写机缘
const { loadDatabase } = require('../database');

router.get('/list', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const skills = skillService.getSkills(character.id);

    // 轮50 删除：baseSlots/levelBonus/talentBonus/gongfaBonus 这段旧分解（两处路由里各一份）
    // 早已不参与 maxSlots 计算（真源只有下面的 balance.skillSlotCap），却仍随响应发给前端，
    // 等于让界面有机会对玩家展示过期构成；两处局部变量在本文件内均无其它引用（已全量核对）。
    const maxSlots = B.skillSlotCap((B.REALM_ORDER || []).indexOf(character.realm));   // E3 章程口径：min(2+境界序号, 8)，等级/天赋/功法不再参与
    const equippedCount = skills.filter(s => s.equipped_slot).length;

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
    // 轮50 删除：baseSlots/levelBonus/talentBonus/gongfaBonus 这段旧分解（两处路由里各一份）
    // 早已不参与 maxSlots 计算（真源只有下面的 balance.skillSlotCap），却仍随响应发给前端，
    // 等于让界面有机会对玩家展示过期构成；两处局部变量在本文件内均无其它引用（已全量核对）。
    const maxSlots = B.skillSlotCap((B.REALM_ORDER || []).indexOf(character.realm));   // E3 章程口径：min(2+境界序号, 8)，等级/天赋/功法不再参与
    const equippedCount = skills.filter(s => s.equipped_slot).length;
    if (equippedCount >= maxSlots) {
      return res.status(400).json({ error: `技能槽已满（${maxSlots}个）`, maxSlots, equippedCount });
    }

    const result = skillService.equipSkill(character.id, playerSkillId, slot);
    if (!result.success) return res.status(400).json(result);

    const newSkills = skillService.getSkills(character.id);
    const newEquipped = newSkills.filter(s => s.equipped_slot).length;
    result.maxSlots = maxSlots;
    result.equippedCount = newEquipped;
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

    const { skillId } = req.body;
    if (!skillId) return res.status(400).json({ error: '缺少技能ID' });

    // 轮47 修漏洞：这里原先把**客户端自报的** condition 字段直接当作"已达成机缘"传给服务层，
    // 服务端零校验 —— 任何登录玩家 POST 一个 truthy 的 condition 就能白拿 7.0 倍率的仙阶大招
    // （前端 public/js/app.js:1821 确实在这么调）。19 门隐藏技的 hidden_condition 至今是散文描述、
    // 没有可判定的服务端记录，所以在实装真实解锁判定之前，这个入口必须拒绝，而不是假装成功。
    // 轮67：这条方向已落地为 services/opportunity.js（character.opportunities），写入方只有战斗与应劫两处。
    // 轮67：本入口从"一刀切 501（尚未实装）"改为**只认服务端记录的真动作**：
    //   · 该隐藏技今天仍无服务端判据 ⇒ 409 如实挂账，绝不假装成功；
    //   · 有判据但角色身上没这条机缘记录 ⇒ 409，并告知差哪一条；
    //   · 有判据且已达成 ⇒ 委托 skillService.learnSkill 走同一套闸门（境界/前置/灵石）并真正写库。
    // 客户端自报的条件字段自始至终不参与判定 —— 轮47 查出的"自报即白拿仙阶大招"那个洞仍然关着。
    const skillDef = skillService.SKILLS_DATA.find((s) => s.id === skillId);
    if (!skillDef) return res.status(400).json({ error: '技能不存在' });
    if (!skillDef.is_hidden) return res.status(400).json({ error: '该技能不是隐藏技能，可直接参悟' });
    const info = opportunity.describeRequirement(skillDef, character);
    if (!info.required) {
      return res.status(409).json({ error: '该隐藏技的解锁条件尚无服务端判据（挂账中，见开发日志轮67）', skill_id: skillId, hidden_condition: skillDef.hidden_condition || null, required_opportunity: null });
    }
    if (!info.achieved) {
      return res.status(409).json({ error: '机缘尚未达成：它只由服务端事件写入，不接受自报', skill_id: skillId, required_opportunity: info.required, hidden_condition: info.condition });
    }
    const done = skillService.learnSkill(character.id, skillId);
    if (!done.success) return res.status(400).json(Object.assign({ required_opportunity: info.required }, done));
    res.json(Object.assign({ unlocked: true }, done));
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
