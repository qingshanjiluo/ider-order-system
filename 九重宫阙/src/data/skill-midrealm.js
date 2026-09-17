/**
 * 技能库扩充（轮110）：补 **金丹期 / 元婴期** 的中段空洞。
 *
 * ## 为什么需要这个文件
 *
 * 轮110 审计发现的**境界空洞**（不是"总数不够"，是分布断层）：
 *
 *   境界      技能总数   玩家真能触达
 *   炼气期      100         100
 *   筑基期       85          84
 *   金丹期       11           3   ← 洞
 *   元婴期       10           5   ← 洞
 *   化神期       24          16
 *   （炼虚~飞升由 skill-highrealm.js 覆盖，各 15~22 条）
 *
 * 两个既有扩展段各自只覆盖一端：`skill-expansion` 做 炼气(66)+筑基(56)，
 * `skill-highrealm` 做 化神~飞升；**金丹与元婴中间这段没人做**。
 * 结果玩家从 Lv21 到 Lv40（两个大境界、游戏中期最长的成长段）几乎无技可学 ——
 * 主文件里金丹/元婴仅有的 21 条全是天阶/仙阶/圣阶的隐藏技或任务技（带前置链），
 * 普通玩家触达率 27% 与 50%，而炼气期是 100%。
 *
 * ## 口径（与既有扩展段保持一致，便于统一审计）
 *
 * - 确定性组合生成（无随机），命名来自词库拼接，同一 id 永远同名
 * - 七系各出主动技 + 无系功能技，槽位 main/sub/ultimate 分明
 * - 前置链只指向**本文件或更早境界**的技能（禁死锁门 —— 参见 r98 的教训）
 * - source 只用玩家真能触达的途径（不写 hidden，hidden 是给主文件顶级技的）
 * - required_realm 沿用"金丹期/元婴期"口径（与 realms 表只差"期"后缀，既有约定）
 */
const REALM_JINDAN = '金丹期';
const REALM_YUANYING = '元婴期';

/** 境界内的品质阶梯：金丹 = 玄→地→天，元婴 = 地→天→圣 */
const LADDER = {
  [REALM_JINDAN]: [
    { quality: '玄阶', rarity: 'uncommon', rarityW: 1.00, mana: 45, mult: 2.4, cd: 2, cost: [420, 160], maxLevel: 10 },
    { quality: '地阶', rarity: 'rare', rarityW: 1.55, mana: 70, mult: 3.6, cd: 3, cost: [900, 340], maxLevel: 10 },
    { quality: '天阶', rarity: 'epic', rarityW: 2.45, mana: 105, mult: 5.2, cd: 4, cost: [1900, 700], maxLevel: 5 }
  ],
  [REALM_YUANYING]: [
    { quality: '地阶', rarity: 'rare', rarityW: 1.55, mana: 85, mult: 4.2, cd: 3, cost: [1100, 400], maxLevel: 10 },
    { quality: '天阶', rarity: 'epic', rarityW: 2.45, mana: 125, mult: 6.0, cd: 4, cost: [2300, 850], maxLevel: 5 },
    { quality: '圣阶', rarity: 'legendary', rarityW: 3.60, mana: 175, mult: 8.2, cd: 5, cost: [4200, 1500], maxLevel: 5 }
  ]
};

/**
 * 七系词库。与 skill-expansion.js 的取名方式一致（前缀+核心字），但**词面不重复**：
 * 既有文件用「庚金/锐金…」「青藤/古木…」，这里换一批，避免出现两个同名技能。
 */
