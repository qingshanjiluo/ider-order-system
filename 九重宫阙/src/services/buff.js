const { loadDatabase, saveDatabase } = require('../database');

class BuffService {
  getActiveBuffs(characterId) {
    const db = loadDatabase();
    if (!db.character_buffs) db.character_buffs = [];
    const now = Date.now();
    return db.character_buffs.filter(b => b.character_id === characterId && b.expires_at > now);
  }

  addBuff(characterId, type, value, durationMs) {
    const db = loadDatabase();
    if (!db.character_buffs) db.character_buffs = [];

    const existing = db.character_buffs.find(b => b.character_id === characterId && b.type === type);
    if (existing) {
      existing.value = Math.max(existing.value, value);
      existing.expires_at = Math.max(existing.expires_at, Date.now() + durationMs);
    } else {
      db.character_buffs.push({
        id: Date.now(),
        character_id: characterId,
        type,
        value,
        expires_at: Date.now() + durationMs,
        created_at: Date.now()
      });
    }
    saveDatabase(db);
  }

  removeBuff(characterId, type) {
    const db = loadDatabase();
    if (!db.character_buffs) return;
    db.character_buffs = db.character_buffs.filter(b => !(b.character_id === characterId && b.type === type));
    saveDatabase(db);
  }

  cleanupExpired() {
    const db = loadDatabase();
    if (!db.character_buffs) return;
    const now = Date.now();
    db.character_buffs = db.character_buffs.filter(b => b.expires_at > now);
    saveDatabase(db);
  }

  getBuffMultiplier(characterId, statType) {
    const buffs = this.getActiveBuffs(characterId);
    let multiplier = 1.0;
    for (const buff of buffs) {
      if (buff.type === statType || buff.type === 'all') {
        multiplier += (buff.value - 1.0);
      }
    }
    return multiplier;
  }

  applyGuildShopBuff(characterId, itemName) {
    const buffDefinitions = {
      '培元丹': { type: 'exp', value: 1.5, duration: 3600000 },
      '聚灵丹': { type: 'attack', value: 1.2, duration: 3600000 },
      '铁壁丹': { type: 'defense', value: 1.2, duration: 3600000 },
      '疾风丹': { type: 'speed', value: 1.3, duration: 3600000 },
      // 内容富集四期：进阶丹药 + 阵法（同一使用管线）
      '淬体丹': { type: 'defense', value: 1.15, duration: 7200000 },
      '凝神丹': { type: 'exp', value: 1.3, duration: 7200000 },
      '龙血丹': { type: 'attack', value: 1.35, duration: 3600000 },
      '聚灵阵': { type: 'exp', value: 1.15, duration: 28800000 },
      '固元阵': { type: 'defense', value: 1.15, duration: 28800000 },
      '破军杀阵': { type: 'attack', value: 1.25, duration: 14400000 },
      '五行大阵': { type: 'all', value: 1.1, duration: 43200000 },
      // 符箓（短时爆发型）
      '烈火符': { type: 'attack', value: 1.2, duration: 1800000 },
      '寒冰符': { type: 'speed', value: 1.2, duration: 1800000 },
      '护身符': { type: 'defense', value: 1.25, duration: 1800000 },
      '驱邪符': { type: 'all', value: 1.05, duration: 7200000 }
    };
    const def = buffDefinitions[itemName];
    if (def) {
      this.addBuff(characterId, def.type, def.value, def.duration);
      return { success: true, buff: def, message: `${itemName}效果已激活，持续${def.duration / 60000}分钟` };
    }
    return { success: false, message: '该物品无法使用' };
  }
}

module.exports = new BuffService();
