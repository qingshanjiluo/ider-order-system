/**
 * 经济服务（阶段6 · 原始设定 10 · 决议 Q8）
 *
 * 四级灵石（基准单位 = 下品）：
 *   下品 ×1 → 中品 ×1000 → 上品 ×100万 → 极品 ×10亿（上界灵石 1:1兆=10^12）
 * 双向兑换手续费 2%（决议 Q8）。
 * character.spirit_stone 恒为下品基准整数（全部既有系统零改动），高品级为兑换/携带形态。
 */
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const store = require('../db/store');

const TIERS = {
  lower: { name: '下品', factor: 1 },
  middle: { name: '中品', factor: 1000 },
  upper: { name: '上品', factor: 1000000 },
  extreme: { name: '极品', factor: 1000000000 }
};

const EXCHANGE_FEE = 0.02;

/** 下品基准 → 品级数量（向下取整） */
function baseToTier(base, tier) {
  const t = TIERS[tier];
  if (!t) throw new Error(`未知品级: ${tier}`);
  return Math.floor(base / t.factor);
}

/** 品级数量 → 下品基准 */
function tierToBase(amount, tier) {
  const t = TIERS[tier];
  if (!t) throw new Error(`未知品级: ${tier}`);
  return Math.floor(amount) * t.factor;
}

