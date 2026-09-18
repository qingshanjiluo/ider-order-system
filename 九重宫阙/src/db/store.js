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

// 可被 DSH_DATA_DIR 覆盖：轮41 的"空库重建链"锁必须在临时目录里跑完整 seed，
// 不能拿正式存档做破坏性实验（写死路径 = 这条路径永远测不到，所以它坏了三轮都没人发现）。
const DATA_DIR = process.env.DSH_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'game.db');
const LEGACY_JSON = path.join(DATA_DIR, 'game.json');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

/**
 * 文档集合白名单（对应当前库里 22 张 col_*，由 `git` 跟踪的 game.db 枚举得来）。
 * 空库启动时这些键必须是**空数组而不是 undefined** —— 否则 initDatabase 与 33 个路由
 * 里的 `db.realms.length` / `db.items.push` 类写法会直接 TypeError（轮41 实测正是如此）。
 * 新系统落文档集合时要在此登记，否则只有写过一次才存在，等于把崩溃留给下个进程。
 */
const DOC_COLLECTIONS = [
  'achievements', 'blueprints', 'character_buffs', 'characters', 'checkin', 'dungeons',
  'equipments', 'forge_recipes', 'friends', 'gongfa', 'guild_members', 'guilds', 'inventory',
  'items', 'maps', 'monsters', 'pets', 'player_skills', 'realms', 'recipes',
  'shop', 'skills', 'users'
];

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
  // 增量列迁移（SQLite 无 ADD COLUMN IF NOT EXISTS，靠幂等 try）
  for (const ddl of [
    'ALTER TABLE sects ADD COLUMN key TEXT',
    'ALTER TABLE sects ADD COLUMN gongfa_focus TEXT'
  ]) {
    try { sqlite.exec(ddl); } catch (_) { /* 列已存在 */ }
  }

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

  // 空库自愈：白名单里的集合一律补成数组（已存在的不动），让 db.X 在任何环境下都不是 undefined
  for (const name of DOC_COLLECTIONS) {
    if (!Array.isArray(mirror[name])) {
      mirror[name] = [];
      if (!persisted.has(name)) persisted.set(name, '[]');
    }
  }

  // 角色字段自愈（轮114）。
  //
  // 起因：存档实测角色 2「最中幻想」**缺 `max_hp`/`max_mp`/`exp_to_next`** ——
  // 它是更早期版本创建的角色，而 `auth.js` 的新建路径与 `services/character.js`
  // 的升级路径都只在"升了一级"时才算这些值，**没有任何路径会给 level 1 的老角色补齐**。
  //
  // 后果不是崩溃，而是**同一个概念在三个地方给出三个值**：
  //     存档 hp=120 · 战斗 getEntity 算出 maxHp=144 · calculateHpMax(1,炼气)=110
  // 各处靠各自的兜底（`character.max_hp || 100`）苟活，玩家看到的血条上限
  // 取决于哪段代码先说话。旧字段 `hp_max`/`mp_max` 也正是因此不能删 ——
  // 它们是那 1/32 角色的唯一上限来源。
  //
  // 实现在 boot 里（而非 loadDatabase，后者有 330 个调用点），靠 boot 的
  // `if (sqlite) return` 保证每进程只跑一次。数值取自与服务层**同一个函数**
  // （`services/character` 的 calculate*），不另写一套公式 —— 否则又会造出第四个上限。
  healCharacterFields(mirror);

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

/**
 * 角色字段自愈（轮114）。
 *
 * 补的是**只该由代码计算、不该由客户端提供**的真源字段。
 * 判据很简单：这些字段在 `auth.js` 新建路径里是必填的，
 * 所以任何一个角色缺它们，都只可能是"老版本建的档"，不是合法状态。
 *
 * 三条不变量：
 *   ① **幂等**：只在字段为 `null`/`undefined` 时写，已有值一律不动。
 *   ② **同源**：数值来自 `services/character` 的 calculate*，与服务层共用公式。
 *   ③ **收敛**：补齐后 hp/mp 不得超过新上限（老档可能带着超上限的值）。
 *
 * 自愈失败不阻断启动 —— 与 `boot()` 里的"空库自愈"保持同样的容错姿态。
 * 这里返回补了几个字段，供测试直接断言，不依赖读日志。
 */
