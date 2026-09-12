/**
 * 技能库扩充（内容富集三期）：模板化构建 122 个新技能。
 * 七系 × 四品阶(黄玄地天) × 4 主动 = 112；无系功能主动 10 → 总计新增 122。
 * 命名：元素词库确定性组合；前置链：同系上一品阶首个技能；全部经 test-content.js 完整性断言。
 */

const QUALITIES = ['黄阶', '玄阶', '地阶', '天阶'];
const REALM_BY_Q = { 黄阶: '炼气期', 玄阶: '炼气期', 地阶: '筑基期', 金: '金丹期', 天阶: '金丹期' };
const RARITY_BY_Q = { 黄阶: 'common', 玄阶: 'uncommon', 地阶: 'rare', 天阶: 'epic' };
const COST_BY_Q = { 黄阶: [40, 15], 玄阶: [220, 90], 地阶: [650, 240], 天阶: [1800, 650] };

const ELEMENT_POOLS = {
  metal: {
    prefix: ['庚金', '锐金', '金鸣', '白刃', '锋镝', '剑鸣', '金戈', '铄金'],
    core: ['斩', '击', '刺', '破', '锋', '裂', '诀', '鸣'],
    effects: ['无视目标10%防御', '命中后破甲2回合', '攻击附带金属锐气，暴击率提升', '连击两次，每次60%伤害']
  },
  wood: {
    prefix: ['青藤', '古木', '林语', '翠芽', '藤蔓', '春木', '棘刺', '林涛'],
    core: ['缠', '生', '刺', '缚', '愈', '长', '击', '卷'],
    effects: ['命中后吸取目标生命8%', '缠绕减速目标速度20%', '每回合回复自身3%生命，持续3回合', '毒性寄生，2回合持续伤害']
  },
  water: {
    prefix: ['碧波', '寒泉', '沧浪', '冰心', '水幕', '寒潭', '霜华', '潮音'],
    core: '斩 击 涛 冻 卷 盾 涌 破'.split(' '),
    effects: ['冻结目标1回合（30%概率）', '形成水盾，吸收本次伤害40%', '降低目标速度25%，持续2回合', '寒气侵体，目标攻击下降10%']
  },
  fire: {
    prefix: ['烈焰', '焚天', '赤炎', '火羽', '炎爆', '朱明', '燎原', '烬灭'],
    core: '斩 爆 焚 灼 冲 引 弹 轰'.split(' '),
    effects: ['灼烧2回合，每回合40%伤害', '爆炸波及相邻敌人50%伤害', '燃烧自身5%生命换取双倍威力', '火势蔓延，目标越多伤害越高']
  },
  earth: {
    prefix: ['厚土', '崩岩', '山岳', '黄尘', '磐石', '地脉', '黄沙', '岩崩'],
    core: '崩 压 缚 岳 盾 击 震 封'.split(' '),
    effects: ['落石镇压，目标眩晕1回合（35%概率）', '大地护盾，免疫下一次攻击', '沙尘蔽目，目标闪避下降15%', '地刺突起，对全体造成60%伤害']
  },
  light: {
    prefix: ['圣辉', '晨曦', '圣光', '辉光', '天启', '曦和', '净世', '煌辉'],
    core: '斩 沐 盾 照 弹 环 驱 破'.split(' '),
    effects: ['净化自身负面状态并回复8%生命', '圣光护体，2回合内减伤20%', '对黑暗系目标伤害提升50%', '辉光震荡，对全体造成55%伤害']
  },
  dark: {
    prefix: ['幽影', '噬魂', '暗蚀', '夜幕', '黑渊', '魔蚀', '幽泉', '暗霜'],
    core: '噬 袭 缚 蚀 刺 沉 爪 罩'.split(' '),
    effects: ['吸取伤害30%化为自身生命', '暗影侵蚀，目标防御下降15%', '恐惧凝视，目标20%概率无法行动', '暗影潜伏，下回合伤害翻倍']
  }
};

const NONE_UTILITY = [
  ['qi_shield_art', '聚气护体', '形成灵气护盾吸收300点伤害', 'shield'],
  ['spirit_eye', '灵目术', '看破目标弱点，下次攻击必定暴击', 'crit'],
  ['wind_wing', '风翼术', '提升自身速度40%，持续3回合', 'buff'],
  ['earth_ward', '地灵守护', '召唤地灵分担30%伤害，持续2回合', 'shield'],
  ['blood_burn', '燃血秘术', '燃烧10%当前生命，攻击提升50%', 'buff'],
  ['quiet_mind', '冥想术', '回复25%灵力并清除1个负面状态', 'heal'],
  ['taunt_roar', '嘲天吼', '嘲讽全体敌人，防御提升30%', 'taunt'],
  ['phantom_step', '幻影步', '闪避下一次攻击并反击', 'dodge'],
  ['spirit_drain', '汲灵术', '吸取目标20%灵力转为己用', 'drain'],
  ['dao_heart', '道心坚定', '免疫控制效果，持续2回合', 'buff']
];

function buildSkills() {
  const out = [];
  for (const [element, pool] of Object.entries(ELEMENT_POOLS)) {
    const tierFirstIds = [];
    QUALITIES.forEach((quality, qi) => {
      for (let i = 0; i < 4; i++) {
        const id = `exp_${element}_${qi}_${i + 1}`;
        const name = `${pool.prefix[(qi * 4 + i) % pool.prefix.length]}${pool.core[i % pool.core.length]}`;
        const isMain = i < 2;
        const [learn, upgrade] = COST_BY_Q[quality];
        out.push({
          id,
          name: `${name}·${quality}`,
          element,
          type: 'active',
          slot: isMain ? 'main' : 'sub',
          quality,
          rarity: RARITY_BY_Q[quality],
          mana_cost: 10 + qi * 15 + i * 3,
          cooldown: qi >= 2 ? (i % 3) : (i % 2),
          damage_mult: Number((1.0 + qi * 1.1 + i * 0.25).toFixed(2)),
          effect: pool.effects[(qi + i) % pool.effects.length],
          effect_type: 'damage',
          effect_value: Number((0.1 + qi * 0.1).toFixed(2)),
          source: ['sect', 'dungeon', 'inheritance', 'fortune'][i % 4],
          learn_cost: learn + i * 20,
          upgrade_cost: upgrade,
          max_level: quality === '天阶' ? 5 : 10,
          required_realm: qi >= 2 ? '筑基期' : '炼气期',
          prerequisites: qi > 0 ? [tierFirstIds[qi - 1]] : [],
          is_hidden: false,
          expanded: true
        });
        if (i === 0) tierFirstIds[qi] = id;
      }
    });
  }
  NONE_UTILITY.forEach(([id, name, effect, effectType], i) => {
    out.push({
      id,
      name,
      element: 'none',
      type: 'active',
      slot: 'sub',
      quality: i < 6 ? '黄阶' : '玄阶',
      rarity: i < 6 ? 'common' : 'uncommon',
      mana_cost: 15 + i * 2,
      cooldown: 3,
      damage_mult: 0,
      effect,
      effect_type: effectType,
      effect_value: 0.2,
      source: 'shop',
      learn_cost: 150 + i * 40,
      upgrade_cost: 60,
      max_level: 5,
      required_realm: '炼气期',
      prerequisites: [],
      is_hidden: false,
      expanded: true
    });
  });
  return out;
}

module.exports = { buildSkills };
