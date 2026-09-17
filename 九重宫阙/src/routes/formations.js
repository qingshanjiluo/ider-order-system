const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const proficiencyService = require('../services/proficiency');
const buffService = require('../services/buff');

/**
 * 战斗阵法（轮111 重做成本端与效果端，与 talismans.js 同源同治法）。
 *
 * ## 修前的两个真缺陷（均已实证）
 *
 * **① 零成本凭空获得。** `/activate` 完全不校验材料与灵石 —— 实测验：一个**新手号
 * 100 灵石**直接 POST formationId=4 就激活了最强阵法「万剑归宗阵」(attack+25%)，
 * 灵石一分没扣。定义 id 路径（`find(f => f.id === formationId)`）在没有实例时
 * 还会直接 push 一行新的。
 *
 * **② 效果无人消费。** `bonus_attack/bonus_defense/bonus_speed/bonus_hp/bonus_exp`
 * 只在 formations.js 自己里出现（定义 + 写库），全项目**没有任何消费端读取**；
 * `combat.js` 的面板乘数链是
 *   attack = floor((base+equip+pet) × realmMultiplier × tempAttackBonus × mood × 伤势 × 宗门)
 * 里面**没有 formations**。玩家激活阵法等于没激活。
 *
 * ## 现在的口径
 *
 * - **成本**：配方显式列材料名与数量 + 灵石。按名解析真实 item_id（物品 id 不连续）。
 *   首次布置收费；同类型阵法已有实例时只做「切换激活」，不重复收费。
 * - **效果**：走 `buffService.addBuff` —— 与符箓/丹药/仙盟商店同一条被战斗真读的通路。
 *   `bonus_*` 的数值语义是**百分数**（15 = +15%），转成 buff 的乘数即 `1 + 15/100`。
 * - `bonus_exp`（修炼速度）不是战斗面板项，暂不接 buff，保持为展示字段并在
 *   响应里如实标注 **applied: false**，不假装生效。
 */
const FORMATION_TYPES = [
  {
    id: 1, name: '天罡北斗阵', type: 'big_dipper',
    bonus_attack: 15, bonus_defense: 10, bonus_speed: 0, bonus_hp: 0, bonus_exp: 0,
    cost: { spiritStone: 800, materials: [{ name: '玄铁矿', quantity: 3 }, { name: '朱砂', quantity: 3 }] },
    description: '攻击力+15%，防御力+10%'
  },
  {
    id: 2, name: '七星聚灵阵', type: 'seven_star',
    bonus_attack: 0, bonus_defense: 0, bonus_speed: 0, bonus_hp: 0, bonus_exp: 30,
    cost: { spiritStone: 1500, materials: [{ name: '灵草', quantity: 5 }, { name: '星陨砂', quantity: 2 }] },
    description: '修炼速度+30%（展示项，尚未接入修炼结算）'
  },
  {
    id: 3, name: '九宫八卦阵', type: 'nine_palace',
    bonus_attack: 0, bonus_defense: 20, bonus_speed: 10, bonus_hp: 0, bonus_exp: 0,
    cost: { spiritStone: 2200, materials: [{ name: '玄铁矿', quantity: 4 }, { name: '紫晶砂', quantity: 2 }] },
    description: '防御力+20%，速度+10%'
  },
  {
    id: 4, name: '万剑归宗阵', type: 'sword_array',
    bonus_attack: 25, bonus_defense: 0, bonus_speed: 0, bonus_hp: 0, bonus_exp: 0,
    cost: { spiritStone: 4500, materials: [{ name: '天外陨铁', quantity: 3 }, { name: '紫晶砂', quantity: 3 }] },
    description: '攻击力+25%'
  },
  {
    id: 5, name: '玄武防御阵', type: 'black_tortoise',
    bonus_attack: 0, bonus_defense: 30, bonus_speed: 0, bonus_hp: 20, bonus_exp: 0,
    cost: { spiritStone: 3800, materials: [{ name: '镜心砂', quantity: 3 }, { name: '五色土', quantity: 3 }] },
    description: '防御力+30%，生命+20%'
  }
];

/** 阵法持续时长：布置后一直生效，用很长的 buff 表示（30 天） */
const FORMATION_BUFF_MS = 30 * 24 * 60 * 60 * 1000;

