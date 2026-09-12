/**
 * P1/E3 怪物模板重排（曲线拟合，默认 dry-run）
 *
 * 为什么要有这个脚本：sim-battle 已证明"四段递减胜率"在只调玩家曲线的解空间里不可达
 * （20 组参数扫描，段1 最高只能到 74%）。剩余的自由度在怪物侧，故按目标 TTK 反解怪物三维数值。
 *
 * 做法（可复算，不手改 86 条）：
 *   1. 每个模板按 level_range 中位归属境界，取该境界的**参考玩家**（characterService 曲线，与升级写入同源）；
 *   2. 给定段位目标：玩家几回合杀掉怪 pRounds、怪几回合杀掉玩家 mRounds —— 比值就是难度斜率；
 *   3. 防御取"玩家攻击的一个比例"（保证不会再次出现打不动），生命 = pRounds × 玩家对该防的实伤；
 *      攻击用二分法反解，使怪物实伤 ≈ 玩家生命 / mRounds；
 *   4. **保留同池相对差异**：以该池重排前的中位为基准算出每个模板的倍率 div，夹到 [0.6, 1.6] 后乘回去。
 *      这样小怪有强弱，但 5~10 倍的无标记精英会被压回同一数量级（轮36 发现的结构性问题）。
 *
 * 用法：node scripts/rebalance-monsters.js            # 干跑，只打印
 *       node scripts/rebalance-monsters.js --apply    # 真正写库（请先备份）
 */
const { loadDatabase, saveDatabase } = require('../src/database');
const characterService = require('../src/services/character');
const dmgCalc = require('../src/services/battle/damage');
const B = require('../src/config/balance');

const APPLY = process.argv.indexOf('--apply') >= 0;
const db = loadDatabase();

/** 段位目标：胜率窗口 75-92 / 60-78 / 45-65 / 30-50 对应的 TTK 组合（比值单调下降 = 难度递增） */
const BANDS = { 炼气: { p: 2.2, m: 6.8, def: 0.18 }, 筑基: { p: 2.4, m: 7.3, def: 0.22 }, 金丹: { p: 3.2, m: 4.6, def: 0.30 }, 元婴: { p: 3.6, m: 5.0, def: 0.34 }, 化神: { p: 4.0, m: 4.2, def: 0.38 }, 炼虚: { p: 4.6, m: 4.6, def: 0.42 }, 合体: { p: 5.2, m: 5.0, def: 0.45 }, 大乘: { p: 6.0, m: 3.2, def: 0.48 }, 渡劫: { p: 7.0, m: 3.6, def: 0.52 }, 飞升: { p: 7.6, m: 2.6, def: 0.55 } };
const DIV_MIN = 0.6, DIV_MAX = 1.6;

function parseRange(t) {
  let r = t.level_range;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
  return Array.isArray(r) && Number.isFinite(Number(r[0])) && Number.isFinite(Number(r[1])) ? [Number(r[0]), Number(r[1])] : null;
}
function parseStats(t) {
  try { return JSON.parse(t.stats || '{}'); } catch (e) { return null; }
}
function realmOf(mid) {
  const hit = (db.realms || []).find(r => mid >= Number(r.min_level) && mid <= Number(r.max_level));
  if (hit) return hit.name;
  const order = B.REALM_ORDER || [];
  let best = '炼气', bestD = Infinity;
  for (const r of db.realms || []) {
    const c = (Number(r.min_level) + Number(r.max_level)) / 2;
    const d = Math.abs(c - mid);
    if (d < bestD) { bestD = d; best = r.name; }
  }
  void order;
  return best;
}
function refPlayer(realm) {
  const r = (db.realms || []).find(x => x.name === realm) || { min_level: 1, max_level: 10 };
  const lv = Math.floor((Number(r.min_level) + Number(r.max_level)) / 2);
  return {
    name: 'ref', level: lv, realm,
    hp: characterService.calculateHpMax(lv, realm), maxHp: characterService.calculateHpMax(lv, realm),
    mp: 999, attack: characterService.calculateAttack(lv, realm),
    defense: characterService.calculateDefense(lv, realm), speed: characterService.calculateSpeed(lv, realm),
    element: 'none', crit_rate: 0
  };
}
/** 二分反解：找最大的 attack 使实伤 ≤ target */
function solveAttack(P, target) {
  let lo = 1, hi = Math.max(2, Math.ceil(target * 4));
  const probe = (a) => dmgCalc.calculateFinalDamage({ name: 'm', level: P.level, attack: a, defense: 0, hp: 1, element: 'none', crit_rate: 0 }, P, null).damage;
  if (probe(hi) <= target) return hi;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (probe(mid) <= target) lo = mid; else hi = mid;
  }
  return lo;
}

