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

  if (!Array.isArray(db.realms) || db.realms.length === 0) {   // 空库自愈：不能假设 store 白名单已覆盖本集合
    db.realms = [
      { id: 1, name: '炼气', min_level: 1, max_level: 10, stages: '前期,中期,后期', exp_requirement: 5200000 },
      { id: 2, name: '筑基', min_level: 11, max_level: 20, stages: '前期,中期,后期', exp_requirement: 31000000 },
      { id: 3, name: '金丹', min_level: 21, max_level: 30, stages: '前期,中期,后期', exp_requirement: 220000000 },
      { id: 4, name: '元婴', min_level: 31, max_level: 40, stages: '前期,中期,后期,半步', exp_requirement: 1400000000 },
      { id: 5, name: '化神', min_level: 41, max_level: 50, stages: '前期,中期,后期,半步', exp_requirement: 60000000000 },
      { id: 6, name: '炼虚', min_level: 51, max_level: 60, stages: '前期,中期,后期,半步', exp_requirement: 390000000000 },
      { id: 7, name: '合体', min_level: 61, max_level: 70, stages: '前期,中期,后期,半步', exp_requirement: 2500000000000 },
      { id: 8, name: '大乘', min_level: 71, max_level: 80, stages: '前期,中期,后期,半步', exp_requirement: 16000000000000 },
      { id: 9, name: '渡劫', min_level: 81, max_level: 90, stages: '前期,中期,后期,半步', exp_requirement: 100000000000000 },
      { id: 10, name: '飞升', min_level: 91, max_level: 100, stages: '前期,中期,后期,半步', exp_requirement: 650000000000000 }
    ];
  }

  // 轮42：此处**不再兜底播种 maps / items**。原先这 6 张图与 6 件物品只在空库时插入，
  // 于是抢先占掉 id 1-6；而 init-db / expand-data 的插入都是"id 已存在则跳过"，
  // 结果带 monsters/gather_nodes 的正式地图被这批贫字段行遮蔽 —— 全新安装会拿到
  // "没有刷怪表与采集点"的地图（存档当年是从 game.json 迁移来的、长度非 0，兜底没触发，
  // 所以这个 bug 十年不发作，只有空库重建才暴露）。
  // 集合的存在性由 src/db/store.js 的 DOC_COLLECTIONS 白名单负责（自愈成空数组），无需在此造样本。
  // realms 的兜底保留：它是所有路由与境界曲线的依赖，且与 seed 不抢 id、各处定义一致。
  if (!Array.isArray(db.id_counters)) db.id_counters = {};

  saveDatabase(db);
  console.log('数据库初始化完成');
}

module.exports = { loadDatabase, saveDatabase, getNextId, invalidateCache, initDatabase, closeDatabase };