/** bonus_*（百分数）→ buff 乘数 */
const pctToMultiplier = (pct) => 1 + Number(pct || 0) / 100;

/** 按名解析材料（物品 id 不连续，一律按名找） */
function resolveMaterial(db, name) {
  const item = (db.items || []).find((i) => i.name === name);
  if (!item) return { ok: false, error: `阵法配方引用的材料「${name}」在物品表里不存在` };
  return { ok: true, item };
}

function heldQuantity(db, characterId, itemId) {
  return (db.inventory || [])
    .filter((i) => Number(i.character_id) === Number(characterId) && Number(i.item_id) === Number(itemId))
    .reduce((n, i) => n + (Number(i.quantity) || 0), 0);
}

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

/** 把某个阵法的加成写进 buffService（战斗真源） */
function applyFormationBuffs(characterId, def) {
  const map = [
    ['attack', def.bonus_attack],
    ['defense', def.bonus_defense],
    ['speed', def.bonus_speed]
  ];
  for (const [type, pct] of map) {
    if (Number(pct) > 0) buffService.addBuff(characterId, type, pctToMultiplier(pct), FORMATION_BUFF_MS);
  }
  // bonus_hp 没有对应的战斗乘数入口（面板 hp 走 constitution/physique 派生），
  // 如实不接，不伪造。
}

