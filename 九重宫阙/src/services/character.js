const { loadDatabase, saveDatabase } = require('../database');
const gameTime = require('./gameTime');

const VIP_LEVELS = [
  { level: 0, name: '凡人', required: 0, benefits: { expBonus: 1.0, spiritStoneBonus: 1.0, storageSlots: 50 } },
  { level: 1, name: '修士', required: 100, benefits: { expBonus: 1.05, spiritStoneBonus: 1.05, storageSlots: 60 } },
  { level: 2, name: '道友', required: 300, benefits: { expBonus: 1.10, spiritStoneBonus: 1.10, storageSlots: 70 } },
  { level: 3, name: '真人', required: 600, benefits: { expBonus: 1.15, spiritStoneBonus: 1.15, storageSlots: 80 } },
  { level: 4, name: '仙师', required: 1000, benefits: { expBonus: 1.20, spiritStoneBonus: 1.20, storageSlots: 90 } },
  { level: 5, name: '天仙', required: 1500, benefits: { expBonus: 1.25, spiritStoneBonus: 1.25, storageSlots: 100 } },
  { level: 6, name: '金仙', required: 2000, benefits: { expBonus: 1.30, spiritStoneBonus: 1.30, storageSlots: 120 } },
  { level: 7, name: '大罗金仙', required: 3000, benefits: { expBonus: 1.35, spiritStoneBonus: 1.35, storageSlots: 140 } },
  { level: 8, name: '准圣', required: 5000, benefits: { expBonus: 1.40, spiritStoneBonus: 1.40, storageSlots: 160 } },
  { level: 9, name: '圣人', required: 8000, benefits: { expBonus: 1.45, spiritStoneBonus: 1.45, storageSlots: 180 } },
  { level: 10, name: '道祖', required: 12000, benefits: { expBonus: 1.50, spiritStoneBonus: 1.50, storageSlots: 200 } }
];

class CharacterService {
  getCharacter(userId) {
    const db = loadDatabase();
    return db.characters.find(c => c.user_id === userId);
  }

  getVipBonus(vipLevel) {
    const vip = VIP_LEVELS.find(v => v.level === (vipLevel || 0));
    return vip ? vip.benefits : { expBonus: 1.0, spiritStoneBonus: 1.0 };
  }

  calculateCombatPower(character) {
    const base = (character.attack || 0) + (character.defense || 0) + (character.hp || 0) + (character.speed || 0);
    return Math.floor(base);
  }

  addExp(characterId, amount, vipLevel) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;

    const vipBonus = this.getVipBonus(vipLevel || character.vip_level || 0);
    const finalAmount = Math.floor(amount * vipBonus.expBonus);

    character.exp = (character.exp || 0) + finalAmount;
    let leveledUp = false;
    let bottleneck = false;

    // T0-2 铁律：任何经验来源（战斗/副本/挂机/丹药/签到）都不得把角色推出本境界 max_level。
    // 到顶即钉住，越境界必须走 realm.breakthrough —— 承担折寿与失败风险。
    // 此前这里只有 while(exp>=need) level++ 且无上限，刷经验可直接连升境界等级、绕开突破判定。
    const RLC = require('../config/balance').REALM_LEVEL_CAP;
    const realmRow = (db.realms || []).find(r => r.name === character.realm);
    const capLevel = RLC.enforce && realmRow ? (Number(realmRow.max_level) || 0) : 0;

    while ((!capLevel || (character.level || 1) < capLevel) && character.exp >= (character.exp_to_next || 100)) {
      character.exp -= (character.exp_to_next || 100);
      character.level = (character.level || 1) + 1;
      character.exp_to_next = this.calculateExpForLevel(character.level);
      character.max_hp = this.calculateHpMax(character.level, character.realm);
      character.max_mp = this.calculateMpMax(character.level, character.realm);
      character.attack = this.calculateAttack(character.level, character.realm);
      character.defense = this.calculateDefense(character.level, character.realm);
      character.speed = this.calculateSpeed(character.level, character.realm);
      character.hp = character.max_hp;
      character.mp = character.max_mp;
      // v2 寿命：境界内每升 1 级 +LEVEL_LIFESPAN_GAIN 当前境界基础寿元（决议 D5）
      // 写入收回 gameTime 独占：系数不再硬编码 0.01，寿元算术也不散落两处
      gameTime.addRealmGrowth(character);
      leveledUp = true;
    }

    // 已到本境界天花板：修为钉在下一级需求处（前端可显示"圆满·待突破"），多余经验不累积
    if (capLevel && (character.level || 1) >= capLevel) {
      bottleneck = true;
      if (RLC.pinExpAtFull) {
        character.exp = Math.min(character.exp, character.exp_to_next || character.exp);
      }
    }

    saveDatabase(db);
    return { character, leveledUp, expGained: finalAmount, vipExpBonus: vipBonus.expBonus, bottleneck, realmCapLevel: capLevel || null };
  }

  calculateExpForLevel(level) {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  }

  calculateHpMax(level, realm) {
    const realmBonus = this.getRealmBonus(realm);
    return Math.floor(100 + level * 10 + realmBonus * 50);
  }

  calculateMpMax(level, realm) {
    const realmBonus = this.getRealmBonus(realm);
    return Math.floor(50 + level * 5 + realmBonus * 30);
  }

  calculateAttack(level, realm) {
    const realmBonus = this.getRealmBonus(realm);
    return Math.floor(10 + level * 2 + realmBonus * 15);
  }

  calculateDefense(level, realm) {
    const realmBonus = this.getRealmBonus(realm);
    return Math.floor(5 + level * 1 + realmBonus * 10);
  }

  calculateSpeed(level, realm) {
    const realmBonus = this.getRealmBonus(realm);
    return Math.floor(5 + Math.floor(level / 5) + realmBonus * 5);
  }

  getRealmBonus(realm) {
    const realmIndex = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'].indexOf(realm);
    return realmIndex >= 0 ? realmIndex : 0;
  }
}

module.exports = new CharacterService();
module.exports.VIP_LEVELS = VIP_LEVELS;
