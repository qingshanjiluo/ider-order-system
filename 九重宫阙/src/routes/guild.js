const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) {
      return res.json({ inGuild: false });
    }
    const guild = db.guilds.find(g => g.id === member.guild_id);
    const members = db.guild_members.filter(m => m.guild_id === guild.id);
    const memberDetails = members.map(m => {
      const char = db.characters.find(c => c.id === m.character_id);
      return { ...m, character: char };
    });
    res.json({ inGuild: true, guild, members: memberDetails, role: member.role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/create', auth, (req, res) => {
  try {
    const { name } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    // 阶段7：创建门槛由 1000 灵石改为 仙盟令×1（原始设定 09，稀缺凭证）
    ensureGuildTokenItems(db);
    const tokenIdx = db.inventory.findIndex(i => i.character_id === character.id && GUILD_TOKEN_ITEMS.some(t => t.itemId === i.item_id));
    if (tokenIdx === -1) {
      return res.status(400).json({ error: '创建仙盟需要「仙盟令」（礼包/拍卖/邀请奖励获取）' });
    }
    const existing = db.guilds.find(g => g.name === name);
    if (existing) {
      return res.status(400).json({ error: '仙盟名称已存在' });
    }
    const guildId = getNextId('guilds');
    db.guilds.push({
      id: guildId, name, leader_id: character.id, level: 1, exp: 0,
      created_at: new Date().toISOString()
    });
    db.guild_members.push({
      id: getNextId('guild_members'), guild_id: guildId, character_id: character.id,
      role: '盟主', joined_at: new Date().toISOString()
    });
    // 消耗仙盟令
    const tokenInv = db.inventory[tokenIdx];
    tokenInv.quantity = (tokenInv.quantity || 1) - 1;
    if (tokenInv.quantity <= 0) db.inventory.splice(tokenIdx, 1);
    saveDatabase(db);
    // 轮83 批5任务钩子：任务 8「宗门贡献」——创立与加入都算入盟（type:'guild' 此前全库无进度源）
    require('./quests').updateQuestProgress(character.id, 'guild', 1);
    res.json({ success: true, guildId, message: '仙盟令已消耗，仙盟创立' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/join', auth, (req, res) => {
  try {
    const { guildId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const existingMember = db.guild_members.find(m => m.character_id === character.id);
    if (existingMember) {
      return res.status(400).json({ error: '已经加入仙盟' });
    }
    const guild = db.guilds.find(g => g.id === guildId);
    if (!guild) {
      return res.status(400).json({ error: '仙盟不存在' });
    }
    db.guild_members.push({
      id: getNextId('guild_members'), guild_id: guildId, character_id: character.id,
      role: '成员', joined_at: new Date().toISOString()
    });
    saveDatabase(db);
    require('./quests').updateQuestProgress(character.id, 'guild', 1); // 轮83 批5任务钩子（同 create 档）
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/leave', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const memberIndex = db.guild_members.findIndex(m => m.character_id === character.id);
    if (memberIndex === -1) {
      return res.status(400).json({ error: '未加入仙盟' });
    }
    const member = db.guild_members[memberIndex];
    if (member.role === '盟主') {
      return res.status(400).json({ error: '盟主不能退出仙盟' });
    }
    db.guild_members.splice(memberIndex, 1);
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/kick', auth, (req, res) => {
  try {
    const { characterId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const myMember = db.guild_members.find(m => m.character_id === character.id);
    if (!myMember || (myMember.role !== '盟主' && myMember.role !== '长老')) {
      return res.status(400).json({ error: '权限不足' });
    }
    const targetMember = db.guild_members.find(m => m.character_id === characterId);
    if (!targetMember || targetMember.guild_id !== myMember.guild_id) {
      return res.status(400).json({ error: '目标不在本仙盟' });
    }
    if (targetMember.role === '盟主') {
      return res.status(400).json({ error: '不能踢出盟主' });
    }
    const targetIndex = db.guild_members.findIndex(m => m.character_id === characterId);
    db.guild_members.splice(targetIndex, 1);
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/set-role', auth, (req, res) => {
  try {
    const { characterId, role } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const myMember = db.guild_members.find(m => m.character_id === character.id);
    if (!myMember || myMember.role !== '盟主') {
      return res.status(400).json({ error: '只有盟主可以设置职位' });
    }
    const targetMember = db.guild_members.find(m => m.character_id === characterId);
    if (!targetMember || targetMember.guild_id !== myMember.guild_id) {
      return res.status(400).json({ error: '目标不在本仙盟' });
    }
    const validRoles = ['成员', '长老'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: '无效的职位，只能设置为成员或长老' });
    }
    targetMember.role = role;
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/list', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const guilds = db.guilds.map(g => {
      const memberCount = db.guild_members.filter(m => m.guild_id === g.id).length;
      return { ...g, memberCount, maxMembers: 50 };
    });
    res.json(guilds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/info', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) {
      return res.json(null);
    }
    const guild = db.guilds.find(g => g.id === member.guild_id);
    const memberCount = db.guild_members.filter(m => m.guild_id === guild.id).length;
    res.json({ ...guild, memberCount, maxMembers: 50, funds: guild.funds || 0, notice: guild.notice || '' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/members', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) {
      return res.json([]);
    }
    const members = db.guild_members.filter(m => m.guild_id === member.guild_id);
    const memberDetails = members.map(m => {
      const char = db.characters.find(c => c.id === m.character_id);
      return {
        id: m.id,
        name: char?.name || '未知',
        position: m.role,
        combatPower: (char?.attack || 0) + (char?.defense || 0) + (char?.hp || 0)
      };
    });
    res.json(memberDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/donate', auth, (req, res) => {
  try {
    const { amount } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    if (character.spirit_stone < amount) {
      return res.status(400).json({ error: '灵石不足' });
    }
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) {
      return res.status(400).json({ error: '未加入仙盟' });
    }
    character.spirit_stone -= amount;
    const guild = db.guilds.find(g => g.id === member.guild_id);
    guild.funds = (guild.funds || 0) + amount;
    saveDatabase(db);
    res.json({ success: true, funds: guild.funds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const GUILD_SHOP = [
  { id: 1, name: '回灵丹', item_id: 300, price: 10, description: '恢复50点灵力' },
  { id: 2, name: '疗伤丹', item_id: 301, price: 10, description: '恢复100点生命' },
  { id: 3, name: '大回灵丹', item_id: 302, price: 30, description: '恢复200点灵力' },
  { id: 4, name: '大疗伤丹', item_id: 303, price: 30, description: '恢复500点生命' },
  { id: 5, name: '培元丹', item_id: 310, price: 25, description: '修炼经验增加50%' },
  { id: 6, name: '聚灵丹', item_id: 311, price: 40, description: '攻击增加20%' },
  { id: 7, name: '铁壁丹', item_id: 312, price: 40, description: '防御增加20%' },
  { id: 8, name: '疾风丹', item_id: 313, price: 40, description: '速度增加30%' },
  { id: 9, name: '灵宠口粮', item_id: 340, price: 5, description: '喂养灵宠获得30经验' },
  { id: 10, name: '灵宠干粮', item_id: 341, price: 8, description: '喂养灵宠获得50经验' }
];

const GUILD_SKILLS = [
  { id: 'qi_gather', name: '灵气汇聚', description: '每级+5%经验', effect: 'exp_bonus', per_level: 0.05, max_level: 10, upgrade_cost: 50 },
  { id: 'stone_vein', name: '灵石矿脉', description: '每级+5%灵石获取', effect: 'spirit_stone_bonus', per_level: 0.05, max_level: 10, upgrade_cost: 60 },
  { id: 'cultivation', name: '修炼秘境', description: '每级+3%修炼速度', effect: 'cultivation_speed_bonus', per_level: 0.03, max_level: 10, upgrade_cost: 80 },
  { id: 'battle_power', name: '战斗之力', description: '每级+2%攻击', effect: 'attack_bonus', per_level: 0.02, max_level: 10, upgrade_cost: 100 },
  { id: 'defense_array', name: '防御阵法', description: '每级+2%防御', effect: 'defense_bonus', per_level: 0.02, max_level: 10, upgrade_cost: 100 }
];

const GUILD_DUNGEON = {
  id: 'guild_dungeon',
  name: '仙盟秘境',
  min_members: 3,
  difficulty: 3,
  min_level: 10,
  rewards: { exp: 500, spiritStone: 200 },
  description: '仙盟成员协作挑战的秘境副本'
};

router.get('/shop', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    const guild = db.guilds.find(g => g.id === member.guild_id);
    res.json({ items: GUILD_SHOP, guild_funds: guild.funds || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/shop/buy', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    const guild = db.guilds.find(g => g.id === member.guild_id);
    const shopItem = GUILD_SHOP.find(i => i.id === itemId);
    if (!shopItem) return res.status(400).json({ error: '商品不存在' });
    if ((guild.funds || 0) < shopItem.price) return res.status(400).json({ error: '仙盟资金不足' });
    guild.funds -= shopItem.price;
    const inv = db.inventory.find(i => i.character_id === character.id && i.item_id === shopItem.item_id);
    if (inv) {
      inv.quantity += 1;
    } else {
      db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: shopItem.item_id, quantity: 1 });
    }
    saveDatabase(db);
    res.json({ success: true, funds: guild.funds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/skills', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    const guild = db.guilds.find(g => g.id === member.guild_id);
    const guildSkills = db.guild_skills ? db.guild_skills.filter(s => s.guild_id === guild.id) : [];
    const result = GUILD_SKILLS.map(skill => {
      const current = guildSkills.find(s => s.skill_id === skill.id);
      return { ...skill, current_level: current ? current.level : 0 };
    });
    res.json({ skills: result, guild_funds: guild.funds || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/skill/upgrade', auth, (req, res) => {
  try {
    const { skillId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    if (member.role !== '盟主' && member.role !== '长老') return res.status(400).json({ error: '权限不足，只有盟主或长老可以升级技能' });
    const skillDef = GUILD_SKILLS.find(s => s.id === skillId || s.id === String(skillId));
    if (!skillDef) return res.status(400).json({ error: '技能不存在', available: GUILD_SKILLS.map(s => s.id) });
    const guild = db.guilds.find(g => g.id === member.guild_id);
    if (!db.guild_skills) db.guild_skills = [];
    let current = db.guild_skills.find(s => s.guild_id === guild.id && s.skill_id === skillDef.id);
    if (!current) {
      current = { guild_id: guild.id, skill_id: skillDef.id, level: 0 };
      db.guild_skills.push(current);
    }
    if (current.level >= skillDef.max_level) return res.status(400).json({ error: '技能已达最高等级' });
    const cost = skillDef.upgrade_cost * (current.level + 1);
    if ((guild.funds || 0) < cost) return res.status(400).json({ error: '仙盟资金不足', required: cost });
    guild.funds -= cost;
    current.level += 1;
    saveDatabase(db);
    res.json({ success: true, level: current.level, funds: guild.funds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dungeon', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    const members = db.guild_members.filter(m => m.guild_id === member.guild_id);
    const onlineCount = members.length;
    res.json({ dungeon: GUILD_DUNGEON, online_members: onlineCount, can_enter: onlineCount >= GUILD_DUNGEON.min_members });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/dungeon/enter', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    const members = db.guild_members.filter(m => m.guild_id === member.guild_id);
    if (members.length < GUILD_DUNGEON.min_members) {
      return res.status(400).json({ error: `需要至少${GUILD_DUNGEON.min_members}名成员在线，当前${members.length}名` });
    }
    if (character.level < GUILD_DUNGEON.min_level) {
      return res.status(400).json({ error: `等级需要达到${GUILD_DUNGEON.min_level}级` });
    }
    const reward = GUILD_DUNGEON.rewards;
    character.exp = (character.exp || 0) + reward.exp;
    character.spirit_stone = (character.spirit_stone || 0) + reward.spiritStone;
    saveDatabase(db);
    res.json({ success: true, rewards: reward });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const GUILD_TOKEN_ITEMS = [
  { id: 'low_token', name: '初级仙盟令', itemId: 80, quality: '凡品', contribution: 10 },
  { id: 'mid_token', name: '中级仙盟令', itemId: 81, quality: '灵品', contribution: 30 },
  { id: 'high_token', name: '高级仙盟令', itemId: 82, quality: '宝品', contribution: 80 },
  { id: 'supreme_token', name: '至尊仙盟令', itemId: 83, quality: '仙品', contribution: 200 }
];

/** 确保仙盟令物品存在于 items 表（幂等） */
function ensureGuildTokenItems(db) {
  for (const t of GUILD_TOKEN_ITEMS) {
    if (!db.items.find(i => i.id === t.itemId)) {
      db.items.push({ id: t.itemId, name: t.name, type: '凭证', quality: t.quality, stats: '{}', description: `创建/资助仙盟的稀缺凭证（${t.quality}）` });
    }
  }
}

/** 阶段7：参与建设期间的机会成本（不能修炼/刷怪） */
function isBuilding(character) {
  return (character.guild_build_until || 0) > Date.now();
}

const GUILD_BUILDINGS = [
  { id: 'hall', name: '仙盟大厅', description: '仙盟核心建筑，等级影响其他建筑上限', maxLevel: 10, upgradeTime: 3600, costBase: 500, effect: 'maxMemberBonus', perLevel: 5 },
  { id: 'treasury', name: '仙盟宝库', description: '存储仙盟物资，等级影响存储上限', maxLevel: 8, upgradeTime: 2400, costBase: 300, effect: 'storageBonus', perLevel: 100 },
  { id: 'library', name: '仙盟书阁', description: '存放功法秘籍，等级影响可兑换功法品阶', maxLevel: 8, upgradeTime: 2800, costBase: 400, effect: 'gongfaTier', perLevel: 1 },
  { id: 'arena', name: '仙盟演武场', description: '成员切磋，等级影响挑战奖励', maxLevel: 6, upgradeTime: 2000, costBase: 350, effect: 'arenaRewardBonus', perLevel: 0.1 },
  { id: 'spirit_vein', name: '仙盟灵脉', description: '提供灵气，等级影响灵气产出', maxLevel: 8, upgradeTime: 3200, costBase: 450, effect: 'spiritPerHour', perLevel: 5 },
  { id: 'shop_building', name: '仙盟商铺', description: '开放更多商品，等级影响商品种类', maxLevel: 6, upgradeTime: 1800, costBase: 280, effect: 'shopSlots', perLevel: 2 }
];

router.get('/buildings', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });

    const guild = db.guilds.find(g => g.id === member.guild_id);
    if (!guild.buildings) guild.buildings = {};
    if (!guild.buildQueue) guild.buildQueue = [];

    const now = Date.now();
    const completedBuilds = [];
    guild.buildQueue = guild.buildQueue.filter(b => {
      if (b.completedAt <= now) {
        if (!guild.buildings[b.buildingId]) guild.buildings[b.buildingId] = 0;
        guild.buildings[b.buildingId]++;
        completedBuilds.push(b);
        return false;
      }
      return true;
    });
    if (completedBuilds.length > 0) saveDatabase(db);

    const buildings = GUILD_BUILDINGS.map(b => {
      const job = guild.buildQueue.find(q => q.buildingId === b.id);
      return {
        ...b,
        currentLevel: guild.buildings[b.id] || 0,
        isUpgrading: Boolean(job),
        participants: job ? (job.participants || []).length : 0,
        upgradeFinishTime: job ? job.completedAt : null,
        upgradeCost: Math.floor(b.costBase * Math.pow(1.5, (guild.buildings[b.id] || 0)))
      };
    });

    res.json({ buildings, buildQueue: guild.buildQueue, funds: guild.funds || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/buildings/upgrade', auth, (req, res) => {
  try {
    const { buildingId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    if (member.role !== '盟主' && member.role !== '长老') return res.status(400).json({ error: '权限不足' });

    const building = GUILD_BUILDINGS.find(b => b.id === buildingId);
    if (!building) return res.status(400).json({ error: '建筑不存在' });

    const guild = db.guilds.find(g => g.id === member.guild_id);
    if (!guild.buildings) guild.buildings = {};
    if (!guild.buildQueue) guild.buildQueue = [];

    const currentLevel = guild.buildings[buildingId] || 0;
    if (currentLevel >= building.maxLevel) return res.status(400).json({ error: '建筑已达最高等级' });

    if (guild.buildQueue.some(q => q.buildingId === buildingId)) {
      return res.status(400).json({ error: '该建筑正在升级中' });
    }
    // 阶段7：建设队列全局串行（原始设定 09——与其他队列串行）
    if (guild.buildQueue.length > 0) {
      return res.status(400).json({ error: '建设队列串行中，须等待当前建筑完工', queue: guild.buildQueue.length });
    }

    if (buildingId !== 'hall') {
      const hallLevel = guild.buildings['hall'] || 0;
      if (currentLevel >= hallLevel) return res.status(400).json({ error: '需要先升级仙盟大厅' });
    }

    const cost = Math.floor(building.costBase * Math.pow(1.5, currentLevel));
    if ((guild.funds || 0) < cost) return res.status(400).json({ error: '仙盟资金不足', need: cost });

    guild.funds -= cost;
    guild.buildQueue.push({
      buildingId,
      startLevel: currentLevel,
      startedAt: Date.now(),
      completedAt: Date.now() + building.upgradeTime * 1000,
      participants: []
    });
    saveDatabase(db);

    res.json({ success: true, message: `开始升级${building.name}（队列串行）`, funds: guild.funds, queueLength: guild.buildQueue.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 阶段7：参与建设——机会成本（建设期间不能修炼/刷怪）+ 人数加速（每多1人剩余时间÷1.25，下限10%）
router.post('/buildings/participate', auth, (req, res) => {
  try {
    const { buildingId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });

    const guild = db.guilds.find(g => g.id === member.guild_id);
    if (!guild || !guild.buildQueue) return res.status(400).json({ error: '没有进行中的建设' });
    const job = guild.buildQueue.find(q => q.buildingId === buildingId);
    if (!job) return res.status(400).json({ error: '该建筑不在建设队列中' });
    if (isBuilding(character)) return res.status(400).json({ error: '已在参与建设' });

    job.participants = job.participants || [];
    if (!job.participants.includes(character.id)) job.participants.push(character.id);
    const speedup = Math.max(0.1, 1 / (1 + 0.25 * (job.participants.length - 1)));
    const remaining = Math.max(0, job.completedAt - Date.now()) * speedup;
    job.completedAt = Date.now() + remaining;
    character.guild_build_until = job.completedAt;
    member.contribution = (member.contribution || 0) + 5; // 参与建设微量贡献
    saveDatabase(db);
    res.json({
      success: true,
      participants: job.participants.length,
      speedup,
      buildUntil: job.completedAt,
      message: `参与建设（${job.participants.length}人协作，剩余时间×${speedup.toFixed(2)}）；期间无法修炼与刷怪`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 阶段7：成员赠送灵石（原始设定 09）
router.post('/gift', auth, (req, res) => {
  try {
    const { targetCharacterId, amount } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const senderMember = db.guild_members.find(m => m.character_id === character.id);
    if (!senderMember) return res.status(400).json({ error: '未加入仙盟' });
    const target = db.characters.find(c => c.id === Number(targetCharacterId));
    if (!target || target.id === character.id) return res.status(400).json({ error: '目标成员无效' });
    const targetMember = db.guild_members.find(m => m.character_id === target.id);
    if (!targetMember || targetMember.guild_id !== senderMember.guild_id) return res.status(400).json({ error: '对方不在同一仙盟' });
    const amt = Math.floor(Number(amount));
    if (!(amt > 0)) return res.status(400).json({ error: '数额无效' });
    if ((character.spirit_stone || 0) < amt) return res.status(400).json({ error: '灵石不足' });
    character.spirit_stone -= amt;
    target.spirit_stone = (target.spirit_stone || 0) + amt;
    saveDatabase(db);
    res.json({ success: true, amount: amt, to: target.name, balance: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 阶段7：邀请奖励——首次领取初级仙盟令（获取渠道之一）
router.post('/token/claim', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    if (character.guild_token_claimed) return res.status(400).json({ error: '邀请奖励已领取' });
    ensureGuildTokenItems(db);
    const tokenDef = GUILD_TOKEN_ITEMS[0];
    db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: tokenDef.itemId, quantity: 1 });
    character.guild_token_claimed = true;
    saveDatabase(db);
    res.json({ success: true, item: tokenDef.name, message: '邀请奖励：初级仙盟令×1（拍卖行亦可流通各品阶仙盟令）' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/token/submit', auth, (req, res) => {
  try {
    const { tokenItemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const token = GUILD_TOKEN_ITEMS.find(t => t.itemId === tokenItemId);
    if (!token) return res.status(400).json({ error: '仙盟令不存在' });

    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    if (member.contributed) return res.status(400).json({ error: '已提交过仙盟令' });

    const invItem = db.inventory.find(i => i.character_id === character.id && i.item_id === tokenItemId);
    if (!invItem || (invItem.quantity || 1) < 1) return res.status(400).json({ error: '仙盟令不足' });

    invItem.quantity = (invItem.quantity || 1) - 1;
    if (invItem.quantity <= 0) {
      const idx = db.inventory.findIndex(i => i.id === invItem.id);
      if (idx !== -1) db.inventory.splice(idx, 1);
    }

    member.contributed = true;
    member.contribution = (member.contribution || 0) + token.contribution;
    const guild = db.guilds.find(g => g.id === member.guild_id);
    guild.funds = (guild.funds || 0) + token.contribution;
    saveDatabase(db);

    res.json({ success: true, contribution: member.contribution, message: `提交${token.name}，贡献+${token.contribution}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/activities', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });

    const activities = [
      { id: 'guild_boss', name: '仙盟BOSS', description: '全盟协作击杀BOSS，按贡献分配奖励', minMembers: 5, cooldown: 86400, lastTime: 0 },
      { id: 'guild_war', name: '仙盟战', description: '与其他仙盟争夺领地', minMembers: 10, cooldown: 604800, lastTime: 0 },
      { id: 'guild_auction', name: '仙盟拍卖', description: '使用仙盟资金拍卖稀有物品', minMembers: 3, cooldown: 43200, lastTime: 0 },
      { id: 'guild_practice', name: '仙盟修炼', description: '集体修炼获得额外经验', minMembers: 2, cooldown: 7200, lastTime: 0 }
    ];

    const memberCount = db.guild_members.filter(m => m.guild_id === member.guild_id).length;
    const result = activities.map(a => ({
      ...a,
      canEnter: memberCount >= a.minMembers,
      memberCount
    }));

    res.json({ activities: result, memberCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/activities/join', auth, (req, res) => {
  try {
    const { activityId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });

    const memberCount = db.guild_members.filter(m => m.guild_id === member.guild_id).length;
    if (memberCount < 2) return res.status(400).json({ error: '成员不足' });

    const activityRewards = {
      guild_boss: { exp: 300, spiritStone: 100, contribution: 20 },
      guild_war: { exp: 500, spiritStone: 200, contribution: 40 },
      guild_auction: { exp: 100, spiritStone: 50, contribution: 10 },
      guild_practice: { exp: 200, spiritStone: 30, contribution: 15 }
    };

    const reward = activityRewards[activityId] || { exp: 100, spiritStone: 20, contribution: 10 };
    character.exp = (character.exp || 0) + reward.exp;
    character.spirit_stone = (character.spirit_stone || 0) + reward.spiritStone;
    member.contribution = (member.contribution || 0) + reward.contribution;
    saveDatabase(db);

    res.json({ success: true, rewards: reward, contribution: member.contribution });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- 轮94：AI 战书（guild_content 用途的消费端——宣纸挂门楣） ----------
router.post('/war-post', auth, async (req, res) => {
  try {
    const aiService = require('../services/ai'); // 懒require防环（quests钩子同法）
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    const member = db.guild_members.find(m => m.character_id === character.id);
    if (!member) return res.status(400).json({ error: '未加入仙盟' });
    const guild = db.guilds.find(g => g.id === member.guild_id);
    // 轮94 松绑：不给 guildId 就自动撮合一家他盟（宣战也需要缘分，FE 免下拉）
    const target = req.body.guildId
      ? db.guilds.find(g => g.id === Number(req.body.guildId) && g.id !== member.guild_id)
      : (db.guilds || []).find(g => g.id !== member.guild_id);
    if (!target) return res.status(400).json({ error: '江湖上只剩自家一盟，无处修书' });

    // nonce 进参数散列：同一对盟反复修书不会命中旧稿（传记二润教训的反向用法）
    const gen = await aiService.generate('guild_content', {
      kind: 'war_post', from: guild.name, to: target.name, by: character.name, nonce: Date.now()
    }, {});
    const approved = gen.status === 'approved' && gen.content; // 服务契约是 content（ai.js:317），非 result
    if (approved) {
      guild.warPost = {
        title: gen.content.name, body: gen.content.desc,
        target: target.name, at: Date.now(), generationId: gen.generationId
      };
      saveDatabase(db);
    }
    res.json({
      status: gen.status, generationId: gen.generationId,
      warPost: guild.warPost || null,
      message: approved ? '战书已悬于门楣' : '词稿已入审核池，通过后自动生效'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
