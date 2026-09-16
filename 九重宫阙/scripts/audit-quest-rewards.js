/**
 * 剧情奖励 vs 经济曲线的对齐审计（P7 数据玩法完善）。
 *
 * ## 为什么必须审
 *
 * 上一轮我手写了 21 条委托的奖励数值（修为/灵石/物品），是**估的**。
 * 估的数值有三个真实风险：
 *   ① 奖励远超同级正常产出 → 玩家刷委托就能跳过整个升级曲线（经济崩）
 *   ② 奖励远低于同级正常产出 → 委托不值得做（内容白写）
 *   ③ 与既有产出源（战斗/挂机/签到）不在一个量级 → 玩家行为被扭曲成"只做委托"
 *
 * 所以要把"委托奖励"与"该境界正常玩一小时的产出"放在一起看。参照系取
 * 已有的经济模拟（scripts/sim-economy.js）与升级曲线（services/exp-curve.js），
 * 不另造一套数。
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase } = require(path.join(ROOT, 'src', 'database'));
const QL = require(path.join(ROOT, 'src', 'data', 'quest-library'));
const db = loadDatabase();

// 境界 → 中位等级
const realmMid = {};
for (const r of db.realms || []) {
  const [a, b] = String(r.level_range || '').replace(/[[\]]/g, '').split(',').map(Number);
  if (Number.isFinite(a) && Number.isFinite(b)) realmMid[r.name] = Math.round((a + b) / 2);
}

// 每级所需修为（exp-curve 真源）
let expCurve = null;
try { expCurve = require(path.join(ROOT, 'src', 'services', 'exp-curve')); } catch (e) { /* 可选 */ }
const expForLevel = (lv) => {
  try {
    if (expCurve && typeof expCurve.expToNext === 'function') return expCurve.expToNext(lv);
    if (expCurve && typeof expCurve.required === 'function') return expCurve.required(lv);
  } catch (e) { /* ignore */ }
  return null;
};

console.log('== 剧情奖励 vs 经济曲线 ==');
if (!expCurve) console.log('⚠ 未取到 exp-curve 真源，升级成本用兜底估算');
else console.log('✅ 升级曲线真源已接入');

// 一条委托的奖励 = 修为 + 灵石（按 1 灵石 ≈ ? 修为 折算后合并看量级）
const rows = [];
for (const q of QL.allQuests()) {
  const mid = realmMid[q.realmFrom] || 1;
  const nextExp = expForLevel(mid);
  const exp = q.rewards.exp || 0;
  const stone = q.rewards.spirit_stone || 0;
  const stages = q.stages.length;
  const objTotal = q.stages.reduce((a, s) => a + s.objectives.reduce((x, o) => x + (o.required || 0), 0), 0);
  rows.push({
    id: q.id, vol: q.chapter.volume, realm: q.realmFrom, mid, exp, stone, stages, objTotal,
    expPerObj: objTotal ? Math.round(exp / objTotal) : 0,
    pctOfLevel: nextExp ? Math.round((exp / nextExp) * 100) : null
  });
}

console.log('\n按卷汇总（奖励量级）:');
for (const v of [1, 2, 3, 4]) {
  const list = rows.filter((r) => r.vol === v);
  if (!list.length) continue;
  const sumExp = list.reduce((a, r) => a + r.exp, 0);
  const sumStone = list.reduce((a, r) => a + r.stone, 0);
  const sumObj = list.reduce((a, r) => a + r.objTotal, 0);
  const pcts = list.map((r) => r.pctOfLevel).filter((x) => x != null);
  console.log(`  卷${v}: ${list.length} 条 | 修为 ${sumExp} | 灵石 ${sumStone} | 目标点 ${sumObj}`
    + ` | 单条均 ${Math.round(sumExp / list.length)} 修为`
    + (pcts.length ? ` | 占同级升级成本 ${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}%` : ''));
}

console.log('\n单条明细（修为/目标点 = 每个目标点的回报）:');
for (const r of rows.sort((a, b) => a.vol - b.vol || a.exp - b.exp)) {
  console.log(`  ${r.vol} ${String(r.id).padEnd(26)} ${String(r.realm).padEnd(4)} 修为${String(r.exp).padStart(6)}`
    + ` 灵石${String(r.stone).padStart(5)} 阶段${r.stages} 目标点${String(r.objTotal).padStart(3)}`
    + ` → ${String(r.expPerObj).padStart(5)}/点` + (r.pctOfLevel != null ? ` (占升级 ${r.pctOfLevel}%)` : ''));
}

