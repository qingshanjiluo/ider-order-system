const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const proficiencyService = require('../services/proficiency');
const buffService = require('../services/buff');

/**
 * 符箓配方（轮111 重做成本端与效果端）。
 *
 * ## 修掉的两个真缺陷
 *
 * **① 成本端：做任何符都只吃"背包里第一件材料"。**
 * 旧代码（轮111 审计实证）：
 *     const materials = inventory.filter(i => 物品.type === '材料');
 *     if (materials[0].quantity < 1) ...
 *     materials[0].quantity -= 1;
 * 它**不看配方要什么**，扣的纯粹是「背包里排第一的那件 type=材料」。
 * 实证：把「九转还魂草」（宝品）排到前面，做**凡品**「治愈符」就吃掉了它；
 * 把「灵草」（凡品）排前面就吃灵草。玩家可用背包顺序挑便宜的，也会误吃贵重材料，
 * 而 5 条配方的材料需求**完全相同**（都是"随便一件"）。
 *
 * **② 效果端：符箓效果 100% 不生效。**
 * 旧代码写 `character.temp_attack_bonus = 1.3`，但战斗读的是
 * `buffService.getBuffMultiplier(charId,'attack')`（真源是 db.character_buffs 表），
 * **没有任何地方读 character.temp_attack_bonus**。玩家花材料做出的符用了等于没用。
 * 传送符更直接：只回一句文案，不改任何状态。
 *
 * ## 现在的口径
 *
 * - `materials`：配方**显式**列出所需材料名与数量，按名解析真实 item_id（物品 id 不连续，
 *   绝不硬编码数字）。缺哪种就明确报哪种，不做"任意材料"兜底。
 * - `buff`：走 buffService，与丹药/仙盟商店同一条被战斗真读的通路。
 *   取值语义与 getBuffMultiplier 一致：`value` 是**乘数**（1.3 = +30%），
 *   同类型多个 buff 按 (value-1) 累加。
 * - 瞬时效果（治愈）直接改 hp，不挂 buff。
 */
const TALISMAN_RECIPES = [
  {
    id: 1, name: '雷击符', type: 'thunder_strike', quality: '灵品',
    materials: [{ name: '朱砂', quantity: 2 }], spiritStone: 50,
    buff: { type: 'attack', value: 1.3, durationMs: 5 * 60 * 1000 },
    effect: 'attack_damage_up_30', description: '使用后攻击提升30%，持续5分钟'
  },
  {
    id: 2, name: '护盾符', type: 'shield', quality: '灵品',
    materials: [{ name: '玄铁矿', quantity: 2 }], spiritStone: 50,
    buff: { type: 'defense', value: 1.5, durationMs: 5 * 60 * 1000 },
    effect: 'defense_up_50', description: '使用后防御提升50%，持续5分钟'
  },
  {
    id: 3, name: '加速符', type: 'speed_boost', quality: '凡品',
    materials: [{ name: '灵草', quantity: 1 }], spiritStone: 30,
    buff: { type: 'speed', value: 1.4, durationMs: 5 * 60 * 1000 },
    effect: 'speed_up_40', description: '使用后速度提升40%，持续5分钟'
  },
  {
    id: 4, name: '治愈符', type: 'healing', quality: '凡品',
    materials: [{ name: '灵草', quantity: 2 }], spiritStone: 30,
    healPercent: 0.3,
    effect: 'heal_30_percent_hp', description: '使用后立即恢复30%生命'
  },
  {
    id: 5, name: '传送符', type: 'teleport', quality: '宝品',
    materials: [{ name: '九转还魂草', quantity: 1 }], spiritStone: 200,
    // 传送符的效果是"脱离战斗"，由 battle 侧读取该 buff 判定（value 仅作标记）
    buff: { type: 'escape', value: 2.0, durationMs: 60 * 1000 },
    effect: 'escape_battle', description: '使用后可脱离当前战斗'
  }
];

// 轮111 附注：旧版第 5 条写的是 quality: '玄品'，而**物品表里没有"玄品"这个品质**
// （真实阶梯是 凡品/灵品/宝品/仙品/道品，见 pill-library.QUALITY_ORDER）。
// 已改为「宝品」—— 传送符是 200 灵石 + 宝品材料换的，定档宝品与成本相称。

/** 兼容旧口径：调用方仍可只传 spiritStone 的配方 */
const DEFAULT_SPIRIT_COST = 50;

/**
 * 按名解析材料。物品表 id 不连续（1~1670 有 1036 个缺号），一律按名找。
 * @returns {{ok:true,item:object}|{ok:false,error:string}}
 */
function resolveMaterialByName(db, name) {
  const item = (db.items || []).find((i) => i.name === name);
  if (!item) return { ok: false, error: `配方引用的材料「${name}」在物品表里不存在` };
  return { ok: true, item };
}

/** 汇总角色持有量（同名物品可能多行） */
function heldQuantity(db, characterId, itemId) {
  return (db.inventory || [])
    .filter((i) => Number(i.character_id) === Number(characterId) && Number(i.item_id) === Number(itemId))
    .reduce((n, i) => n + (Number(i.quantity) || 0), 0);
}

