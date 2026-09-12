const { loadDatabase, saveDatabase, getNextId } = require('../../database');

const SKILL_TYPES = {
  '金': { name: '金系', color: '#FFD700', element: '金' },
  '木': { name: '木系', color: '#228B22', element: '木' },
  '水': { name: '水系', color: '#1E90FF', element: '水' },
  '火': { name: '火系', color: '#FF4500', element: '火' },
  '土': { name: '土系', color: '#8B4513', element: '土' }
};

const SECT_SKILLS = {
  '青云宗': {
    name: '青云宗',
    skills: [
      { name: '青云剑诀', type: '金', multiplier: 1.2, description: '青云宗基础剑法' },
      { name: '御风术', type: '木', multiplier: 1.1, description: '提升移动速度' },
      { name: '天雷斩', type: '金', multiplier: 1.5, description: '召唤天雷攻击敌人' }
    ]
  },
  '火焰山': {
    name: '火焰山',
    skills: [
      { name: '烈火诀', type: '火', multiplier: 1.3, description: '释放火焰攻击' },
      { name: '火遁术', type: '火', multiplier: 1.0, description: '瞬移到敌人身后' },
      { name: '焚天煮海', type: '火', multiplier: 2.0, description: '终极火系技能' }
    ]
  },
  '冰雪原': {
    name: '冰雪原',
    skills: [
      { name: '冰锥术', type: '水', multiplier: 1.2, description: '发射冰锥攻击' },
      { name: '寒冰护体', type: '水', multiplier: 0.8, description: '提升防御力' },
      { name: '冰封万里', type: '水', multiplier: 1.8, description: '冻结敌人' }
    ]
  }
};

class SkillService {
  constructor() {
    this.db = loadDatabase();
  }

  getSectSkills(sectName) {
    return SECT_SKILLS[sectName]?.skills || [];
  }

  getCharacterSkills(characterId) {
    const gongfas = this.db.gongfa.filter(g => g.character_id === characterId && g.type === '战斗');
    const skills = [];
    for (const gf of gongfas) {
      const item = this.db.items.find(i => i.id === gf.item_id);
      if (item) {
        const stats = JSON.parse(item.stats || '{}');
        skills.push({
          id: gf.id,
          name: item.name,
          element: stats.element || '金',
          multiplier: stats.skill_damage || 1.0,
          level: gf.level,
          exp: gf.exp,
          description: item.description
        });
      }
    }
    return skills;
  }

  learnSkill(characterId, skillId) {
    const character = this.db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const item = this.db.items.find(i => i.id === skillId);
    if (!item || item.type !== '功法') {
      return { success: false, error: '无效的功法' };
    }

    const existingGongfa = this.db.gongfa.find(
      g => g.character_id === characterId && g.item_id === skillId
    );
    if (existingGongfa) {
      return { success: false, error: '已经学习了该功法' };
    }

    const slot = this.getNextSlot(characterId);
    if (slot === null) {
      return { success: false, error: '技能槽位已满，无法再挂载' };
    }

    const gongfaId = getNextId('gongfa');
    this.db.gongfa.push({
      id: gongfaId,
      character_id: characterId,
      type: '战斗',
      slot,
      item_id: skillId,
      level: 1,
      exp: 0
    });

    this.save();
    return { success: true, gongfaId };
  }

  /**
   * 取第一个空槽；**满槽返回 null**（旧实现 return 1，会让两件功法静默撞同一槽）。
   * 槽位上限由境界决定：min(2 + 境界序号, 8)。
   */
  getNextSlot(characterId) {
    const B = require('../../config/balance');
    const ch = (this.db.characters || []).find((c) => c.id === characterId);
    const realms = this.db.realms || [];
    const realmIndex = ch ? realms.findIndex((r) => r.name === ch.realm) : -1;
    const cap = B.skillSlotCap(realmIndex);

    const usedSlots = this.db.gongfa
      .filter(g => g.character_id === characterId && g.type === '战斗')
      .map(g => g.slot);
    for (let i = 1; i <= cap; i++) {
      if (!usedSlots.includes(i)) return i;
    }
    return null;
  }

  upgradeSkill(gongfaId) {
    const gongfa = this.db.gongfa.find(g => g.id === gongfaId);
    if (!gongfa) return { success: false, error: '功法不存在' };

    const expRequired = gongfa.level * 100;
    if (gongfa.exp < expRequired) {
      return { success: false, error: '经验不足' };
    }

    gongfa.exp -= expRequired;
    gongfa.level++;
    this.save();

    return { success: true, level: gongfa.level };
  }

  addSkillExp(gongfaId, amount) {
    const gongfa = this.db.gongfa.find(g => g.id === gongfaId);
    if (!gongfa) return null;

    gongfa.exp += amount;
    this.save();
    return gongfa;
  }

  save() {
    saveDatabase(this.db);
  }
}

module.exports = new SkillService();
