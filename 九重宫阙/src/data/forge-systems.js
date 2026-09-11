const QUALITY_MULTIPLIERS = {
  极品: 1.5,
  上品: 1.2,
  中品: 1.0,
  下品: 0.8,
};

const AFFIX_POOLS = {
  紫雷: { attack: 25, critRate: 0.05, desc: '雷电之力加持' },
  烈焰: { attack: 30, burn: 10, desc: '火焰灼烧之威' },
  寒冰: { defense: 30, slowRate: 0.15, desc: '寒冰护体之力' },
  玄风: { speed: 20, dodgeRate: 0.1, desc: '风行无踪之术' },
  厚土: { defense: 40, maxHp: 200, desc: '厚土承载之德' },
  幽暗: { critRate: 0.12, critDamage: 0.3, desc: '幽暗侵蚀之意' },
  神圣: { attack: 20, defense: 20, healBonus: 0.2, desc: '神圣护佑之恩' },
};

const NAME_PARTS = {
  weapon: {
    base: ['剑', '刀', '杖', '枪', '弓'],
    modifiers: ['清风', '破军', '绝影', '寒霜', '惊鸿', '流光', '幽冥', '天火', '玄冰', '龙吟'],
  },
  head: {
    base: ['盔', '冠', '兜'],
    modifiers: ['金刚', '天罡', '星辰', '日月', '玄武', '龙纹', '凤羽', '虎啸', '云纹', '玉清'],
  },
  body: {
    base: ['甲', '袍', '铠'],
    modifiers: ['锁子', '麒麟', '凤凰', '蛟龙', '天蚕', '玄铁', '紫金', '白玉', '玄冰', '烈焰'],
  },
  legs: {
    base: ['靴', '履', '踏'],
    modifiers: ['追风', '踏云', '飞天', '缩地', '凌波', '流云', '风行', '逐日', '破空', '神行'],
  },
  accessory: {
    base: ['戒', '佩', '环', '坠'],
    modifiers: ['灵犀', '通灵', '聚灵', '凝神', '化元', '归元', '乾坤', '太极', '阴阳', '混元'],
  },
};

const STYLE_MARKS = ['一文', '二文', '三文', '四文', '五文'];

const STYLE_MARK_BONUS = {
  一文: 0,
  二文: 0.1,
  三文: 0.2,
  四文: 0.3,
  五文: 0.5,
};

function generateEquipmentName(slot, quality, affixes) {
  const qualityPrefix = QUALITY_MULTIPLIERS[quality] ? quality : '中品';
  const style = affixes.styleMark || '三文';
  const slotParts = NAME_PARTS[slot] || NAME_PARTS.weapon;
  const baseWeapon = slotParts.base[Math.floor(Math.random() * slotParts.base.length)];
  const modifier = slotParts.modifiers[Math.floor(Math.random() * slotParts.modifiers.length)];
  const element = affixes.element || Object.keys(AFFIX_POOLS)[Math.floor(Math.random() * Object.keys(AFFIX_POOLS).length)];
  const name = `${qualityPrefix}${style}${element}${modifier}${baseWeapon}`;
  return name;
}

const BLUEPRINT_TYPES = ['weapon', 'chest', 'pill', 'formation', 'talisman'];