// 先按境界分池，算重排前的中位（用于保留相对差异）
const buckets = {};
for (const t of db.monsters || []) {
  const rg = parseRange(t), st = parseStats(t);
  if (!rg || !st || !Number.isFinite(Number(st.hp))) continue;
  const realm = realmOf((rg[0] + rg[1]) / 2);
  (buckets[realm] = buckets[realm] || []).push({ t, st, realm });
}
const med = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 1; };

console.log(APPLY ? '>>> 应用模式：将写库' : '>>> dry-run：只打印，不写库');
console.log('境界 | 池 | 参考玩家hp/攻 | 重排前 hp中位(最大/中位) | 重排后 hp中位 | 攻中位 | 防中位');

let changed = 0, unparseable = 0;

for (const t of db.monsters || []) {
  const rg = parseRange(t), st = parseStats(t);
  if (!rg || !st || !Number.isFinite(Number(st.hp))) unparseable++;
}

const report = [];
for (const realm of (B.REALM_ORDER || Object.keys(BANDS))) {
  const list = buckets[realm];
  if (!list || !list.length) continue;
  const band = BANDS[realm] || BANDS['渡劫'];
  const P = refPlayer(realm);
  const targetDef = Math.max(1, Math.round(P.attack * band.def));
  const probeMob = (hp, atk, def) => ({ name: 'm', level: P.level, hp, maxHp: hp, mp: 0, attack: atk, defense: def, speed: 0, element: 'none', crit_rate: 0 });
  const pDmg = dmgCalc.calculateFinalDamage(P, probeMob(1000, 0, targetDef), null).damage;
  const bandHp = Math.max(1, Math.round(band.p * pDmg));
  const bandAtk = solveAttack(P, Math.max(1, Math.round(P.hp / band.m)));
  const beforeHp = med(list.map(x => Number(x.st.hp) || 0));
  const beforeAtk = med(list.map(x => Number(x.st.attack) || 0));
  const beforeDef = med(list.map(x => Number(x.st.defense) || 0));
  const maxHp = Math.max(...list.map(x => Number(x.st.hp) || 0));

  for (const x of list) {
    const divHp = Math.min(DIV_MAX, Math.max(DIV_MIN, (Number(x.st.hp) || beforeHp) / (beforeHp || 1)));
    const divAtk = Math.min(DIV_MAX, Math.max(DIV_MIN, (Number(x.st.attack) || beforeAtk) / (beforeAtk || 1)));
    const divDef = Math.min(DIV_MAX, Math.max(DIV_MIN, (Number(x.st.defense) || beforeDef) / (beforeDef || 1)));
    const nh = Math.max(1, Math.round(bandHp * divHp));
    const na = Math.max(1, Math.round(bandAtk * divAtk));
    const nd = Math.max(0, Math.round(targetDef * divDef));
    if (Number(x.st.hp) !== nh || Number(x.st.attack) !== na || Number(x.st.defense) !== nd) {
      x.st.hp = nh; x.st.attack = na; x.st.defense = nd;
      // 速度保持原样：先手判定依赖它，本轮不动（若与新区间冲突再单独处理）
      x.t.stats = JSON.stringify(x.st);
      changed++;
    }
  }
  const afterHp = med(list.map(x => Number(x.st.hp) || 0));
  report.push(realm + ' | n=' + list.length + ' | 玩家hp' + P.hp + '/攻' + P.attack +
    ' | 前 ' + beforeHp + '(最大' + maxHp + '/' + (maxHp / (beforeHp || 1)).toFixed(1) + '倍)' +
    ' | 后中位 ' + afterHp + ' | 攻 ' + med(list.map(x => Number(x.st.attack) || 0)) +
    ' | 防 ' + med(list.map(x => Number(x.st.defense) || 0)) + ' | 目标 p' + band.p + '/m' + band.m);
}
report.forEach(l => console.log('  ' + l));
console.log(`合计改写 ${changed} 个模板；stats/level_range 不可解析 ${unparseable} 个`);

if (APPLY) {
  saveDatabase(db);
  console.log('已写库（game.db）。请立即用 sim-battle 复验四段胜率。');
} else {
  console.log('dry-run 结束，未写库。确认表格后用 --apply 落库。');
}
