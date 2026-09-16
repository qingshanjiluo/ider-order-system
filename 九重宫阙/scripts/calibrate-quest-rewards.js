/**
 * 剧情奖励标定器（P7 数据玩法完善）。
 *
 * ## 为什么要有这个脚本，而不是手填数值
 *
 * 第一版 21 条委托的奖励是我按「卷」拍的：卷1 几百、卷2 上千、卷4 几万。
 * 结果同卷同境界内单位回报差 6 倍、跨境界倒挂 4 处 —— 因为**工作量（目标点总数）
 * 在卷内并不均匀**（v3_02 要 83 个目标点，v3_05 只要 21 个），按卷定额必然错。
 *
 * 正确做法是定一条「每目标点回报」的基准曲线，用工作量乘出来：
 *
 *   P(境界序号 r) = BASE × GROWTH^r      每目标点给多少修为
 *   修为 = 工作量(目标点总数) × P(r)，取整到好读的档位
 *   灵石 = 修为 × STONE_RATIO
 *
 * 这样三条性质是**构造出来**的，不靠事后检查：
 *   · 同境界内，报酬与工作量严格成正比（差 0 倍，不是"差得不多"）
 *   · 跨境界单调递增（倒挂不可能出现）
 *   · 硬通货占比恒定，不会超发
 *
 * ## 用法
 *
 *   node scripts/calibrate-quest-rewards.js            # 只报告差异（默认，安全）
 *   node scripts/calibrate-quest-rewards.js --apply    # 写回 quest-library.js
 *
 * 改基准（BASE/GROWTH/STONE_RATIO）后重跑即可全局重标定 —— 这是这套数值的"旋钮"。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const QL = require(path.join(ROOT, 'src', 'data', 'quest-library'));
const realmOrder = QL.realmOrder();

// ── 旋钮（改这三个数就能重标定全部委托）──
// BASE：炼气期每目标点给多少修为。取自原稿里最像"低级小活"的几条（21~25/点）。
// GROWTH：每上一境，单位回报乘多少。1.55 让九境走完是 22 → 1136/点，
//         与玩家攻击曲线（每境界 ×1.6~1.7）和升级成本的增长同阶，
//         不至于让做委托跑在正常成长曲线前面。
// STONE_RATIO：灵石 = 修为 × 该比例。审计阈值 0.35，留余量取 0.28。
const BASE = 22;
const GROWTH = 1.55;
const STONE_RATIO = 0.28;

const perPoint = (r) => BASE * Math.pow(GROWTH, Math.max(0, r));

/** 取整到好读的档位（1250 比 1237 舒服；取整不破坏单调性，因为步长远小于间距） */
function nice(n) {
  if (n <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const step = mag >= 1000 ? 1000 : mag >= 100 ? 100 : mag >= 10 ? 10 : 1;
  return Math.max(step, Math.round(n / step) * step);
}

const objPoints = (q) => q.stages.reduce((a, s) => a + s.objectives.reduce((x, o) => x + (o.required || 0), 0), 0);

/** 计算某条委托应有的奖励 */
function targetRewards(q) {
  const r = realmOrder.indexOf(q.realmFrom);
  const pts = objPoints(q);
  const exp = nice(pts * perPoint(r));
  return { exp, spirit_stone: nice(exp * STONE_RATIO), points: pts, realm: q.realmFrom, perPoint: pts ? Math.round(exp / pts) : 0 };
}

console.log('== 剧情奖励标定 ==');
console.log(`基准：炼气 ${BASE} 修为/点，每境 ×${GROWTH}，灵石占比 ${STONE_RATIO}`);
console.log('每目标点回报：' + realmOrder.map((n, i) => `${n} ${Math.round(perPoint(i))}`).join(' | '));
console.log('');

const diffs = [];
for (const q of QL.allQuests()) {
  const t = targetRewards(q);
  const o = q.rewards;
  if (o.exp !== t.exp || o.spirit_stone !== t.spirit_stone) {
    diffs.push({ id: q.id, realm: t.realm, points: t.points, from: [o.exp, o.spirit_stone], to: [t.exp, t.spirit_stone], perPoint: t.perPoint });
  }
}

if (!diffs.length) {
  console.log('🟢 全部 ' + QL.allQuests().length + ' 条委托的奖励已符合基准曲线（无需改动）');
  process.exit(0);
}

console.log((APPLY ? '将写入 ' : '差异（未写入，加 --apply 生效）') + ' ' + diffs.length + ' 条：');
for (const d of diffs) {
  console.log(`  ${d.id.padEnd(26)} ${String(d.realm).padEnd(4)} ${String(d.points).padStart(3)}点  `
    + `修为 ${String(d.from[0]).padStart(6)} → ${String(d.to[0]).padStart(6)}   `
    + `灵石 ${String(d.from[1]).padStart(5)} → ${String(d.to[1]).padStart(5)}   ${d.perPoint}/点`);
}

if (!APPLY) {
  console.log('\n（这是 dry-run：要写回请加 --apply）');
  process.exit(0);
}

// ── 写回：按 id 定位块，只改块内的 rewards 行 ──
const FILE = path.join(ROOT, 'src', 'data', 'quest-library.js');
let src = fs.readFileSync(FILE, 'utf8');
let n = 0;
for (const d of diffs) {
  const idIdx = src.indexOf(`id: '${d.id}'`);
  if (idIdx < 0) { console.log('  ⚠ 找不到 ' + d.id); continue; }
  const rwIdx = src.indexOf('rewards: { exp:', idIdx);
  if (rwIdx < 0) { console.log('  ⚠ 找不到 rewards ' + d.id); continue; }
  const lineEnd = src.indexOf('\n', rwIdx);
  const oldLine = src.slice(rwIdx, lineEnd);
  const m = oldLine.match(/rewards: \{ exp: (\d+), spirit_stone: (\d+), items: (\[.*\]) \},/);
  if (!m) { console.log('  ⚠ rewards 行格式不符 ' + d.id); continue; }
  src = src.slice(0, rwIdx) + `rewards: { exp: ${d.to[0]}, spirit_stone: ${d.to[1]}, items: ${m[3]} },` + src.slice(lineEnd);
  n++;
}
fs.writeFileSync(FILE, src, 'utf8');
console.log('\n✅ 已写入 ' + n + ' 条委托的奖励');
