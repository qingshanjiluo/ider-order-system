const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');

const VIP_LEVELS = [
  { level: 0, name: '凡人', required: 0, benefits: { expBonus: 1.0, spiritStoneBonus: 1.0, storageSlots: 50, dailyJade: 0, dailySweep: 0 } },
  { level: 1, name: '修士', required: 100, benefits: { expBonus: 1.05, spiritStoneBonus: 1.05, storageSlots: 60, dailyJade: 10, dailySweep: 1 } },
  { level: 2, name: '道友', required: 300, benefits: { expBonus: 1.10, spiritStoneBonus: 1.10, storageSlots: 70, dailyJade: 20, dailySweep: 2 } },
  { level: 3, name: '真人', required: 600, benefits: { expBonus: 1.15, spiritStoneBonus: 1.15, storageSlots: 80, dailyJade: 30, dailySweep: 3 } },
  { level: 4, name: '仙师', required: 1000, benefits: { expBonus: 1.20, spiritStoneBonus: 1.20, storageSlots: 90, dailyJade: 50, dailySweep: 4 } },
  { level: 5, name: '天仙', required: 1500, benefits: { expBonus: 1.25, spiritStoneBonus: 1.25, storageSlots: 100, dailyJade: 80, dailySweep: 5 } },
  { level: 6, name: '金仙', required: 2000, benefits: { expBonus: 1.30, spiritStoneBonus: 1.30, storageSlots: 120, dailyJade: 120, dailySweep: 6 } },
  { level: 7, name: '大罗金仙', required: 3000, benefits: { expBonus: 1.35, spiritStoneBonus: 1.35, storageSlots: 140, dailyJade: 180, dailySweep: 7 } },
  { level: 8, name: '准圣', required: 5000, benefits: { expBonus: 1.40, spiritStoneBonus: 1.40, storageSlots: 160, dailyJade: 250, dailySweep: 8 } },
  { level: 9, name: '圣人', required: 8000, benefits: { expBonus: 1.45, spiritStoneBonus: 1.45, storageSlots: 180, dailyJade: 350, dailySweep: 10 } },
  { level: 10, name: '道祖', required: 12000, benefits: { expBonus: 1.50, spiritStoneBonus: 1.50, storageSlots: 200, dailyJade: 500, dailySweep: 12 } }
];

const RECHARGE_PACKAGES = [
  { id: 1, name: '小额', price: 6, jade: 60, bonusJade: 0, badge: '' },
  { id: 2, name: '实惠', price: 30, jade: 300, bonusJade: 30, badge: '热门' },
  { id: 3, name: '超值', price: 98, jade: 980, bonusJade: 128, badge: '推荐' },
  { id: 4, name: '豪华', price: 198, jade: 1980, bonusJade: 388, badge: '' },
  { id: 5, name: '至尊', price: 328, jade: 3280, bonusJade: 788, badge: '超值' },
  { id: 6, name: '大佬', price: 648, jade: 6480, bonusJade: 1888, badge: '壕' }
];

/**
 * 仙玉商城。
 *
 * ## 为什么用 itemName 而不是 itemId（轮108 修）
 *
 * 这里原本写的是硬编码数字 id（`itemId: 50` 配 `name: '回城符x5'`）。物品表的 id
 * **不连续**（1~1670 区间里有 1036 个缺号，是历轮增删内容的自然结果），于是硬编码必然错位。
 * 实测三处已坏：
 *   · j3 回城符 → itemId 50（缺号，**不存在**）→ 玩家花 30 玉买到一件查不到定义的空物品
 *   · j4 传音符 → itemId 49（缺号，**不存在**）→ 同上
 *   · j12 复活令 → itemId 56 = **回城符** → 花 500 玉买"复活令"到手是"回城符"
 * 而且"复活令"这个物品在表里**根本不存在**（道具类只有 传音符/回城符/随机传送符 三件）。
 *
 * 按名字存则与 id 分配彻底解耦：物品表怎么重编都不会错位。
 * `resolveItem()` 在启动时把名字解析成 id，解析不到就**直接抛错**（宁可启动失败，
 * 也不要静默卖给玩家一件虚空物品）。这条由 scripts/audit-content-integrity.js 锁住。
 */