/** 万/亿/兆 层级显示（原始设定 12 面板规范） */
function formatBase(base) {
  const n = Math.floor(base || 0);
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}兆`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return `${n}`;
}

function wallet(character) {
  const base = character.spirit_stone || 0;
  return {
    base,
    display: formatBase(base),
    tiers: Object.fromEntries(Object.entries(TIERS).map(([k, t]) => [k, { name: t.name, count: baseToTier(base, k), factor: t.factor }])),
    jade: character.jade || 0,
    exchangeFee: EXCHANGE_FEE
  };
}

/**
 * 双向兑换（2% 手续费，决议 Q8）。
 * fromTier/toTier ∈ TIERS；amount 为 fromTier 数量。
 */
function exchange(character, fromTier, toTier, amount) {
  const from = TIERS[fromTier];
  const to = TIERS[toTier];
  if (!from || !to) return { ok: false, error: '品级无效' };
  if (fromTier === toTier) return { ok: false, error: '兑换品级相同' };
  const amt = Math.floor(Number(amount));
  if (!(amt > 0)) return { ok: false, error: '数额无效' };

  // 统一换到基准
  const baseIn = tierToBase(amt, fromTier);
  const walletBase = character.spirit_stone || 0;
  // 持有校验：当前持有品级折算（用全额基准近似——角色恒持下品基准）
  if (walletBase < baseIn) return { ok: false, error: '灵石不足' };

  const feeBase = Math.ceil(baseIn * EXCHANGE_FEE);
  const outBase = baseIn - feeBase;
  // 目标品级整数化（余数留在下品）
  const outTierCount = baseToTier(outBase, toTier);
  const remainder = outBase - tierToBase(outTierCount, toTier);
  const finalBase = tierToBase(outTierCount, toTier) + remainder;

  character.spirit_stone = walletBase - baseIn + finalBase;
  return {
    ok: true,
    spent: { tier: fromTier, count: amt, base: baseIn },
    fee: { base: feeBase, display: formatBase(feeBase) },
    received: { tier: toTier, count: outTierCount, display: formatBase(finalBase) },
    balance: character.spirit_stone,
    balanceDisplay: formatBase(character.spirit_stone)
  };
}

// ---------- 特殊灵石（6 种，原始设定 10） ----------
const SPECIAL_STONES = [
  { name: '血石',     implementable: true,  effect: 'use:降低修炼效率24h', desc: '魔教特殊物质，使用后修炼效率下降' },
  { name: '太极石',   implementable: false, effect: '阴阳双属性（待洞府阵法联动）', desc: '蕴含阴阳二气' },
  { name: '上界灵石', implementable: true,  effect: 'use:巨额灵气+渡劫难度标记', desc: '上界掉落，1:1兆下品，有概率增加渡劫难度' },
  { name: '人造灵石', implementable: false, effect: '机巧门阵法储灵法器（待炼器联动）', desc: '存储灵力的阵法法器' },
  { name: '造化灵石', implementable: true,  effect: 'use:随机机缘（功法/物品/灵石）', desc: '副本/野外小概率获取' },
  { name: '五行灵石', implementable: true,  effect: 'use:3-5灵根修炼增益；1-2灵根反噬', desc: '五行俱全，1-2灵根者使用暴毙' }
];

const WUXING_STONE_BUFF_HOURS = 24;

/** 使用特殊灵石（背包中持有） */
function useSpecialStone(character, stoneName) {
  const db = loadDatabase();
  const def = SPECIAL_STONES.find(s => s.name === stoneName);
  if (!def) return { ok: false, error: '未知特殊灵石' };
  if (!def.implementable) return { ok: false, error: `${stoneName} 尚未开放使用（${def.effect}）` };

  const inv = db.inventory.find(i => i.character_id === character.id && (db.items.find(it => it.id === i.item_id) || {}).name === stoneName);
  if (!inv) return { ok: false, error: `背包中没有 ${stoneName}` };

  // 消耗一颗
  inv.quantity = (inv.quantity || 1) - 1;
  if (inv.quantity <= 0) db.inventory.splice(db.inventory.indexOf(inv), 1);

  const result = { ok: true, stone: stoneName };

  if (stoneName === '血石') {
    const buffService = require('./buff');
    buffService.addBuff(character.id, 'exp', 0.7, WUXING_STONE_BUFF_HOURS * 3600 * 1000); // 修炼效率-30%
    result.effect = '修炼效率 -30%（24游戏小时）';
  } else if (stoneName === '五行灵石') {
    const roots = (character.spirit_roots || []).filter(r => !r.special);
    if (roots.length < 3) {
      // 暴毙→重伤反噬（对玩家更友好的忠实改编）：伤势拉满 + 扣寿1%
      const injuryService = require('./injury');
      character.injury = 100;
      character.injury_status = '重伤';
      const heavy = injuryService.triggerHeavyInjury(character, 'nearDeath');
      result.effect = `灵根不足反噬！重伤（寿元折损 ${Math.round(heavy.lostYears)} 年）`;
      result.died = heavy.died;
    } else {
      const buffService = require('./buff');
      buffService.addBuff(character.id, 'exp', 1.3, WUXING_STONE_BUFF_HOURS * 3600 * 1000);
      result.effect = `修炼效率 +30%（${roots.length} 灵根共鸣，${WUXING_STONE_BUFF_HOURS}游戏小时）`;
    }
  } else if (stoneName === '上界灵石') {
    character.spirit_stone = (character.spirit_stone || 0) + 1e12; // 1:1兆下品
    character.tribulation_risk = (character.tribulation_risk || 0) + 1; // 渡劫难度标记
    result.effect = '获灵气 1兆下品；渡劫难度 +1（风险标记）';
  } else if (stoneName === '造化灵石') {
    const roll = Math.random();
    if (roll < 0.4) {
      const stones = Math.floor(1000 + Math.random() * 9000);
      character.spirit_stone += stones;
      result.effect = `机缘：灵石 ×${stones}`;
    } else if (roll < 0.8) {
      const pool = (db.items || []).filter(i => i.type === '材料' && i.quality !== '仙品');
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) {
        db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: pick.id, quantity: 1 });
        result.effect = `机缘：获得 ${pick.name}`;
      } else result.effect = '机缘落空';
    } else {
      const gongfaPool = (db.items || []).filter(i => i.type === '功法');
      const pick = gongfaPool[Math.floor(Math.random() * gongfaPool.length)];
      if (pick) {
        db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: pick.id, quantity: 1 });
        result.effect = `大机缘：功法「${pick.name}」`;
      } else result.effect = '机缘落空';
    }
  }

  saveDatabase(db);
  return result;
}

module.exports = {
  TIERS, EXCHANGE_FEE, SPECIAL_STONES,
  baseToTier, tierToBase, formatBase, wallet, exchange, useSpecialStone
};
