const { loadDatabase, saveDatabase, getNextId } = require('../database');

const QUALITY_ORDER = ['凡器', '法器', '灵器', '法宝', '古宝', '灵宝', '道器', '仙器', '混沌至宝'];
const STAGES = ['下品', '中品', '上品', '极品'];

const SLOT_NAMES = {
  'weapon': '主武器',
  'head': '头',
  'chest': '上身',
  'legs': '裤子',
  'gloves': '手套',
  'boots': '鞋子',
  'necklace': '项链',
  'ring': '戒指'
};

const SLOT_BONUS = {
  'weapon': { attack: 1.5, defense: 0, hp: 0, speed: 0 },
  'head': { attack: 0, defense: 1.2, hp: 0.5, speed: 0 },
  'chest': { attack: 0, defense: 1.5, hp: 1.2, speed: 0 },
  'legs': { attack: 0.3, defense: 0.5, hp: 0.3, speed: 0.8 },
  'gloves': { attack: 0.8, defense: 0.3, hp: 0, speed: 0.5 },
  'boots': { attack: 0, defense: 0.3, hp: 0, speed: 1.5 },
  'necklace': { attack: 0.5, defense: 0, hp: 1.0, speed: 0 },
  'ring': { attack: 0.8, defense: 0, hp: 0, speed: 0.3 }
};

const SLOT_WEIGHTS = {
  'weapon': [40, 25, 15, 10, 5, 3, 1, 0.8, 0.2],
  'head': [35, 30, 18, 10, 4, 2, 0.8, 0.15, 0.05],
  'chest': [35, 30, 18, 10, 4, 2, 0.8, 0.15, 0.05],
  'legs': [38, 28, 16, 10, 5, 2, 0.8, 0.15, 0.05],
  'gloves': [36, 29, 17, 10, 5, 2, 0.8, 0.15, 0.05],
  'boots': [38, 28, 16, 10, 5, 2, 0.8, 0.15, 0.05],
  'necklace': [30, 25, 20, 12, 6, 4, 2, 0.8, 0.2],
  'ring': [30, 25, 20, 12, 6, 4, 2, 0.8, 0.2]
};

const SLOT_SUBTYPES = {
  'weapon': ['长剑', '短刀', '法杖', '长枪', '双刀', '重锤', '飞剑', '灵扇'],
  'head': ['头盔', '发冠', '额饰', '面具', '兜帽'],
  'chest': ['轻甲', '重甲', '法袍', '皮甲', '锁子甲'],
  'legs': ['护腿', '腿甲', '护膝', '绑腿'],
  'gloves': ['手套', '指套', '护手', '灵纹手套'],
  'boots': ['战靴', '布鞋', '皮靴', '飞云履'],
  'necklace': ['项链', '吊坠', '护身符', '灵链'],
  'ring': ['指环', '玉戒', '骨戒', '灵戒']
};

class ItemService {
  getItem(itemId) {
    const db = loadDatabase();
    return db.items.find(i => i.id === itemId);
  }

  getItemsByType(type) {
    const db = loadDatabase();
    return db.items.filter(i => i.type === type);
  }

  getItemsByQuality(quality) {
    const db = loadDatabase();
    return db.items.filter(i => i.quality === quality);
  }

  generateEquipment(realm, quality, slot) {
    const qualityIndex = QUALITY_ORDER.indexOf(quality);
    if (qualityIndex < 0) return null;

    if (!slot || !SLOT_NAMES[slot]) {
      slot = 'weapon';
    }

    const slotBonus = SLOT_BONUS[slot] || SLOT_BONUS['weapon'];
    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    const baseStats = this.getBaseStats(quality);
    const stageMultiplier = 1 + STAGES.indexOf(stage) * 0.25;

    const stats = {
      attack: Math.floor(baseStats.attack * stageMultiplier * slotBonus.attack),
      defense: Math.floor(baseStats.defense * stageMultiplier * slotBonus.defense),
      hp: Math.floor(baseStats.hp * stageMultiplier * slotBonus.hp),
      speed: Math.floor(baseStats.speed * stageMultiplier * slotBonus.speed)
    };

    const enhanceMax = 3 + qualityIndex * 3;
    const subtypes = SLOT_SUBTYPES[slot] || ['普通'];
    const subtype = subtypes[Math.floor(Math.random() * subtypes.length)];

    return {
      name: `${realm}${quality}${stage}${subtype}`,
      type: '装备',
      slot,
      quality,
      realm,
      stage,
      stats: JSON.stringify(stats),
      enhanceMax,
      description: `${realm}境界的${quality}${stage}${subtype}，适合${SLOT_NAMES[slot]}槽位`
    };
  }