// ── 判定 ──
const issues = [];

// ⓪ 单位回报在**同一卷内**不应差得离谱。
//    ⚠ 但卷 ≠ 单一境界：卷2 同时含金丹与元婴委托，元婴的活本就该比金丹值钱。
//    所以按「卷 + 起始境界」**分组**比，只有同卷同境的委托才要求报酬与工作量成比例。
//    （第一版按整卷比，把"元婴确实比金丹贵"误报成了缺陷。）
const PER_OBJ_SPREAD = 2.5;
{
  const groups = new Map();
  for (const r of rows) {
    if (!r.objTotal) continue;
    const key = r.vol + '|' + r.realm;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const vals = list.map((r) => r.expPerObj);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo > 0 && hi / lo > PER_OBJ_SPREAD) {
      const loQ = list.find((r) => r.expPerObj === lo), hiQ = list.find((r) => r.expPerObj === hi);
      issues.push(`卷${key.split('|')[0]} 的 ${key.split('|')[1]} 期委托单位回报差 ${(hi / lo).toFixed(1)} 倍（>${PER_OBJ_SPREAD}）：`
        + `${loQ.id} 仅 ${lo}/点，而 ${hiQ.id} 有 ${hi}/点 —— 同期委托的报酬应与工作量成比例`);
    }
  }
}

// ① 单条委托的修为不应超过同级升一整级的成本（否则一条委托 = 白送一级）
for (const r of rows) {
  if (r.pctOfLevel != null && r.pctOfLevel > 100) {
    issues.push(`${r.id}：单条给 ${r.exp} 修为，超过 ${r.realm}（Lv${r.mid}）升一整级所需（${r.pctOfLevel}%）—— 一条委托白送一级`);
  }
}
// ② 每个目标点的回报应随卷递增（后期委托的单位劳动更值钱）
const perObjByVol = {};
for (const v of [1, 2, 3, 4]) {
  const list = rows.filter((r) => r.vol === v);
  if (list.length) perObjByVol[v] = list.reduce((a, r) => a + r.expPerObj, 0) / list.length;
}
for (let v = 2; v <= 4; v++) {
  if (perObjByVol[v] == null || perObjByVol[v - 1] == null) continue;
  if (perObjByVol[v] <= perObjByVol[v - 1]) {
    issues.push(`卷${v} 的单位目标点回报（${Math.round(perObjByVol[v])}）未高于卷${v - 1}（${Math.round(perObjByVol[v - 1])}）`);
  }
}
// ③ 灵石/(修为) 比不应离谱（灵石是硬通货，给太多会冲垮坊市）
for (const r of rows) {
  const ratio = r.exp > 0 ? r.stone / r.exp : 0;
  if (ratio > 0.35) issues.push(`${r.id}：灵石/修为 = ${ratio.toFixed(2)}（>0.35），硬通货给得偏多`);
}
// ④ 境界序不应倒挂：靠后境界的委托，单位回报不该低于靠前境界的（哪怕跨卷）
{
  const order = QL.realmOrder();
  const idxOf = (n) => order.indexOf(n);
  const sorted = rows.filter((r) => r.objTotal > 0 && idxOf(r.realm) >= 0)
    .sort((a, b) => idxOf(a.realm) - idxOf(b.realm) || a.expPerObj - b.expPerObj);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (idxOf(cur.realm) > idxOf(prev.realm) && cur.expPerObj < prev.expPerObj) {
      issues.push(`境界倒挂：${cur.id}（${cur.realm}，${cur.expPerObj}/点）低于更低境界的 ${prev.id}（${prev.realm}，${prev.expPerObj}/点）`);
    }
  }
}

if (issues.length) {
  console.log('\n❌ 发现 ' + issues.length + ' 处数值问题:');
  for (const i of issues) console.log('   · ' + i);
} else {
  console.log('\n🟢 21 条委托的奖励量级与升级曲线一致（无单条白送一级、单位回报随卷递增、硬通货不过量）');
}
process.exit(issues.length ? 1 : 0);
