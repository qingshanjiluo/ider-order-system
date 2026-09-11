const { loadDatabase, saveDatabase } = require('../database');

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

    while (character.exp >= (character.exp_to_next || 100)) {
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
      leveledUp = true;
    }

    saveDatabase(db);
    return { character, leveledUp, expGained: finalAmount, vipExpBonus: vipBonus.expBonus };
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
