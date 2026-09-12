/**
 * 把 `sim-balance --solve` 反解出的每境需求，同步写进 realms 的**三处定义源**并导入正式档。
 *
 * 为什么需要它：`exp_requirement` 同时存在于
 *   ① src/database.js（建库种子）② src/services/realm.js（REALMS 常量表）③ src/data/content-export.json（内容台账）
 * 三处只要漏一处就漂移（而漂移的表现是"改了没生效"或"重建后回退"，都很难查）。
 * 手改 30 个数字本身就是错误源（轮53 教训：我手抄了一份品质表，得出完全错误的结论）。
 *
 * 用法：node scripts/apply-realm-need.js '{"炼气":5200000, ...}' [--no-import]
 */
const fs = require('fs');
const path = require('path');

const ORDER = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'];
const FILES = ['src/database.js', 'src/services/realm.js', 'src/data/content-export.json'];

// 参数既可以是 JSON 字符串，也可以是 `sim-balance --solve` 写出的工件路径（推荐：可评审、不依赖 shell 引号）
const arg = process.argv[2];
if (!arg) {
  console.error('用法：node scripts/apply-realm-need.js <src/data/realm-need.json | JSON字符串> [--no-import]');
  process.exit(2);
}
let need;
try {
  need = JSON.parse(arg.trim().startsWith('{') ? arg : fs.readFileSync(path.resolve(arg), 'utf8'));
} catch (e) { console.error('入参解析失败：' + e.message); process.exit(2); }

const missing = ORDER.filter((r) => !Number.isFinite(Number(need[r])) || Number(need[r]) <= 0);
if (missing.length) { console.error('[FATAL] 缺少境界需求值：' + missing.join('、')); process.exit(1); }
const extra = Object.keys(need).filter((k) => !ORDER.includes(k));
if (extra.length) { console.error('[FATAL] 未知境界名：' + extra.join('、')); process.exit(1); }

const root = path.join(__dirname, '..');
let touched = 0;
for (const rel of FILES) {
  const f = path.join(root, rel);
  let s = fs.readFileSync(f, 'utf8');
  let n = 0;
  for (const name of ORDER) {
    const v = String(Math.round(Number(need[name])));
    const jsRe = new RegExp(`(name: '${name}',[^\\n]*?exp_requirement: )\\d+`);
    const jsonRe = new RegExp(`("name":"${name}",[^\\]}]*?"exp_requirement":)\\d+`);
    if (jsRe.test(s)) { s = s.replace(jsRe, `$1${v}`); n++; }
    else if (jsonRe.test(s)) { s = s.replace(jsonRe, `$1${v}`); n++; }
  }
  if (n !== ORDER.length) {
    console.error(`[FATAL] ${rel} 只命中 ${n}/${ORDER.length} 处，拒绝写回（宁可不动，也别留下半套漂移）`);
    process.exit(1);
  }
  fs.writeFileSync(f, s, 'utf8');
  touched++;
  console.log(`  ${rel}  已更新 ${n}/10`);
}

console.log(`  已写回 ${touched} 个定义源（本脚本不直接碰 data/game.db，只经 seed:content 导入）`);
if (process.argv.includes('--no-import')) {
  console.log('  （--no-import：跳过导入正式档，稍后自行 npm run seed:content）');
} else {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(root, 'src/scripts/content-sync.js'), 'import'],
    { cwd: root, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const line = (out.match(/realms\+\d+\/~\d+\/\d+/) || ['(未见 realms 统计行)'])[0];
  console.log(`  seed:content import → exit=${r.status}  ${line}`);
  if (r.status !== 0) { console.error(out.slice(-1500)); process.exit(1); }
}
console.log('\n下一步必须复测：node scripts/sim-balance.js（真源一致 + 目标带）→ npm run verify:drift → npm test');
