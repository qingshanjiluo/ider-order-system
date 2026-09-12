const { loadDatabase, saveDatabase } = require('../database');
const gameTime = require('./gameTime');

const REALMS = [
  { name: '炼气', min_level: 1, max_level: 10, stages: ['前期', '中期', '后期'], exp_requirement: 100 },
  { name: '筑基', min_level: 11, max_level: 20, stages: ['前期', '中期', '后期'], exp_requirement: 500 },
  { name: '金丹', min_level: 21, max_level: 30, stages: ['前期', '中期', '后期'], exp_requirement: 2000 },
  { name: '元婴', min_level: 31, max_level: 40, stages: ['前期', '中期', '后期', '半步'], exp_requirement: 8000 },
  { name: '化神', min_level: 41, max_level: 50, stages: ['前期', '中期', '后期', '半步'], exp_requirement: 30000 },
  { name: '炼虚', min_level: 51, max_level: 60, stages: ['前期', '中期', '后期', '半步'], exp_requirement: 100000 },
  { name: '合体', min_level: 61, max_level: 70, stages: ['前期', '中期', '后期', '半步'], exp_requirement: 500000 },
  { name: '大乘', min_level: 71, max_level: 80, stages: ['前期', '中期', '后期', '半步'], exp_requirement: 2000000 },
  { name: '渡劫', min_level: 81, max_level: 90, stages: ['前期', '中期', '后期', '半步'], exp_requirement: 10000000 },
  { name: '飞升', min_level: 91, max_level: 100, stages: ['前期', '中期', '后期', '半步'], exp_requirement: 50000000 }
];

class RealmService {
  getRealmInfo(characterOrName) {
    if (typeof characterOrName === 'string') {
      return REALMS.find(r => r.name === characterOrName);
    }
    const character = characterOrName;
    const realm = REALMS.find(r => r.name === character.realm);
    if (!realm) return { name: '凡人', progress: 0, breakthroughChance: 0 };

    const realmIndex = REALMS.findIndex(r => r.name === character.realm);
    const stageIndex = realm.stages.indexOf(this.getStageName(character.realm_stage || 1));
    const progress = ((character.exp || 0) / (realm.exp_requirement || 1)) * 100;
    const breakthroughChance = this.breakthroughProbability(character).chance;

    return {
      name: `${realm.name}${this.getStageName(character.realm_stage || 1)}`,
      realm: realm.name,
      stage: this.getStageName(character.realm_stage || 1),
      level: character.level || 1,
      exp: character.exp || 0,
      expToNext: realm.exp_requirement,
      progress: Math.min(100, Math.floor(progress)),
      breakthroughChance: Math.min(100, breakthroughChance),
      realmIndex,
      stageIndex
    };
  }

  getNextRealm(currentRealm) {
    const index = REALMS.findIndex(r => r.name === currentRealm);
    return index < REALMS.length - 1 ? REALMS[index + 1] : null;
  }

  canBreakthrough(character) {
    const realm = REALMS.find(r => r.name === character.realm);
    if (!realm) return false;

    const realmIndex = REALMS.findIndex(r => r.name === character.realm);
    const stageIndex = (character.realm_stage || 1) - 1;

    if (stageIndex < realm.stages.length - 1) {
      return (character.level || 1) >= realm.max_level && (character.exp || 0) >= realm.exp_requirement;
    } else {
      const nextRealm = this.getNextRealm(character.realm);
      return nextRealm && (character.level || 1) >= realm.max_level && (character.exp || 0) >= realm.exp_requirement;
    }
  }

  getStageName(stageIndex) {
    const stages = ['前期', '中期', '后期', '半步'];
    return stages[stageIndex - 1] || '前期';
  }

  /**
   * 从角色身上解析突破契机（只读**已验证存在**的字段；未落地的通道由 E5 置位，不臆造效果）
   * injury 为现成字段：中伤(≥60)以上强冲 → P−10；其余为契约字段，当前恒 false/0。
   */
  resolveBreakthroughMods(character) {
    return {
      daoDamage: (character.injury || 0) >= 60,
      pill: this._findPillRow(character.id) != null,
      formation: (character.cave_formation_level || 0) > 0,
      veinLevel: character.cave_vein_level || 0,
      artPerfect: !!character.art_perfect,
      epiphany: !!character.epiphany_ready
    };
  }

  /** 背包里的契机丹（按名匹配 items → inventory 行）；无则 null */
  _findPillRow(characterId) {
    if (characterId == null) return null;
    try {
      const B = require('../config/balance');
      const db = loadDatabase();
      const names = new Set(B.BREAKTHROUGH_PILL_NAMES || []);
      if (!names.size) return null;
      const itemIds = new Set((db.items || []).filter(i => names.has(i.name)).map(i => i.id));
      if (!itemIds.size) return null;
      return (db.inventory || []).find(r => r.character_id === characterId
        && itemIds.has(r.item_id) && (r.quantity || 0) > 0) || null;
    } catch (e) { return null; }
  }