const ELEMENT_POOLS = {
  metal: {
    cname: '金',
    prefix: ['白虹', '斩铁', '金煞', '霜刃', '罡锋', '破军', '镔铁', '锐芒'],
    core: '斩 刺 破 鸣 裂 击 锋 灭'.split(' '),
    effects: [
      '无视目标 18% 防御',
      '命中后破甲 2 回合，目标防御 -20%',
      '暴击率 +15%，暴击伤害 +30%',
      '连击两次，每次 70% 伤害',
      '对护盾类目标伤害提升 60%'
    ]
  },
  wood: {
    cname: '木',
    prefix: ['苍梧', '碧落', '藤杀', '木魅', '荣枯', '青囊', '棘心', '木灵'],
    core: '缠 缚 生 噬 卷 刺 荣 缚'.split(' '),
    effects: [
      '命中后吸取目标 12% 生命',
      '缠绕目标 2 回合，速度 -25%',
      '每回合回复自身 5% 生命，持续 3 回合',
      '寄生之毒，2 回合持续伤害',
      '对全体造成 65% 伤害并各吸 5% 生命'
    ]
  },
  water: {
    cname: '水',
    prefix: ['玄溟', '寒漪', '碧海', '霜涛', '沧浪', '凛冬', '水镜', '潮汐'],
    core: '涛 冻 涌 盾 斩 噬 封 澜'.split(' '),
    effects: [
      '冻结目标 1 回合（40% 概率）',
      '水幕护体，吸收本次伤害 50%',
      '目标速度 -30%，持续 2 回合',
      '寒气入体，目标攻击 -18%',
      '对灼烧中的目标伤害提升 70%'
    ]
  },
  fire: {
    cname: '火',
    prefix: ['朱雀', '燎原', '赤霄', '炎狱', '焚寂', '流火', '丹曦', '燚焱'],
    core: '焚 爆 灼 轰 冲 燎 焰 烬'.split(' '),
    effects: [
      '灼烧 3 回合，每回合 45% 伤害',
      '爆炸波及相邻目标 60% 伤害',
      '燃烧自身 6% 生命换取 2.2 倍威力',
      '敌方人数越多伤害越高（每多 1 人 +12%）',
      '对寒冰护盾造成 3 倍伤害'
    ]
  },
  earth: {
    cname: '土',
    prefix: ['昆吾', '崚嶒', '黄泉', '磐岳', '坤元', '厚载', '裂地', '山鬼'],
    core: '崩 压 岳 盾 震 封 裂 镇'.split(' '),
    effects: [
      '落石镇压，目标眩晕 1 回合（40% 概率）',
      '大地护盾，免疫下一次攻击',
      '沙尘蔽目，目标命中 -20%',
      '地刺突起，对全体造成 70% 伤害',
      '自身防御 +35%，持续 3 回合'
    ]
  },
  light: {
    cname: '光',
    prefix: ['曦光', '太清', '明夷', '净世', '皓月', '慈航', '光明', '曜灵'],
    core: '照 沐 盾 净 弹 环 破 辉'.split(' '),
    effects: [
      '净化自身全部负面状态并回复 12% 生命',
      '圣光护体，3 回合内减伤 25%',
      '对黑暗系目标伤害提升 65%',
      '辉光震荡，对全体造成 60% 伤害',
      '复活自身一次（本场战斗限一次，回复 30% 生命）'
    ]
  },
  dark: {
    cname: '暗',
    prefix: ['幽都', '殁影', '冥蚀', '夜哭', '黒渊', '蚀骨', '厉鬼', '暗潮'],
    core: '噬 袭 蚀 沉 爪 罩 缚 刺'.split(' '),
    effects: [
      '吸取伤害的 35% 化为自身生命',
      '暗影侵蚀，目标防御 -20%',
      '恐惧凝视，目标 25% 概率无法行动',
      '暗影潜伏，下回合伤害翻倍',
      '斩杀：目标生命低于 25% 时伤害 +120%'
    ]
  }
};

/** 无系功能技（同 skill-expansion 的 NONE_UTILITY 风格，但词面全新） */
// effect_type 必须落在**战斗真的认识**的那一套里（轮110 门禁抓到：初版写了
// control/cleanse/summon 三种，combat 里没有对应分支 —— 玩家学到会是"文案说有、
// 打起来没有"。既有词表见 test-content 的断言与 combat 的 switch）。
const NONE_UTILITY = [
  ['meridian_open', '通脉诀', '立即回复 40% 灵力', 'heal'],
  ['iron_body', '铁骨功', '受到伤害降低 25%，持续 3 回合', 'shield'],
  ['wind_ride', '御风诀', '速度 +50%，持续 3 回合', 'buff'],
  ['soul_lock', '锁魂印', '命中后目标定身 1 回合（45% 概率）', 'stun'],
  ['blood_sacrifice', '血祭法', '消耗 15% 生命，下次伤害 +80%', 'buff'],
  ['clear_mind', '明心咒', '驱散自身负面状态并回复 12% 生命', 'heal'],
  ['mirror_image', '镜像术', '制造镜像，闪避下一次攻击并反击 120%', 'dodge'],
  ['spirit_return', '归元术', '吸取目标 25% 灵力转为己用', 'drain'],
  ['beast_call', '御兽令', '借灵兽之力，本回合攻击附带额外 60% 伤害', 'damage'],
  ['formation_eye', '阵眼术', '以身为阵眼，本回合减伤 20% 并反伤', 'thorns']
];

/** 玩家真能触达的获取途径（不含 hidden —— 那是主文件顶级技用的） */
const SOURCES = ['sect', 'dungeon', 'quest', 'guild', 'inheritance', 'fortune', 'shop'];

