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
    const stats = {
      cultivation_speed: 1 + (qualityIndex * 0.1 + STAGES.indexOf(stage) * 0.025),
      skill_damage: 1 + (qualityIndex * 0.15 + STAGES.indexOf(stage) * 0.0375)
    };

    return {
      name: `${realm}${quality}${stage}${type === '修炼' ? '修炼功法' : '战斗功法'}`,
      type: '功法',
      quality,
      realm,
      stage,
      stats: JSON.stringify(stats),
      description: `${realm}境界的${quality}${stage}${type}功法`
    };
  }

  generatePet(realm, quality) {
    const qualityIndex = ['凡兽', '灵兽', '玄兽', '地兽', '天兽', '圣兽', '仙兽'].indexOf(quality);
    if (qualityIndex < 0) return null;

    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    const baseMultiplier = 1 + qualityIndex * 0.3;
    const stageMultiplier = 1 + STAGES.indexOf(stage) * 0.25;

    const stats = {
      hp: Math.floor(50 * baseMultiplier * stageMultiplier),
      attack: Math.floor(5 * baseMultiplier * stageMultiplier),
      defense: Math.floor(3 * baseMultiplier * stageMultiplier),
      speed: Math.floor(2 * baseMultiplier * stageMultiplier)
    };

    return {
      name: `${realm}${quality}${stage}灵宠`,
      type: '灵宠',
      quality,
      realm,
      stage,
      stats: JSON.stringify(stats),
      description: `${realm}境界的${quality}${stage}灵宠`
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
