/**
 * 战斗数值标定 —— 把 sim-battle 的四段胜率带与 TTK 窗口同时调达标。
 *
 * ## 核心原则：标定与验收共用同一份测量代码
 *
 * 轮103 最大的坑是"照着 sim-battle 抄了一份差不多的建卡代码"，抄错了 element / 暴击字段，
 * 导致标定自认为落带、验收却差 20 个点，震荡 8 轮不收敛。
 * 现在胜率测量**直接调 `scripts/sim-battle-lib.js`**（sim-battle.js 的唯一真源），
 * 倍率通过"临时改写存档对象的 stats"施加，走同一条代码路径。
 *
 * ## 两个旋钮的分工（为什么不能只用一个）
 *
 * 验收有两条独立的锁：
 *   ① `sim-battle.js`：四段平均胜率落进目标带（段1 75-92% … 段4 30-50%）
 *   ② `test-content.js`：TTK 窗口 —— 中位怪打死参考玩家 >2.0 回合；玩家击杀中位怪 ≤8 回合
 *
 * 攻击**同时**影响胜率与 TTK：怪越疼，玩家越容易输，但 TTK 也越短。一个旋钮拉两个目标必然震荡。
 * 分工：
 *   · **攻击 = TTK 旋钮**（保证双方都不秒杀）
 *   · **血量 = 胜率旋钮**（怪更耐打 → 玩家胜率降低，但不影响"每回合掉多少血"）
 * 血量到顶（玩家打不死）时，才回到攻击上继续调；每轮结束重跑 TTK 护栏，靠轮次交替收敛。
 *
 * 用法：
 *   node scripts/calibrate-bands.js            # 默认只报数，不写库（安全）
 *   node scripts/calibrate-bands.js --apply    # 真正写回存档
 *   node scripts/calibrate-bands.js --runs 20  # 减少采样加速
 *
 * ⚠ 现状（章程 R13）：段4 的两个约束互相冲突，本脚本**不接入自动投产链**。
 *   默认 dry-run 是刻意的 —— 它会在约束间震荡，自动跑且写库会把内容数据搅乱。
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;
const RUNS = (() => { const i = process.argv.indexOf('--runs'); return i >= 0 ? Number(process.argv[i + 1]) || 60 : 60; })();
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase } = require(path.join(ROOT, 'src', 'database'));
const dmgCalc = require(path.join(ROOT, 'src', 'services', 'battle', 'damage'));
const simLib = require(path.join(ROOT, 'scripts', 'sim-battle-lib'));

const db = loadDatabase();
const monsters = db.monsters || [];

const BANDS = [
  { label: '段1', realms: ['炼气', '筑基'], want: [0.75, 0.92] },
  { label: '段2', realms: ['金丹', '元婴'], want: [0.60, 0.78] },
  { label: '段3', realms: ['化神', '炼虚', '合体'], want: [0.45, 0.65] },
  { label: '段4', realms: ['大乘', '渡劫'], want: [0.30, 0.50] },
  { label: '段5', realms: ['飞升'], want: [0.30, 0.50] }
];

const TTK_MIN = 3.0;      // 怪打死参考玩家的回合下限（锁 >2.0，留余量）
const KILL_CAP = 6.5;     // 玩家击杀中位怪的回合上限（锁 ≤8，留余量）
const MAX_ROUNDS = 10;

const realmRow = (n) => (db.realms || []).find((r) => r.name === n);
const ATK_MUL = new Map();   // realmName → 攻击倍率
const HP_MUL = new Map();    // 怪 id → 血量倍率
const atkOf = (realmName) => ATK_MUL.get(realmName) || 1;
const hpOf = (id) => HP_MUL.get(Number(id)) || 1;

/** 怪所属境界（mid 落在 [min,max]） */
function realmOfMonster(m) {
  let r = m.level_range;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { return null; } }
  if (!Array.isArray(r)) return null;
  const mid = (Number(r[0]) + Number(r[1])) / 2;
  return (db.realms || []).find((x) => mid >= Number(x.min_level) && mid <= Number(x.max_level)) || null;
}

/** 在"应用了当前倍率"的临时 stats 上跑一段，返回平均胜率（跑完还原） */
function bandWinRate(band) {
  const saved = monsters.map((m) => m.stats);
  for (const m of monsters) {
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    const rr = realmOfMonster(m);
    const am = rr ? atkOf(rr.name) : 1;
    const hm = hpOf(m.id);
    if (Math.abs(am - 1) < 1e-9 && Math.abs(hm - 1) < 1e-9) continue;
    if (Number(st.hp)) st.hp = Math.max(1, Math.round(st.hp * hm));
    if (Number(st.attack)) st.attack = Math.max(1, Math.round(st.attack * am));
    m.stats = JSON.stringify(st);
  }
  let total = 0, wins = 0;
  try {
    for (const realm of band.realms) {
      const row = realmRow(realm);
      if (!row) continue;
      const level = Math.floor((Number(row.min_level) + Number(row.max_level)) / 2);
      const player = simLib.buildPlayer(realm, level);
      const { pool } = simLib.monstersFor(db, realm);
      for (const mob of pool) {
        for (let k = 0; k < RUNS; k++) {
          total++;
          if (simLib.fight(player, mob).win) wins++;
        }
      }
    }
  } finally {
    monsters.forEach((m, i) => { m.stats = saved[i]; });
  }
  return total ? wins / total : 0;
}