const BLUEPRINTS = {
  bp_001: {
    id: 'bp_001',
    name: '玄铁重剑图纸',
    type: 'weapon',
    rarity: '稀有',
    materials: { 玄铁矿: 10, 精铁: 5, 灵木: 3 },
    unlocked: false,
  },
  bp_002: {
    id: 'bp_002',
    name: '凤羽软甲图纸',
    type: 'chest',
    rarity: '稀有',
    materials: { 凤凰羽: 8, 天蚕丝: 6, 金丝线: 4 },
    unlocked: false,
  },
  bp_003: {
    id: 'bp_003',
    name: '筑基丹图纸',
    type: 'pill',
    rarity: '普通',
    materials: { 人参: 5, 灵芝: 3, 朱砂: 2 },
    unlocked: false,
  },
  bp_004: {
    id: 'bp_004',
    name: '九宫八卦阵图纸',
    type: 'formation',
    rarity: '传说',
    materials: { 阵盘: 1, 灵石: 20, 星辰砂: 5, 天机玉: 1 },
    unlocked: false,
  },
  bp_005: {
    id: 'bp_005',
    name: '雷符图纸',
    type: 'talisman',
    rarity: '精良',
    materials: { 黄纸: 10, 朱砂: 8, 雷击木: 3 },
    unlocked: false,
  },
  bp_006: {
    id: 'bp_006',
    name: '烈焰战刃图纸',
    type: 'weapon',
    rarity: '精良',
    materials: { 火灵石: 8, 赤铁矿: 12, 火蜥蜴血: 4 },
    unlocked: false,
  },
  bp_007: {
    id: 'bp_007',
    name: '冰心玉冠图纸',
    type: 'chest',
    rarity: '传说',
    materials: { 万年寒冰: 3, 天山雪莲: 5, 冰蚕丝: 8, 玄冰晶: 2 },
    unlocked: false,
  },
  bp_008: {
    id: 'bp_008',
    name: '培元丹图纸',
    type: 'pill',
    rarity: '精良',
    materials: { 千年灵芝: 3, 九转还魂草: 2, 龙血: 1 },
    unlocked: false,
  },
  bp_009: {
    id: 'bp_009',
    name: '五行遁阵图纸',
    type: 'formation',
    rarity: '稀有',
    materials: { 五行灵石: 15, 阵旗: 8, 混元珠: 1 },
    unlocked: false,
  },
  bp_010: {
    id: 'bp_010',
    name: '护身符图纸',
    type: 'talisman',
    rarity: '普通',
    materials: { 黄纸: 5, 桃木: 3, 灵泉水: 2 },
    unlocked: false,
  },
};

function checkBlueprintComplete(blueprintId, inventory) {
  const bp = BLUEPRINTS[blueprintId];
  if (!bp) return false;
  for (const [material, required] of Object.entries(bp.materials)) {
    if (!inventory[material] || inventory[material] < required) {
      return false;
    }
  }
  return true;
}

function unlockBlueprint(blueprintId, inventory) {
  const bp = BLUEPRINTS[blueprintId];
  if (!bp) return { success: false, message: '图纸不存在' };
  if (bp.unlocked) return { success: false, message: '图纸已解锁' };
  if (!checkBlueprintComplete(blueprintId, inventory)) {
    return { success: false, message: '材料不足' };
  }
  for (const [material, required] of Object.entries(bp.materials)) {
    inventory[material] -= required;
  }
  bp.unlocked = true;
  return { success: true, message: `${bp.name} 已解锁` };
}

const REFINE_LEVELS = [
  { name: '粗炼', successRate: 1.0, costMultiplier: 1.0, effectMultiplier: 1.0 },
  { name: '精炼', successRate: 0.85, costMultiplier: 1.5, effectMultiplier: 1.5 },
  { name: '极炼', successRate: 0.65, costMultiplier: 2.5, effectMultiplier: 2.2 },
  { name: '仙炼', successRate: 0.4, costMultiplier: 4.0, effectMultiplier: 3.5 },
  { name: '神炼', successRate: 0.2, costMultiplier: 7.0, effectMultiplier: 5.0 },
];

const PILLS = {
  pill_001: { name: '筑基丹', baseEffect: 50, currentLevel: 0, maxLevel: 4 },
  pill_002: { name: '培元丹', baseEffect: 80, currentLevel: 0, maxLevel: 4 },
  pill_003: { name: '回气丹', baseEffect: 30, currentLevel: 0, maxLevel: 4 },
  pill_004: { name: '洗髓丹', baseEffect: 120, currentLevel: 0, maxLevel: 4 },
  pill_005: { name: '破境丹', baseEffect: 200, currentLevel: 0, maxLevel: 4 },
};