  /**
   * 突破判定概率（定稿模型，取代"满足即 100% 成功"的空心玩法）
   * P = clamp(base[境界] − 5×心魔 − 3×连败 + 契机 + 天道庇护, 5, 95)
   * opts: { pill, formation, veinLevel, artPerfect, epiphany, daoDamage }
   */
  breakthroughProbability(character, opts = {}) {
    const B = require('../config/balance');
    const realm = REALMS.find(r => r.name === character.realm);
    if (!realm) return { chance: 0, parts: null };
    opts = Object.assign(this.resolveBreakthroughMods(character), opts);
    const M = B.BREAKTHROUGH_MODS;
    const failures = character.breakthrough_failures || 0;
    const demons = character.inner_demon || 0;

    const parts = {
      base: B.BREAKTHROUGH_BASE[realm.name] != null ? B.BREAKTHROUGH_BASE[realm.name] : 80,
      innerDemon: M.perInnerDemon * demons,
      failures: M.perFail * failures,
      heavenShield: failures >= M.heavenShieldFrom ? M.heavenShieldEach * (failures - M.heavenShieldFrom + 1) : 0,
      pill: opts.pill ? M.pill : 0,
      formation: opts.formation ? M.formation : 0,
      vein: opts.veinLevel ? M.veinPerLevel * opts.veinLevel : 0,
      artPerfect: opts.artPerfect ? M.artPerfect : 0,
      epiphany: opts.epiphany ? M.epiphany : 0,
      daoDamage: opts.daoDamage ? M.daoDamage : 0
    };
    const total = Object.values(parts).reduce((s, v) => s + v, 0);
    return { chance: Math.max(5, Math.min(95, Math.round(total))), parts };
  }

  /**
   * 突破结算。phase 区分"闸门未过（不罚）"与"判定失败（罚）"，
   * 修掉旧版把"条件不满足"也计入连败的问题。
   */
  breakthrough(characterId, opts = {}) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, phase: 'missing', error: '角色不存在' };

    if (!this.canBreakthrough(character)) {
      return { success: false, phase: 'gate', error: '不满足突破条件' };
    }

    const { chance, parts } = this.breakthroughProbability(character, opts);
    const roll = Math.floor((opts.rng || Math.random)() * 100);
    // 契机丹一次性：本次判定无论成败都扣一枚（防"随身永驻 +15%"）
    const pillRow = this._findPillRow(character.id);
    if (pillRow) {
      pillRow.quantity = (pillRow.quantity || 1) - 1;
      if (pillRow.quantity <= 0) {
        const ix = (db.inventory || []).indexOf(pillRow);
        if (ix >= 0) db.inventory.splice(ix, 1);
      }
    }
    if (roll >= chance) {
      character._pending_breakthrough_failure = true;   // 仅此标记允许后续折寿结算
      saveDatabase(db);
      return { success: false, phase: 'roll', error: '突破失败，道基受损', chance, roll, parts };
    }
    character._pending_breakthrough_failure = false;

    const realm = REALMS.find(r => r.name === character.realm);
    const stageIndex = (character.realm_stage || 1) - 1;

    if (stageIndex < realm.stages.length - 1) {
      character.realm_stage = (character.realm_stage || 1) + 1;
    } else {
      const nextRealm = this.getNextRealm(character.realm);
      if (nextRealm) {
        const prevRealm = character.realm;
        character.realm = nextRealm.name;
        character.realm_stage = 1;
        // 飞升：超脱寿数（决议 D5）
        if (nextRealm.name === '飞升') {
          character.ascended = true;
        }
        // 编年史：大境界突破
        gameTime.logEvent(
          character,
          'breakthrough',
          `突破${nextRealm.name}`,
          `${prevRealm} → ${nextRealm.name}，寿元上限 ${
            gameTime.getLifespanBase(character) === null ? '超脱' : gameTime.getLifespanBase(character) + ' 年'
          }`
        );
      }
    }

    character.exp = 0;
    character.breakthrough_failures = 0;
    saveDatabase(db);

    return { success: true, character, chance, roll, parts };
  }

  /**
   * 失败结算（R1 比例折寿 / R6 不降境界 / 心魔 +1 / 修为回落 10%）。
   * 只处理带 _pending_breakthrough_failure 标记的判定失败：闸门未过一律不罚。
   */
  handleBreakthroughFailure(characterId) {
    const B = require('../config/balance');
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;
    if (!character._pending_breakthrough_failure) return character;
    character._pending_breakthrough_failure = false;

    const failures = (character.breakthrough_failures || 0) + 1;
    character.breakthrough_failures = failures;
    character.inner_demon = (character.inner_demon || 0) + 1;

    const cap = gameTime.effectiveLifespan(character) || 0;
    const C = B.BREAKTHROUGH_LIFE_COST;
    const ratio = Math.min(C.max, C.base + C.perFail * (failures - 1));
    const lost = B.yearsOfRatio(cap, ratio);
    gameTime.subtractLifespan(character, lost);

    const before = character.exp || 0;
    character.exp = Math.floor(before * (1 - B.BREAKTHROUGH_FAIL.expFallbackRatio));

    gameTime.logEvent(
      character,
      'breakthrough_fail',
      '突破失败',
      `第 ${failures} 次失败：折寿 ${lost} 年（上限 ${cap} 的 ${(ratio * 100).toFixed(1)}%）、` +
      `修为回落 ${before - character.exp}，心魔 ${character.inner_demon} 层`
    );
    saveDatabase(db);
    return character;
  }

  isTribulationRealm(realmName) {
    return ['化神', '炼虚', '合体', '大乘', '渡劫', '飞升'].includes(realmName);
  }
}

module.exports = new RealmService();