const JADE_SHOP = [
  { id: 'j1', name: '灵石x1000', cost: 50, type: 'spirit_stone', value: 1000, desc: '1000灵石' },
  { id: 'j2', name: '灵石x5000', cost: 200, type: 'spirit_stone', value: 5000, desc: '5000灵石' },
  { id: 'j3', name: '回城符x5', cost: 30, type: 'item', itemName: '回城符', quantity: 5, desc: '传送回城' },
  { id: 'j4', name: '传音符x3', cost: 80, type: 'item', itemName: '传音符', quantity: 3, desc: '全服传音' },
  { id: 'j5', name: '随机传送符x5', cost: 40, type: 'item', itemName: '随机传送符', quantity: 5, desc: '随机传送' },
  { id: 'j6', name: '灵宠口粮x10', cost: 60, type: 'item', itemName: '灵宠口粮', quantity: 10, desc: '喂养灵宠' },
  { id: 'j7', name: '灵宠美食x5', cost: 150, type: 'item', itemName: '灵宠美食', quantity: 5, desc: '高级灵宠粮' },
  { id: 'j8', name: '精铁x10', cost: 100, type: 'item', itemName: '精铁', quantity: 10, desc: '炼器材料' },
  { id: 'j9', name: '寒铁x5', cost: 200, type: 'item', itemName: '寒铁', quantity: 5, desc: '高级炼器' },
  { id: 'j10', name: '九转还魂草x10', cost: 80, type: 'item', itemName: '九转还魂草', quantity: 10, desc: '珍贵药材' },
  { id: 'j11', name: '紫金x5', cost: 250, type: 'item', itemName: '紫金', quantity: 5, desc: '高级材料' },
  // j12 原为「复活令」（物品表里不存在，且 itemId 56 指向回城符）。
  // 改为三件真道具里最贵的随机传送符，并让大份更划算（j5 是 5 件 40 玉 = 8 玉/件，
  // 这里 20 件 140 玉 = 7 玉/件）。初版定 260 玉被新审计的"定价单调"锁抓到（13 玉/件，买多反而亏）。
  { id: 'j12', name: '随机传送符x20', cost: 140, type: 'item', itemName: '随机传送符', quantity: 20, desc: '大量随机传送' }
];

/**
 * 把 JADE_SHOP 里的 itemName 解析成实际 id。
 * 解析不到 → 抛错（不让商城带着虚空商品上线）。
 * @returns {Array} 每项带 `itemId` 的商城副本
 */
function resolveJadeShop(db) {
  const byName = new Map((db.items || []).map((i) => [i.name, i.id]));
  return JADE_SHOP.map((it) => {
    if (it.type !== 'item') return { ...it };
    const id = byName.get(it.itemName);
    if (id == null) {
      throw new Error(`仙玉商城商品「${it.name}」引用的物品「${it.itemName}」在物品表里不存在`);
    }
    return { ...it, itemId: id };
  });
}