function refinePill(pillId, currentLevel) {
  const pill = PILLS[pillId];
  if (!pill) return { success: false, message: '丹药不存在' };
  const nextLevel = currentLevel + 1;
  if (nextLevel >= REFINE_LEVELS.length) {
    return { success: false, message: '已达最高精炼等级' };
  }
  const refineData = REFINE_LEVELS[nextLevel];
  const roll = Math.random();
  const success = roll < refineData.successRate;
  if (success) {
    pill.currentLevel = nextLevel;
    const newEffect = Math.floor(pill.baseEffect * refineData.effectMultiplier);
    return {
      success: true,
      message: `精炼成功！${REFINE_LEVELS[nextLevel].name}完成`,
      newLevel: nextLevel,
      newEffect,
      costMultiplier: refineData.costMultiplier,
    };
  }
  return {
    success: false,
    message: `精炼失败！${pill.name}保持当前品质`,
    currentLevel,
    loseChance: 0.2,
  };
}

const LEGENDARY_EQUIPMENT = [
  {
    id: 'leg_001',
    name: '天问剑',
    slot: 'weapon',
    quality: '仙阶',
    realm: '化神期',
    stats: { attack: 500, critRate: 0.2, critDamage: 0.8, speed: 50 },
    description: '传说中上古仙人遗留之剑，蕴含天地至理',
    blueprintRequired: true,
    affixes: ['紫雷', '神圣'],
  },
  {
    id: 'leg_002',
    name: '焚天刀',
    slot: 'weapon',
    quality: '仙阶',
    realm: '化神期',
    stats: { attack: 550, burn: 50, critDamage: 0.6, maxHp: 300 },
    description: '以九天玄火锻造，刀锋过处焚尽万物',
    blueprintRequired: true,
    affixes: ['烈焰', '幽暗'],
  },
  {
    id: 'leg_003',
    name: '寒渊杖',
    slot: 'weapon',
    quality: '仙阶',
    realm: '化神期',
    stats: { attack: 450, slowRate: 0.3, defense: 80, maxMp: 500 },
    description: '以万年寒冰为芯，冰封千里之威',
    blueprintRequired: true,
    affixes: ['寒冰', '厚土'],
  },
  {
    id: 'leg_004',
    name: '龙鳞铠',
    slot: 'body',
    quality: '仙阶',
    realm: '化神期',
    stats: { defense: 400, maxHp: 1000, damageReduction: 0.15, regen: 20 },
    description: '以真龙鳞片编织，万法不侵',
    blueprintRequired: true,
    affixes: ['厚土', '神圣'],
  },
  {
    id: 'leg_005',
    name: '凤羽霓裳',
    slot: 'body',
    quality: '仙阶',
    realm: '化神期',
    stats: { defense: 350, speed: 80, dodgeRate: 0.2, regen: 30 },
    description: '凤凰涅槃之羽所织，轻若无物却坚不可摧',
    blueprintRequired: true,
    affixes: ['玄风', '烈焰'],
  },
  {
    id: 'leg_006',
    name: '天罡冠',
    slot: 'head',
    quality: '仙阶',
    realm: '化神期',
    stats: { defense: 200, maxMp: 800, mpRegen: 15, allResist: 0.1 },
    description: '汇聚星辰之力，护持神魂不灭',
    blueprintRequired: true,
    affixes: ['紫雷', '玄风'],
  },
  {
    id: 'leg_007',
    name: '玄武重盔',
    slot: 'head',
    quality: '仙阶',
    realm: '化神期',
    stats: { defense: 300, maxHp: 600, damageReduction: 0.1, critResist: 0.15 },
    description: '玄武神兽之力凝聚，固若金汤',
    blueprintRequired: true,
    affixes: ['厚土', '寒冰'],
  },
  {
    id: 'leg_008',
    name: '追风神靴',
    slot: 'legs',
    quality: '仙阶',
    realm: '化神期',
    stats: { speed: 200, dodgeRate: 0.25, attackSpeed: 0.2, escapeRate: 0.3 },
    description: '穿上即可日行万里，追风逐电',
    blueprintRequired: false,
    affixes: ['玄风', '紫雷'],
  },
  {
    id: 'leg_009',
    name: '乾坤戒',
    slot: 'accessory',
    quality: '仙阶',
    realm: '化神期',
    stats: { maxHp: 500, maxMp: 500, allResist: 0.15, storageBonus: 50 },
    description: '内含乾坤世界，可纳万物',
    blueprintRequired: true,
    affixes: ['神圣', '厚土'],
  },
  {
    id: 'leg_010',
    name: '灵犀佩',
    slot: 'accessory',
    quality: '仙阶',
    realm: '化神期',
    stats: { attack: 100, defense: 100, speed: 100, critRate: 0.15 },
    description: '心有灵犀，万物共鸣',
    blueprintRequired: false,
    affixes: ['紫雷', '幽暗'],
  },
  {
    id: 'leg_011',
    name: '苍穹弓',
    slot: 'weapon',
    quality: '仙阶',
    realm: '大乘期',
    stats: { attack: 600, critRate: 0.25, range: 200, critDamage: 1.0 },
    description: '射落星辰之弓，箭出如流星',
    blueprintRequired: true,
    affixes: ['玄风', '紫雷'],
  },
  {
    id: 'leg_012',
    name: '幽冥刺',
    slot: 'weapon',
    quality: '仙阶',
    realm: '大乘期',
    stats: { attack: 480, critRate: 0.35, critDamage: 1.2, dodgeRate: 0.15 },
    description: '暗影中的致命一击，无声无息',
    blueprintRequired: true,
    affixes: ['幽暗', '紫雷'],
  },
  {
    id: 'leg_013',
    name: '不灭金身甲',
    slot: 'body',
    quality: '仙阶',
    realm: '大乘期',
    stats: { defense: 600, maxHp: 2000, damageReduction: 0.2, regen: 50 },
    description: '金刚不坏之身，万劫不灭',
    blueprintRequired: true,
    affixes: ['厚土', '神圣'],
  },
  {
    id: 'leg_014',
    name: '星辰冠',
    slot: 'head',
    quality: '仙阶',
    realm: '大乘期',
    stats: { defense: 350, maxMp: 1500, mpRegen: 30, skillDamage: 0.2 },
    description: '星辰之力灌顶，神通大增',
    blueprintRequired: true,
    affixes: ['紫雷', '神圣'],
  },
  {
    id: 'leg_015',
    name: '虚空靴',
    slot: 'legs',
    quality: '仙阶',
    realm: '大乘期',
    stats: { speed: 350, dodgeRate: 0.3, spaceWalk: true, attackSpeed: 0.3 },
    description: '踏破虚空，瞬息万里',
    blueprintRequired: true,
    affixes: ['玄风', '幽暗'],
  },
  {
    id: 'leg_016',
    name: '造化玉碟',
    slot: 'accessory',
    quality: '仙阶',
    realm: '大乘期',
    stats: { allStats: 150, expBonus: 0.3, dropRate: 0.2, luck: 50 },
    description: '天地造化所生，可窥天道玄机',
    blueprintRequired: true,
    affixes: ['神圣', '玄风'],
  },
  {
    id: 'leg_017',
    name: '诛仙剑',
    slot: 'weapon',
    quality: '神阶',
    realm: '渡劫期',
    stats: { attack: 1000, critRate: 0.4, critDamage: 2.0, armorPen: 0.3 },
    description: '上古诛仙四剑之一，可斩仙灭神',
    blueprintRequired: true,
    affixes: ['紫雷', '烈焰', '神圣'],
  },
  {
    id: 'leg_018',
    name: '混沌钟',
    slot: 'accessory',
    quality: '神阶',
    realm: '渡劫期',
    stats: { defense: 500, maxHp: 5000, damageReduction: 0.3, invincibleChance: 0.05 },
    description: '混沌至宝，钟声一响天地震荡',
    blueprintRequired: true,
    affixes: ['厚土', '幽暗', '神圣'],
  },
  {
    id: 'leg_019',
    name: '盘古幡',
    slot: 'weapon',
    quality: '神阶',
    realm: '渡劫期',
    stats: { attack: 1200, allStats: 200, armorPen: 0.4, critDamage: 2.5 },
    description: '开天辟地之神器，威力无穷',
    blueprintRequired: true,
    affixes: ['烈焰', '寒冰', '紫雷'],
  },
  {
    id: 'leg_020',
    name: '鸿蒙紫气甲',
    slot: 'body',
    quality: '神阶',
    realm: '渡劫期',
    stats: { defense: 1500, maxHp: 10000, damageReduction: 0.4, regen: 200 },
    description: '鸿蒙紫气凝聚而成，万法不侵，不灭不坏',
    blueprintRequired: true,
    affixes: ['厚土', '神圣', '玄风'],
  },
];

