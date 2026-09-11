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

const JADE_SHOP = [
  { id: 'j1', name: '灵石x1000', cost: 50, type: 'spirit_stone', value: 1000, desc: '1000灵石' },
  { id: 'j2', name: '灵石x5000', cost: 200, type: 'spirit_stone', value: 5000, desc: '5000灵石' },
  { id: 'j3', name: '回城符x5', cost: 30, type: 'item', itemId: 50, quantity: 5, desc: '传送回城' },
  { id: 'j4', name: '传音符x3', cost: 80, type: 'item', itemId: 49, quantity: 3, desc: '全服传音' },
  { id: 'j5', name: '随机传送符x5', cost: 40, type: 'item', itemId: 57, quantity: 5, desc: '随机传送' },
  { id: 'j6', name: '灵宠口粮x10', cost: 60, type: 'item', itemId: 150, quantity: 10, desc: '喂养灵宠' },
  { id: 'j7', name: '灵宠美食x5', cost: 150, type: 'item', itemId: 152, quantity: 5, desc: '高级灵宠粮' },
  { id: 'j8', name: '精铁x10', cost: 100, type: 'item', itemId: 64, quantity: 10, desc: '炼器材料' },
  { id: 'j9', name: '寒铁x5', cost: 200, type: 'item', itemId: 65, quantity: 5, desc: '高级炼器' },
  { id: 'j10', name: '九转还魂草x10', cost: 80, type: 'item', itemId: 38, quantity: 10, desc: '珍贵药材' },
  { id: 'j11', name: '紫金x5', cost: 250, type: 'item', itemId: 40, quantity: 5, desc: '高级材料' },
  { id: 'j12', name: '复活令x1', cost: 500, type: 'item', itemId: 56, quantity: 1, desc: '原地复活' }
];

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
    res.json({ items: JADE_SHOP, jade: character.jade || 0 });
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

    const shopItem = JADE_SHOP.find(i => i.id === itemId);
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