router.get('/info', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const currentVip = VIP_LEVELS.find(v => v.level === (character.vip_level || 0));
    const nextVip = VIP_LEVELS.find(v => v.level === (character.vip_level || 0) + 1);
    const today = new Date().toISOString().slice(0, 10);
    const lastClaim = character.vip_daily_claim || '';
    const canClaimDaily = currentVip.benefits.dailyJade > 0 && lastClaim !== today;

    res.json({
      level: character.vip_level || 0,
      name: currentVip.name,
      benefits: currentVip.benefits,
      vipExp: character.vip_exp || 0,
      jade: character.jade || 0,
      nextLevel: nextVip ? {
        level: nextVip.level,
        name: nextVip.name,
        required: nextVip.required,
        remaining: nextVip.required - (character.vip_exp || 0)
      } : null,
      canClaimDaily,
      dailyJade: currentVip.benefits.dailyJade
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/levels', auth, (req, res) => {
  try {
    res.json({ levels: VIP_LEVELS, packages: RECHARGE_PACKAGES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/recharge', auth, (req, res) => {
  try {
    const { packageId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const pkg = RECHARGE_PACKAGES.find(p => p.id === packageId);
    if (!pkg) return res.status(400).json({ error: '套餐不存在' });

    const totalJade = pkg.jade + pkg.bonusJade;
    character.jade = (character.jade || 0) + totalJade;
    if (!character.vip_exp) character.vip_exp = 0;
    character.vip_exp += pkg.price;

    let leveledUp = false;
    while (true) {
      const nextVip = VIP_LEVELS.find(v => v.level === (character.vip_level || 0) + 1);
      if (nextVip && character.vip_exp >= nextVip.required) {
        character.vip_level = nextVip.level;
        leveledUp = true;
      } else break;
    }

    if (!db.recharge_log) db.recharge_log = [];
    db.recharge_log.push({
      user_id: req.userId,
      username: db.users.find(u => u.id === req.userId)?.username || '',
      packageId: pkg.id,
      packageName: pkg.name,
      price: pkg.price,
      jade: totalJade,
      timestamp: new Date().toISOString()
    });

    saveDatabase(db);
    res.json({
      success: true,
      jade: character.jade,
      received: totalJade,
      vipExp: character.vip_exp,
      vipLevel: character.vip_level,
      leveledUp,
      message: `充值成功！获得${totalJade}仙玉`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/claim-daily', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const today = new Date().toISOString().slice(0, 10);
    if (character.vip_daily_claim === today) return res.status(400).json({ error: '今日已领取' });

    const currentVip = VIP_LEVELS.find(v => v.level === (character.vip_level || 0));
    if (currentVip.benefits.dailyJade <= 0) return res.status(400).json({ error: 'VIP等级不足，无法领取' });

    character.jade = (character.jade || 0) + currentVip.benefits.dailyJade;
    character.vip_daily_claim = today;
    saveDatabase(db);

    res.json({ success: true, jade: currentVip.benefits.dailyJade, totalJade: character.jade, message: `领取${currentVip.benefits.dailyJade}仙玉` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/jade-shop', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    // 解析 itemName → itemId；解析不到会抛错（宁可 500 也不要让前端显示一件买不到的东西）
    res.json({ items: resolveJadeShop(db), jade: character.jade || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/jade-buy', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });

    const shopItem = resolveJadeShop(db).find(i => i.id === itemId);
    if (!shopItem) return res.status(400).json({ error: '商品不存在' });
    if ((character.jade || 0) < shopItem.cost) return res.status(400).json({ error: '仙玉不足', need: shopItem.cost, owned: character.jade || 0 });

    character.jade -= shopItem.cost;

    if (shopItem.type === 'spirit_stone') {
      character.spirit_stone = (character.spirit_stone || 0) + shopItem.value;
    } else if (shopItem.type === 'item') {
      const existingInv = db.inventory.find(i => i.character_id === character.id && i.item_id === shopItem.itemId);
      if (existingInv) existingInv.quantity = (existingInv.quantity || 1) + shopItem.quantity;
      else {
        const { getNextId } = require('../database');
        db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: shopItem.itemId, quantity: shopItem.quantity });
      }
    }

    saveDatabase(db);
    res.json({ success: true, jade: character.jade, message: `购买成功：${shopItem.name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recharge-history', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const logs = (db.recharge_log || []).filter(l => l.user_id === req.userId).slice(-20).reverse();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
// 供审计脚本在运行时校验商城内容（不靠正则匹配源码文本 —— 那种做法改个写法就假绿）
module.exports._resolveJadeShop = resolveJadeShop;
module.exports._JADE_SHOP = JADE_SHOP;
