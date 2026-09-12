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
      character.exp_to_next = this.calculateExpForLevel(character.level, character.realm);
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

  /**
   * 下一级所需修为（E9 曲线调平 · 轮54）。真源在 `services/exp-curve.js`，本方法只做"按角色境界查行 + 兜底"。
   * 兜底分支只在境界行查不到（脏数据）时生效；**建角与转世已不再走这里**，它们直接调 exp-curve，
   * 于是"出厂 exp_to_next"与真实曲线不可能再分叉（轮54 之前那两处是硬编码 100）。
   */
  calculateExpForLevel(level, realm = null) {
    const row = realm ? (loadDatabase().realms || []).find((r) => r.name === realm) : null;
    const n = require('./exp-curve').needForLevel(row, level);
    return n != null ? n : Math.floor(100 * Math.pow(1.5, (Number(level) || 1) - 1));
  }

  /**
   * E3/T0-3 数值曲线修复：玩家面板原本是**纯线性**（100+level*10+境界序号*50），
   * 而 db.monsters 模板是手工指数堆高（同级怪 hp 从 70 涨到 35000、攻 16 涨到 1000）。
   * 实测后果：渡劫段"怪 0.7 回合打死我、我要 85.8 回合才杀掉怪"→ sim-battle 段4 胜率 0.0%。
   * 现给每条曲线加一个境界乘性因子（系数在 balance.REALM_STAT_GROWTH，可复算可调）。
   * 速度只按 √ 增长：先手差距保留一点压迫感，但不让后期永远后手。
   */
  realmStatFactor(realm) {
    const B = require('../config/balance');
    const g = Number(B.REALM_STAT_GROWTH) || 1;
    return Math.pow(g, this.getRealmBonus(realm));
  }

  calculateHpMax(level, realm) {
    return Math.floor((100 + level * 10) * this.realmStatFactor(realm));
  }

  calculateMpMax(level, realm) {
    return Math.floor((50 + level * 5) * this.realmStatFactor(realm));
  }

  calculateAttack(level, realm) {
    const B = require('../config/balance');
    const g = Number(B.REALM_STAT_GROWTH) || 1;
    const bias = Number(B.ATTACK_GROWTH_BIAS) || 1;
    // 攻击可独立加权：否则高境界会变成"能挨不能打"的磨盘
    return Math.floor((10 + level * 2) * Math.pow(g, this.getRealmBonus(realm) * bias));
  }

  calculateDefense(level, realm) {
    return Math.floor((5 + level * 1) * this.realmStatFactor(realm));
  }

  calculateSpeed(level, realm) {
    const B = require('../config/balance');
    const g = Number(B.REALM_STAT_GROWTH) || 1;
    return Math.floor((5 + Math.floor(level / 5)) * Math.pow(g, this.getRealmBonus(realm) * 0.5));
  }

  getRealmBonus(realm) {
    const realmIndex = (require('../config/balance').REALM_ORDER || []).indexOf(realm);
    return realmIndex >= 0 ? realmIndex : 0;
  }
}

module.exports = new CharacterService();
module.exports.VIP_LEVELS = VIP_LEVELS;