function healCharacterFields(db) {
  try {
    const charSvc = require('../services/character');
    let healed = 0;
    let cleaned = 0;
    for (const ch of (db.characters || [])) {
      if (!ch || typeof ch !== 'object') continue;
      const realm = ch.realm || '炼气';
      const level = Number(ch.level) || 1;

      if (ch.max_hp == null) {
        const v = charSvc.calculateHpMax(level, realm);
        if (Number.isFinite(v) && v > 0) { ch.max_hp = v; healed++; }
      }
      if (ch.max_mp == null) {
        const v = charSvc.calculateMpMax(level, realm);
        if (Number.isFinite(v) && v > 0) { ch.max_mp = v; healed++; }
      }

      // 注意：**不在这里补 `exp_to_next`**。
      //
      // 第一版补了，被 `G3 经验真源` 锁抓红 —— `test-exp-curve-e2e.js` 要求
      // `exp_to_next` 的赋值点只出现在真源文件内（character.js / exp-curve.js /
      // auth.js / gameTime.js / realm.js）。那条锁是对的：
      // 经验曲线一旦有第二个写入点，就会出现"两处算出不同升级需求"的分叉，
      // 正是 `exp_to_next` 这一族 bug 的成因。
      //
      // 所以这里只补**纯属性上限**（max_hp/max_mp 没有第二真源的问题）；
      // `exp_to_next` 的缺失由走 `characterService.addExp` 的路径自然补齐
      // （升级时重算），不在此处越权。这也是本轮"自愈要走服务层同源"原则的
      // 一个边界：**同源不只是数值同源，写入权也要同源**。

      // 补齐后收敛，避免"血比上限多"
      if (ch.hp != null && ch.max_hp != null && ch.hp > ch.max_hp) ch.hp = ch.max_hp;
      if (ch.mp != null && ch.max_mp != null && ch.mp > ch.max_mp) ch.mp = ch.max_mp;

      // 残留清理（轮115）：角色行上的 camelCase 上限是历史残留。
      //
      // 实测存档：角色 1/2 的行上同时有 `maxHp=120`（两个角色都是 120）、
      // `max_hp=100/110`、`hp=100/110` —— **同一个概念三个值**。
      // `maxHp=120` 既不等于真源上限，也不等于当前血量，是个写进去就没人管的数。
      //
      // 判据（三条都成立才删，缺一不可）：
      //   ① 同集合所有行**都用** snake_case 真源（`max_hp`），camelCase 是少数派
      //   ② 全项目**无任何代码**读取"角色行"的 `.maxHp` ——
      //      `forge-systems.js` 里那些 `maxHp:` 是**装备 stats 的键**，不同对象，
      //      所以这里按"角色行"限定，而不是全局搜字段名
      //   ③ 真源存在（删了不会让角色失去上限）
      //
      // 用 `delete` 而不是置 0/null，否则"字段存在但为空"会继续骗过存在性检查。
      //
      // **安全边界**：只有真源确实存在时才删。若 `max_hp` 既缺失又补不出来
      //（realm 非法等），删掉 `maxHp` 会让角色彻底没有上限 ——
      // 那比留着一个错值更糟。宁可留脏，不可留空。
      for (const stale of ['maxHp', 'maxMp']) {
        const truth = stale === 'maxHp' ? 'max_hp' : 'max_mp';
        if (ch[stale] != null && ch[truth] != null) {
          delete ch[stale];
          cleaned++;
        }
      }

      // 上古遗留字段清理（轮116）。
      //
      // 这 4 个字段只在 2/32 个角色（同一批老档）上存在，**全项目 0 处读取角色行
      // 上的它们**。逐个核实过每个"同名出现点"挂在哪：
      //
      //   · `hp_max` / `mp_max` / `exp_max`
      //     真源是 `max_hp` / `max_mp` / `exp_to_next`（snake_case，32/32 持有）。
      //     `src/routes/battle.js:57` 那处 `{ hp_max: ... }` 是
      //     **机会记录器（opportunity.record）自己的字段**，不同对象，与本清理解耦。
      //
      //   · `sect_contribution`
      //     宗门贡献的真源是**关系表 `sect_members.contribution`**
      //     （`services/sect.js` 的 `addContribution` 走 `store.incrementRel`）。
      //     项目自己把它与仙盟贡献（`guild_members.contribution`）严格分离 ——
      //     见 `services/sect.js` 顶部注释。角色行上的这个是第三处，无人读。
      //
      // 清理前提（三条都成立）：
      //   ① 全项目无任何代码读"角色行"上的这些字段（已按挂载变量逐个核实）
      //   ② 真源存在（`max_hp`/`max_mp` 刚刚补过；`exp_to_next` 由经验真源路径负责，
      //      这里**只删字段、不写 exp_to_next**，避免违反 G3 经验真源锁）
      //   ③ 字段值本身没有信息量（实测全是 `hp_max=100 mp_max=50 exp_max=100
      //      sect_contribution=0`，即出厂默认值，不是玩家积累的数据）
      //
      // 与 `maxHp` 同样的安全边界：真源缺失时留着，不制造"数值为空"。
      for (const stale of ['hp_max', 'mp_max', 'exp_max', 'sect_contribution']) {
        const truth = stale === 'hp_max' ? 'max_hp'
          : stale === 'mp_max' ? 'max_mp'
            : stale === 'exp_max' ? 'exp_to_next'
              : null;   // sect_contribution 的真源在关系表，无同名角色字段可查
        // 需要真源才能删的，检查真源存在；关系表真源无法在此探测，
        // 改用"字段值为出厂默认值"作充分条件（见下方说明）
        const truthOk = truth
          ? ch[truth] != null
          : Number(ch[stale]) === 0;
        if (ch[stale] != null && truthOk) {
          delete ch[stale];
          cleaned++;
        }
      }
    }
    if (healed > 0 || cleaned > 0) {
      dirty = true;
      console.log(`[store] 角色字段自愈：补齐 ${healed} 个缺失的属性上限，清理 ${cleaned} 个残留字段`);
    }
    return healed;
  } catch (e) {
    console.error('[store] 角色字段自愈失败（不影响启动）:', e.message);
    return 0;
  }
}

