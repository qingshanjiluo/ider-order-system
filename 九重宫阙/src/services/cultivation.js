const { loadDatabase, saveDatabase } = require('../database');
const characterService = require('./character');
const injuryService = require('./injury');

class CultivationService {
  /** 灵气浓度（决议 v2 修炼杠杆）：地图难度 + 洞府地脉加成 */
  getSpiritDensity(character) {
    const db = loadDatabase();
    let density = 1.0;
    const map = (db.maps || []).find((m) => m.id === (character.afk_map || 1));
    if (map && map.difficulty) {
      density += (map.difficulty - 1) * 0.05; // 高阶地图灵气更浓
    }
    // 洞府地脉（数据由洞府系统写入，存在即生效）
    const veinLevel = Number(character.cave_vein_level) || 0;
    if (veinLevel > 0) density += veinLevel * 0.05;
    return density;
  }

  getCultivationSpeed(character) {
    const db = loadDatabase();
    let speed = 1.0;
    // 吐纳功法（主修=修炼类功法全加成；副修功法体系阶段4接入）
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
    // 伤势修炼减速（决议 D5）
    speed *= injuryService.getDebuffs(character).cultivateMultiplier;
    // 灵气浓度
    speed *= this.getSpiritDensity(character);
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

    // 决议 D1：离线修炼 100% 效率（与在线一致），离线时间同时 100% 推进游戏年龄
    // （年龄推进由 gameTime.settleTime 在角色加载/登录时统一结算）
    const speed = this.getCultivationSpeed(character);
    const expPerSecond = Math.floor(10 * speed);
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
