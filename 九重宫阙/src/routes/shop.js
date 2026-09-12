const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const QUALITY_PRICE = {
  '凡器': 10, '法器': 50, '灵器': 200, '法宝': 1000, '古宝': 5000,
  '灵宝': 25000, '道器': 100000, '仙器': 500000, '混沌至宝': 2000000,
  '黄阶': 50, '玄阶': 200, '地阶': 1000, '天阶': 5000, '圣阶': 25000, '仙阶': 100000,
  '凡兽': 10, '灵兽': 50, '玄兽': 200, '地兽': 1000, '天兽': 5000, '圣兽': 25000, '仙兽': 100000,
  '消耗品': 5, '材料': 3, '道具': 20
};

function getSellPrice(item) {
  if (!item) return 1;
  const qualityPrice = QUALITY_PRICE[item.quality] || 10;
  let basePrice = qualityPrice;
  if (item.type === '装备') basePrice = Math.floor(qualityPrice * 1.5);
  else if (item.type === '功法') basePrice = Math.floor(qualityPrice * 1.2);
  else if (item.type === '灵宠') basePrice = Math.floor(qualityPrice * 2);
  return Math.max(1, Math.floor(basePrice * 0.3));
}

router.get('/items', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const items = db.shop.map(s => {
      const item = db.items.find(i => i.id === s.item_id);
      return {
        id: s.id,
        item_id: s.item_id,
        name: item ? item.name : '未知物品',
        type: item ? item.type : '未知',
        quality: item ? item.quality : '未知',
        price: s.price,
        stock: s.stock,
        description: s.description
      };
    });
    res.json(items);
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
      return {
        id: inv.id,
        item_id: inv.item_id,
        name: item ? item.name : '未知物品',
        type: item ? item.type : '未知',
        quality: item ? item.quality : '未知',
        quantity: inv.quantity || 1,
        sellPrice: getSellPrice(item)
      };
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/buy', auth, (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const shopItem = db.shop.find(s => s.id === itemId);
    if (!shopItem) {
      return res.status(400).json({ error: '物品不存在' });
    }

    const qty = quantity || 1;
    const totalCost = shopItem.price * qty;

    if ((character.spirit_stone || 0) < totalCost) {
      return res.status(400).json({ error: '灵石不足', required: totalCost, current: character.spirit_stone || 0 });
    }

    if (shopItem.stock !== -1 && shopItem.stock < qty) {
      return res.status(400).json({ error: '库存不足', stock: shopItem.stock });
    }

    character.spirit_stone -= totalCost;
    if (shopItem.stock !== -1) shopItem.stock -= qty;

    const existingInv = db.inventory.find(
      i => i.character_id === character.id && i.item_id === shopItem.item_id
    );
    if (existingInv) {
      existingInv.quantity = (existingInv.quantity || 1) + qty;
    } else {
      db.inventory.push({
        id: getNextId('inventory'),
        character_id: character.id,
        item_id: shopItem.item_id,
        quantity: qty
      });
    }

    saveDatabase(db);
    res.json({ success: true, spiritStone: character.spirit_stone, totalCost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sell', auth, (req, res) => {
  try {
    const { inventoryId, quantity } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = db.inventory.find(
      i => i.id === inventoryId && i.character_id === character.id
    );
    if (!inventoryItem) {
      return res.status(400).json({ error: '物品不存在' });
    }

    const item = db.items.find(i => i.id === inventoryItem.item_id);
    if (!item) {
      return res.status(400).json({ error: '物品信息不存在' });
    }

    const unitPrice = getSellPrice(item);
    const qty = Math.min(quantity || 1, inventoryItem.quantity || 1);
    const totalGold = unitPrice * qty;

    inventoryItem.quantity -= qty;
    if (inventoryItem.quantity <= 0) {
      db.inventory = db.inventory.filter(i => i.id !== inventoryId);
    }

    character.spirit_stone = (character.spirit_stone || 0) + totalGold;
    saveDatabase(db);
    res.json({ success: true, spiritStone: character.spirit_stone, sellPrice: totalGold, unitPrice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 从背包里扣一件（按角色 + 物品 id）。找不到或数量为 0 返回 false。 */
function consumeOne(db, characterId, itemId) {
  const row = (db.inventory || []).find(i => i.character_id === characterId && Number(i.item_id) === Number(itemId) && (i.quantity || 0) > 0);
  if (!row) return false;
  if (row.quantity > 1) row.quantity -= 1;
  else db.inventory.splice(db.inventory.indexOf(row), 1);
  return true;
}

router.post('/use-item', auth, (req, res) => {
  try {
    const { itemName } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const heldRow = (db.inventory || []).find(i =>
      i.character_id === character.id && (i.quantity || 0) > 0 &&
      (db.items || []).some(x => Number(x.id) === Number(i.item_id) && x.name === itemName));
    const heldItem = heldRow ? (db.items || []).find(x => Number(x.id) === Number(heldRow.item_id)) : null;

    // 轮55：延寿货品（LIFE_GAIN.plants 点名的灵植 / stats.longevity_ratio 的丹药）优先走延寿通道。
    // 这条通道此前全仓无人接线（`addLifespanBonus` 只有 T0-1 应劫一个调用者）⇒
    // 铁律(2)「元婴之后必须经营寿元」玩家手上零手段（E9 实测可获得 0/3）。
    // 规矩：**先判定后扣减**（被拒不损耗道具）；寿元算术一律在 `gameTime.addLifespanBonus` 里，这里绝不重算一份。
    const lifespanGoods = require('../services/lifespan-goods');
    const good = lifespanGoods.resolveLifespanGood(heldItem);
    if (good) {
      const out = lifespanGoods.use(character, good);
      if (!out.ok) {
        return res.status(423).json({
          success: false, status: 423, type: 'lifespan_locked', error: out.reason,
          item: itemName, leftThisLife: out.left === Infinity ? null : out.left,
          longevityCeiling: out.ceiling, longevityYears: character.longevity_years || 0
        });
      }
      if (!consumeOne(db, character.id, heldItem.id)) {
        return res.status(500).json({ error: '内部不一致：延寿已计入但背包扣减失败' });
      }
      saveDatabase(db);
      return res.json({
        success: true, type: 'longevity', item: itemName, gained: out.gained,
        longevityYears: character.longevity_years, longevityCeiling: out.ceiling,
        leftThisLife: out.left === Infinity ? null : out.left - 1,
        lifespan: require('../services/gameTime').lifespanInfo(character)
      });
    }
    if (heldItem && !heldRow) return res.status(400).json({ error: '背包里没有该物品' });

    const buffService = require('../services/buff');
    const result = buffService.applyGuildShopBuff(character.id, itemName);

    if (result.success && heldRow) {
      consumeOne(db, character.id, heldRow.item_id);
      saveDatabase(db);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