  getBaseStats(quality) {
    const bases = {
      '凡器': { attack: 5, defense: 3, hp: 20, speed: 1 },
      '法器': { attack: 15, defense: 10, hp: 50, speed: 2 },
      '灵器': { attack: 30, defense: 20, hp: 100, speed: 3 },
      '法宝': { attack: 60, defense: 40, hp: 200, speed: 5 },
      '古宝': { attack: 100, defense: 70, hp: 350, speed: 8 },
      '灵宝': { attack: 160, defense: 110, hp: 550, speed: 12 },
      '道器': { attack: 250, defense: 170, hp: 800, speed: 18 },
      '仙器': { attack: 400, defense: 270, hp: 1200, speed: 25 },
      '混沌至宝': { attack: 650, defense: 430, hp: 1800, speed: 35 }
    };
    return bases[quality] || bases['凡器'];
  }

  generateRandomEquipment(realm) {
    const qualityWeights = SLOT_WEIGHTS['weapon'];
    const totalWeight = qualityWeights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let qualityIndex = 0;
    for (let i = 0; i < qualityWeights.length; i++) {
      random -= qualityWeights[i];
      if (random <= 0) {
        qualityIndex = i;
        break;
      }
    }
    const quality = QUALITY_ORDER[qualityIndex];
    const slots = Object.keys(SLOT_NAMES);
    const slot = slots[Math.floor(Math.random() * slots.length)];
    return this.generateEquipment(realm, quality, slot);
  }

  generateGongfa(realm, quality, type) {
    const qualityIndex = ['黄阶', '玄阶', '地阶', '天阶', '圣阶', '仙阶'].indexOf(quality);
    if (qualityIndex < 0) return null;

    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    // 元素亲和：七系随机（修炼功法偏五行，战斗功法七系皆可）
    const elements = ['metal', 'wood', 'water', 'fire', 'earth', 'light', 'dark'];
    const element = elements[Math.floor(Math.random() * elements.length)];
    const ELEMENT_ZH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土', light: '光明', dark: '黑暗' };

    // 命名词库：Prefix + Core + 类别尾字（替代呆板的"境界+品质+品阶+类型功法"）
    const GONGFA_PREFIX = ['太虚', '玄冥', '天罡', '紫霄', '太乙', '混元', '大衍', '无量', '周天', '九转', '焚天', '镇岳', '御灵', '归墟', '渡厄'];
    const GONGFA_CORE = { 修炼: ['炼髓', '凝元', '养神', '淬体', '朝元', '抱朴'], 战斗: ['诀', '斩', '印', '罡', '术', '典'] };
    const prefix = GONGFA_PREFIX[Math.floor(Math.random() * GONGFA_PREFIX.length)];
    const core = GONGFA_CORE[type === '修炼' ? '修炼' : '战斗'][Math.floor(Math.random() * 6)];
    const name = `${ELEMENT_ZH[element]}系·${prefix}${core}`;

    const stats = {
      cultivation_speed: Number((1 + (qualityIndex * 0.1 + STAGES.indexOf(stage) * 0.025)).toFixed(3)),
      skill_damage: Number((1 + (qualityIndex * 0.15 + STAGES.indexOf(stage) * 0.0375)).toFixed(3)),
      element,
      element_boost: Number((qualityIndex * 0.06 + STAGES.indexOf(stage) * 0.015).toFixed(3)),
      skill_slots: type === '战斗' && qualityIndex >= 3 && Math.random() < 0.25 ? 1 : 0,
      comprehension_req: qualityIndex + 1
    };

    const FLAVOR = {
      修炼: [`行气如龙，周天自转，修炼时${ELEMENT_ZH[element]}灵气加倍亲和`, `以${ELEMENT_ZH[element]}入道，经脉如江河奔涌`, `古修遗篇，字字玄妙，习之事半功倍`],
      战斗: [`运功如雷，一击而天下惊`, `${ELEMENT_ZH[element]}之力凝于指掌，伤敌于无形`, `战阵之上，此法一出，群邪辟易`]
    };
    const flavor = FLAVOR[type === '修炼' ? '修炼' : '战斗'][Math.floor(Math.random() * 3)];

    return {
      name,
      type: '功法',
      quality,
      realm,
      stage,
      stats: JSON.stringify(stats),
      description: `${realm}境界的${quality}${stage}${type}功法（${ELEMENT_ZH[element]}系亲和）——${flavor}`
    };
  }

