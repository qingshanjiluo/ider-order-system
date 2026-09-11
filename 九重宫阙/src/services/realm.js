const { loadDatabase, saveDatabase } = require('../database');

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
    const breakthroughChance = Math.max(10, 100 - (character.breakthrough_failures || 0) * 10);

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

  breakthrough(characterId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    if (!this.canBreakthrough(character)) {
      return { success: false, error: '不满足突破条件' };
    }

    const realm = REALMS.find(r => r.name === character.realm);
    const stageIndex = (character.realm_stage || 1) - 1;

    if (stageIndex < realm.stages.length - 1) {
      character.realm_stage = (character.realm_stage || 1) + 1;
    } else {
      const nextRealm = this.getNextRealm(character.realm);
      if (nextRealm) {
        character.realm = nextRealm.name;
        character.realm_stage = 1;
      }
    }

    character.exp = 0;
    character.breakthrough_failures = 0;
    saveDatabase(db);

    return { success: true, character };
  }

  handleBreakthroughFailure(characterId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;

    if (!character.breakthrough_failures) {
      character.breakthrough_failures = 0;
    }
    character.breakthrough_failures++;

    if (character.breakthrough_failures <= 3) {
      character.exp = 0;
    } else if (character.breakthrough_failures <= 5) {
      character.exp = Math.floor((character.exp || 0) * 0.5);
    } else if (character.breakthrough_failures <= 7) {
      character.exp = Math.floor((character.exp || 0) * 0.7);
    } else {
      character.exp = Math.floor((character.exp || 0) * 0.5);
    }

    saveDatabase(db);
    return character;
  }

  isTribulationRealm(realmName) {
    return ['化神', '炼虚', '合体', '大乘', '渡劫', '飞升'].includes(realmName);
  }
}

module.exports = new RealmService();
