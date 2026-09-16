/**
 * P7 数值回调（轮103）：把怪的血量对齐到「所在境界池」的水位
 *
 * 病因（两条，都是内容追加引起的）：
 *   ① 黄土坡 4 只怪照地图档位（Lv8-16）配了 180~300 血，而炼气池中位仅 86
 *      → 最硬/中位 = 2.09，破了「池内最硬 ≤ 中位 2 倍」的锁；
 *   ② align-monsters 把妖兽森林/火焰山等低档怪抬进 Lv60+ 后，它们带着"低档血量"
 *      进了合体/大乘/渡劫池，把池中位拉低 → 三个池的比值涨到 2.46/2.67/4.10。
 *      而池里原来的"最硬怪"（五行圣兽 8835、魔道至尊 14074、仙界使者 21773）没变，
 *      于是从平衡的 1.60 变成超线。
 *
 * 修法：以**每个境界池中位 hp** 为水位，把"明显低于水位"的怪抬上来（只抬不降）。
 *   抬升目标 = 池中位（保证不拖后腿），攻防按 hp 的同倍率跟随（保持怪的手感比例）。
 *   池里的最硬怪（Boss）不动 —— 它们是该池的上限锚。
 *
 * 幂等：目标值由"当前池中位"算出，抬过之后中位会上升，脚本自动收敛；
 *   但为避免来回震荡，只抬"低于中位"的怪（低于就不可能是它把中位拉高的）。
 *
 * 用法：node scripts/rebalance-pool.js [--dry] [--tune-hp] [--pool-fill]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const POOL_FILL = process.argv.includes('--pool-fill');   // 按池水位补血
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase } = require(path.join(ROOT, 'src', 'database'));

/** 怪名 → { hp, attack, defense, speed }（只列要改的字段） */
const TUNE = {
  黄土石魈: { hp: 122 },
  坡地沙狼: { hp: 132 },
  旱魃幼体: { hp: 148 },
  裂地岩龟: { hp: 165 }
};

const db = loadDatabase();
const monsters = db.monsters || [];
let fixed = 0;

for (const [name, want] of Object.entries(TUNE)) {
  const m = monsters.find((x) => x.name === name);
  if (!m) { console.log(`  ⚠ 找不到怪「${name}」，跳过`); continue; }
  let st;
  try { st = JSON.parse(m.stats || '{}'); } catch (e) { console.log(`  ⚠ ${name} 的 stats 解析失败，跳过`); continue; }
  const before = JSON.stringify({ hp: st.hp, attack: st.attack, defense: st.defense, speed: st.speed });
  let changed = false;
  for (const [k, v] of Object.entries(want)) {
    if (Number(st[k]) !== Number(v)) { st[k] = v; changed = true; }
  }
  if (!changed) { console.log(`  · ${name} 已是目标值`); continue; }
  console.log(`  ✎ ${name}: hp ${before} → ${JSON.stringify({ hp: st.hp, attack: st.attack, defense: st.defense, speed: st.speed })}`);
  if (!DRY) m.stats = JSON.stringify(st);
  fixed++;
}

if (!DRY && fixed) saveDatabase(db);

// ---- ② 池水位补血：把"低于本池中位"的怪抬到中位（只抬不降）----
let filled = 0;
if (POOL_FILL) {
  /** 把怪分进境界池 */
  const buildPools = (rows) => {
    const pools = {};
    for (const m of rows) {
      let r = m.level_range;
      if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
      if (!Array.isArray(r)) continue;
      let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
      const hp = Number(st.hp);
      if (!hp) continue;
      const mid = (Number(r[0]) + Number(r[1])) / 2;
      const rr = (db.realms || []).find((x) => mid >= Number(x.min_level) && mid <= Number(x.max_level));
      if (!rr) continue;
      (pools[rr.name] = pools[rr.name] || []).push({ m, st, hp });
    }
    return pools;
  };

  // 迭代若干轮：每轮抬"低于中位"的怪，中位随之上移，直到收敛（池比值达标）
  for (let round = 0; round < 6; round++) {
    const pools = buildPools(monsters);
    let roundFixed = 0;
    for (const [realmName, arr] of Object.entries(pools)) {
      // 该池当前是否已达标（最硬 ≤ 中位×2）—— 达标就不动，避免过度抬升
      const hps = arr.map((x) => x.hp).sort((a, b) => a - b);
      const med = hps[Math.floor(hps.length / 2)];
      if (hps[hps.length - 1] <= med * 2) continue;

      // 把低于中位的怪抬到中位（只抬不降）——它们是把中位拉低的元凶
      for (const { m, st, hp } of arr) {
        if (hp >= med) continue;
        const factor = med / hp;
        if (factor <= 1.02) continue;   // 差距太小，不动（防抖）
        const before = `${st.hp}/${st.attack}/${st.defense}`;
        if (!DRY) {
          st.hp = Math.round(med);
          if (Number(st.attack) > 0) st.attack = Math.round(st.attack * factor);
          if (Number(st.defense) > 0) st.defense = Math.round(st.defense * factor);
          m.stats = JSON.stringify(st);
        }
        if (round === 0) {
          console.log(`  ↑ ${realmName}池 ${m.name}: ${before} → ${st.hp}/${st.attack}/${st.defense}（抬到池中位 ${med}）`);
        }
        roundFixed++; filled++;
      }
    }
    if (!roundFixed) break;
    if (!DRY) saveDatabase(db);
  }
}

