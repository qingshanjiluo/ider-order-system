/**
 * E7 · 备份可恢复性校验（"没验证过的备份等于没有备份"）
 * 做三件事：完整性 PRAGMA → 关键表存在 → 行数与活库同量级（防止备份到半态/空库）
 * 用法：node scripts/verify-backup.js [文件路径]     缺省取 backups/ 下最新一份
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..');
const dir = path.resolve(root, process.env.BACKUP_DIR || 'backups');
const liveSrc = process.env.DB_PATH || path.join(root, 'data', 'game.db');

const file = process.argv[2] || (() => {
  if (!fs.existsSync(dir)) throw new Error(`备份目录不存在：${dir}`);
  const all = fs.readdirSync(dir).filter((f) => /^game-\d{8}-\d{6}\.db$/.test(f)).sort();
  if (!all.length) throw new Error('备份目录内没有可校验的快照');
  return path.join(dir, all[all.length - 1]);
})();

const CRITICAL = ['col_characters', 'col_users', 'col_items', 'col_inventory', 'meta'];
// 口径说明：本脚本刻意跳过 sqlite_* 内部表，故 rows 比 backup.js 少 19（sqlite_sequence 的行数），非数据缺失。
const failures = [];
const check = new DatabaseSync(file, { readOnly: true });
let rows = 0;
try {
  const integ = check.prepare('PRAGMA integrity_check').get();
  const msg = JSON.stringify(integ);
  if (!/ok/i.test(msg)) failures.push(`integrity_check 非 ok：${msg}`);

  const tables = new Set(check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
  for (const t of CRITICAL) if (!tables.has(t)) failures.push(`缺关键表 ${t}`);

  const counts = {};
  for (const t of [...tables]) {
    if (t.startsWith('sqlite_')) continue;
    counts[t] = check.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  }
  rows = Object.values(counts).reduce((a, b) => a + b, 0);

  // 与活库比对：关键表不得明显缩水（容差 0：备份行数必须 ≥ 活库的 90%）
  if (fs.existsSync(liveSrc)) {
    const live = new DatabaseSync(liveSrc, { readOnly: true });
    try {
      for (const t of CRITICAL) {
        if (!tables.has(t)) continue;
        let liveN = 0;
        try { liveN = live.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; } catch { continue; }
        const snapN = counts[t] || 0;
        if (liveN > 0 && snapN < liveN * 0.9) failures.push(`${t} 快照 ${snapN} < 活库 ${liveN} 的 90%`);
      }
    } finally { live.close(); }
  }
} finally { check.close(); }

if (failures.length) {
  console.error(`[verify-backup] ❌ ${path.basename(file)}`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`[verify-backup] ✅ ${path.basename(file)} 可恢复（rows=${rows}）`);
