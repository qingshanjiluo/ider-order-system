/**
 * 高阶技能库（P1 技能差口 214 -> 320；轮47）
 *
 * 为什么全押在"化神期以上"：实测原 214 门的 required_realm 分布是
 *   炼气期 100 / 筑基期 85 / 金丹期 11 / 元婴期 10 / 化神期 8 / 炼虚~飞升 **0**
 * —— 角色一旦过了化神就没有一门新技能可学，后面五个大境界是空的。
 * 补数量如果还堆在炼气/筑基，等于往已经不饿的口袋里塞馒头。
 *
 * 可达性口径（与 scripts/ref-integrity.js 的技能边一致，别改回去）：
 *   一条技能"拿得到" = 非隐藏 且 required_realm 落在 balance.REALM_ORDER 内 且 前置链可满足。
 *   三条都是硬闸：GET /api/skill/all 只列非隐藏、learnSkill 卡境界与前置。本文件一律 is_hidden:false，
 *   且每条的前置要么为空、要么指向确定存在且同样可学的技能。source 只是风味标签（sect/dungeon 之类
 *   池子并没有发放代码），真正兜住可达性的是"列表 + /learn"这条通用路径。
 *
 * **效果类型只用战斗状态机真正实现的那几种**（src/services/battle/skillState.js 的 IMPLEMENTED）：
 *   damage（纯倍率伤害）/ dot（3 回合持续伤害）/ heal（按自身生命上限回复）/
 *   drain 与 lifesteal（把本次伤害按比例转成**生命**，不是灵力）。
 *   aoe/buff/debuff/shield/stun/crit/thorns 目前登记在 NEEDS_MULTI_TARGET 里（1v1 模型不伪造效果），
 *   所以这里不再写"冻结/护盾/全体"这类做不到的文案 —— 上一条门禁正是被这个抓的：
 *   第一版把 106 门里 61 门压在了未实现类型上，全局"已实现效果占比"从 66.8% 掉到 54.1% 而被打红。
 *   同理：本文件**不做 passive 技能**，因为 combat 明确"被动除外"，被动等于零消费。
 *
 * 数值边界（量过的，不是拍的）：原 214 门 damage_mult 上限是 **10**（混沌初开/仙阶），
 * 新 106 门压在 **7.2** 以下 —— 补内容不抬高战力天花板。learn_cost 上限 176000 灵石（原库 54000），
 * 高于仙阶功法 150000 一档，只当飞升期的灵石沉淀口；新号 100 灵石差三个数量级，不影响早期可达性。
 * mana_cost ≤ 300、cooldown ≤ 8；品质只用 天阶/圣阶/仙阶（真源 = skill.QUALITY_ORDER 六级阶梯）。
 *
 * 命名：元素前缀按境界取不同词（42 个前缀横竖都不重复）+ 槽位词，构造上保证与原库和本文件都不重名；
 * 这一点由 test-content 的"技能名/id 唯一"锁兜底，撞名会直接把门禁打红而不是悄悄覆盖。
 */

const REALMS = [
  { realm: '化神期', quality: '天阶', rarity: 'epic', cost: 3000, up: 1100, mana: 70, cd: 3, mult: 3.2, maxLevel: 6 },
  { realm: '炼虚期', quality: '圣阶', rarity: 'legendary', cost: 8000, up: 2600, mana: 95, cd: 3, mult: 4.0, maxLevel: 6 },
  { realm: '合体期', quality: '圣阶', rarity: 'legendary', cost: 16000, up: 5000, mana: 120, cd: 4, mult: 4.6, maxLevel: 5 },
  { realm: '大乘期', quality: '仙阶', rarity: 'legendary', cost: 32000, up: 9000, mana: 150, cd: 4, mult: 5.2, maxLevel: 5 },
  { realm: '渡劫期', quality: '仙阶', rarity: 'legendary', cost: 54000, up: 14000, mana: 190, cd: 5, mult: 5.8, maxLevel: 4 },
  { realm: '飞升期', quality: '仙阶', rarity: 'legendary', cost: 88000, up: 20000, mana: 230, cd: 6, mult: 6.4, maxLevel: 3 }
];