  generatePet(realm, quality) {
    const qualityIndex = ['凡兽', '灵兽', '玄兽', '地兽', '天兽', '圣兽', '仙兽'].indexOf(quality);
    if (qualityIndex < 0) return null;

    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    const baseMultiplier = 1 + qualityIndex * 0.3;
    const stageMultiplier = 1 + STAGES.indexOf(stage) * 0.25;

    // 物种化：随机灵兽 + 元素 + 天赋特性（替代呆板的"境界+品质+品阶灵宠"）
    const SPECIES = [
      { name: '火翎狐', element: 'fire', trait: '灵火灼烧：攻击附带灼烧' },
      { name: '玄水龟', element: 'water', trait: '玄甲：大幅提升防御' },
      { name: '青木鹿', element: 'wood', trait: '回春：每回合为全队回复生命' },
      { name: '金羽鹰', element: 'metal', trait: '锐目：提升主人命中与暴击' },
      { name: '厚土熊', element: 'earth', trait: '撼地：受击时震慑反击' },
      { name: '白泽', element: 'light', trait: '通晓万物：提升主人修炼效率' },
      { name: '幽冥猫', element: 'dark', trait: '影遁：提升主人闪避' },
      { name: '雷罡豹', element: 'metal', trait: '雷驰：大幅提升速度' },
      { name: '冰晶蝶', element: 'water', trait: '凝霜：攻击概率冻结' },
      { name: '墨鳞蛟', element: 'dark', trait: '蛟威：威压降敌攻' },
      { name: '金睛猿', element: 'earth', trait: '灵目：识破敌人弱点' },
      { name: '碧火凰', element: 'fire', trait: '涅槃：濒死时浴火重生一次' },
      { name: '雪魄狼', element: 'water', trait: '啸月：寒夜中全属性提升' },
      { name: '紫电貂', element: 'metal', trait: '电掣：出手概率先攻' },
      { name: '吞天蟾', element: 'dark', trait: '吞灵：吞噬敌方灵力' },
      { name: '青鸾', element: 'light', trait: '清音：净化主人负面状态' },
      { name: '玉麒麟', element: 'light', trait: '瑞气：提升主人气运与机缘' },
      // ---- E6 数据深化：物种池 17 → 36（火4/木3/水3/金3/土3/光2/暗1）----
      { name: '赤焰狮', element: 'fire', trait: '燎原：群战时灼烧伤害翻倍' },
      { name: '毕方', element: 'fire', trait: '独足踏火：出手附带灼烧并提升先攻' },
      { name: '金乌', element: 'fire', trait: '日轮：白昼全属性+10%，灼烧不中断' },
      { name: '焱甲虫', element: 'fire', trait: '炎壳：受击反弹火焰伤害' },
      { name: '藤萝蟒', element: 'wood', trait: '缠绕：普攻概率定身一回合' },
      { name: '苍梧鹤', element: 'wood', trait: '啄灵：攻击吸取生命反哺主人' },
      { name: '芝灵童', element: 'wood', trait: '共生：主人炼丹时提高成丹率' },
      { name: '沧溟鲲', element: 'water', trait: '吞海：HP 上限大幅提升' },
      { name: '碧潭蛛', element: 'water', trait: '凝露：战斗开始为己方挂护盾' },
      { name: '潮音蚌', element: 'water', trait: '潮律：每回合回复主人灵力' },
      { name: '太白庚兽', element: 'metal', trait: '裂金：无视目标 15% 防御' },
      { name: '锖甲犀', element: 'metal', trait: '冲撞：突进首回合伤害+30%' },
      { name: '素月兔', element: 'metal', trait: '望月：夜晚速度与会心提升' },
      { name: '岩岳兽', element: 'earth', trait: '镇岳：受击减伤并积累势能反击' },
      { name: '黄壤鼹', element: 'earth', trait: '掘土：采集时额外获得土石材料' },
      { name: '磁光鲨', element: 'earth', trait: '磁力：干扰敌方金属性输出' },
      { name: '净世犼', element: 'light', trait: '净世：驱散敌方增益效果' },
      { name: '昭明羽人', element: 'light', trait: '昭明：延长了主增益状态持续' },
      { name: '蚀骨蝠', element: 'dark', trait: '蚀骨：攻击叠加削弱敌方防御' }
    ];
    const sp = SPECIES[Math.floor(Math.random() * SPECIES.length)];
    const name = `${sp.name}（${realm}${quality}${stage}）`;

    const stats = {
      hp: Math.floor(50 * baseMultiplier * stageMultiplier),
      attack: Math.floor(5 * baseMultiplier * stageMultiplier),
      defense: Math.floor(3 * baseMultiplier * stageMultiplier),
      speed: Math.floor(2 * baseMultiplier * stageMultiplier),
      element: sp.element,
      trait: sp.trait,
      species: sp.name
    };

    return {
      name,
      type: '灵宠',
      quality,
      realm,
      stage,
      stats: JSON.stringify(stats),
      description: `${sp.name}——${sp.trait}（${realm}境界的${quality}${stage}灵兽，${sp.element}系）`
    };
  }

  enhanceEquipment(equipmentId) {
    const db = loadDatabase();
    const equip = db.equipments.find(e => e.id === equipmentId);
    if (!equip) return { success: false, error: '装备不存在' };

    const item = db.items.find(i => i.id === equip.item_id);
    if (!item) return { success: false, error: '装备信息不存在' };

    if ((equip.enhance || 0) >= (item.enhanceMax || 25)) {
      return { success: false, error: '已达强化上限' };
    }

    const successRate = Math.max(0.3, 1 - (equip.enhance || 0) * 0.05);
    if (Math.random() > successRate) {
      return { success: false, error: '强化失败' };
    }

    equip.enhance = (equip.enhance || 0) + 1;
    saveDatabase(db);
    return { success: true, enhanceLevel: equip.enhance };
  }
}

module.exports = new ItemService();
