/**
 * E7 · 从快照恢复（破坏性操作：默认要求显式 --yes）
 * 用法：node scripts/restore.js <快照路径> --yes
 * 前置：先停服（pm2 stop jiuchong-gongque / docker compose down），否则活库被占用。
 * 行为：先把当前活库另存为 game.db.pre-restore-<ts>，再用快照覆盖 data/game.db，并清掉旧 WAL/SHM。
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..');
const live = process.env.DB_PATH || path.join(root, 'data', 'game.db');
const argv = process.argv.slice(2);
const src = argv.find((a) => !a.startsWith('--'));
const confirmed = argv.includes('--yes');

if (!src) { console.error('用法：node scripts/restore.js <快照路径> --yes'); process.exit(2); }
const snap = path.resolve(root, src);
if (!fs.existsSync(snap)) { console.error(`快照不存在：${snap}`); process.exit(2); }
if (!confirmed) { console.error('拒绝执行：恢复会覆盖当前活库，请追加 --yes 确认（并先停服）'); process.exit(2); }

// 恢复前必须验证快照可用，避免拿坏档覆盖好档
const probe = new DatabaseSync(snap, { readOnly: true });
try {
  const integ = probe.prepare('PRAGMA integrity_check').get();
  if (!/ok/i.test(JSON.stringify(integ))) throw new Error('快照 integrity_check 未通过');
  const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of ['col_characters', 'col_users', 'meta']) {
    if (!tables.includes(t)) throw new Error(`快照缺关键表 ${t}`);
  }
} finally { probe.close(); }

if (fs.existsSync(live)) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const safe = path.join(path.dirname(live), `${path.basename(live)}.pre-restore-${ts}`);
  fs.copyFileSync(live, safe);
  console.log(`[restore] 当前活库已另存 ${path.basename(safe)}`);
}
fs.mkdirSync(path.dirname(live), { recursive: true });
fs.copyFileSync(snap, live);
for (const ext of ['-wal', '-shm']) {
  const p = live + ext;
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`[restore] 清理残留 ${path.basename(p)}`); }
}
console.log(`[restore] ✅ 已从 ${path.basename(snap)} 恢复至 ${path.relative(root, live)}；请重启服务并观察 seed 是否零变更`);
