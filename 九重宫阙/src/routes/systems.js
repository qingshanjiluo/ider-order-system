const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
// 轮112：丹药的属性加成必须走 buffService（战斗面板的真源）——
// 旧代码只写 character.temp_*_bonus，而 combat.js 读的是 db.character_buffs。
const buffService = require('../services/buff');

// ========== 法器系统 ==========
router.get('/weapons', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const weapons = (db.items || []).filter(i => i.type === '法器').map(item => ({
      id: item.id,
      name: item.name,
      subtype: item.subtype,
      quality: item.quality,
      realm: item.realm,
      stats: JSON.parse(item.stats || '{}'),
      description: item.description
    }));
    res.json(weapons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/weapons/my', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const inventory = (db.inventory || []).filter(i => i.character_id === character.id);
    const weapons = [];
    for (const inv of inventory) {
      const item = (db.items || []).find(i => i.id === inv.item_id);
      if (item && item.type === '法器') {
        weapons.push({
          id: inv.id,
          itemId: item.id,
          name: item.name,
          subtype: item.subtype,
          quality: item.quality,
          realm: item.realm,
          stats: JSON.parse(item.stats || '{}'),
          quantity: inv.quantity || 1,
          description: item.description
        });
      }
    }
    res.json(weapons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/weapons/equip', auth, (req, res) => {
  try {
    const { itemId, slot } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const inventoryItem = (db.inventory || []).find(
      i => i.character_id === character.id && i.item_id === itemId
    );
    if (!inventoryItem) {
      return res.status(400).json({ error: '物品不在背包中' });
    }

    const item = (db.items || []).find(i => i.id === itemId);
    if (!item || item.type !== '法器') {
      return res.status(400).json({ error: '无效的法器' });
    }

    const validSlot = slot || item.subtype || '飞剑';
    const existingEquip = (db.equipments || []).find(
      e => e.character_id === character.id && e.slot === validSlot
    );
    if (existingEquip) {
      const oldItem = (db.items || []).find(i => i.id === existingEquip.item_id);
      (db.inventory || []).push({
        character_id: character.id,
        item_id: existingEquip.item_id,
        quantity: 1
      });
      const idx = (db.equipments || []).findIndex(e => e.id === existingEquip.id);
      if (idx !== -1) db.equipments.splice(idx, 1);
    }

    const invIdx = (db.inventory || []).findIndex(i => i.id === inventoryItem.id);
    if (invIdx !== -1) db.inventory.splice(invIdx, 1);

    const equipId = getNextId('equipments');
    (db.equipments || []).push({
      id: equipId,
      character_id: character.id,
      slot: validSlot,
      item_id: itemId,
      enhance: 0
    });

    saveDatabase(db);
    res.json({ success: true, equipId, slot: validSlot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 丹药系统 ==========
/**
 * 轮112：**是不是丹药**的单一真源判定。
 *
 * 旧代码在三处硬编码 `item.type === '丹药'`，但物品表里**名字以「丹」结尾却标着
 * 「消耗品」**的有 3 个：培元丹(id32)、回灵丹(id30，商店在售 10 灵石)、
 * 疗伤丹(id31，商店在售 10 灵石)。
 *
 * 后果是一条完整的用户可见故障链：
 *   玩家在商店买下回灵丹/疗伤丹 → 它们不进「我的丹药」列表（前端筛 type=丹药）
 *   → 背包里看得见却**没有"使用"入口**；就算直接调接口也是 400「无效的丹药」。
 *   花钱买的东西用不了。
 *
 * 判定口径（宽进）：`type === '丹药'` **或** `type === '消耗品'` 且名字以「丹」结尾。
 * 这个口径与前端 `app.js` 重炼列表的筛选
 *   `i.type === '消耗品' && (i.subtype === '丹药' || i.name.includes('丹'))`
 * 对齐 —— 前端早就认了这类物品，是后端不认。
 */
function isPillItem(item) {
  if (!item) return false;
  if (item.type === '丹药') return true;
  return item.type === '消耗品' && /丹$/.test(String(item.name || ''));
}

router.get('/pills', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const pills = (db.items || []).filter(isPillItem).map(item => ({
      id: item.id,
      name: item.name,
      subtype: item.subtype,
      quality: item.quality,
      realm: item.realm,
      stats: JSON.parse(item.stats || '{}'),
      description: item.description
    }));
    res.json(pills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pills/my', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const inventory = (db.inventory || []).filter(i => i.character_id === character.id);
    const pills = [];
    for (const inv of inventory) {
      const item = (db.items || []).find(i => i.id === inv.item_id);
      if (isPillItem(item)) {
        pills.push({
          id: inv.id,
          itemId: item.id,
          name: item.name,
          subtype: item.subtype,
          quality: item.quality,
          stats: JSON.parse(item.stats || '{}'),
          quantity: inv.quantity || 1,
          description: item.description
        });
      }
    }
    res.json(pills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pills/use', auth, (req, res) => {
  try {
    const { itemId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    // 轮112：**跨行汇总**持有量。旧代码用 `.find()` 只取背包里的第一行 ——
    // 同一种丹药如果在背包里有多行（合成、活动发放、商店分次购买都会造成），
    // 第一行用完（被 splice）前看不到第二行；更糟的是第一行数量不足时
    // 直接报「丹药不足」，**即使第二行有货**。符箓侧（G15）修过同一问题。
    // 这里同时用 Number 比较，避免 item_id 存成字符串时严格比较失配。
    const rows = (db.inventory || []).filter(
      i => Number(i.character_id) === Number(character.id) && Number(i.item_id) === Number(itemId)
    );
    const heldTotal = rows.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
    if (heldTotal < 1) {
      return res.status(400).json({ error: '丹药不足' });
    }

    const item = (db.items || []).find(i => Number(i.id) === Number(itemId));
    if (!isPillItem(item)) {
      return res.status(400).json({ error: '无效的丹药' });
    }

    const stats = JSON.parse(item.stats || '{}');
    let effect = '';

    if (stats.hp_restore) {
      character.hp = Math.min((character.hp || 0) + stats.hp_restore, character.max_hp || 100);
      effect = `恢复${stats.hp_restore}点生命`;
    }
    if (stats.mp_restore) {
      character.mp = Math.min((character.mp || 0) + stats.mp_restore, character.max_mp || 50);
      effect += (effect ? '，' : '') + `恢复${stats.mp_restore}点灵力`;
    }
    if (stats.hp_full) {
      character.hp = character.max_hp || 100;
      effect = '完全恢复生命';
    }
    if (stats.mp_full) {
      character.mp = character.max_mp || 50;
      effect += (effect ? '，' : '') + '完全恢复灵力';
    }
    // ── 轮112：属性加成必须走 buffService，不能只写给**没人读**的 temp_* 字段 ──
    //
    // 旧代码把 attack_bonus/defense_bonus/speed_bonus/exp_bonus 写进
    // `character.temp_attack_bonus` 等字段，但 combat.js 的面板乘数链读的是
    //   buffService.getBuffMultiplier(charId, 'attack')
    // 真源是 db.character_buffs 表 —— 全项目**没有任何地方读** character.temp_*_bonus。
    //
    // 实证影响面：物品表里 **6 条真丹药**带这些字段，其中 **4 条正在商店售卖**
    //（培元丹 50、聚灵丹 80、铁壁丹 80、疾风丹 80）。玩家花钱买了吃下去，
    // 界面回"攻击加成20%"而面板纹丝不动 —— 在售商品的虚假宣传。
    //
    // 现在：战斗三属性走 buffService（与符箓/阵法同一条被战斗真读的通路）；
    // temp_* 字段**继续写入**以保持既有接口兼容（有前端/别处可能在读），
    // 但它们不再是唯一去处。
    const buffMs = (Number(stats.duration) || 300) * 1000;
    if (stats.attack_bonus) {
      character.temp_attack_bonus = stats.attack_bonus;
      character.temp_attack_bonus_duration = stats.duration || 300;
      buffService.addBuff(character.id, 'attack', Number(stats.attack_bonus), buffMs);
      effect += (effect ? '，' : '') + `攻击加成${Math.round((stats.attack_bonus - 1) * 100)}%`;
    }
    if (stats.defense_bonus) {
      character.temp_defense_bonus = stats.defense_bonus;
      character.temp_defense_bonus_duration = stats.duration || 300;
      buffService.addBuff(character.id, 'defense', Number(stats.defense_bonus), buffMs);
      effect += (effect ? '，' : '') + `防御加成${Math.round((stats.defense_bonus - 1) * 100)}%`;
    }
    if (stats.speed_bonus) {
      character.temp_speed_bonus = stats.speed_bonus;
      character.temp_speed_bonus_duration = stats.duration || 300;
      buffService.addBuff(character.id, 'speed', Number(stats.speed_bonus), buffMs);
      effect += (effect ? '，' : '') + `速度加成${Math.round((stats.speed_bonus - 1) * 100)}%`;
    }
    // 经验加成没有对应的战斗面板乘数（那是结算侧的事），保持原样写入并在
    // 响应里如实返回 —— 不伪造"已生效"。
    if (stats.exp_bonus) {
      character.temp_exp_bonus = stats.exp_bonus;
      character.temp_exp_bonus_duration = stats.duration || 300;
      effect += (effect ? '，' : '') + `经验加成${Math.round((stats.exp_bonus - 1) * 100)}%`;
    }
    // 跨行扣 1（从靠前的行开始），数量归零的行移除
    let left = 1;
    for (const row of rows) {
      if (left <= 0) break;
      const have = Number(row.quantity) || 0;
      if (have <= 0) continue;
      const take = Math.min(have, left);
      row.quantity = have - take;
      left -= take;
    }
    db.inventory = (db.inventory || []).filter(i => (Number(i.quantity) || 0) > 0);

    saveDatabase(db);
    res.json({ success: true, effect, hp: character.hp, mp: character.mp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 符箓系统 ==========
// 轮93：符箓/阵法六个变体端点退役删除（talismans[/my]|use、formations[/my]|activate）。
//   正主是 /api/talismans 与 /api/formations（FE 全接、轮77 已修）；变体是 P0 时代的双实现影子，
//   同库存两笔 effect 即漂移温床（影子擂台同款）。G5 轮89 负扫同批撤。

router.get('/sets', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const sets = {};
    const items = (db.items || []).filter(i => i.stats && JSON.parse(i.stats || '{}').set);
    for (const item of items) {
      const stats = JSON.parse(item.stats || '{}');
      const setName = stats.set;
      if (!sets[setName]) {
        sets[setName] = {
          name: setName,
          items: [],
          bonuses: []
        };
      }
      sets[setName].items.push({
        id: item.id,
        name: item.name,
        type: item.type,
        subtype: item.subtype,
        quality: item.quality
      });
    }

    for (const [setName, set] of Object.entries(sets)) {
      const itemCount = set.items.length;
      if (itemCount >= 2) set.bonuses.push('2件套：攻击+10%');
      if (itemCount >= 3) set.bonuses.push('3件套：防御+15%');
      if (itemCount >= 4) set.bonuses.push('4件套：全属性+20%');
      if (itemCount >= 5) set.bonuses.push('5件套：技能伤害+30%');
    }

    res.json(Object.values(sets));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