// 每系 6 个境界各一个前缀：横向（同境界不同系）与纵向（同系不同境界）都不重词
const PREFIXES = {
  fire: ['炎劫', '九炎', '灭世炎', '涅槃炎', '天诛炎', '仙炎'],
  water: ['寒潮', '重水', '幽溟', '沧溟', '天霖', '仙霖'],
  earth: ['岳镇', '地脉', '山魂', '坤元', '天柱', '仙岳'],
  metal: ['庚精', '白虹', '剑鸣', '太白', '天罡', '仙金'],
  wood: ['苍梧', '青霖', '若木', '建木', '天藤', '仙萝'],
  dark: ['幽冥', '夜殁', '噬天', '归墟', '天晦', '仙冥'],
  light: ['昭明', '净世', '晖曜', '天光', '圣曜', '仙晖']
};

const MAIN_CORES = ['燎原', '裂空', '碎岳', '穿云', '决堤', '崩星', '贯日', '坠月', '破阵', '摧城'];
const SUB_CORES = ['护体', '凝罡', '附骨', '缠身', '洗髓', '藏锋', '映雪', '流金', '盘根', '涤尘'];

// 效果池：type 必须在 skillState.IMPLEMENTED 内，文案严格对应状态机的真实行为
const MAIN_EFFECTS = [
  { effect_type: 'damage', text: (v) => `无视护体罡气，直接以${Math.round(v * 100)}%的威力重创目标` },
  { effect_type: 'dot', text: (v) => `命中后伤口溃散，3 回合内持续损失生命` },
  { effect_type: 'drain', text: (v) => `将本次伤害的${Math.round(v * 100)}%转化为自身生命` },
  { effect_type: 'lifesteal', text: (v) => `嗜血一击，把${Math.round(v * 100)}%的伤害汲回自身生命` }
];
const SUB_EFFECTS = [
  { effect_type: 'heal', text: (v) => `运功疗伤，回复自身${Math.round(v * 100)}%最大生命` },
  { effect_type: 'drain', text: (v) => `将本次伤害的${Math.round(v * 100)}%转化为自身生命` },
  { effect_type: 'dot', text: (v) => `缠绕不散，令目标 3 回合内持续损失生命` },
  { effect_type: 'lifesteal', text: (v) => `嗜血反哺，把${Math.round(v * 100)}%的伤害汲回自身生命` }
];
// 比例取值区间（dot 的 perRound = 伤害×比例/3；heal 用 min(ratio,1)×生命上限）
const VALUE_RANGE = { damage: [0.15, 0.4], dot: [0.2, 0.45], drain: [0.12, 0.35], lifesteal: [0.12, 0.35], heal: [0.08, 0.28] };

// 主式偏"坊市/传承"，副式偏"宗门/ guild"，让技能书商店与宗门藏经两侧都有高阶货
const SOURCES_MAIN = ['shop', 'sect', 'shop', 'inheritance', 'shop', 'fortune'];
const SOURCES_SUB = ['guild', 'shop', 'guild', 'dungeon', 'shop', 'forge'];