function buildSkills() {
  const out = [];

  for (const realm of [REALM_JINDAN, REALM_YUANYING]) {
    const ladder = LADDER[realm];
    const realmTag = realm === REALM_JINDAN ? 'jd' : 'yy';

    for (const [element, pool] of Object.entries(ELEMENT_POOLS)) {
      // 前置链：同系本境界内的阶位首条
      const tierFirstIds = [];

      ladder.forEach((tier, ti) => {
        // **每系每阶只出 1 条**（轮110 修正配额）。
        //
        // 初版每阶出 2 条（main+sub）+ 1 终极 = 每境界 7×7 = 49 条，实测可触达 58，
        // 而既有库的配额是「化神以上每境界 15~22 条」（skill-highrealm 的设计值）。
        // 于是新出现的断崖是**元婴(58) → 化神(16)**：我不是补洞，是造了新的不平衡。
        // 补内容的正确姿势是**对齐既有配额**，而不是让中段比后段富 4 倍。
        // 现在每境界 7 系×3 阶 + 7 终极 + 无系 ≈ 24 条，与化神期 16 条同量级。
        const idx = ti;
        const id = `mid_${realmTag}_${element}_${ti}_1`;
        const name = `${pool.prefix[idx % pool.prefix.length]}${pool.core[idx % pool.core.length]}`;
        const finalName = `${name}·${tier.quality}`;

        out.push({
          id,
          name: finalName,
          element,
          type: 'active',
          slot: ti === 0 ? 'sub' : 'main',   // 低阶做副技、高阶做主技，槽位两种都有得选
          quality: tier.quality,
          rarity: tier.rarity,
          mana_cost: tier.mana + idx * 6,
          cooldown: tier.cd,
          damage_mult: Number((tier.mult + idx * 0.5).toFixed(2)),
          effect: pool.effects[idx % pool.effects.length],
          effect_type: 'damage',
          effect_value: Number((0.12 + ti * 0.10).toFixed(2)),
          source: SOURCES[(ti * 3 + element.length) % SOURCES.length],
          learn_cost: tier.cost[0] + idx * 120,
          upgrade_cost: tier.cost[1],
          max_level: tier.maxLevel,
          required_realm: realm,
          // 同系内本阶首条作下一阶的前置（跨阶可达，禁死锁）
          prerequisites: ti > 0 ? [tierFirstIds[ti - 1]] : [],
          is_hidden: false,
          expanded: true,
          midrealm: true
        });
        tierFirstIds[ti] = id;
      });

      // 每系一条终极技：金丹用天阶、元婴用圣阶，前置=该系本境界末阶首条
      //
      // damage_mult 硬上限 10（轮110 门禁抓到）：既有库的战力天花板是
      // primordial_chaos（仙阶化神）的 10.0，初版这里按 lastTier.mult × 1.8 算，
      // 元婴圣阶会到 14.76 —— **补内容不得悄悄抬高战力天花板**。
      // 改为按阶位直接给定值，元婴终极技封在 10.0（与既有天花板齐平，不超）。
      const ULT_MULT = realm === REALM_YUANYING ? 10.0 : 9.0;
      const lastTier = ladder[ladder.length - 1];
      const ultId = `mid_${realmTag}_${element}_ult`;
      out.push({
        id: ultId,
        name: `${pool.prefix[0]}${pool.core[0]}·${lastTier.quality}极`,
        element,
        type: 'active',
        slot: 'ultimate',
        quality: lastTier.quality,
        rarity: lastTier.rarity,
        mana_cost: lastTier.mana + 60,
        cooldown: lastTier.cd + 3,
        damage_mult: ULT_MULT,
        effect: pool.effects[pool.effects.length - 1],
        effect_type: 'damage',
        effect_value: Number((0.35 + (realm === REALM_YUANYING ? 0.15 : 0)).toFixed(2)),
        source: 'quest',
        learn_cost: lastTier.cost[0] * 2,
        upgrade_cost: lastTier.cost[1] * 2,
        max_level: 5,
        required_realm: realm,
        prerequisites: [tierFirstIds[ladder.length - 1]],
        is_hidden: false,
        expanded: true,
        midrealm: true
      });
    }
  }

  // 无系功能技：金丹 4 条 + 元婴 3 条（与既有库的"无系"配额同量级，
  // skill-highrealm 每境界给 2 条无系功能技）
  NONE_UTILITY.slice(0, 7).forEach(([baseId, baseName, effect, effectType], i) => {
    const realm = i < 4 ? REALM_JINDAN : REALM_YUANYING;
    const realmTag = realm === REALM_JINDAN ? 'jd' : 'yy';
    const isHigh = i >= 4;
    out.push({
      id: `mid_${realmTag}_${baseId}`,
      name: baseName,
      element: 'none',
      type: 'active',
      slot: 'sub',
      quality: isHigh ? '天阶' : (i < 3 ? '玄阶' : '地阶'),
      rarity: isHigh ? 'epic' : (i < 3 ? 'uncommon' : 'rare'),
      mana_cost: 40 + i * 8,
      cooldown: 4,
      damage_mult: 0,
      effect,
      effect_type: effectType,
      effect_value: 0.25,
      source: i % 3 === 0 ? 'shop' : (i % 3 === 1 ? 'guild' : 'quest'),
      learn_cost: 600 + i * 180,
      upgrade_cost: 260,
      max_level: 5,
      required_realm: realm,
      prerequisites: [],
      is_hidden: false,
      expanded: true,
      midrealm: true
    });
  });

  return out;
}

module.exports = { buildSkills };