/**
 * 一致性快照（轮61）：本项目 store.js 开了 `PRAGMA journal_mode = WAL`，
 * 裸 `copyFileSync(game.db)` **会丢掉尚未 checkpoint 的已提交事务**。
 * 容器恢复演练当场复现：注册成功 → cp 主库 → 删库还原 → 同账号登录 401，
 * 而主库的 MD5 在注册前后一字未变（写都进 -wal 了），所以旧"逐字节比对"永远查不出这事。
 * VACUUM INTO 由 SQLite 自己写出一个含 WAL 内容的完整单文件，且不与在线写入冲突。
 */
function snapshotTo(destFile) {
  const abs = require('path').resolve(destFile);
  if (abs === require('path').resolve(DB_FILE)) throw new Error('快照目标不能是在用的 game.db');
  boot();
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  sqlite.exec(`VACUUM INTO '${abs.replace(/'/g, "''")}'`);
  return abs;
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

// ---------- v2 关系表通用读写（schema.sql 中定义的表） ----------
const REL_TABLES = new Set([
  'sects', 'sect_members', 'sect_buildings', 'sect_posts', 'guild_build_queue',
  'lifespan_events', 'market_listings', 'market_orders', 'market_rates',
  'ai_keys', 'ai_generations', 'sect_library'
]);

const okCol = (k) => /^[a-z_][a-z0-9_]*$/.test(k);
const bindVal = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

/** 插入关系表记录，返回自增 id */
function insertRel(table, obj) {
  boot();
  if (!REL_TABLES.has(table)) throw new Error(`非法关系表: ${table}`);
  const cols = Object.keys(obj || {}).filter(okCol);
  if (!cols.length) throw new Error('无有效列');
  const placeholders = cols.map(() => '?').join(',');
  const stmt = sqlite.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
  const info = stmt.run(...cols.map((c) => bindVal(obj[c] === undefined ? null : obj[c])));
  return Number(info.lastInsertRowid);
}

/** 查询关系表（等值条件），可选排序（默认 rowid，兼容无 id 列的表如 market_rates） */
function queryRel(table, where = {}, orderBy = 'rowid') {
  boot();
  if (!REL_TABLES.has(table)) throw new Error(`非法关系表: ${table}`);
  const keys = Object.keys(where || {}).filter(okCol);
  let sql = `SELECT * FROM ${table}`;
  const params = [];
  if (keys.length) {
    sql += ' WHERE ' + keys.map((k) => `${k} = ?`).join(' AND ');
    params.push(...keys.map((k) => bindVal(where[k])));
  }
  if (orderBy && /^[a-z_][a-z0-9_]*$/.test(orderBy)) sql += ` ORDER BY ${orderBy}`;
  return sqlite.prepare(sql).all(...params);
}

/** 按条件更新关系表记录（适配无 id 列的表） */
function updateRelWhere(table, where, patch) {
  boot();
  if (!REL_TABLES.has(table)) throw new Error(`非法关系表: ${table}`);
  const wKeys = Object.keys(where || {}).filter(okCol);
  const pCols = Object.keys(patch || {}).filter(okCol);
  if (!wKeys.length || !pCols.length) return;
  const sql = `UPDATE ${table} SET ${pCols.map((c) => `${c} = ?`).join(',')} WHERE ${wKeys.map((k) => `${k} = ?`).join(' AND ')}`;
  sqlite.prepare(sql).run(...pCols.map((c) => bindVal(patch[c])), ...wKeys.map((k) => bindVal(where[k])));
}

/** 更新关系表记录（按 id） */
function updateRel(table, id, patch) {
  boot();
  if (!REL_TABLES.has(table)) throw new Error(`非法关系表: ${table}`);
  const cols = Object.keys(patch || {}).filter(okCol);
  if (!cols.length) return;
  const set = cols.map((c) => `${c} = ?`).join(',');
  sqlite.prepare(`UPDATE ${table} SET ${set} WHERE id = ?`).run(...cols.map((c) => bindVal(patch[c])), id);
}

/** 删除关系表记录（等值条件） */
function deleteRel(table, where = {}) {
  boot();
  if (!REL_TABLES.has(table)) throw new Error(`非法关系表: ${table}`);
  const keys = Object.keys(where || {}).filter(okCol);
  if (!keys.length) throw new Error('deleteRel 需要条件');
  const sql = `DELETE FROM ${table} WHERE ` + keys.map((k) => `${k} = ?`).join(' AND ');
  sqlite.prepare(sql).run(...keys.map((k) => bindVal(where[k])));
}

/** 数值列自增（delta 可负） */
function incrementRel(table, id, column, delta) {
  boot();
  if (!REL_TABLES.has(table)) throw new Error(`非法关系表: ${table}`);
  if (!okCol(column)) throw new Error(`非法列名: ${column}`);
  sqlite.prepare(`UPDATE ${table} SET ${column} = COALESCE(${column}, 0) + ? WHERE id = ?`).run(delta, id);
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

module.exports = { boot, loadDatabase, saveDatabase, getNextId, flushAll, invalidateCache, isDirty, close, insertRel, queryRel, updateRel, updateRelWhere, deleteRel, incrementRel, snapshotTo, healCharacterFields };