/** 按需扣减（跨多行），不足则不扣任何东西（先校验后扣） */
function consumeMaterial(db, characterId, itemId, need) {
  let left = need;
  for (const row of db.inventory || []) {
    if (left <= 0) break;
    if (Number(row.character_id) !== Number(characterId) || Number(row.item_id) !== Number(itemId)) continue;
    const take = Math.min(Number(row.quantity) || 0, left);
    row.quantity = (Number(row.quantity) || 0) - take;
    left -= take;
  }
  db.inventory = (db.inventory || []).filter((i) => (Number(i.quantity) || 0) > 0);
  return left === 0;
}

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const talismans = (db.talismans || []).filter(t => t.character_id === character.id);
    res.json({ talismans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recipes', auth, (req, res) => {
  try {
    res.json({ recipes: TALISMAN_RECIPES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/craft', auth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '请输入符箓名称' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const recipe = TALISMAN_RECIPES.find(r => r.name === name);
    if (!recipe) {
      return res.status(400).json({
        error: '未知的符箓类型，可选：' + TALISMAN_RECIPES.map((r) => r.name).join('/')
      });
    }

    const spiritCost = recipe.spiritStone != null ? recipe.spiritStone : DEFAULT_SPIRIT_COST;
    if ((character.spirit_stone || 0) < spiritCost) {
      return res.status(400).json({ error: `灵石不足，需要${spiritCost}灵石` });
    }

    // 配方材料：先全部校验（含解析真实 item_id），任何一种不足都**不扣任何东西**
    const need = [];
    for (const spec of recipe.materials || []) {
      const resolved = resolveMaterialByName(db, spec.name);
      if (!resolved.ok) return res.status(500).json({ error: resolved.error });
      const have = heldQuantity(db, character.id, resolved.item.id);
      if (have < spec.quantity) {
        return res.status(400).json({
          error: `材料不足：${spec.name} 需要 ${spec.quantity}，持有 ${have}`
        });
      }
      need.push({ itemId: resolved.item.id, name: spec.name, quantity: spec.quantity });
    }

    character.spirit_stone -= spiritCost;
    for (const n of need) consumeMaterial(db, character.id, n.itemId, n.quantity);

    const existingTalisman = (db.talismans || []).find(
      t => t.character_id === character.id && t.type === recipe.type
    );

    if (existingTalisman) {
      existingTalisman.quantity = (existingTalisman.quantity || 1) + 1;
    } else {
      const talisman = {
        id: getNextId('talismans'),
        character_id: character.id,
        name: recipe.name,
        type: recipe.type,
        quality: recipe.quality,
        effect: recipe.effect,
        quantity: 1,
        crafted_at: Date.now()
      };
      if (!db.talismans) db.talismans = [];
      db.talismans.push(talisman);
    }

    // 阶段3：制符积累符箓熟练度
    proficiencyService.addExp(character, 'talisman', 5);

    saveDatabase(db);
    res.json({ success: true, message: `${recipe.name}制作成功`, name: recipe.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/use', auth, (req, res) => {
  try {
    const { talismanId } = req.body;
    if (!talismanId) {
      return res.status(400).json({ error: '请指定要使用的符箓' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const talisman = (db.talismans || []).find(
      t => t.id === talismanId && t.character_id === character.id
    );
    if (!talisman || (talisman.quantity || 0) <= 0) {
      return res.status(400).json({ error: '符箓不存在或数量不足' });
    }

    // 效果真源：按 type 找到配方定义（携带 buff / healPercent），而不是把效果写死在 switch 里。
    // 这样"配方表"是唯一真源 —— 加一条符箓不需要同时改两处。
    const recipe = TALISMAN_RECIPES.find(r => r.type === talisman.type);
    if (!recipe) {
      return res.status(400).json({ error: `符箓「${talisman.name}」没有对应配方定义，无法结算效果` });
    }

    let effectMessage = '';

    // ① 瞬时效果：治疗直接改 hp
    if (recipe.healPercent) {
      const maxHp = character.max_hp || 100;
      const before = character.hp != null ? character.hp : maxHp;
      const healAmount = Math.floor(maxHp * recipe.healPercent);
      character.hp = Math.min(before + healAmount, maxHp);
      effectMessage = `使用${talisman.name}，恢复${character.hp - before}点生命`;
    }

    // ② 持续效果：走 buffService —— 与丹药/仙盟商店**同一条被战斗真读的通路**。
    //    combat.js 的 attack/defense/speed 面板乘数来自
    //    buffService.getBuffMultiplier(charId, stat)，真源是 db.character_buffs 表。
    //    旧代码写的 character.temp_attack_bonus 没有任何消费端，等于符箓白用。
    if (recipe.buff) {
      buffService.addBuff(character.id, recipe.buff.type, recipe.buff.value, recipe.buff.durationMs);
      const pct = Math.round((recipe.buff.value - 1) * 100);
      const label = { attack: '攻击', defense: '防御', speed: '速度', escape: '脱离战斗' }[recipe.buff.type] || recipe.buff.type;
      const mins = Math.round(recipe.buff.durationMs / 60000);
      if (recipe.buff.type === 'escape') {
        effectMessage = `使用${talisman.name}，已获得脱离战斗的效果（${mins} 分钟内有效）`;
      } else {
        effectMessage = `使用${talisman.name}，${label}提升${pct}%，持续${mins}分钟`;
      }
    }

    if (!effectMessage) effectMessage = `使用了${talisman.name}`;

    talisman.quantity = (talisman.quantity || 1) - 1;
    if (talisman.quantity <= 0) {
      const idx = (db.talismans || []).findIndex(t => t.id === talisman.id);
      if (idx !== -1) db.talismans.splice(idx, 1);
    }

    saveDatabase(db);
    res.json({ success: true, message: effectMessage, talismanName: talisman.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
