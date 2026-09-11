const express = require('express');
const router = express.Router();
const { loadDatabase, saveDatabase } = require('../database');
const auth = require('../middleware/auth');
const gameTime = require('../services/gameTime');
const injuryService = require('../services/injury');

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    // 阶段2：时间引擎结算（24h=10年，100% 在线离线折算）
    const settled = gameTime.settleTime(character);
    // 阶段5：伤势自然恢复（每游戏日-20；洞府×2 —— 由洞府系统写入 in_cave 标记）
    const nowTick = Date.now();
    const elapsedHours = character.last_recover_tick_at
      ? (nowTick - character.last_recover_tick_at) / 3600000
      : 0;
    character.last_recover_tick_at = nowTick;
    const recovered = injuryService.meditateRecover(character, elapsedHours, Boolean(character.in_cave));
    let reincarnated = null;
    if (gameTime.shouldPassAway(character)) {
      reincarnated = gameTime.passAway(character, db);
      saveDatabase(db);
    }
    res.json({
      ...character,
      lifespan: gameTime.lifespanInfo(character),
      injury: { value: Math.round(character.injury || 0), status: character.injury_status || 'none', autoMeditating: injuryService.shouldAutoMeditate(character), recovered: Math.round(recovered) },
      timeAdvanced: { years: Number(settled.advancedYears.toFixed(4)) },
      reincarnated
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/proficiency', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const proficiencyService = require('../services/proficiency');
    const out = {};
    for (const key of Object.keys(proficiencyService.CATEGORIES)) {
      out[key] = proficiencyService.get(character, key);
    }
    res.json({ proficiency: out, ladder: proficiencyService.LADDER });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const stats = character.stats || {};
    const spiritRoots = character.spirit_roots || [];

    const equips = db.equipments.filter(e => e.character_id === character.id);
    let equipAttack = 0, equipDefense = 0, equipHp = 0, equipSpeed = 0;
    let equipBonus = {};

    for (const e of equips) {
      const item = db.items.find(i => i.id === e.item_id);
      if (item) {
        const istats = JSON.parse(item.stats || '{}');
        const enhanceBonus = 1 + (e.enhance || 0) * 0.1;
        equipAttack += Math.floor((istats.attack || 0) * enhanceBonus);
        equipDefense += Math.floor((istats.defense || 0) * enhanceBonus);
        equipHp += Math.floor((istats.hp || 0) * enhanceBonus);
        equipSpeed += Math.floor((istats.speed || 0) * enhanceBonus);
        for (const [k, v] of Object.entries(istats)) {
          if (!['attack','defense','hp','speed'].includes(k)) {
            equipBonus[k] = (equipBonus[k] || 0) + Math.floor(v * enhanceBonus);
          }
        }
      }
    }

    let gongfaCultivationSpeed = 1.0;
    let gongfaSkillDamage = 1.0;
    const gongfas = db.gongfa.filter(g => g.character_id === character.id);
    for (const gf of gongfas) {
      const item = db.items.find(i => i.id === gf.item_id);
      if (item) {
        const istats = JSON.parse(item.stats || '{}');
        gongfaCultivationSpeed *= istats.cultivation_speed || 1;
        gongfaSkillDamage *= istats.skill_damage || 1;
      }
      gongfaCultivationSpeed *= 1 + ((gf.level || 1) - 1) * 0.02;
      gongfaSkillDamage *= 1 + ((gf.level || 1) - 1) * 0.03;
    }

    let petAttack = 0, petDefense = 0, petHp = 0;
    const activePets = db.pets.filter(p => p.character_id === character.id && p.is_active);
    for (const pet of activePets) {
      const item = db.items.find(i => i.id === pet.item_id || i.id === pet.pet_id);
      if (item) {
        const istats = JSON.parse(item.stats || '{}');
        petAttack += istats.attack || 0;
        petDefense += istats.defense || 0;
        petHp += istats.hp || 0;
      }
      petAttack += ((pet.level || 1) - 1) * 2;
      petDefense += ((pet.level || 1) - 1) * 1;
      petHp += ((pet.level || 1) - 1) * 5;
    }

    const level = character.level || 1;
    const constitution = stats.constitution || 10;
    const strength = stats.strength || 10;
    const physique = stats.physique || 10;
    const wisdom = stats.wisdom || 10;
    const soul = stats.soul || 10;
    const talent = stats.talent || 10;
    const comprehension = stats.comprehension || 10;
    const affinity = stats.affinity || 10;
    const luck = stats.luck || 10;
    const daoAffinity = stats.dao_affinity || 10;
    const fortune = stats.fortune || 10;

    const baseAttack = 10 + level * 2 + Math.floor(strength * 0.5) + Math.floor(constitution * 0.2);
    const baseDefense = 5 + level * 1 + Math.floor(physique * 0.5) + Math.floor(constitution * 0.3);
    const baseHp = 100 + level * 10 + physique * 5 + constitution * 3;
    const baseMp = 50 + level * 5 + wisdom * 3 + soul * 2;
    const baseSpeed = 5 + Math.floor(level / 5) + Math.floor(strength * 0.3);

    const realmIndex = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'].indexOf(character.realm);
    const realmMultiplier = 1 + realmIndex * 0.15;

    const moodModifier = (stats.mood || 80) / 100;
    const attack = Math.floor((baseAttack + equipAttack + petAttack) * realmMultiplier * moodModifier);
    const defense = Math.floor((baseDefense + equipDefense + petDefense) * realmMultiplier * moodModifier);
    const hp = Math.floor((baseHp + equipHp + petHp) * realmMultiplier);
    const maxHp = hp;
    const mp = Math.floor(baseMp * realmMultiplier);
    const maxMp = mp;
    const speed = Math.floor((baseSpeed + equipSpeed) * realmMultiplier);
    const critRate = Math.floor((5 + luck * 0.3 + (equipBonus.luck || 0) * 0.3) * 100) / 100;
    const combatPower = attack + defense + hp + mp;

    const avgRootPurity = spiritRoots.length > 0 
      ? Math.floor(spiritRoots.reduce((s, r) => s + (r.purity || 50), 0) / spiritRoots.length) 
      : 50;

    res.json({
      attack, defense, hp, maxHp, mp, maxMp, speed, combatPower, critRate,
      gongfaCultivationSpeed: Math.floor(gongfaCultivationSpeed * 100) / 100,
      gongfaSkillDamage: Math.floor(gongfaSkillDamage * 100) / 100,
      equipBonus: { attack: equipAttack, defense: equipDefense, hp: equipHp, speed: equipSpeed, ...equipBonus },
      petBonus: { attack: petAttack, defense: petDefense, hp: petHp },
      baseStats: { constitution, strength, physique, wisdom, soul, talent, comprehension, affinity, luck },
      specialStats: { appearance: stats.appearance || 1, daoAffinity, fortune, lifespan: stats.lifespan || 300, mood: stats.mood || 80 },
      spirit_roots: spiritRoots,
      avgRootPurity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/equipments', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const equipments = db.equipments.filter(e => e.character_id === character.id);
    const equippedItems = equipments.map(e => {
      const item = db.items.find(i => i.id === e.item_id);
      return { ...e, item };
    });
    res.json(equippedItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/gongfa', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const gongfa = db.gongfa.filter(g => g.character_id === character.id);
    const equippedGongfa = gongfa.map(g => {
      const item = db.items.find(i => i.id === g.item_id);
      return { ...g, item };
    });
    res.json(equippedGongfa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pets', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const pets = db.pets.filter(p => p.character_id === character.id);
    const petDetails = pets.map(p => {
      const item = db.items.find(i => i.id === p.item_id || i.id === p.pet_id);
      return { ...p, item, stats: item ? JSON.parse(item.stats || '{}') : {} };
    });
    res.json(petDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/inventory', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const inventory = db.inventory.filter(i => i.character_id === character.id);
    const items = inventory.map(inv => {
      const item = db.items.find(i => i.id === inv.item_id);
      return { ...inv, item };
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/', auth, (req, res) => {
  try {
    const { name } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (character && name) {
      character.name = name;
      saveDatabase(db);
    }
    res.json(character);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/spirit-roots', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const roots = character.spirit_roots || [];
    const SPIRIT_ROOTS = ['金','木','水','火','土','光明','黑暗'];
    const SPECIAL_ROOTS = ['剑灵根','丹灵根','欲灵根','财灵根','至尊灵根','炉鼎灵根'];
    const allRoots = [...SPIRIT_ROOTS, ...SPECIAL_ROOTS];
    res.json({
      roots,
      available: allRoots.filter(r => !roots.find(x => x.type === r)),
      elementRelations: {
        '金克木': '1.2x', '木克土': '1.2x', '土克水': '1.2x', '水克火': '1.2x', '火克金': '1.2x',
        '金生水': '0.8x', '水生木': '0.8x', '木生火': '0.8x', '火生土': '0.8x', '土生金': '0.8x'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/spirit-roots/cultivate', auth, (req, res) => {
  try {
    const { root_type } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    if (!character.spirit_roots) character.spirit_roots = [];
    const root = character.spirit_roots.find(r => r.type === root_type);
    if (!root) return res.status(400).json({ error: '没有此灵根' });
    const cost = Math.floor(10 * Math.pow(1.5, Math.floor(root.purity / 20)));
    if (character.spirit_stone < cost) return res.status(400).json({ error: '灵石不足', need: cost });
    character.spirit_stone -= cost;
    const gain = Math.floor(Math.random() * 5) + 1;
    root.purity = Math.min(100, root.purity + gain);
    saveDatabase(db);
    res.json({ success: true, purity_gain: gain, new_purity: root.purity, cost, spirit_stone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/mood', auth, (req, res) => {
  try {
    const { action } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    if (!character.stats) character.stats = {};
    const moodActions = {
      'meditate': { change: 5, cost: 10, desc: '冥想' },
      'wine': { change: 10, cost: 50, desc: '饮酒' },
      'travel': { change: 15, cost: 100, desc: '游历' },
      'paint': { change: 8, cost: 20, desc: '作画' },
      'tea': { change: 6, cost: 15, desc: '品茶' }
    };
    const act = moodActions[action];
    if (!act) return res.status(400).json({ error: '无效操作', available: Object.keys(moodActions) });
    if (character.spirit_stone < act.cost) return res.status(400).json({ error: '灵石不足', need: act.cost });
    character.spirit_stone -= act.cost;
    character.stats.mood = Math.min(100, Math.max(0, (character.stats.mood || 80) + act.change));
    saveDatabase(db);
    res.json({ success: true, action: act.desc, mood: character.stats.mood, cost: act.cost, spirit_stone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/advanced', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const stats = character.stats || {};
    res.json({
      basic: {
        constitution: stats.constitution || 10,
        strength: stats.strength || 10,
        physique: stats.physique || 10,
        wisdom: stats.wisdom || 10,
        soul: stats.soul || 10,
        talent: stats.talent || 10
      },
      advanced: {
        comprehension: stats.comprehension || 10,
        affinity: stats.affinity || 10,
        luck: stats.luck || 10,
        daoAffinity: stats.dao_affinity || 10
      },
      special: {
        appearance: stats.appearance || 1,
        fortune: stats.fortune || 10,
        lifespan: stats.lifespan || 300,
        mood: stats.mood || 80
      },
      spirit_roots: character.spirit_roots || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