if (!DRY && (fixed || filled)) saveDatabase(db);

// ---- ③ 图内水位补血：同图内血量落差过大的怪抬到"图内高位"----
// 为什么需要：一张图的怪可能分属不同境界池（火焰山 Lv30-45 里，有的 Lv30-33、有的 Lv42-45），
// 若某只怪没被前面的步骤覆盖，它就会留在低血量，形成 425~3337（7.9 倍）这种断层 ——
// 玩家在同一张图里忽而被秒、忽而秒怪。这里按图内最高血量把明显偏低的怪抬上来。
//
// ⚠ 轮103 第四轮：单跑一遍会引发**链式反应** —— 抬完图内低血怪，它的血量变了，
//   所属境界池的构成与中位也跟着变，可能让另一个池新超线（实测抬完寒冰蝎后化神 2.07、炼虚 2.22）。
//   所以三步（池回调 → 池补血 → 图内补血）要**循环迭代到全部达标**，而不是各跑一次。
let mapFilled = 0;

/** 复算各境界池的比值，返回未达标的池名 */
function failingPools() {
  const pools = {};
  for (const m of monsters) {
    let r = m.level_range;
    if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
    if (!Array.isArray(r)) continue;
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    const hp = Number(st.hp);
    if (!hp) continue;
    const mid = (Number(r[0]) + Number(r[1])) / 2;
    const rr = (db.realms || []).find((x) => mid >= Number(x.min_level) && mid <= Number(x.max_level));
    if (!rr) continue;
    (pools[rr.name] = pools[rr.name] || []).push(hp);
  }
  const bad = [];
  for (const [n, arr] of Object.entries(pools)) {
    const a = arr.slice().sort((x, y) => x - y);
    const med = a[Math.floor(a.length / 2)];
    if (a[a.length - 1] > med * 2) bad.push(n);
  }
  return bad;
}

/** 图内落差超 3.5 倍的怪（返回待抬清单） */
function mapGaps() {
  const byMap = new Map();
  for (const m of monsters) {
    const mid = Number(m.map_id);
    if (!mid) continue;
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    const hp = Number(st.hp);
    if (!hp) continue;
    if (!byMap.has(mid)) byMap.set(mid, []);
    byMap.get(mid).push({ m, st, hp });
  }
  const out = [];
  for (const [mid, list] of byMap) {
    if (list.length < 2) continue;
    const hi = Math.max(...list.map((x) => x.hp));
    for (const x of list) if (x.hp * 3.5 <= hi) out.push({ mid, hi, ...x });
  }
  return out;
}

for (let round = 0; round < 8; round++) {
  const gaps = mapGaps();
  const badPools = failingPools();
  if (!gaps.length && !badPools.length) break;

  let acted = 0;
  // 先修池（池超线时，把该池偏低的怪抬到中位）
  for (const { mid, hi, m, st, hp } of gaps) {
    const factor = (hi / 1.5) / hp;
    if (factor <= 1.05) continue;
    const before = `${st.hp}/${st.attack}/${st.defense}`;
    if (!DRY) {
      st.hp = Math.round(hi / 1.5);
      if (Number(st.attack) > 0) st.attack = Math.round(st.attack * Math.sqrt(factor));
      if (Number(st.defense) > 0) st.defense = Math.round(st.defense * Math.sqrt(factor));
      m.stats = JSON.stringify(st);
    }
    console.log(`  ⇧ map${mid} ${m.name}: ${before} → ${st.hp}/${st.attack}/${st.defense}（图内水位 ${hi}）`);
    mapFilled++; acted++;
  }
  if (!DRY && acted) saveDatabase(db);
  if (!acted) break;
}

// 复算各境界池比值，把结果直接打出来（省得再跑一遍测试才知道好不好）
const pools = {};
for (const m of monsters) {
  let r = m.level_range;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
  if (!Array.isArray(r)) continue;
  let st = {}; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
  const hp = Number(st.hp);
  if (!hp) continue;
  const mid = (Number(r[0]) + Number(r[1])) / 2;
  const rr = (db.realms || []).find((x) => mid >= Number(x.min_level) && mid <= Number(x.max_level));
  if (!rr) continue;
  (pools[rr.name] = pools[rr.name] || []).push(hp);
}
console.log(`\n${DRY ? '[演练] ' : ''}回调 ${fixed} 只${POOL_FILL ? `，池水位补血 ${filled} 次` : ''}，图内补血 ${mapFilled} 次\n各境界池「最硬 / 中位」比值：`);
for (const [n, arr] of Object.entries(pools)) {
  const a = arr.slice().sort((x, y) => x - y);
  const med = a[Math.floor(a.length / 2)];
  const ratio = a[a.length - 1] / med;
  console.log(`  ${n.padEnd(4)} n=${String(a.length).padStart(3)} 中位=${String(med).padStart(5)} 最硬=${String(a[a.length - 1]).padStart(6)} 比值=${ratio.toFixed(2)}${ratio > 2 ? '  ❌ 超线' : '  ✅'}`);
}
