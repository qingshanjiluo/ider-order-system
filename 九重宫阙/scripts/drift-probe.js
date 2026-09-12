/**
 * 漂移定性诊断（轮42；只读，比较在用存档与给定重建库的行级差异）
 * 用法：node scripts/drift-probe.js <重建库路径>
 * 回答三个问题：
 *   1) 代码"多出"的行是不是同名重复（即历史上被去重脚本合并掉、而种子仍会造出来的那批）；
 *   2) 字段不同的行，到底差在哪些字段上（按字段名统计频次 + 举 2 例）；
 *   3) 差异是否只在数值曲线上（若是，则以谁为准要由胜率实测决定）。
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const LIVE = path.join(ROOT, 'data', 'game.db');
const NEW = process.argv[2];
if (!NEW || !fs.existsSync(NEW)) {
  console.log('缺少重建库路径。先跑：node scripts/rebuild-check.js --keep');
  process.exitCode = 1;
  return;
}

function rows(file) {
  const db = new DatabaseSync(file);
  try {
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'col_%'")
      .all().map(r => r.name.slice(4));
    const out = {};
    for (const n of names) {
      const m = new Map();
      for (const r of db.prepare(`SELECT data FROM col_${n}`).all()) {
        const o = JSON.parse(r.data);
        m.set(String(o && o.id), o);
      }
      out[n] = m;
    }
    return out;
  } finally { db.close(); }
}

const A = rows(LIVE);
const B = rows(NEW);
const NL = String.fromCharCode(10);

function nameOf(o) { return o && (o.name || o.title || o.key) ? String(o.name || o.title || o.key) : ''; }

for (const coll of ['items', 'dungeons', 'monsters', 'maps', 'shop', 'blueprints']) {
  const a = A[coll] || new Map();
  const b = B[coll] || new Map();
  const aNames = new Set(Array.from(a.values()).map(nameOf));
  const extras = Array.from(b.entries()).filter(([id]) => !a.has(id));
  const dupExtras = extras.filter(([, o]) => aNames.has(nameOf(o)));
  const freshExtras = extras.filter(([, o]) => !aNames.has(nameOf(o)));
  const diffs = [];
  for (const [id, row] of a) {
    if (!b.has(id)) continue;
    const other = b.get(id);
    const keys = Array.from(new Set(Object.keys(row).concat(Object.keys(other))));
    const changed = keys.filter(k => JSON.stringify(row[k]) !== JSON.stringify(other[k]));
    if (changed.length) diffs.push({ id, changed, row, other });
  }
  const freq = {};
  for (const d of diffs) for (const k of d.changed) freq[k] = (freq[k] || 0) + 1;
  console.log(NL + '=== ' + coll + ' === 存档 ' + a.size + ' / 重建 ' + b.size);
  console.log('  多出行 ' + extras.length + '：同名重复 ' + dupExtras.length
    + '｜真正新内容 ' + freshExtras.length
    + (freshExtras.length ? '  例: ' + freshExtras.slice(0, 6).map(([, o]) => nameOf(o) + '#' + o.id).join(', ') : ''));
  if (dupExtras.length) console.log('  同名重复例: ' + dupExtras.slice(0, 6).map(([, o]) => nameOf(o) + '#' + o.id).join(', '));
  console.log('  字段不同 ' + diffs.length + ' 行；差异字段频次: '
    + Object.entries(freq).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => k + '=' + n).join('  '));
  for (const d of diffs.slice(0, 2)) {
    const show = {};
    for (const k of d.changed.slice(0, 5)) show[k] = [d.row[k], d.other[k]];
    console.log('  例 id=' + d.id + ' ' + JSON.stringify(show).slice(0, 220));
  }
}