function buildSkills() {
  const out = [];
  const els = Object.keys(PREFIXES);
  const idAt = (el, ri, slot) => `hr_${el}_${ri}_${slot}`;
  const valOf = (type, k) => {
    const r = VALUE_RANGE[type];
    return Number((r[0] + (r[1] - r[0]) * (k % 5) / 4).toFixed(2));
  };

  for (let ri = 0; ri < REALMS.length; ri++) {
    const R = REALMS[ri];
    for (let ei = 0; ei < els.length; ei++) {
      const el = els[ei];
      const pre = PREFIXES[el][ri];

      const mIdx = (ei + ri) % MAIN_EFFECTS.length;
      const mType = MAIN_EFFECTS[mIdx].effect_type;
      const mVal = valOf(mType, ei + ri);
      out.push({
        id: idAt(el, ri, 'a'), name: pre + MAIN_CORES[(ei * 2 + ri) % MAIN_CORES.length],
        element: el, type: 'active', slot: 'main', quality: R.quality, rarity: R.rarity,
        mana_cost: R.mana, cooldown: R.cd, damage_mult: Number(R.mult.toFixed(1)),
        effect: MAIN_EFFECTS[mIdx].text(mVal), effect_type: mType, effect_value: mVal,
        source: SOURCES_MAIN[(ei + ri) % SOURCES_MAIN.length],
        learn_cost: R.cost, upgrade_cost: R.up, max_level: R.maxLevel,
        required_realm: R.realm, prerequisites: ri > 0 ? [idAt(el, ri - 1, 'a')] : [], is_hidden: false
      });

      const sIdx = (ei + ri) % SUB_EFFECTS.length;
      const sType = SUB_EFFECTS[sIdx].effect_type;
      const sVal = valOf(sType, ei + ri + 2);
      out.push({
        id: idAt(el, ri, 'b'), name: pre + SUB_CORES[(ei * 2 + ri * 3) % SUB_CORES.length],
        element: el, type: 'active', slot: 'sub', quality: R.quality, rarity: R.rarity,
        mana_cost: Math.round(R.mana * 0.7), cooldown: Math.max(1, R.cd - 1), damage_mult: Number((R.mult * 0.45).toFixed(1)),
        effect: SUB_EFFECTS[sIdx].text(sVal), effect_type: sType, effect_value: sVal,
        source: SOURCES_SUB[(ei + ri) % SOURCES_SUB.length],
        learn_cost: Math.round(R.cost * 0.8), upgrade_cost: Math.round(R.up * 0.8), max_level: R.maxLevel,
        required_realm: R.realm,
        prerequisites: ri > 0 ? [idAt(el, ri - 1, 'b')] : [idAt(el, 0, 'a')], is_hidden: false
      });
    }
  }

  // 渡劫/飞升各 7 道禁式（ultimate 槽原库 17 条，高阶段一个都没有）
  for (let ri = 4; ri <= 5; ri++) {
    const R = REALMS[ri];
    for (let ei = 0; ei < els.length; ei++) {
      const el = els[ei];
      const v = valOf('lifesteal', ei + ri);
      out.push({
        id: idAt(el, ri, 'u'), name: PREFIXES[el][ri] + '·禁式',
        element: el, type: 'key', slot: 'ultimate', quality: R.quality, rarity: 'legendary',
        mana_cost: R.mana + 60, cooldown: R.cd + 2, damage_mult: Number((R.mult + 0.8).toFixed(1)),
        effect: `禁式既出，以${Math.round(v * 100)}%的伤害汲回自身生命`, effect_type: 'lifesteal', effect_value: v,
        source: 'inheritance', learn_cost: R.cost * 2, upgrade_cost: R.up * 2,
        max_level: ri === 5 ? 3 : 4, required_realm: R.realm,
        prerequisites: [idAt(el, ri, 'a'), idAt(el, ri, 'b')], is_hidden: false
      });
    }
  }

  // 无系 8 门：4 门生活向（skillState 的 NON_COMBAT 明确登记，不参与战斗）+ 4 门战斗向 sustain
  const PLAIN = [
    ['匠心通幽', 'forge', 'craft_amp', '锻造出高品质器材的概率提升', 0.25, '化神期', '天阶'],
    ['丹火映心', 'guild', 'alchemy_amp', '炼丹成功率与爆表率提升', 0.2, '化神期', '天阶'],
    ['万宝来朝', 'shop', 'discount', '坊市购入降价、出售提价', 0.15, '炼虚期', '圣阶'],
    ['草木有灵', 'dungeon', 'gather_amp', '采集产出与稀有材料几率提升', 0.3, '炼虚期', '圣阶'],
    ['龟息养真', 'fortune', 'heal', '运功养真，回复自身最大生命的24%', 0.24, '合体期', '圣阶'],
    ['金刚不坏', 'sect', 'lifesteal', '受击时反哺自身，把伤害的28%转为生命', 0.28, '大乘期', '仙阶'],
    ['清心涤虑', 'inheritance', 'dot', '一念清净，令目标 3 回合持续损失生命', 0.3, '渡劫期', '仙阶'],
    ['缩地成寸', 'fortune', 'drain', '身随念动，把伤害的30%转化为自身生命', 0.3, '飞升期', '仙阶']
  ];
  PLAIN.forEach((p, i) => {
    const combat = ['heal', 'lifesteal', 'dot', 'drain'].includes(p[2]);
    out.push({
      id: `hr_plain_${i}`, name: p[0], element: 'none', type: 'active', slot: 'sub',
      quality: p[6], rarity: 'legendary', mana_cost: combat ? 60 + i * 8 : 0, cooldown: combat ? 3 : 0,
      damage_mult: combat ? 1.2 : 0, effect: p[3], effect_type: p[2], effect_value: p[4],
      source: p[1], learn_cost: 2000 + i * 9000, upgrade_cost: 800 + i * 1600,
      max_level: 5, required_realm: p[5], prerequisites: [], is_hidden: false
    });
  });

  return out;
}

module.exports = { buildSkills, REALMS, PREFIXES };
