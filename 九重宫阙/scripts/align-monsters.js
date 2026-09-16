/**
 * P7 数值对齐（轮103）：把怪物等级拉回所属地图的区间内
 *
 * 病因（审计 ⑤ 发现）：地图 #2~#17 的 min/max_level 在某次平衡调整里被抬高了
 *   （妖兽森林 Lv15-30、火焰山 Lv30-45…），但图上的怪还留着抬高前的等级
 *   （竹妖 Lv10-14、火焰蜥蜴王 Lv20-24…）。结果玩家进 Lv15 的图打 Lv10 的怪：
 *   经验/掉落按怪等级算 → 越打越亏，等于这些图白开。
 *
 * 为什么不反过来降地图等级：地图等级已与副本（dungeons.min_level）、
 *   装备档位、坊市解锁对齐，动地图会连带打断三条链；抬怪只动一个字段组。
 *
 * 对齐规则（按图内强弱次序均匀铺满，而不是等比拉伸）：
 *   等比拉伸的毛病：原图的怪自己也挤在区间左端（混沌深渊 Lv50-60 五只挤在 10 级内），
 *   拉伸后同样挤在左端（Lv75-79），地图右端 Lv80-90 依旧空着 —— 换了个地方接着浪费。
 *   改为：把图内怪按**原中位等级**排序，从 ML 到 MH 均匀分布（保持原有强弱次序），
 *   每只怪取一个宽度约 (MH-ML)/n 的区间。这样整张图从下到上都有怪，进度带不空转。
 *
 * ⚠ 血泪教训（轮103 第二轮）：只抬等级、不抬血量会**打乱境界池平衡** ——
 *   怪物平衡锁要求「同境界池内最硬怪 ≤ 池中位 hp 的 2 倍」。把 Lv10-14 的怪抬成 Lv15-18 后，
 *   它从"炼气池"挪进了"筑基池"，但血量还是炼气的量级 → 各池中位被拉低，元婴/合体/大乘/渡劫
 *   四个池的比值从 1.60 飙到 2.24/3.13/2.67/6.38（全线超线）。
 *   所以等级抬升必须**按同倍率抬血量**（攻击/防御同理），保持怪与档位的比例关系不变。
 *
 * 幂等：该图所有怪都落在 [ML-3, MH+3] 内就不动；重复跑结果收敛。
 *
 * 用法：node scripts/align-monsters.js [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase } = require(path.join(ROOT, 'src', 'database'));

const db = loadDatabase();
const maps = new Map((db.maps || []).map((m) => [Number(m.id), m]));
const monsters = db.monsters || [];

const byMap = new Map();
for (const mo of monsters) {
  const mid = Number(mo.map_id);
  if (!mid || !maps.has(mid)) continue;
  if (!byMap.has(mid)) byMap.set(mid, []);
  byMap.get(mid).push(mo);
}

const parseLr = (v) => {
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
  return Array.isArray(v) && v.length >= 2 ? v.map(Number) : null;
};

/** 该等级所属境界池的现有怪中位 hp（对齐锚：地图档位与境界池不是同一把尺） */
function poolMedianHp(level) {
  const rr = (db.realms || []).find((x) => level >= Number(x.min_level) && level <= Number(x.max_level));
  if (!rr) return null;
  const hps = [];
  for (const m of monsters) {
    const r = parseLr(m.level_range);
    if (!r) continue;
    const mid = (r[0] + r[1]) / 2;
    if (mid < Number(rr.min_level) || mid > Number(rr.max_level)) continue;
    let st; try { st = JSON.parse(m.stats || '{}'); } catch (e) { continue; }
    const hp = Number(st.hp);
    if (hp > 0) hps.push(hp);
  }
  if (!hps.length) return null;
  hps.sort((a, b) => a - b);
  return hps[Math.floor(hps.length / 2)];
}

let fixed = 0;
const report = [];

