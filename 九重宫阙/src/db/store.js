/**
 * SQLite 存储层（阶段1）—— node:sqlite 原生驱动，零外部依赖
 *
 * 架构：进程级内存镜像 + 事务落盘
 *   - loadDatabase() 返回进程生命周期内的同一镜像对象（根除旧 100ms TTL 缓存
 *     跨引用丢失更新的并发灾难）
 *   - saveDatabase(data) 立即事务落盘「有变化的集合」（diff 快照，行级 JSON 文档）
 *   - 安全网：20s 脏检查自动落盘 + 进程退出钩子强制落盘
 *   - 首次启动自动从 legacy data/game.json 一次性迁移
 *
 * 集合表结构：col_<name>(rowid INTEGER PK AUTOINCREMENT, doc_id TEXT, data TEXT)
 *   任意数组集合动态建表；新系统（宗门/交易行/AI/编年史）使用 schema.sql 中的关系表。
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'game.db');
const LEGACY_JSON = path.join(DATA_DIR, 'game.json');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

let sqlite = null;
let mirror = null;
let persisted = new Map(); // collection -> 上次落盘 JSON 快照
let dirty = false;
let autosaveTimer = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureCollectionTable(name) {
  // 防注入：集合名只能出现于动态 DDL，白名单校验
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`非法集合名: ${name}`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS col_${name} (rowid INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, data TEXT NOT NULL)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_col_${name}_docid ON col_${name}(doc_id)`);
}

function boot() {
  if (sqlite) return mirror;
  ensureDataDir();
  sqlite = new DatabaseSync(DB_FILE);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));

  mirror = { id_counters: {} };
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'col_%'")
    .all();
  for (const { name } of tables) {
    const collName = name.slice(4);
    const rows = sqlite.prepare(`SELECT doc_id, data FROM col_${collName} ORDER BY rowid`).all();
    mirror[collName] = rows.map((r) => JSON.parse(r.data));
    persisted.set(collName, JSON.stringify(mirror[collName]));
  }
  for (const r of sqlite.prepare('SELECT key, value FROM meta').all()) {
    try {
      mirror[r.key] = JSON.parse(r.value);
    } catch (_) { /* 跳过损坏 meta */ }
  }
  if (!Array.isArray(mirror.id_counters)) mirror.id_counters = {};

  // 一次性迁移：库为空且存在 legacy JSON
  if (tables.length === 0 && fs.existsSync(LEGACY_JSON)) {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8'));
    for (const [k, v] of Object.entries(legacy)) mirror[k] = v;
    if (!Array.isArray(mirror.id_counters)) {
      mirror.id_counters = legacy.id_counters && typeof legacy.id_counters === 'object' ? legacy.id_counters : {};
    }
    flushAll();
    console.log('[store] 已从 game.json 一次性迁移至 SQLite (data/game.db)');
  }

  autosaveTimer = setInterval(() => {
    if (dirty) {
      try { flushAll(); } catch (e) { console.error('[store] 自动落盘失败:', e.message); }
    }
  }, 20000);
  autosaveTimer.unref();

  return mirror;
}

function flushAll() {
  if (!sqlite || !mirror) return 0;
  let wrote = 0;
  sqlite.exec('BEGIN');
  try {
    for (const [collName, arr] of Object.entries(mirror)) {
      if (!Array.isArray(arr)) continue;
      ensureCollectionTable(collName);
      const snap = JSON.stringify(arr);
      if (persisted.get(collName) === snap) continue;
      sqlite.exec(`DELETE FROM col_${collName}`);
      const ins = sqlite.prepare(`INSERT INTO col_${collName} (doc_id, data) VALUES (?, ?)`);
      for (const item of arr) {
        ins.run(item && item.id !== undefined ? String(item.id) : null, JSON.stringify(item));
      }
      persisted.set(collName, snap);
      wrote += 1;
    }
    const upsert = sqlite.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    upsert.run('id_counters', JSON.stringify(mirror.id_counters || {}));
    for (const [k, v] of Object.entries(mirror)) {
      if (Array.isArray(v) || k === 'id_counters' || v === undefined) continue;
      upsert.run(k, JSON.stringify(v));
    }
    sqlite.exec('COMMIT');
    dirty = false;
    return wrote;
  } catch (e) {
    try { sqlite.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  }
}

function loadDatabase() {
  boot();
  return mirror;
}

function saveDatabase(data) {
  boot();
  if (data && typeof data === 'object') mirror = data;
  dirty = true;
  flushAll();
}

/**
 * 自愈式 id 推导：以集合实际最大 id 为准（阶段0 修复的延续）。
 * 镜像常驻进程后，计数器不再有跨引用丢失问题；本实现保持等价语义。
 */
function getNextId(collection) {
  const db = loadDatabase();
  if (!db.id_counters) db.id_counters = {};
  let maxId = Number(db.id_counters[collection]) || 0;
  const list = db[collection];
  if (Array.isArray(list)) {
    for (const item of list) {
      const id = Number(item && item.id);
      if (Number.isFinite(id) && id > maxId) maxId = id;
    }
  }
  const next = maxId + 1;
  db.id_counters[collection] = next;
  return next;
}

function invalidateCache() {
  // 兼容保留：镜像常驻，无需失效（旧 TTL 机制已退役）
}

function isDirty() {
  return dirty;
}

/** 进程退出前调用：落盘 + 关库 */
function close() {
  if (autosaveTimer) clearInterval(autosaveTimer);
  if (dirty) {
    try { flushAll(); } catch (e) { console.error('[store] 退出落盘失败:', e.message); }
  }
  if (sqlite) {
    try { sqlite.close(); } catch (_) { /* ignore */ }
    sqlite = null;
  }
}

module.exports = { boot, loadDatabase, saveDatabase, getNextId, flushAll, invalidateCache, isDirty, close };
