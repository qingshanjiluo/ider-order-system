/**
 * 怪物战斗数值对齐玩家曲线 —— 修 R13（四段胜率带无法落区间）的数值根因。
 *
 * ## 病因（轮103 实测数据）
 *
 * | 境界 | Lv | 玩家atk | 怪atk中位 | 玩家/怪 | 怪atk/怪hp |
 * |---|---|---|---|---|---|
 * | 炼气 | 5 | 20 | 18 | 1.11 | 0.155 |
 * | 化神 | 45 | 279 | 105 | 2.66 | 0.059 |
 * | 渡劫 | 85 | 1402 | 270 | **5.19** | 0.020 |
 *
 * 玩家攻击按 `REALM_STAT_GROWTH=1.25` + `ATTACK_GROWTH_BIAS=1.15` **指数**增长（每境界 ×1.45），
 * 而怪的攻击是早期用 `sqrt(hp)` 之类凑出来的，**增长远慢于玩家**：
 * 低境界玩家/怪 ≈ 1.1（势均力敌），高境界飙到 5.2（玩家碾压）。
 *
 * 于是高段位玩家胜率压不下去（段4 目标 30-50%，实测 66.8%），
 * 而 TTK 锁又要求怪不能秒玩家 —— 两条锁在段4 上互相冲突（章程 R13）。
 *
 * ## 修法
 *
 * 让怪的攻击跟着**玩家攻击曲线**走，取一个随境界微升的"压迫度"：
 *   targetAtk(境界) = 玩家atk(refLv) × pressure(境界)
 *
 * pressure 从 0.55（早期，怪略弱，容错高）线性升到 0.95（后期，怪接近同级玩家，压力大）。
 * 这直接给出"随进度递减的难度曲线"（E3 原始意图），同时因为怪永远不会超过玩家，
 * 玩家的先手权与操作空间仍在（不会变成"必须嗑药才能活"）。
 *
 * 血量不动（血量由 `rebalance-pool.js` 的池水位纪律管，且它已被四张验收表锁住）。
 *
 * 用法：
 *   node scripts/align-monster-attack.js            # 默认 --dry（演练），只报数
 *   node scripts/align-monster-attack.js --apply    # 写回存档
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase } = require(path.join(ROOT, 'src', 'database'));
const cs = require(path.join(ROOT, 'src', 'services', 'character'));

const db = loadDatabase();

/** 境界顺序按 min_level 排（炼气 → 飞升），pressure 随进度线性上升 */
const realms = (db.realms || []).slice().sort((a, b) => Number(a.min_level) - Number(b.min_level));
const PRESSURE_LO = 0.46;   // 炼气：怪攻击 ≈ 同级玩家 46%
// ⚠ 为什么压到 0.46 而不是"刚好落带"的 0.50：
//   0.50 时段1 实测 75.2%，距下限 75% 只有 0.2 个点 —— 采样抖动（60 场/组合）就足以让它翻红。
//   留 ~4 个点的余量，代价是新手期怪略弱（这本来就是刻意的设计：早期容错高）。
const PRESSURE_HI = 0.95;   // 飞升：怪攻击 ≈ 同级玩家 95%（高端压迫）
const pressureOf = (i) => (realms.length <= 1 ? PRESSURE_LO : PRESSURE_LO + (PRESSURE_HI - PRESSURE_LO) * (i / (realms.length - 1)));

const realmIndex = new Map(realms.map((r, i) => [r.name, i]));
const realmRow = (n) => realms.find((r) => r.name === n);
const midLevel = (r) => Math.floor((Number(r.min_level) + Number(r.max_level)) / 2);

/** 该境界的目标怪攻击 */
function targetAtk(realmName) {
  const i = realmIndex.get(realmName);
  if (i === undefined) return null;
  const r = realms[i];
  return { atk: cs.calculateAttack(midLevel(r), realmName) * pressureOf(i), pressure: pressureOf(i) };
}

/** 怪所属境界（mid 落在 [min,max]；边界怪归属更低的那个境界，保证压力不跳档） */
function realmOfMonster(m) {
  let r = m.level_range;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { return null; } }
  if (!Array.isArray(r) || r.length < 2) return null;
  const mid = (Number(r[0]) + Number(r[1])) / 2;
  let hit = null;
  for (const rr of realms) {
    if (mid >= Number(rr.min_level) && mid <= Number(rr.max_level)) { hit = rr; break; }
  }
  return hit;
}