/** 某境界的 TTK 回合数（mode: 'median' | 'max'，按怪的 hp 排序取那只） */
function ttkRounds(realmName, mode) {
  const row = realmRow(realmName);
  if (!row) return null;
  const lo = Number(row.min_level) - 2, hi = Number(row.max_level) + 2;
  const rows = [];
  for (const m of monsters) {
    let r = m.level_range;
    if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
    if (!Array.isArray(r)) continue;
    const mid = (Number(r[0]) + Number(r[1])) / 2;
    if (mid < lo || mid > hi) continue;
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    if (!Number(st.hp)) continue;
    // 用倍率后的有效数值排序
    rows.push({ hp: (Number(st.hp) || 0) * hpOf(m.id), atk: (Number(st.attack) || 0) * atkOf(realmName), def: Number(st.defense) || 0 });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.hp - b.hp);
  const pick = mode === 'max' ? rows[rows.length - 1] : rows[Math.floor(rows.length / 2)];
  const lv = Math.floor((Number(row.min_level) + Number(row.max_level)) / 2);
  const P = simLib.buildPlayer(realmName, lv);
  P.critChance = 0;
  const M = { name: 'm', level: lv, hp: pick.hp, maxHp: pick.hp, mp: 0, attack: pick.atk, defense: pick.def, element: 'none', crit_rate: 0 };
  const dmg = dmgCalc.calculateFinalDamage(M, P, null).damage;
  if (dmg <= 0) return null;
  return P.maxHp / dmg;
}

/** 玩家击杀中位怪的回合数（TTK 锁的另一半：≤8） */
function killRounds(realmName) {
  const row = realmRow(realmName);
  if (!row) return null;
  const lo = Number(row.min_level) - 2, hi = Number(row.max_level) + 2;
  const rows = [];
  for (const m of monsters) {
    let r = m.level_range;
    if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
    if (!Array.isArray(r)) continue;
    const mid = (Number(r[0]) + Number(r[1])) / 2;
    if (mid < lo || mid > hi) continue;
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    if (!Number(st.hp)) continue;
    rows.push({ hp: (Number(st.hp) || 0) * hpOf(m.id), def: Number(st.defense) || 0 });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.hp - b.hp);
  const pick = rows[Math.floor(rows.length / 2)];
  const lv = Math.floor((Number(row.min_level) + Number(row.max_level)) / 2);
  const P = simLib.buildPlayer(realmName, lv);
  P.critChance = 0;
  const M = { name: 'm', level: lv, hp: pick.hp, maxHp: pick.hp, mp: 0, attack: 1, defense: pick.def, element: 'none', crit_rate: 0 };
  const dmg = dmgCalc.calculateFinalDamage(P, M, null).damage;
  if (dmg <= 0) return null;
  return pick.hp / dmg;
}

/** 把各境界攻击倍率压到 TTK 安全线内（每轮都要重跑，因为调血量可能连带改动攻击） */
function enforceTtk() {
  let changed = 0;
  for (const band of BANDS) {
    for (const realmName of band.realms) {
      const before = atkOf(realmName);
      let mul = before;
      for (let attempt = 0; attempt < 16; attempt++) {
        ATK_MUL.set(realmName, mul);
        const rtMed = ttkRounds(realmName, 'median');
        const rtMax = ttkRounds(realmName, 'max');
        const worst = Math.min(rtMed === null ? Infinity : rtMed, rtMax === null ? Infinity : rtMax);
        if (worst >= TTK_MIN) break;
        mul *= Math.max(0.45, Math.min(0.95, (worst / TTK_MIN) * 0.9));
      }
      ATK_MUL.set(realmName, mul);
      if (Math.abs(mul - before) > 0.005) changed++;
    }
  }
  return changed;
}

/** 把血量倍率压到"玩家击杀中位怪 ≤ KILL_CAP 回合" */
function enforceKillCap() {
  for (const band of BANDS) {
    for (const realmName of band.realms) {
      const kr = killRounds(realmName);
      if (kr === null || kr <= KILL_CAP) continue;
      // 需要把血量整体缩到 kr → KILL_CAP
      const scale = KILL_CAP / kr;
      const row = realmRow(realmName);
      const lo = Number(row.min_level) - 2, hi = Number(row.max_level) + 2;
      for (const m of monsters) {
        let r = m.level_range;
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
        if (!Array.isArray(r)) continue;
        const mid = (Number(r[0]) + Number(r[1])) / 2;
        if (mid < lo || mid > hi) continue;
        HP_MUL.set(Number(m.id), hpOf(m.id) * scale);
      }
      console.log(`  ✂ ${realmName} 玩家击杀中位怪 ${kr.toFixed(1)} 回 > ${KILL_CAP}，血量 ×${scale.toFixed(3)}`);
    }
  }
}