function getCodexEntries(unlockedBlueprints) {
  const unlockedIds = new Set(unlockedBlueprints);
  return LEGENDARY_EQUIPMENT.filter((item) => {
    if (!item.blueprintRequired) return true;
    return unlockedIds.has(`bp_${item.id.split('_')[1]}`);
  });
}

const GONGFA_CATEGORIES = {
  cultivation: {
    name: '修炼功法',
    slots: 3,
    subtypes: ['吐纳', '引导', '存想'],
  },
  combat: {
    name: '战斗功法',
    slots: 6,
    subtypes: ['剑诀', '掌法', '身法', '阵法', '符箓', '炼体'],
  },
  support: {
    name: '辅助功法',
    slots: 3,
    subtypes: ['炼丹', '炼器', '采集', '经商'],
  },
};

const GONGFA_QUALITY = ['黄阶', '玄阶', '地阶', '天阶', '仙阶'];

const GONGFA_LIST = [
  {
    id: 'gf_001',
    name: '吐故纳新术',
    category: 'cultivation',
    subtype: '吐纳',
    quality: '黄阶',
    stats: { expRate: 1.1, mpRegen: 5, hpRegen: 2 },
    description: '基础吐纳之法，引天地灵气入体',
  },
  {
    id: 'gf_002',
    name: '周天搬运功',
    category: 'cultivation',
    subtype: '引导',
    quality: '玄阶',
    stats: { expRate: 1.3, mpRegen: 15, maxMp: 100 },
    description: '引导真气运行周天，根基稳固',
  },
  {
    id: 'gf_003',
    name: '观想存神诀',
    category: 'cultivation',
    subtype: '存想',
    quality: '地阶',
    stats: { expRate: 1.5, maxMp: 300, skillDamage: 0.1 },
    description: '存想观神，神魂壮大',
  },
  {
    id: 'gf_004',
    name: '青莲剑诀',
    category: 'combat',
    subtype: '剑诀',
    quality: '地阶',
    stats: { attack: 80, critRate: 0.1, swordDamage: 0.2 },
    description: '青莲剑仙所传，剑出如莲',
  },
  {
    id: 'gf_005',
    name: '降龙十八掌',
    category: 'combat',
    subtype: '掌法',
    quality: '天阶',
    stats: { attack: 150, critDamage: 0.5, palmDamage: 0.3 },
    description: '刚猛掌法，龙吟震天',
  },
  {
    id: 'gf_006',
    name: '凌波微步',
    category: 'combat',
    subtype: '身法',
    quality: '玄阶',
    stats: { speed: 50, dodgeRate: 0.15, escapeRate: 0.2 },
    description: '轻灵身法，踏水无痕',
  },
  {
    id: 'gf_007',
    name: '九宫八卦阵',
    category: 'combat',
    subtype: '阵法',
    quality: '地阶',
    stats: { defense: 60, teamDefense: 0.15, trapDamage: 40 },
    description: '以九宫八卦布阵，困敌杀敌',
  },
  {
    id: 'gf_008',
    name: '五雷正法符',
    category: 'combat',
    subtype: '符箓',
    quality: '天阶',
    stats: { attack: 120, electricDamage: 80, stunChance: 0.1 },
    description: '五雷轰顶，万邪退避',
  },
  {
    id: 'gf_009',
    name: '金刚不坏体',
    category: 'combat',
    subtype: '炼体',
    quality: '地阶',
    stats: { defense: 100, maxHp: 500, damageReduction: 0.1 },
    description: '炼体成钢，刀枪不入',
  },
  {
    id: 'gf_010',
    name: '丹道入门',
    category: 'support',
    subtype: '炼丹',
    quality: '黄阶',
    stats: { pillSuccessRate: 0.1, pillQuality: 0.1, materialSave: 0.05 },
    description: '炼丹基础，初窥门径',
  },
  {
    id: 'gf_011',
    name: '锻造心法',
    category: 'support',
    subtype: '炼器',
    quality: '玄阶',
    stats: { equipSuccessRate: 0.15, equipQuality: 0.15, materialSave: 0.1 },
    description: '炼器之道，以心御火',
  },
  {
    id: 'gf_012',
    name: '采药术',
    category: 'support',
    subtype: '采集',
    quality: '黄阶',
    stats: { gatherSpeed: 1.2, rareChance: 0.05, yieldBonus: 0.1 },
    description: '辨识灵药，采集有方',
  },
  {
    id: 'gf_013',
    name: '经商之道',
    category: 'support',
    subtype: '经商',
    quality: '玄阶',
    stats: { sellPrice: 1.2, buyPrice: 0.9, tradeExp: 1.3 },
    description: '低买高卖，日进斗金',
  },
  {
    id: 'gf_014',
    name: '紫府玄功',
    category: 'cultivation',
    subtype: '吐纳',
    quality: '天阶',
    stats: { expRate: 2.0, mpRegen: 40, maxMp: 500, realmBonus: 0.1 },
    description: '紫府秘传，修炼速度倍增',
  },
  {
    id: 'gf_015',
    name: '万剑归宗',
    category: 'combat',
    subtype: '剑诀',
    quality: '仙阶',
    stats: { attack: 300, critRate: 0.2, swordDamage: 0.5, aoeRange: 100 },
    description: '万剑齐发，天地变色',
  },
  {
    id: 'gf_016',
    name: '天魔解体大法',
    category: 'combat',
    subtype: '炼体',
    quality: '仙阶',
    stats: { attack: 200, speed: 100, sacrificeHp: 0.3, damageBonus: 1.0 },
    description: '燃烧精血换取极致力量',
  },
  {
    id: 'gf_017',
    name: '天工开物',
    category: 'support',
    subtype: '炼器',
    quality: '天阶',
    stats: { equipSuccessRate: 0.3, equipQuality: 0.3, legendaryChance: 0.05 },
    description: '炼器宗师之法，化腐朽为神奇',
  },
  {
    id: 'gf_018',
    name: '九转金丹术',
    category: 'support',
    subtype: '炼丹',
    quality: '仙阶',
    stats: { pillSuccessRate: 0.3, pillQuality: 0.4, legendaryPillChance: 0.08 },
    description: '九转金丹，起死回生',
  },
];

module.exports = {
  QUALITY_MULTIPLIERS,
  AFFIX_POOLS,
  NAME_PARTS,
  STYLE_MARKS,
  STYLE_MARK_BONUS,
  generateEquipmentName,
  BLUEPRINT_TYPES,
  BLUEPRINTS,
  checkBlueprintComplete,
  unlockBlueprint,
  REFINE_LEVELS,
  PILLS,
  refinePill,
  LEGENDARY_EQUIPMENT,
  getCodexEntries,
  GONGFA_CATEGORIES,
  GONGFA_QUALITY,
  GONGFA_LIST,
};