// ===== 逐境界报告计划 =====
console.log('== 怪物攻击对齐玩家曲线（pressure = 怪atk / 同级玩家atk）==\n');
console.log('境界    Lv  玩家atk  目标怪atk  pressure  当前中位  调整后中位  怪数');
const plan = [];   // { m, newAtk, realm }
for (const r of realms) {
  const i = realmIndex.get(r.name);
  const playerAtk = cs.calculateAttack(midLevel(r), r.name);
  const t = targetAtk(r.name);
  const list = (db.monsters || []).filter((m) => realmOfMonster(m) === r);
  if (!list.length) { console.log(`  ${r.name.padEnd(4)} ${String(midLevel(r)).padStart(3)}  ${String(playerAtk).padStart(7)}  ${String(Math.round(t.atk)).padStart(9)}  ${t.pressure.toFixed(2).padStart(8)}  —（无怪）`); continue; }
  // ⚠ 幂等要点（踩过）：目标值必须是**由怪自身稳定属性算出的绝对值**。
  //   若写成"当前攻击值 × 比例"，每跑一次都会再乘一遍 —— 实测跑两次存档哈希就变，
  //   投产链失去幂等（章程 R12.3 要求的"复跑逐字节一致"）。
  //
  //   本脚本改的是 attack，所以**不能用 attack 当锚**。改用 **hp 的相对分位**：
  //   血量由 rebalance-pool 定稿（本脚本不动它），是稳定且语义正确的强度代理 ——
  //   "血厚的怪攻击也高"正是我们想要的池内形态。
  const hpOf = (m) => { try { return Number(JSON.parse(m.stats || '{}').hp) || 0; } catch (e) { return 0; } };
  const hps = list.map(hpOf).filter((x) => x > 0).sort((a, b) => a - b);
  const hpMed = hps.length ? hps[Math.floor(hps.length / 2)] : 0;
  for (const m of list) {
    const hp = hpOf(m);
    if (!hp) continue;
    // 相对强度 = 本池血量分位（中位为 1）；夹在 [0.5, 1.6] 内，避免极端怪被拉飞
    const rel = hpMed > 0 ? Math.min(1.6, Math.max(0.5, hp / hpMed)) : 1;
    const newAtk = Math.max(1, Math.round(t.atk * rel));
    plan.push({ m, newAtk, realm: r.name });
  }
  // 表里"当前中位"用**改前的攻击中位**（便于人眼对比），改后中位由 plan 统计
  const curMed = list.map((m) => { try { return Number(JSON.parse(m.stats || '{}').attack) || 0; } catch (e) { return 0; } }).sort((a, b) => a - b)[Math.floor(list.length / 2)];
  const after = plan.filter((p) => p.realm === r.name).map((p) => p.newAtk).sort((a, b) => a - b);
  console.log(`  ${r.name.padEnd(4)} ${String(midLevel(r)).padStart(3)}  ${String(playerAtk).padStart(7)}  ${String(Math.round(t.atk)).padStart(9)}  ${t.pressure.toFixed(2).padStart(8)}  ${String(curMed).padStart(8)}  ${String(after[Math.floor(after.length / 2)]).padStart(10)}  ${String(list.length).padStart(4)}`);
}

// ===== 护栏：不许把任何怪的攻击抬到"能秒杀同级玩家" =====
// 用伤害公式反推：怪打死同级参考玩家须 ≥ 3 回合（TTK 锁是 >2.0，留余量）
const dmgCalc = require(path.join(ROOT, 'src', 'services', 'battle', 'damage'));
let capped = 0;
for (const p of plan) {
  const rr = realmOfMonster(p.m);
  if (!rr) continue;
  const lv = midLevel(rr);
  const P = {
    name: 'p', level: lv, realm: rr.name, maxHp: cs.calculateHpMax(lv, rr.name), hp: cs.calculateHpMax(lv, rr.name),
    mp: 0, attack: cs.calculateAttack(lv, rr.name), defense: cs.calculateDefense(lv, rr.name), element: 'none', crit_rate: 0
  };
  let st; try { st = JSON.parse(p.m.stats || '{}'); } catch (e) { continue; }
  const M = { name: 'm', level: lv, hp: 1, maxHp: 1, mp: 0, attack: p.newAtk, defense: Number(st.defense) || 0, element: 'none', crit_rate: 0 };
  const d = dmgCalc.calculateFinalDamage(M, P, null).damage;
  if (d <= 0) continue;
  const rounds = P.maxHp / d;
  if (rounds < 3.0) {
    // 按比例压到恰好 3 回合
    const scale = rounds / 3.0;
    p.newAtk = Math.max(1, Math.round(p.newAtk * scale));
    capped++;
  }
}
if (capped) console.log(`\n🛡 ${capped} 只怪的攻击被 TTK 护栏（≥3 回合）压制`);

// ===== 落库 =====
if (!DRY) {
  let n = 0;
  for (const p of plan) {
    let st; try { st = JSON.parse(p.m.stats || '{}'); } catch (e) { continue; }
    if (Number(st.attack) === p.newAtk) continue;
    st.attack = p.newAtk;
    p.m.stats = JSON.stringify(st);
    n++;
  }
  if (n) saveDatabase(db);
  console.log(`\n已写回 ${n} 只怪的攻击`);
} else {
  console.log(`\n[演练] 将调整 ${plan.length} 只怪（加 --apply 写回）`);
}
