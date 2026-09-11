/**
 * 数据库兼容层（阶段1 起）
 * 底层已切换 SQLite（src/db/store.js），对 33 个路由保持原 API 不变：
 *   loadDatabase / saveDatabase / getNextId / invalidateCache / initDatabase
 * 旧 JSON 文件存储（game.json 直读写 + 100ms TTL 缓存）已退役；
 * 首次启动自动从 data/game.json 一次性迁移至 data/game.db。
 */
const store = require('./db/store');

function loadDatabase() {
  return store.loadDatabase();
}

function saveDatabase(data) {
  store.saveDatabase(data);
}

function getNextId(collection) {
  return store.getNextId(collection);
}

function invalidateCache() {
  store.invalidateCache();
}

function closeDatabase() {
  store.close();
}

function initDatabase() {
  const db = loadDatabase();

  if (db.realms.length === 0) {
    db.realms = [
      { id: 1, name: '炼气', min_level: 1, max_level: 10, stages: '前期,中期,后期', exp_requirement: 100 },
      { id: 2, name: '筑基', min_level: 11, max_level: 20, stages: '前期,中期,后期', exp_requirement: 500 },
      { id: 3, name: '金丹', min_level: 21, max_level: 30, stages: '前期,中期,后期', exp_requirement: 2000 },
      { id: 4, name: '元婴', min_level: 31, max_level: 40, stages: '前期,中期,后期,半步', exp_requirement: 8000 },
      { id: 5, name: '化神', min_level: 41, max_level: 50, stages: '前期,中期,后期,半步', exp_requirement: 30000 },
      { id: 6, name: '炼虚', min_level: 51, max_level: 60, stages: '前期,中期,后期,半步', exp_requirement: 100000 },
      { id: 7, name: '合体', min_level: 61, max_level: 70, stages: '前期,中期,后期,半步', exp_requirement: 500000 },
      { id: 8, name: '大乘', min_level: 71, max_level: 80, stages: '前期,中期,后期,半步', exp_requirement: 2000000 },
      { id: 9, name: '渡劫', min_level: 81, max_level: 90, stages: '前期,中期,后期,半步', exp_requirement: 10000000 },
      { id: 10, name: '飞升', min_level: 91, max_level: 100, stages: '前期,中期,后期,半步', exp_requirement: 50000000 }
    ];
  }

  if (db.maps.length === 0) {
    db.maps = [
      { id: 1, name: '青云山麓', min_level: 1, max_level: 15, difficulty: 1, drop_rate: 1.0, description: '适合新手修炼的山麓地带' },
      { id: 2, name: '妖兽森林', min_level: 15, max_level: 30, difficulty: 2, drop_rate: 1.2, description: '妖兽出没的危险森林' },
      { id: 3, name: '火焰山', min_level: 30, max_level: 45, difficulty: 3, drop_rate: 1.5, description: '炽热的火焰山脉' },
      { id: 4, name: '冰雪原', min_level: 45, max_level: 60, difficulty: 4, drop_rate: 1.8, description: '寒冷的冰雪荒原' },
      { id: 5, name: '雷劫谷', min_level: 60, max_level: 75, difficulty: 5, drop_rate: 2.0, description: '雷电交加的危险山谷' },
      { id: 6, name: '混沌深渊', min_level: 75, max_level: 90, difficulty: 6, drop_rate: 2.5, description: '通往混沌的神秘深渊' }
    ];
  }

  if (db.items.length === 0) {
    db.items = [
      { id: 1, name: '铁剑', type: '装备', quality: '凡器', realm: '炼气', stats: '{"attack":5}', description: '普通的铁剑', subtype: 'weapon' },
      { id: 2, name: '青云剑', type: '装备', quality: '法器', realm: '筑基', stats: '{"attack":20}', description: '青云宗制式长剑', subtype: 'weapon' },
      { id: 3, name: '玄天甲', type: '装备', quality: '灵器', realm: '金丹', stats: '{"defense":30}', description: '玄天宗宝甲', subtype: 'chest' },
      { id: 4, name: '基础功法', type: '功法', quality: '黄阶', realm: '炼气', stats: '{"cultivation_speed":1.1}', description: '基础修炼功法' },
      { id: 5, name: '青云剑诀', type: '功法', quality: '玄阶', realm: '筑基', stats: '{"cultivation_speed":1.3,"skill_damage":1.2}', description: '青云宗剑法' },
      { id: 6, name: '小狐狸', type: '灵宠', quality: '凡兽', realm: '炼气', stats: '{"hp":50,"attack":5}', description: '可爱的小狐狸' }
    ];
  }

  if (!db.id_counters) db.id_counters = {};

  saveDatabase(db);
  console.log('数据库初始化完成');
}

module.exports = { loadDatabase, saveDatabase, getNextId, invalidateCache, initDatabase, closeDatabase };