for (const [mid, list] of byMap) {
  const map = maps.get(mid);
  const ML = Number(map.min_level || 1), MH = Number(map.max_level || ML + 10);
  if (MH <= ML) continue;

  // 该图整体是否已在容差内（全都在就不动，保持幂等）
  const allIn = list.every((m) => {
    const lr = parseLr(m.level_range);
    return !lr || (lr[0] >= ML - 3 && lr[1] <= MH + 3);
  });
  if (allIn) continue;

  // 只对"跑偏的"怪重排；已合规的怪保留（避免把手工校过的图打乱）
  const strays = list.filter((m) => {
    const lr = parseLr(m.level_range);
    return lr && !(lr[0] >= ML - 3 && lr[1] <= MH + 3);
  });
  if (!strays.length) continue;

  // 按原中位等级排序 → 保持图内强弱次序
  strays.sort((a, b) => {
    const la = parseLr(a.level_range) || [0, 0];
    const lb = parseLr(b.level_range) || [0, 0];
    return (la[0] + la[1]) - (lb[0] + lb[1]);
  });

  const n = strays.length;
  const bandWidth = Math.max(2, Math.floor((MH - ML) / n));   // 每只怪占的等级带宽
  let changed = 0;
  strays.forEach((mo, i) => {
    const lr = parseLr(mo.level_range);
    if (!lr) return;
    const lo = ML + i * bandWidth;
    let hi = Math.min(MH, lo + bandWidth);
    if (i === n - 1) hi = MH;                                  // 最后一只顶到地图上限
    const nlo = Math.max(ML, Math.min(lo, MH - 1));
    const nhi = Math.max(nlo + 1, hi);
    if (nlo === lr[0] && nhi === lr[1]) return;

    // 血量/攻防同步搬到新档位。
    // ⚠ 轮103 第二轮教训：按"等级比值"线性缩放**不够** —— 地图档位与境界池不是同一把尺，
    //   线性缩放后的怪进了高档池仍低于池中位，把中位拉低 → 池比值从 1.60 飙到 2.46~4.10。
    //   正确锚是**新等级所属境界池的中位 hp**：把该图最弱的怪对齐池中位，
    //   其余按原有的强弱比例（配置里的相对血量）排上去。
    const oldMid = (lr[0] + lr[1]) / 2;
    const newMid = (nlo + nhi) / 2;
    let statsNote = '';
    if (!DRY) {
      try {
        const st = JSON.parse(mo.stats || '{}');
        const poolMed = poolMedianHp(newMid);
        if (poolMed && Number(st.hp) > 0) {
          // 该图怪的相对强度：以图内最弱为 1.0
          const listHps = list.map((x) => { try { return Number(JSON.parse(x.stats || '{}').hp) || 0; } catch (e) { return 0; } }).filter((x) => x > 0);
          const minHp = listHps.length ? Math.min(...listHps) : Number(st.hp);
          const rel = minHp > 0 ? Number(st.hp) / minHp : 1;      // 图内相对强度
          const targetHp = Math.round(poolMed * rel);
          const before = `${st.hp}/${st.attack}/${st.defense}`;
          const factor = Number(st.hp) > 0 ? targetHp / Number(st.hp) : 1;
          st.hp = targetHp;
          if (Number(st.attack) > 0) st.attack = Math.max(1, Math.round(st.attack * Math.sqrt(factor)));
          if (Number(st.defense) > 0) st.defense = Math.max(1, Math.round(st.defense * Math.sqrt(factor)));
          if (Number(st.speed) > 0) st.speed = Math.max(1, Math.round(st.speed * Math.sqrt(Math.sqrt(factor))));
          mo.stats = JSON.stringify(st);
          statsNote = `  数值×${factor.toFixed(2)} 对齐池中位${poolMed} (${before} → ${st.hp}/${st.attack}/${st.defense})`;
        } else {
          statsNote = '  ⚠ 找不到所属池，血量未动';
        }
      } catch (e) { statsNote = '  ⚠ stats 解析失败，未缩放'; }
    }

    report.push(`  ${map.name}(Lv${ML}-${MH}) ${mo.name}: Lv${lr[0]}-${lr[1]} → Lv${nlo}-${nhi}${statsNote}`);
    if (!DRY) mo.level_range = JSON.stringify([nlo, nhi]);
    changed++; fixed++;
  });
  if (changed) report.push(`  └ ${map.name} 调整 ${changed}/${list.length} 只，铺满 Lv${ML}-${MH}`);
}

if (!DRY && fixed) saveDatabase(db);

console.log(`${DRY ? '[演练] ' : ''}等级对齐：修正 ${fixed} 只怪`);
if (report.length) console.log(report.join('\n'));
console.log(`\n复跑审计：node scripts/audit-gameplay.js`);
