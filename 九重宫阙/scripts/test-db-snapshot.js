#!/usr/bin/env node
/**
 * 第 23 套 · 存档快照与恢复（轮61）
 *
 * 起因是 P5 第 4 项"容器内备份→恢复演练"当场把存档弄丢了：
 *   store.js 开了 PRAGMA journal_mode = WAL，注册与角色写入都先落在 -wal 里；
 *   而备份用的是裸 copyFileSync(game.db)，把主库复制出来时 -wal 里的已提交事务并不在里面
 *   （最能骗人的是：主库 MD5 在注册前后一字未变，所以旧的"副本 vs 源 逐字节一致"检查恒真，
 *    查不出任何事）。删库还原后同一个账号登录 401 —— 备份是废的。
 *
 * 修法：用 SQLite 自己的 VACUUM INTO 出一致性单文件快照（store.snapshotTo / database.snapshotDatabase），
 * 它天然包含 WAL 内容且不与在线写入冲突。本套件既锁住修法，也留住陷阱的现场记录。
 *
 * 全程只写系统临时目录；正式存档 data/game.db 逐字节不得改动（末尾有校验）。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const liveBefore = fs.readFileSync(LIVE_DB);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-snapshot-'));
process.env.DSH_DATA_DIR = TMP;
fs.copyFileSync(LIVE_DB, path.join(TMP, 'game.db'));

const { loadDatabase, saveDatabase, snapshotDatabase } = require('../src/database');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

console.log('== 第 23 套 · 存档快照与恢复（临时数据目录）==');

const MARK = 610610;
let rowsLive = 0;

t('写入带探针的一行且刻意不 checkpoint（-wal 必须有内容，否则本套件的现场就没有意义）', () => {
  const db = loadDatabase();
  db.characters[0].snapshot_probe_61 = MARK;
  saveDatabase(db);
  rowsLive = (loadDatabase().characters || []).length;
  const wal = path.join(TMP, 'game.db-wal');
  const size = fs.existsSync(wal) ? fs.statSync(wal).size : 0;
  console.log(`  · 在用库 ${rowsLive} 个角色；此刻 -wal = ${size} B（>0 说明有已提交事务还没进主库文件）`);
  assert.ok(size > 0, '-wal 为空，无法演示 WAL 下的裸拷贝风险（可能已被自动 checkpoint）');
});

t('VACUUM INTO 快照：能独立打开、integrity ok、行数一致、探针在里面', () => {
  const dest = snapshotDatabase(path.join(TMP, 'snap-61.db'));
  assert.ok(fs.existsSync(dest), '快照文件没生成');
  const p = new DatabaseSync(dest, { readOnly: true });
  try {
    const ic = p.prepare('PRAGMA integrity_check').get();
    assert.ok(ic && ic.integrity_check === 'ok', 'integrity_check 未通过：' + JSON.stringify(ic));
    const n = p.prepare('SELECT COUNT(*) AS n FROM col_characters').get().n;
    assert.strictEqual(n, rowsLive, `快照角色数 ${n} 与在用库 ${rowsLive} 不一致`);
    const first = JSON.parse(p.prepare('SELECT data FROM col_characters LIMIT 1').get().data);
    assert.strictEqual(first.snapshot_probe_61, MARK,
      '快照里没有刚写入的探针 ⇒ VACUUM INTO 没吃到 WAL，修法不成立');
  } finally { p.close(); }
});

t('裸拷贝的不可靠性留档：同 -wal 状态下 copyFileSync 出来的副本可能没有探针', () => {
  const naive = path.join(TMP, 'naive-61.db');
  fs.copyFileSync(path.join(TMP, 'game.db'), naive);
  const p = new DatabaseSync(naive, { readOnly: true });
  let has = null;
  try {
    const first = JSON.parse(p.prepare('SELECT data FROM col_characters LIMIT 1').get().data);
    has = first.snapshot_probe_61 === MARK;
  } catch (e) { has = '读失败：' + e.message; }
  p.close();
  console.log(`  · 裸拷贝副本含探针 = ${has}（false 即轮61 容器演练遇到的丢写；true 只是这次恰好已 checkpoint，不能当作保证）`);
  // 这一条不拿"裸拷贝一定丢"当断言 —— 那取决于 checkpoint 时机，是竞态而非不变量。
  // 真正锁住的是：备份路径必须走快照（下一条静态锁），以及快照必须含数据（上一条）。
  assert.ok(typeof has === 'boolean', '裸拷贝副本读不出来，现场异常：' + has);
});

t('恢复往返：把快照当 game.db 放进新目录，读出来行数与探针都在', () => {
  const T2 = path.join(TMP, 'restore');
  fs.mkdirSync(T2, { recursive: true });
  fs.copyFileSync(path.join(TMP, 'snap-61.db'), path.join(T2, 'game.db'));
  const p = new DatabaseSync(path.join(T2, 'game.db'), { readOnly: true });
  try {
    const n = p.prepare('SELECT COUNT(*) AS n FROM col_characters').get().n;
    assert.strictEqual(n, rowsLive, '还原后的库行数对不上');
    const first = JSON.parse(p.prepare('SELECT data FROM col_characters LIMIT 1').get().data);
    assert.strictEqual(first.snapshot_probe_61, MARK, '还原后探针丢失');
  } finally { p.close(); }
});

t('静态锁：备份与隔离副本都必须走 snapshotDatabase，不许退回裸拷贝（含旧的恒真比对）', () => {
  // 先剥注释再扫：否则我写在注释里的"这里原来是裸拷贝"会把锁自己打红（轮61 真发生过）
  const bare = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const bk = bare('scripts/backup.js');
  const as = bare('scripts/attack-sim.js');
  assert.ok(/snapshotDatabase\(/.test(bk), 'backup.js 不再使用 snapshotDatabase ⇒ 会退回 WAL 丢写的裸拷贝');
  assert.ok(/snapshotDatabase\(/.test(as), 'attack-sim.js 的隔离副本不再使用 snapshotDatabase ⇒ 仿真可能读到缺数据的库');
  assert.ok(!/copyFileSync\(DB,/.test(bk), 'backup.js 里又出现了 copyFileSync(DB, ...) 形式的存档拷贝');
  assert.ok(!/逐字节一致=\$\{same\}/.test(bk),
    'backup.js 又用"副本 vs 源 逐字节一致"自我认证 —— 那是恒真式，WAL 丢写查不出来');
  const st = fs.readFileSync(path.join(ROOT, 'src', 'db', 'store.js'), 'utf8');
  assert.ok(/VACUUM INTO/.test(st) && /snapshotTo/.test(st), 'store.js 的快照实现被改动');
  const facade = fs.readFileSync(path.join(ROOT, 'src', 'database.js'), 'utf8');
  assert.ok(/snapshotDatabase/.test(facade), 'database.js 门面不再导出 snapshotDatabase');
});

t('快照目标不许指向在用库（防自我覆盖造成真丢档）', () => {
  assert.throws(() => snapshotDatabase(path.join(TMP, 'game.db')), /不能是在用的 game\.db/);
});

const liveAfter = fs.readFileSync(LIVE_DB);
t('正式存档 data/game.db 未被本套件写动（只写临时目录）', () => {
  assert.ok(liveBefore.equals(liveAfter), 'data/game.db 被改动了，隔离失败');
});

try { require('../src/database').closeDatabase(); } catch (_) { /* 已关 */ }
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { console.log('  · 临时目录未删净（Windows 文件锁）：' + e.code); }
console.log(`\n  存档快照与恢复: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
