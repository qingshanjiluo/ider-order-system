const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const itemService = require('../services/item');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const GONGFA_TYPES = {
  'cultivation': { name: '修炼功法', maxSlots: 3 },
  'combat': { name: '战斗功法', maxSlots: 6 }
};

// gongfa.type 的规范词表（轮60）：读取方说的是中文 —— services/cultivation.js 过滤 '修炼'、
  // 轮66：本路由按类型分槽（GONGFA_TYPES.maxSlots），与技能槽的境界总闸（balance.skillSlotCap，
// 见 routes/skill.js）是两套各自成立的上限。历史上还有一份按境界扫槽的并行实现
// （src/services/battle/skill.js 的 getNextSlot），它无人 require，已随死代码删除。
// 于是"坊市买功法 → 装备"写出来的行**永远进不了任何结算**（G1 的直连断言抓到：ctx.gongfas 为空）。
// 规则：写库处一律经 canonType() 归一，读取方保持中文不动；API 契约里的 type 键不变（前端无需改）。
const TYPE_CANON = { cultivation: '修炼', combat: '战斗', '修炼': '修炼', '战斗': '战斗' };
function canonType(t) { return TYPE_CANON[t] || null; }

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const gongfas = db.gongfa.filter(g => g.character_id === character.id);
    const equippedGongfa = gongfas.map(g => {
      const item = db.items.find(i => i.id === g.item_id);
      return { ...g, item };
    });
    res.json(equippedGongfa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/slots', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const slots = {};
    for (const [typeId, typeInfo] of Object.entries(GONGFA_TYPES)) {
      const equipped = db.gongfa.filter(
        // 两侧都归一：typeId 是 API 键（cultivation/combat），g.type 落库是中文规范词
        g => g.character_id === character.id && canonType(g.type) === canonType(typeId)
      );
      slots[typeId] = {
        name: typeInfo.name,
        maxSlots: typeInfo.maxSlots,
        equipped: equipped.map(g => ({
          ...g,
          item: db.items.find(i => i.id === g.item_id)
        }))
      };
    }
    res.json(slots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/equip', auth, (req, res) => {
  try {
    const { itemId, type, slot } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = db.inventory.find(
      i => i.character_id === character.id && i.item_id === itemId
    );
    if (!inventoryItem) {
      return res.status(400).json({ error: '物品不在背包中' });
    }

    const item = db.items.find(i => i.id === itemId);
    if (!item || item.type !== '功法') {
      return res.status(400).json({ error: '无效的功法' });
    }

    const gongfaType = type || (item.description && item.description.includes('修炼') ? 'cultivation' : 'combat');
    const typeConfig = GONGFA_TYPES[gongfaType];
    if (!typeConfig) {
      return res.status(400).json({ error: '无效的功法类型' });
    }
    // 落库用规范词；计数时两种词表都认（历史数据/宗门路径写的都是中文，避免归一后反而漏计）
    const dbType = canonType(gongfaType);

    const currentEquipped = db.gongfa.filter(
      g => g.character_id === character.id && canonType(g.type) === dbType
    );
    if (currentEquipped.length >= typeConfig.maxSlots) {
      return res.status(400).json({ error: `${typeConfig.name}已达上限` });
    }

    const gongfaId = getNextId('gongfa');
    db.gongfa.push({
      id: gongfaId,
      character_id: character.id,
      type: dbType,
      item_id: itemId,
      level: 1,
      exp: 0
    });

    const invIdx = db.inventory.findIndex(i => i.id === inventoryItem.id);
    if (invIdx !== -1) db.inventory.splice(invIdx, 1);

    saveDatabase(db);
    res.json({ success: true, gongfaId, type: gongfaType });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unequip', auth, (req, res) => {
  try {
    const { gongfaId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const gongfaIndex = db.gongfa.findIndex(
      g => g.id === gongfaId && g.character_id === character.id
    );
    if (gongfaIndex === -1) {
      return res.status(400).json({ error: '功法不存在' });
    }

    const gongfa = db.gongfa[gongfaIndex];
    db.inventory.push({
      character_id: character.id,
      item_id: gongfa.item_id,
      quantity: 1
    });

    db.gongfa.splice(gongfaIndex, 1);
    saveDatabase(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', auth, (req, res) => {
  try {
    const { realm, quality, type } = req.body;
    const qualities = ['黄阶', '玄阶', '地阶', '天阶', '圣阶', '仙阶'];
    const types = ['修炼', '战斗'];
    const costMap = { '黄阶': 80, '玄阶': 200, '地阶': 500, '天阶': 1000, '圣阶': 2500, '仙阶': 5000 };
    const selectedQuality = quality || qualities[Math.floor(Math.random() * qualities.length)];
    const cost = costMap[selectedQuality] || 150;

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: `灵石不足，需要${cost}灵石` });
    }

    const gongfa = itemService.generateGongfa(
      realm || '炼气',
      selectedQuality,
      type || types[Math.floor(Math.random() * types.length)]
    );
    if (!gongfa) {
      return res.status(400).json({ error: '生成功法失败' });
    }

    character.spirit_stone -= cost;
    const itemId = getNextId('items');
    db.items.push({ id: itemId, ...gongfa });

    db.inventory.push({
      character_id: character.id,
      item_id: itemId,
      quantity: 1
    });

    saveDatabase(db);
    res.json({ success: true, item: { id: itemId, ...gongfa }, cost, spirit_stone: character.spirit_stone });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upgrade', auth, (req, res) => {
  try {
    const { gongfaId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const gongfa = db.gongfa.find(
      g => g.id === gongfaId && g.character_id === character.id
    );
    if (!gongfa) {
      return res.status(400).json({ error: '功法不存在' });
    }

    const expRequired = gongfa.level * 100;
    if ((gongfa.exp || 0) < expRequired) {
      return res.status(400).json({ error: '经验不足', required: expRequired, current: gongfa.exp || 0 });
    }

    const cost = gongfa.level * 10;
    if ((character.spirit_stone || 0) < cost) {
      return res.status(400).json({ error: '灵石不足', required: cost });
    }

    character.spirit_stone -= cost;
    gongfa.exp -= expRequired;
    gongfa.level += 1;

    saveDatabase(db);
    res.json({ success: true, level: gongfa.level, exp: gongfa.exp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 研读功法书（轮46 补上的缺失闭环）
 * 设计口径早就写在《方案规划/01-核心系统/功法系统.md》里："功法书 —— 直接获得完整功法"，
 * expand-data 也给了 stats.gongfa_id 指向具体功法物品（14~18），但全仓没有任何一处消费 功法书，
 * 于是 5 条功法书成了"买不到、也用不掉"的死定义。这里把使用路径接上：
 *   背包里的 功法书 --研读--> 消耗它 --发放--> gongfa_id 指向的 功法 物品（同一本书不重复给）
 * 校验一律拒绝而不是兜底伪造：书不存在 / 类型不对 / gongfa_id 缺失或指向非功法物品 / 已掌握，都直接报错。
 */
router.post('/study', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const invIdx = db.inventory.findIndex(i => i.character_id === character.id && i.item_id === Number(itemId));
    if (invIdx === -1) {
      return res.status(400).json({ error: '背包中没有该物品' });
    }
    const book = db.items.find(i => i.id === db.inventory[invIdx].item_id);
    if (!book || book.type !== '功法书') {
      return res.status(400).json({ error: '该物品不是功法书' });
    }
    let st = {};
    try { st = JSON.parse(book.stats || '{}'); } catch (e) { st = {}; }
    // 目标功法解析次序（轮46 的 G1 套件逼出来的口径）：先按 gongfa_id，但**只有它确实指向一条
    // type='功法' 的物品才算数**；否则退回 stats.gongfa 的名字。
    // 原因：items.id 在不同库里不稳定 —— 全新档上 gongfa_id=14 会撞上"雷电结晶"这类材料，
    // 只认 id 就会把材料当功法发出去（或反过来让研读必然失败）。名字才是可信的键。
    const gid = Number(st.gongfa_id);
    const byId = (Number.isFinite(gid) && gid > 0) ? db.items.find(i => Number(i.id) === gid && i.type === '功法') : undefined;
    const byName = st.gongfa ? db.items.find(i => String(i.name) === String(st.gongfa) && i.type === '功法') : undefined;
    const target = byId || byName;
    if (!target) {
      const wrong = (Number.isFinite(gid) && gid > 0) ? db.items.find(i => Number(i.id) === gid) : undefined;
      return res.status(400).json({
        error: wrong
          ? `功法书指向的 #${gid} 是「${wrong.name}」(${wrong.type})，不是功法，且按名也未找到「${st.gongfa || '无名'}」`
          : `功法书指向的功法不存在（gongfa_id=${st.gongfa_id == null ? '缺' : st.gongfa_id} gongfa=${st.gongfa || '缺'}）`
      });
    }
    const targetId = Number(target.id);
    const owned = db.inventory.some(i => i.character_id === character.id && i.item_id === targetId);
    const equipped = (db.gongfa || []).some(g => g.character_id === character.id && g.item_id === targetId);
    if (owned || equipped) {
      return res.status(400).json({ error: '已修习过该功法，此书无从再参悟', gongfa: target.name });
    }

    db.inventory[invIdx].quantity = (db.inventory[invIdx].quantity || 1) - 1;
    if (db.inventory[invIdx].quantity <= 0) db.inventory.splice(invIdx, 1);
    db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: targetId, quantity: 1 });

    saveDatabase(db);
    res.json({ success: true, learned: target.name, itemId: targetId, quality: target.quality, realm: target.realm });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
