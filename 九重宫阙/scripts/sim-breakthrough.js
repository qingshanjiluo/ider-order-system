/**
 * E9 · 突破概率蒙特卡洛（只读 balance/realm，不改任何产品代码）
 * 回答三个设计问题：
 *   (1) 一世内能否突破？期望尝试次数与期望消耗寿元
 *   (2) 心魔累积是否会死亡螺旋（越失败越难，最终必然卡死）
 *   (3) 天道庇护（连败≥3 每次 +6）是否足以兜住弃坑风险
 * 用法：node scripts/sim-breakthrough.js [次数]
 */
const realmService = require('../src/services/realm');
const B = require('../src/config/balance');

const N = Number(process.argv[2] || 20000);
const REALMS = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);

function simulate(realm, { demonsAtStart = 0, capYears, seedRng } = {}) {
  const rng = seedRng || Math.random;
  let demons = demonsAtStart, failures = 0, attempts = 0, lostYears = 0;
  const guard = 400;
  while (attempts < guard) {
    attempts++;
    const { chance } = realmService.breakthroughProbability(
      { realm, inner_demon: demons, breakthrough_failures: failures, injury: 0 }
    );
    if (Math.floor(rng() * 100) < chance) {
      return { ok: true, attempts, failures, demons, lostYears };
    }
    failures++;
    demons++;
    const C = B.BREAKTHROUGH_LIFE_COST;
    lostYears += B.yearsOfRatio(capYears, Math.min(C.max, C.base + C.perFail * (failures - 1)));
    if (lostYears >= capYears) return { ok: false, attempts, failures, demons, lostYears };
  }
  return { ok: false, attempts, failures, demons, lostYears, exhaustedGuard: true };
}

console.log(`境界        基准P  期望尝试  失败率   期望折寿年  折寿/寿元  卡死率`);
for (const realm of REALMS) {
  const base = B.BREAKTHROUGH_BASE[realm];
  const cap = B.lifespanOf(realm);
  let sumAtt = 0, failRuns = 0, sumLost = 0, stuck = 0;
  for (let i = 0; i < N; i++) {
    const r = simulate(realm, { capYears: cap });
    sumAtt += r.attempts; sumLost += r.lostYears;
    if (!r.ok) { failRuns++; if (r.exhaustedGuard) stuck++; }
  }
  console.log(
    `${realm.padEnd(6)}   ${String(base).padStart(4)}  ` +
    `${fmt(sumAtt / N).padStart(8)}  ${fmt((failRuns / N) * 100).padStart(6)}%  ` +
    `${fmt(sumLost / N).padStart(9)}  ${fmt((sumLost / N / cap) * 100).padStart(8)}%  ` +
    `${fmt((stuck / N) * 100).padStart(7)}%`
  );
}
console.log('\n注：折寿/寿元 = 平均一次突破流程烧掉的寿元占当前境界上限的比例；卡死率 = 400 次内既未成功也未寿尽（理论上应≈0，非 0 说明判定或保底有缺陷）。');
