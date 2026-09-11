const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const CAVE_LEVELS = [
  { level: 1, name: '简陋石洞', size: 10, storageLimit: 20, spiritPerHour: 5, cost: 0 },
  { level: 2, name: '普通洞府', size: 20, storageLimit: 40, spiritPerHour: 10, cost: 500 },
  { level: 3, name: '宽敞洞府', size: 35, storageLimit: 70, spiritPerHour: 18, cost: 1500 },
  { level: 4, name: '精致洞府', size: 50, storageLimit: 100, spiritPerHour: 28, cost: 4000 },
  { level: 5, name: '豪华洞府', size: 70, storageLimit: 150, spiritPerHour: 40, cost: 10000 },
  { level: 6, name: '仙家洞府', size: 100, storageLimit: 200, spiritPerHour: 60, cost: 25000 },
  { level: 7, name: '灵山福地', size: 150, storageLimit: 300, spiritPerHour: 90, cost: 60000 },
  { level: 8, name: '天界仙府', size: 200, storageLimit: 500, spiritPerHour: 130, cost: 150000 }
];

const FORMATIONS = [
  { id: 'spirit_gather', name: '聚灵阵', description: '灵气产生+50%', spiritBonus: 0.5, beauty: 5, cost: 300, levelReq: 1 },
  { id: 'protection', name: '护山大阵', description: '洞府防御+100', defense: 100, beauty: 10, cost: 800, levelReq: 2 },
  { id: 'time', name: '时光阵', description: '修炼速度+30%', cultivationBonus: 0.3, beauty: 15, cost: 2000, levelReq: 3 },
  { id: 'storage', name: '须弥阵', description: '储物空间+50%', storageBonus: 0.5, beauty: 8, cost: 1500, levelReq: 3 },
  { id: 'lucky', name: '福运阵', description: '幸运+10', luckBonus: 10, beauty: 12, cost: 1200, levelReq: 2 },
  { id: 'healing', name: '回春阵', description: '生命恢复+5%/小时', healPerHour: 0.05, beauty: 7, cost: 600, levelReq: 1 }
];

const DECORATIONS = [
  { id: 'jade_lamp', name: '玉灯', description: '美观+5，灵气+2/小时', beauty: 5, spiritPerHour: 2, cost: 200, levelReq: 1 },
  { id: 'spirit_tree', name: '灵树', description: '美观+10，灵气+5/小时', beauty: 10, spiritPerHour: 5, cost: 500, levelReq: 1 },
  { id: 'waterfall', name: '瀑布', description: '美观+15，灵气+8/小时', beauty: 15, spiritPerHour: 8, cost: 1200, levelReq: 2 },
  { id: 'crystal_flower', name: '水晶花', description: '美观+20，灵气+12/小时', beauty: 20, spiritPerHour: 12, cost: 2500, levelReq: 3 },
  { id: 'phoenix_feather', name: '凤凰羽', description: '美观+30，灵气+20/小时', beauty: 30, spiritPerHour: 20, cost: 6000, levelReq: 4 },
  { id: 'dragon_bead', name: '龙珠', description: '美观+50，灵气+35/小时', beauty: 50, spiritPerHour: 35, cost: 15000, levelReq: 5 }
];

const VEINS = [
  { id: 'low', name: '低级灵脉', description: '灵气+3/小时', spiritPerHour: 3, cost: 200 },
  { id: 'mid', name: '中级灵脉', description: '灵气+8/小时', spiritPerHour: 8, cost: 800 },
  { id: 'high', name: '高级灵脉', description: '灵气+18/小时', spiritPerHour: 18, cost: 2500 },
  { id: 'top', name: '顶级灵脉', description: '灵气+35/小时', spiritPerHour: 35, cost: 7000 },
  { id: 'heavenly', name: '仙品灵脉', description: '灵气+60/小时', spiritPerHour: 60, cost: 20000 }
];

const TALISMANS = [
  { id: 'attack_talisman', name: '攻击符箓', description: '攻击+50', attackBonus: 50, duration: 3600, cost: 100 },
  { id: 'defense_talisman', name: '防御符箓', description: '防御+50', defenseBonus: 50, duration: 3600, cost: 100 },
  { id: 'hp_talisman', name: '生命符箓', description: '最大生命+500', hpBonus: 500, duration: 3600, cost: 120 },
  { id: 'cultivation_talisman', name: '修炼符箓', description: '修炼速度+20%', cultivationBonus: 0.2, duration: 7200, cost: 200 },
  { id: 'luck_talisman', name: '幸运符箓', description: '幸运+15', luckBonus: 15, duration: 3600, cost: 150 },
  { id: 'herb_talisman', name: '采集符箓', description: '采集效率+30%', gatherBonus: 0.3, duration: 3600, cost: 130 }
];

