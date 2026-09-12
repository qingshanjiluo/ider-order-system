/**
 * E7 · 数据库一致性备份（无外部依赖：node:sqlite VACUUM INTO）
 * 为什么不 cp：SQLite 处于 WAL 模式，直接复制 .db 可能拿到与 -wal 不一致的半态。
 * 用法：node scripts/backup.js [--keep 30] [--dir ./backups]
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..');
const src = process.env.DB_PATH || path.join(root, 'data', 'game.db');
const argv = process.argv.slice(2);
const arg = (name, dft) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dft; };
const keep = Number(arg('keep', 30));
const dir = path.resolve(root, arg('dir', process.env.BACKUP_DIR || 'backups'));

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

if (!fs.existsSync(src)) { console.error(`[backup] 源库不存在：${src}`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });

const out = path.join(dir, `game-${stamp()}.db`);
const db = new DatabaseSync(src, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
} finally { db.close(); }

// 自校验：快照必须能独立打开，且核心集合行数可读
const check = new DatabaseSync(out, { readOnly: true });
try {
  const tables = check.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  const sizes = tables.map((t) => [t, check.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n]);
  const total = sizes.reduce((s, [, n]) => s + n, 0);
  console.log(`[backup] OK ${path.basename(out)}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB  tables=${tables.length} rows=${total}`);
  for (const [t, n] of sizes.filter(([, v]) => v > 0)) process.stdout.write(`  ${t}=${n}`);
  console.log('');
} finally { check.close(); }

// 轮转：仅保留最近 keep 份
const all = fs.readdirSync(dir).filter((f) => /^game-\d{8}-\d{6}\.db$/.test(f)).sort().reverse();
for (const f of all.slice(keep)) {
  fs.unlinkSync(path.join(dir, f));
  console.log(`[backup] 轮转删除 ${f}`);
}
if (process.env.NODE_ENV === 'production' && all.length === 0) console.warn('[backup] 警告：本轮前备份目录为空');