/** 撤掉某个阵法的加成 */
function clearFormationBuffs(characterId, def) {
  for (const type of ['attack', 'defense', 'speed']) {
    if (Number(def['bonus_' + type]) > 0) buffService.removeBuff(characterId, type);
  }
}

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const formations = (db.formations || []).filter(f => f.character_id === character.id);
    res.json({ formations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/list', auth, (req, res) => {
  try {
    res.json({ formations: FORMATION_TYPES });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/activate', auth, (req, res) => {
  try {
    const { formationId, type } = req.body;
    // 轮111：支持按 type 指定（消解"实例 id 与目录 id 数值相同"的歧义）。
    // 两者至少要给一个。
    if (!formationId && !type) {
      return res.status(400).json({ error: '请指定要激活的阵法（formationId 或 type）' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    // 轮111 三刀：**两套 id 空间歧义**。轮78 解决了"实例 id 找不到定义"的方向，
    // 反方向仍在：玩家想布「天罡北斗阵」（目录 id=1），而他恰好有个实例行 id 也是 1
    //（万剑归宗阵，getNextId('formations') 分配）—— 旧解析顺序「先查实例」会命中实例，
    // 把 formationDef 解析成 sword_array，**换阵换了个寂寞**（G16 当场抓到的红）。
    //
    // 现在按**调用方意图**显式区分，同时保住轮78 的"实例优先"语义：
    //   · 传 `type`（字符串）→ 一定按目录定义，最明确
    //   · 传 `formationId` 且该值匹配到**本角色持有的实例行** → 按那一行解析（轮78 语义）
    //   · 否则按目录定义 id
    // 唯一歧义点（实例 id 与目录 id 数值相同）已由 type 参数消解：
    // 此时实例优先（保持轮78 不变的对外行为），要布新阵请传 type。
    const reqType = req.body.type;
    const instance = (db.formations || []).find(f => f.id === formationId && f.character_id === character.id);

    let formationDef = null;
    if (reqType) {
      formationDef = FORMATION_TYPES.find(f => f.type === reqType) || null;
    } else if (instance) {
      formationDef = FORMATION_TYPES.find(f => f.type === instance.type) || null;
    } else {
      formationDef = FORMATION_TYPES.find(f => f.id === formationId) || null;
    }
    if (!formationDef) {
      return res.status(400).json({ error: '未知的阵法' });
    }

    // 轮78 二刀（**不能被削弱**）：旧版按 type 找"已拥有行"，同类型多行时命中哪行全凭
    // 插入顺序 —— 按实例 id 点激活却 toggle 到另一行。这里的口径是：
    //   · 走实例路径 → 精确命中**那一行**（不变）
    //   · 走目录定义路径 → 按 type 找（沿用旧语义）
    const existing = instance
      ? (db.formations || []).find(f => f.id === instance.id && f.character_id === character.id)
      : (db.formations || []).find(
          f => f.character_id === character.id && f.type === formationDef.type
        );

    // 轮111：布置成本。**已有实例**（切换激活）不重复收费；
    // 首次布置才校验并扣材料与灵石。旧版这里什么都不查 ——
    // 实测验：新手号 100 灵石直接激活「万剑归宗阵」且一分不扣。
    const isNewPlacement = !existing;
    if (isNewPlacement) {
      const cost = formationDef.cost || { spiritStone: 0, materials: [] };
      const spiritCost = Number(cost.spiritStone) || 0;
      if ((character.spirit_stone || 0) < spiritCost) {
        return res.status(400).json({
          error: `灵石不足，布置${formationDef.name}需要${spiritCost}灵石（持有${character.spirit_stone || 0}）`,
          required: { spiritStone: spiritCost },
          have: { spiritStone: character.spirit_stone || 0 }
        });
      }
      // 先全部校验，任何一种不足都零副作用拒绝
      const need = [];
      for (const spec of cost.materials || []) {
        const resolved = resolveMaterial(db, spec.name);
        if (!resolved.ok) return res.status(500).json({ error: resolved.error });
        const have = heldQuantity(db, character.id, resolved.item.id);
        if (have < spec.quantity) {
          return res.status(400).json({
            error: `材料不足：${spec.name} 需要 ${spec.quantity}，持有 ${have}`,
            required: { [spec.name]: spec.quantity },
            have: { [spec.name]: have }
          });
        }
        need.push({ itemId: resolved.item.id, quantity: spec.quantity });
      }
      character.spirit_stone -= spiritCost;
      for (const n of need) consumeMaterial(db, character.id, n.itemId, n.quantity);
    }

    const currentActive = (db.formations || []).find(
      f => f.character_id === character.id && f.active
    );
    if (currentActive) {
      currentActive.active = false;
      currentActive.activated_at = null;
      // 换阵时先把旧阵的加成撤掉，否则两阵加成会叠加（buffService 按 (value-1) 累加）
      const oldDef = FORMATION_TYPES.find(f => f.type === currentActive.type);
      if (oldDef) clearFormationBuffs(character.id, oldDef);
    }

    if (existing) {
      existing.active = true;
      existing.activated_at = Date.now();
    } else {
      const formation = {
        id: getNextId('formations'),
        character_id: character.id,
        name: formationDef.name,
        type: formationDef.type,
        bonus_attack: formationDef.bonus_attack,
        bonus_defense: formationDef.bonus_defense,
        bonus_speed: formationDef.bonus_speed,
        bonus_hp: formationDef.bonus_hp,
        bonus_exp: formationDef.bonus_exp,
        active: true,
        activated_at: Date.now()
      };
      if (!db.formations) db.formations = [];
      db.formations.push(formation);
    }

    // 轮111 效果端接线：把阵法加成写进 buffService（combat.js 的面板乘数真源）。
    // 旧版只把 bonus_* 存进 col_formations，而全项目没有任何消费端读它们 ——
    // 玩家激活阵法等于没激活。
    saveDatabase(db);          // 先落库，再写 buff（buff 走自己的 loadDatabase 通路）
    applyFormationBuffs(character.id, formationDef);

    // 阶段3：布置阵法积累阵法熟练度
    proficiencyService.addExp(character, 'formation', 3);

    saveDatabase(db);
    res.json({
      success: true,
      message: `${formationDef.name}已激活`,
      formation: formationDef,
      // 如实标注哪些加成真进了战斗面板，哪些还没有消费端（不假装生效）
      applied: {
        attack: Number(formationDef.bonus_attack) > 0,
        defense: Number(formationDef.bonus_defense) > 0,
        speed: Number(formationDef.bonus_speed) > 0,
        hp: false,
        exp: false
      },
      paid: isNewPlacement ? (formationDef.cost || { spiritStone: 0, materials: [] }) : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deactivate', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const active = (db.formations || []).find(
      f => f.character_id === character.id && f.active
    );

    if (!active) {
      return res.status(400).json({ error: '当前没有激活的阵法' });
    }

    active.active = false;
    active.activated_at = null;
    saveDatabase(db);

    // 轮111：撤阵必须同时撤掉 buff，否则"取消激活"后加成仍在（玩家可白嫖）
    const def = FORMATION_TYPES.find(f => f.type === active.type);
    if (def) clearFormationBuffs(character.id, def);

    res.json({ success: true, message: `${active.name}已取消激活` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