// ===== 主循环：攻击(→TTK) 与 血量(→胜率) 交替收敛 =====
enforceTtk();
console.log('== TTK 护栏后各境界（攻击倍率 / 中位怪回合 / 最强怪回合）==');
for (const band of BANDS) for (const rn of band.realms) {
  console.log(`  ${rn.padEnd(4)} ×${atkOf(rn).toFixed(3)}　中位 ${ttkRounds(rn, 'median')?.toFixed(1) ?? '—'} 回　最强 ${ttkRounds(rn, 'max')?.toFixed(1) ?? '—'} 回`);
}

for (let round = 0; round < MAX_ROUNDS; round++) {
  let changed = false;
  for (const band of BANDS) {
    const cur = bandWinRate(band);
    const [lo, hi] = band.want;
    if (cur >= lo && cur <= hi) continue;

    // ① 先用血量够（血越多 → 胜率越低）；带磨盘上限
    let a = 0.2, b = 30, bestInc = 1, bestWr = cur;
    for (let iter = 0; iter < 16; iter++) {
      const inc = Math.sqrt(a * b);
      const savedHp = new Map(monsters.map((m) => [Number(m.id), hpOf(m.id)]));
      const touched = new Set();
      for (const band2 of BANDS) {
        // 只对本段境界的怪试乘
      }
      // 试乘本段怪的血量
      for (const m of monsters) {
        const rr = realmOfMonster(m);
        if (!rr || !band.realms.includes(rr.name)) continue;
        touched.add(Number(m.id));
        HP_MUL.set(Number(m.id), (savedHp.get(Number(m.id)) || 1) * inc);
      }
      const wr = bandWinRate(band);
      // 还原
      for (const [id, v] of savedHp) if (touched.has(id)) HP_MUL.set(id, v);
      if (wr >= lo && wr <= hi) { bestInc = inc; bestWr = wr; break; }
      if (Math.abs(wr - (bestWr)) < 0) { /* noop */ }
      if (wr > hi) a = inc; else b = inc;
      bestInc = inc; bestWr = wr;
    }
    // 落定本轮血量倍率
    for (const m of monsters) {
      const rr = realmOfMonster(m);
      if (!rr || !band.realms.includes(rr.name)) continue;
      HP_MUL.set(Number(m.id), hpOf(m.id) * bestInc);
    }
    enforceKillCap();
    const wrAfterHp = bandWinRate(band);
    console.log(`  [轮${round + 1}] ${band.label} ${band.realms.join('/')}：${(cur * 100).toFixed(1)}% → 血量×${bestInc.toFixed(2)} → ${(wrAfterHp * 100).toFixed(1)}%（目标 ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%）`);

    // ② 血量到顶仍不落带 → 用攻击继续够（方向：胜率高就提攻击，低就降）
    if (wrAfterHp < lo || wrAfterHp > hi) {
      const dir = wrAfterHp > hi ? 1 : -1;
      let s = 1;
      for (let k = 0; k < 14; k++) {
        s *= dir > 0 ? 1.15 : 0.87;
        const saved = new Map();
        for (const rn of band.realms) { saved.set(rn, atkOf(rn)); ATK_MUL.set(rn, atkOf(rn) * s); }
        const wr = bandWinRate(band);
        if (wr >= lo && wr <= hi) { console.log(`  ↯ ${band.label} 攻击×${s.toFixed(3)} → ${(wr * 100).toFixed(1)}%`); break; }
        if ((dir > 0 && wr < lo) || (dir < 0 && wr > hi)) { for (const [rn, v] of saved) ATK_MUL.set(rn, v); break; }
      }
      changed = true;
    }
    if (Math.abs(bestInc - 1) > 0.01) changed = true;
  }
  if (enforceTtk()) changed = true;
  if (!changed) break;
}

// ===== 落库 =====
let tuned = 0;
if (!DRY) {
  for (const m of monsters) {
    const rr = realmOfMonster(m);
    const hm = hpOf(m.id);
    const am = rr ? atkOf(rr.name) : 1;
    if (Math.abs(hm - 1) < 0.02 && Math.abs(am - 1) < 0.02) continue;
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    if (Math.abs(hm - 1) >= 0.02) st.hp = Math.max(1, Math.round((Number(st.hp) || 1) * hm));
    if (Math.abs(am - 1) >= 0.02) st.attack = Math.max(1, Math.round((Number(st.attack) || 1) * am));
    m.stats = JSON.stringify(st);
    tuned++;
  }
  if (tuned) saveDatabase(db);
}
console.log(`\n${DRY ? '[演练] ' : ''}标定 ${tuned} 只怪`);
