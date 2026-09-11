const { loadDatabase, saveDatabase } = require('../database');
const characterService = require('./character');

class CultivationService {
  getCultivationSpeed(character) {
    const db = loadDatabase();
    let speed = 1.0;
    const gongfas = db.gongfa.filter(g => g.character_id === character.id && g.type === '修炼');
    for (const gf of gongfas) {
      const item = db.items.find(i => i.id === gf.item_id);
      if (item) {
        const stats = JSON.parse(item.stats || '{}');
        speed *= stats.cultivation_speed || 1;
      }
      speed *= 1 + ((gf.level || 1) - 1) * 0.02;
    }
    const realmBonus = 1 + this.getRealmIndex(character.realm) * 0.1;
    speed *= realmBonus;
    const buffService = require('./buff');
    const buffMultiplier = buffService.getBuffMultiplier(character.id, 'exp');
    speed *= buffMultiplier;
    return speed;
  }

  getRealmIndex(realm) {
    return ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'].indexOf(realm);
  }

  cultivate(characterId, durationSeconds) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;

    const speed = this.getCultivationSpeed(character);
    const expPerSecond = Math.floor(10 * speed);
    const totalExp = expPerSecond * durationSeconds;

    const result = characterService.addExp(characterId, totalExp);
    return {
      expGained: totalExp,
      speed,
      ...result
    };
  }

  offlineCultivate(characterId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;

    const lastLogin = new Date(character.last_login).getTime();
    const now = Date.now();
    const offlineSeconds = Math.floor((now - lastLogin) / 1000);
    const maxOffline = 250 * 60 * 60;
    const actualOffline = Math.min(offlineSeconds, maxOffline);

    if (actualOffline <= 0) return null;

    const speed = this.getCultivationSpeed(character) * 0.5;
    const expPerSecond = Math.floor(5 * speed);
    const totalExp = expPerSecond * actualOffline;

    const result = characterService.addExp(characterId, totalExp);

    const expPerHour = Math.floor(expPerSecond * 3600);
    const hours = Math.floor(actualOffline / 3600);
    const minutes = Math.floor((actualOffline % 3600) / 60);

    return {
      offlineTime: `${hours}小时${minutes}分钟`,
      expGained: totalExp,
      expPerHour,
      speed,
      ...result
    };
  }
}

module.exports = new CultivationService();