const FACILITIES = [
  { id: 'spirit_well', name: '灵泉井', description: '灵气+10/小时', spiritPerHour: 10, cost: 1000, levelReq: 2 },
  { id: 'meditation_room', name: '静室', description: '修炼速度+20%', cultivationBonus: 0.2, cost: 2000, levelReq: 3 },
  { id: 'alchemy_room', name: '丹房', description: '炼丹成功率+10%', alchemyBonus: 0.1, cost: 3000, levelReq: 3 },
  { id: 'forge_room', name: '器房', description: '炼器成功率+10%', forgeBonus: 0.1, cost: 3000, levelReq: 3 },
  { id: 'training_ground', name: '演武场', description: '战斗经验+20%', battleExpBonus: 0.2, cost: 4000, levelReq: 4 },
  { id: 'library', name: '藏书阁', description: '功法领悟速度+25%', gongfaBonus: 0.25, cost: 5000, levelReq: 4 },
  { id: 'beast_pen', name: '灵兽栏', description: '宠物经验+15%', petExpBonus: 0.15, cost: 3500, levelReq: 3 },
  { id: 'herb_garden', name: '药圃', description: '采集药材品质+1', herbQualityBonus: 1, cost: 2500, levelReq: 2 }
];

function getCave(character) {
  if (!character.cave) {
    character.cave = {
      level: 1,
      formations: [],
      decorations: [],
      vein: null,
      talismans: [],
      facilities: [],
      spirit_stored: 0,
      lastCollectTime: Date.now()
    };
  }
  return character.cave;
}

function getCaveStats(character) {
  const cave = getCave(character);
  const caveLevel = CAVE_LEVELS.find(c => c.level === cave.level) || CAVE_LEVELS[0];
  let totalSpiritPerHour = caveLevel.spiritPerHour;
  let storageLimit = caveLevel.storageLimit;
  let beauty = 0;
  let cultivationBonus = 0;
  let defense = 0;
  let luckBonus = 0;
  let healPerHour = 0;
  let attackBonus = 0;
  let hpBonus = 0;
  let alchemyBonus = 0;
  let forgeBonus = 0;
  let battleExpBonus = 0;
  let gongfaBonus = 0;
  let petExpBonus = 0;
  let herbQualityBonus = 0;
  let gatherBonus = 0;

  for (const fId of (cave.formations || [])) {
    const f = FORMATIONS.find(x => x.id === fId);
    if (f) {
      if (f.spiritBonus) totalSpiritPerHour *= (1 + f.spiritBonus);
      if (f.storageBonus) storageLimit = Math.floor(storageLimit * (1 + f.storageBonus));
      if (f.beauty) beauty += f.beauty;
      if (f.cultivationBonus) cultivationBonus += f.cultivationBonus;
      if (f.defense) defense += f.defense;
      if (f.luckBonus) luckBonus += f.luckBonus;
      if (f.healPerHour) healPerHour += f.healPerHour;
    }
  }
  for (const dId of (cave.decorations || [])) {
    const d = DECORATIONS.find(x => x.id === dId);
    if (d) {
      totalSpiritPerHour += d.spiritPerHour || 0;
      beauty += d.beauty || 0;
    }
  }
  if (cave.vein) {
    const v = VEINS.find(x => x.id === cave.vein);
    if (v) totalSpiritPerHour += v.spiritPerHour;
  }
  for (const tId of (cave.talismans || [])) {
    const t = TALISMANS.find(x => x.id === tId);
    if (t) {
      if (t.attackBonus) attackBonus += t.attackBonus;
      if (t.defenseBonus) defense += t.defenseBonus;
      if (t.hpBonus) hpBonus += t.hpBonus;
      if (t.cultivationBonus) cultivationBonus += t.cultivationBonus;
      if (t.luckBonus) luckBonus += t.luckBonus;
      if (t.gatherBonus) gatherBonus += t.gatherBonus;
    }
  }
  for (const facId of (cave.facilities || [])) {
    const fac = FACILITIES.find(x => x.id === facId);
    if (fac) {
      totalSpiritPerHour += fac.spiritPerHour || 0;
      if (fac.cultivationBonus) cultivationBonus += fac.cultivationBonus;
      if (fac.alchemyBonus) alchemyBonus += fac.alchemyBonus;
      if (fac.forgeBonus) forgeBonus += fac.forgeBonus;
      if (fac.battleExpBonus) battleExpBonus += fac.battleExpBonus;
      if (fac.gongfaBonus) gongfaBonus += fac.gongfaBonus;
      if (fac.petExpBonus) petExpBonus += fac.petExpBonus;
      if (fac.herbQualityBonus) herbQualityBonus += fac.herbQualityBonus;
    }
  }

  return {
    level: cave.level,
    caveName: caveLevel.name,
    size: caveLevel.size,
    storageLimit,
    spiritPerHour: Math.floor(totalSpiritPerHour),
    beauty,
    cultivationBonus,
    defense,
    luckBonus,
    healPerHour,
    attackBonus,
    hpBonus,
    alchemyBonus,
    forgeBonus,
    battleExpBonus,
    gongfaBonus,
    petExpBonus,
    herbQualityBonus,
    gatherBonus,
    spiritStored: cave.spirit_stored || 0,
    formations: cave.formations || [],
    decorations: cave.decorations || [],
    vein: cave.vein,
    talismans: (cave.talismans || []).map(id => {
      const t = TALISMANS.find(x => x.id === id);
      return t ? { id: t.id, name: t.name, expiresAt: Date.now() + t.duration * 1000 } : null;
    }).filter(Boolean),
    facilities: cave.facilities || []
  };
}

router.get('/info', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const now = Date.now();
    const elapsed = (now - (cave.lastCollectTime || now)) / 3600000;
    const stats = getCaveStats(character);
    const collectible = Math.min(stats.storageLimit - (cave.spirit_stored || 0), Math.floor(stats.spiritPerHour * elapsed));
    if (collectible > 0) {
      cave.spirit_stored = Math.min(stats.storageLimit, (cave.spirit_stored || 0) + collectible);
      cave.lastCollectTime = now;
      saveDatabase(db);
    }

    res.json({
      cave: { ...stats, spiritStored: cave.spirit_stored },
      availableFormations: FORMATIONS.filter(f => cave.level >= f.levelReq),
      availableDecorations: DECORATIONS.filter(d => cave.level >= d.levelReq),
      availableVeins: VEINS,
      availableTalismans: TALISMANS,
      availableFacilities: FACILITIES.filter(f => cave.level >= f.levelReq),
      upgradeCost: cave.level < CAVE_LEVELS.length ? CAVE_LEVELS[cave.level].cost : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upgrade', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    if (cave.level >= CAVE_LEVELS.length) return res.status(400).json({ error: '洞府已达最高品阶' });

    const nextLevel = CAVE_LEVELS[cave.level];
    if ((character.spirit_stone || 0) < nextLevel.cost) return res.status(400).json({ error: '灵石不足', need: nextLevel.cost });
    character.spirit_stone -= nextLevel.cost;
    cave.level++;
    saveDatabase(db);

    const stats = getCaveStats(character);
    res.json({ success: true, cave: stats, spirit_stone: character.spirit_stone, message: `洞府升级为${stats.caveName}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/formation', auth, (req, res) => {
  try {
    const { formationId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const formation = FORMATIONS.find(f => f.id === formationId);
    if (!formation) return res.status(400).json({ error: '阵法不存在' });
    if (cave.level < formation.levelReq) return res.status(400).json({ error: `需要洞府等级${formation.levelReq}` });
    if (cave.formations.includes(formationId)) return res.status(400).json({ error: '阵法已布置' });
    if ((character.spirit_stone || 0) < formation.cost) return res.status(400).json({ error: '灵石不足', need: formation.cost });

    character.spirit_stone -= formation.cost;
    cave.formations.push(formationId);
    saveDatabase(db);

    const stats = getCaveStats(character);
    res.json({ success: true, cave: stats, spirit_stone: character.spirit_stone, message: `布置${formation.name}成功` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/decoration', auth, (req, res) => {
  try {
    const { decorationId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const decoration = DECORATIONS.find(d => d.id === decorationId);
    if (!decoration) return res.status(400).json({ error: '装饰不存在' });
    if (cave.level < decoration.levelReq) return res.status(400).json({ error: `需要洞府等级${decoration.levelReq}` });
    const count = (cave.decorations || []).filter(d => d === decorationId).length;
    if (count >= 5) return res.status(400).json({ error: '该装饰已达上限（5个）' });
    if ((character.spirit_stone || 0) < decoration.cost) return res.status(400).json({ error: '灵石不足', need: decoration.cost });

    character.spirit_stone -= decoration.cost;
    cave.decorations.push(decorationId);
    saveDatabase(db);

    const stats = getCaveStats(character);
    res.json({ success: true, cave: stats, spirit_stone: character.spirit_stone, message: `放置${decoration.name}成功` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vein', auth, (req, res) => {
  try {
    const { veinId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const vein = VEINS.find(v => v.id === veinId);
    if (!vein) return res.status(400).json({ error: '灵脉不存在' });
    if (cave.vein) return res.status(400).json({ error: '已有灵脉，需先拆除' });
    if ((character.spirit_stone || 0) < vein.cost) return res.status(400).json({ error: '灵石不足', need: vein.cost });

    character.spirit_stone -= vein.cost;
    cave.vein = veinId;
    saveDatabase(db);

    const stats = getCaveStats(character);
    res.json({ success: true, cave: stats, spirit_stone: character.spirit_stone, message: `开辟${vein.name}成功` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/remove-vein', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    if (!cave.vein) return res.status(400).json({ error: '没有灵脉' });
    const oldVein = VEINS.find(v => v.id === cave.vein);
    cave.vein = null;
    saveDatabase(db);

    res.json({ success: true, message: `拆除${oldVein ? oldVein.name : '灵脉'}成功` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/talisman', auth, (req, res) => {
  try {
    const { talismanId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const talisman = TALISMANS.find(t => t.id === talismanId);
    if (!talisman) return res.status(400).json({ error: '符箓不存在' });
    const count = (cave.talismans || []).filter(t => t === talismanId).length;
    if (count >= 3) return res.status(400).json({ error: '该符箓已达上限（3张）' });
    if ((character.spirit_stone || 0) < talisman.cost) return res.status(400).json({ error: '灵石不足', need: talisman.cost });

    character.spirit_stone -= talisman.cost;
    if (!cave.talismans) cave.talismans = [];
    cave.talismans.push(talismanId);
    saveDatabase(db);

    const stats = getCaveStats(character);
    res.json({ success: true, cave: stats, spirit_stone: character.spirit_stone, message: `使用${talisman.name}成功` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/facility', auth, (req, res) => {
  try {
    const { facilityId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const facility = FACILITIES.find(f => f.id === facilityId);
    if (!facility) return res.status(400).json({ error: '设施不存在' });
    if (cave.level < facility.levelReq) return res.status(400).json({ error: `需要洞府等级${facility.levelReq}` });
    if ((cave.facilities || []).includes(facilityId)) return res.status(400).json({ error: '设施已建造' });
    if ((character.spirit_stone || 0) < facility.cost) return res.status(400).json({ error: '灵石不足', need: facility.cost });

    character.spirit_stone -= facility.cost;
    if (!cave.facilities) cave.facilities = [];
    cave.facilities.push(facilityId);
    saveDatabase(db);

    const stats = getCaveStats(character);
    res.json({ success: true, cave: stats, spirit_stone: character.spirit_stone, message: `建造${facility.name}成功` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/collect', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const now = Date.now();
    const elapsed = (now - (cave.lastCollectTime || now)) / 3600000;
    const stats = getCaveStats(character);
    const collectible = Math.min(stats.storageLimit - (cave.spirit_stored || 0), Math.floor(stats.spiritPerHour * elapsed));

    cave.spirit_stored = Math.min(stats.storageLimit, (cave.spirit_stored || 0) + collectible);
    cave.lastCollectTime = now;
    saveDatabase(db);

    res.json({ success: true, collected: collectible, spiritStored: cave.spirit_stored, spiritPerHour: stats.spiritPerHour });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/use-storage', auth, (req, res) => {
  try {
    const { action, itemId, quantity } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const cave = getCave(character);
    const stats = getCaveStats(character);
    if (!cave.storage) cave.storage = {};

    if (action === 'store') {
      const inventoryItem = db.inventory.find(i => i.id === itemId && i.character_id === character.id);
      if (!inventoryItem) return res.status(400).json({ error: '物品不存在' });
      const qty = Math.min(quantity || 1, inventoryItem.quantity || 1);
      const storageUsed = Object.values(cave.storage).reduce((s, v) => s + v, 0);
      if (storageUsed + qty > stats.storageLimit) return res.status(400).json({ error: '储物空间不足' });

      inventoryItem.quantity = (inventoryItem.quantity || 1) - qty;
      if (inventoryItem.quantity <= 0) {
        const idx = db.inventory.findIndex(i => i.id === inventoryItem.id);
        if (idx !== -1) db.inventory.splice(idx, 1);
      }
      cave.storage[itemId] = (cave.storage[itemId] || 0) + qty;
      saveDatabase(db);
      res.json({ success: true, message: `存入${qty}个物品` });
    } else if (action === 'retrieve') {
      if (!cave.storage[itemId] || cave.storage[itemId] < (quantity || 1)) return res.status(400).json({ error: '储物空间物品不足' });
      const qty = quantity || 1;
      cave.storage[itemId] -= qty;
      if (cave.storage[itemId] <= 0) delete cave.storage[itemId];

      const existingInv = db.inventory.find(i => i.character_id === character.id && i.item_id === Number(itemId));
      if (existingInv) { existingInv.quantity = (existingInv.quantity || 1) + qty; }
      else { db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: Number(itemId), quantity: qty }); }
      saveDatabase(db);
      res.json({ success: true, message: `取出${qty}个物品` });
    } else {
      res.status(400).json({ error: '无效操作' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
