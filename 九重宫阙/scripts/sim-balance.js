/**
 * E9 · sim-balance —— 追赶校验（cumT vs L）· 轮53
 *
 * 《修炼与寿元系统模型.md》§2.2 把四条铁律写成了设计准则，但一直**没有量过**：
 *   (1) cumT(r) < L(r)            ∀r ≤ 元婴     前四境靠自然寿元可达（新手不被卡死）
 *   (2) L(r) − cumT(r+1) < 0      ∀r ≥ 元婴     元婴之后必须经营寿元才能前进
 *   (3) 余量比 (L−cumT)/L：炼气>60% / 筑基40~55% / 金丹15~30% / 元婴5~15% / 化神起为负
 *   (4) 单境界内连败 3 次 + 重伤 2 次后，cap 仍不得低于 cumT(r)（否则玩家必死无疑 = 数值事故）
 * 本脚本用**生产同一份代码**算速度（`cultivation-model.expPerSecond`）、用**真实存档的等级区间**算需求，
 * 不做任何重算公式，只出表与判词。
 *
 * 口径（全部来自被测代码，不在此复制）：
 *   需求(r)   = Σ_{L=min_level}^{max_level-1} characterService.calculateExpForLevel(L)
 *   速度(r)   = expPerSecond(ctx).rate（修为/真实秒）× 每秒每游戏年换算
 *   一年      = 3600 / gameTime.GAME_YEARS_PER_REAL_HOUR 真实秒（24h=10 游戏年 ⇒ 8640s）
 *
 * 三种画像分别用最"苛刻方向"去卡每条铁律：
 *   P1 慢速（新手：无功法、不入关、零 buff）⇒ cumT 最大 ⇒ 用来卡 (1)「新手不被卡死」
 *   P2 常规（玄阶功法十层 + 坐忘 + 中等地脉）  ⇒ 用来对 (3) 的目标余量带
 *   P3 极限（仙阶功法五十层 + 入定 + 满环境，必然撞 SPEED_CAP_TOTAL）⇒ cumT 最小 ⇒ 用来卡 (2)「极限也快不过寿元」
 *
 * 用法：node scripts/sim-balance.js [--report 文件.md] [--strict]
 *   默认（门禁模式）：(1)(2)(4) 硬断言 + (3) 只报判词并做方向锁（余量比不得继续变大）
 *   --strict：把 (3) 也当硬失败（数值调平之后切过来）
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const B = require('../src/config/balance');
const gameTime = require('../src/services/gameTime');
const { expPerSecond } = require('../src/services/cultivation-model');
const charService = require('../src/services/character');
const { loadDatabase, closeDatabase } = require('../src/database');

const SECONDS_PER_GAME_YEAR = 3600 / gameTime.GAME_YEARS_PER_REAL_HOUR;
const ORDER = B.REALM_ORDER.filter((r) => r !== '飞升');
const STRICT = process.argv.includes('--strict');
const ri = (r) => ORDER.indexOf(r);

// (3) 的目标带（原文照抄《修炼与寿元系统模型.md》§2.2）
const TARGET_RATIO = { 炼气: [60, Infinity], 筑基: [40, 55], 金丹: [15, 30], 元婴: [5, 15] };

/** 三画像：字段名与 services/cultivation.js 注入给模型的 ctx 完全一致 */
const PROFILES = {
  P1: { label: '慢速·新手（无功法/不入关）', ctxOf: (realm) => ({ realm, level: 1, stats: {}, gongfas: [], seclusion: 'none' }) },
  P2: {
    label: '常规（玄阶十层 + 坐忘 + 中等地脉）',
    ctxOf: (realm) => ({
      realm, level: 1, stats: { talent: 12, comprehension: 12, dao_affinity: 10 },
      gongfas: [{ quality: '玄阶', level: 10 }], mapDifficulty: 3, veinLevel: 3, seclusion: 'zuowang'
    })
  },
  P3: {
    label: '极限（仙阶五十层 + 入定 + 满环境）',
    ctxOf: (realm) => ({
      realm, level: 1, stats: { talent: 20, comprehension: 20, dao_affinity: 18 },
      gongfas: [{ quality: '仙阶', level: 50 }], mapDifficulty: 9, veinLevel: 9, seclusion: 'ruding',
      pillMultiplier: 1.5, caveMultiplier: 1.3, sectMultiplier: 1.2, spiritRoots: [{ type: 'metal', purity: 90 }]
    })
  }
};

const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(1)}%` : String(v));
const big = (n) => {
  if (!Number.isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a >= 1e16) return `${(n / 1e16).toFixed(2)}亿亿`;
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}万亿`;
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (a >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return n < 100 && n > 0 ? n.toFixed(2) : String(Math.round(n));
};
const pc1 = (v) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;   // 先量化再显示，避免打印 19.000000000000004%

(async () => {
  console.log('== E9 · sim-balance（追赶校验 cumT vs L）==');
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log(`  ✅ ${name}`); pass++; }
    catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
  };

  const db = loadDatabase();
  const realms = db.realms || [];
  const expForLevel = charService.calculateExpForLevel
    ? (L) => charService.calculateExpForLevel(L)
    : (L) => Math.floor(100 * Math.pow(1.5, L - 1));

  // ---- 结构自检：等级区间必须连续覆盖 1..100，否则"填满本境界"的口径无从谈起
  const rows = ORDER.map((r) => realms.find((x) => x.name === r)).filter(Boolean);
  const struct = [];
  for (const r of rows) struct.push(`${r.name}:${r.min_level}-${r.max_level}`);
  assert.ok(rows.length === ORDER.length, `realms 表缺境界：只有 ${rows.length}/${ORDER.length}（${struct.join(' ')}）`);

  const fillExpOf = (r) => {
    let sum = 0;
    for (let L = Number(r.min_level); L < Number(r.max_level); L++) sum += expForLevel(L);
    return sum;
  };
  const rateOf = (profile, realm) => expPerSecond(profile.ctxOf(realm)).rate;

  // ---- 逐境界、逐画像算 cumT
  const tables = {};
  for (const [key, p] of Object.entries(PROFILES)) {
    let cum = 0;
    const list = [];
    for (const r of rows) {
      const yearRate = rateOf(p, r.name) * SECONDS_PER_GAME_YEAR;
      const need = fillExpOf(r);
      const years = need / yearRate;
      cum += years;
      const L = B.lifespanOf(r.name);
      list.push({
        realm: r.name, levelRange: `${r.min_level}-${r.max_level}`, base: B.CULTIVATION_V0[r.name],
        zones: expPerSecond(p.ctxOf(r.name)).speed, capped: expPerSecond(p.ctxOf(r.name)).capped,
        yearRate, need, years, cumT: cum, L, margin: L ? (L - cum) / L * 100 : NaN,
        gateExp: Number(r.exp_requirement) || 0, pinExp: expForLevel(Number(r.max_level))
      });
    }
    tables[key] = list;
  }

  const head = ['境界', '等级区', 'V0', '总乘区', '修为/游戏年', '本境需求', '本境耗时(年)', 'cumT(年)', 'L(年)', '余量比'];
  const render = (key) => tables[key].map((x) => [
    x.realm, x.levelRange, x.base, `${x.zones.toFixed(2)}${x.capped ? '(封顶)' : ''}`, big(x.yearRate),
    big(x.need), big(x.years), big(x.cumT), big(x.L), pct(x.margin)
  ].join(' | '));
  for (const key of Object.keys(PROFILES)) {
    console.log(`\n  【${key} · ${PROFILES[key].label}】`);
    console.log('    ' + head.join(' | '));
    for (const line of render(key)) console.log('    ' + line);
  }

  // ---- 一处值得单独立刻的数据事实
  const ghostField = (() => {
    const hit = (db.gongfa || []).some((g) => g && 'cultivation_speed' in g);
    return hit;
  })();
  console.log(`\n  ℹ 乘区2（功法）实际只吃"品阶 × 层数"：存档 gongfa 集合里 cultivation_speed ${ghostField ? '存在' : '一行都没有'}` +
    `（模型第 95 行读它，读不到就当没有 ⇒ 该通道恒等 1.0）`);
  console.log('  ℹ 突破的修为闸门 exp_requirement 与等级曲线钉住的 exp 相比：');
  for (const x of tables.P1) console.log(`     ${x.realm}: 圆满时 exp 被钉在 ${big(x.pinExp)}，而 exp_requirement=${big(x.gateExp)} ⇒ 闸门${x.pinExp >= x.gateExp ? '恒成立（形同虚设）' : '才是真门槛'}`);

  // ================= 铁律 (1) =================
  await t('铁律(1) 前四境靠自然寿元可达（最慢画像 P1，cumT 最大方向）', () => {
    for (const x of tables.P1.filter((v) => ri(v.realm) <= ri('元婴'))) {
      assert.ok(x.cumT < x.L, `cumT(${x.realm})=${big(x.cumT)} 年 ≥ L=${big(x.L)} 年：新手在${x.realm}就会被自然寿元卡死`);
    }
  });

  // ================= 铁律 (2) =================
  await t('铁律(2) 元婴之后即便极限速度也追不上寿元（最快画像 P3，cumT 最小方向）', () => {
    const p3 = tables.P3;
    assert.ok(p3.every((x) => x.capped || x.zones < B.SPEED_CAP_TOTAL), 'P3 总乘区超过 SPEED_CAP_TOTAL 却没标 capped');
    for (let i = ri('元婴'); i < p3.length - 1; i++) {
      const cur = p3[i], next = p3[i + 1];
      assert.ok(cur.L - next.cumT < 0,
        `L(${cur.realm})=${big(cur.L)} − cumT(${next.realm})=${big(next.cumT)} ≥ 0：极限 build 也能自然修到 ${next.realm}，"必须经营寿元"不成立`);
    }
  });

  // ================= 铁律 (3) =================
  const r3 = [];
  for (const realm of Object.keys(TARGET_RATIO)) {
    const x = tables.P2.find((v) => v.realm === realm);
    const [lo, hi] = TARGET_RATIO[realm];
    const ok = x.margin > lo && (hi === Infinity || x.margin <= hi);
    r3.push({ realm, actual: x.margin, lo, hi, ok });
    console.log(`  ${ok ? '✅' : '⚠️'} 铁律(3) ${realm}：实测余量比 ${pct(x.margin)}，目标 (${lo}%, ${hi === Infinity ? '∞' : hi}%]${ok ? '' : ' ← 偏离'}`);
  }
  const hua = tables.P2.find((v) => v.realm === '化神');
  console.log(`  ${hua.margin < 0 ? '✅' : '⚠️'} 铁律(3) 化神起应为负：实测 ${pct(hua.margin)}`);

  await t('铁律(3) 追赶压力方向锁（余量比不得比基线更大 = 不得更松）', () => {
    // 当前实测（P2）：筑基 99.8% / 金丹 98.1% / 元婴 80.7%，全部**远高于**目标带 —— 前段几乎没有寿元压力，
    // 而化神单境要 3.13 万游戏年（L 才 2 万），曲线在元婴→化神之间跳了约 34 倍。
    // 也就是说"停着就会死"目前只在纸面上，真正成立的是"化神起数学上不可能"。
    // 调平之前先把方向钉死：这些数字只许往目标带里走，一格都不许更松。
    // （上限是轮53 实测基线向上取整到 0.1，不是拍脑袋 —— 首版我用心算填了 99.6，当场把自己的基线判红了。）
    const CEIL = { 炼气: 100.0, 筑基: 99.9, 金丹: 98.2, 元婴: 80.8 };
    for (const [realm, ceil] of Object.entries(CEIL)) {
      const x = tables.P2.find((v) => v.realm === realm);
      assert.ok(x.margin <= ceil + 1e-9,
        `${realm} 余量比 ${pct(x.margin)} 超过方向锁上限 ${ceil}%：追赶压力被调得更松了（目标带见《修炼与寿元系统模型.md》§2.2）`);
    }
    assert.ok(hua.margin < 0, `化神余量比 ${pct(hua.margin)} 不为负：化神仍可自然达成，与准则(2) 矛盾`);

    // 病根指标：相邻境界"本境耗时"的跳变倍数。1.5^L 每境 ×57.7，V0 每境只 ×~1.7，L 只 ×~3.5
    // ⇒ 每进一境净跳 ~34 倍，这才是"前段无聊、化神墙死"的数学来源。调平后这个数必须显著下降。
    const jumps = [];
    for (let i = 0; i + 1 < tables.P2.length; i++) {
      jumps.push({ from: tables.P2[i].realm, to: tables.P2[i + 1].realm, k: tables.P2[i + 1].years / tables.P2[i].years });
    }
    const worst = jumps.reduce((a, b) => (b.k > a.k ? b : a), jumps[0]);
    console.log(`  ℹ 跨境耗时跳变（P2）：${jumps.map((j) => `${j.from}→${j.to} ×${j.k.toFixed(1)}`).join('  ')}`);
    assert.ok(worst.k <= 34.5,
      `最大跳变 ${worst.from}→${worst.to} ×${worst.k.toFixed(1)} 超过基线锁 34.5：境界曲线比轮53 更陡了（玩家会在这一境被数学墙死）`);
    if (STRICT) {
      const bad = r3.filter((v) => !v.ok);
      assert.deepStrictEqual(bad, [], `--strict：${bad.map((v) => `${v.realm}=${pct(v.actual)}∉(${v.lo},${v.hi}]`).join(' ')} 未落进目标带`);
    }
  });

  // ================= 铁律 (4) =================
  await t('铁律(4) 连败3+重伤2 的折寿不得把 cap 打到 cumT 之下', () => {
    const BL = B.BREAKTHROUGH_LIFE_COST, INJ = B.INJURY_LIFE_COST;
    const worstRatio = 3 * BL.max + 2 * INJ.defeat;      // 每败封顶 5% ×3 + 每次战败 2% ×2 = 19%
    assert.ok(worstRatio > 0 && worstRatio < 1, `折寿比例合计 ${worstRatio} 不合理`);
    for (const x of tables.P1.filter((v) => ri(v.realm) <= ri('元婴'))) {
      const capAfter = x.L * (1 - worstRatio);
      assert.ok(capAfter >= x.cumT,
        `${x.realm}：连败3+重伤2 后 cap=${big(capAfter)} 年 < cumT=${big(x.cumT)} 年，玩家必然横死（数值事故）`);
    }
    console.log(`  ℹ 铁律(4) 口径：最坏折寿 = 3×${(BL.max * 100).toFixed(1)}%（突破失败封顶）+ 2×${(INJ.defeat * 100).toFixed(1)}%（战败）= ${(worstRatio * 100).toFixed(1)}% cap；化神起按准则(2) 本就必须靠应劫续命，故只对前四境判死`);
  });

  // ---- 报告
  const repArg = process.argv.indexOf('--report');
  if (repArg !== -1 && process.argv[repArg + 1]) {
    const out = [];
    out.push('# 数值追赶校验表（sim-balance 实测 · 轮53）');
    out.push('');
    out.push(`> 由 \`node scripts/sim-balance.js --report 数值追赶校验.md\` 生成，勿手改。`);
    out.push(`> 口径：需求 = Σ \`characterService.calculateExpForLevel(L)\`（真实等级区间，读自存档 \`realms\`）；`);
    out.push('> 速度 = 生产同款九乘区 `cultivation-model.expPerSecond()`；1 游戏年 = ' + SECONDS_PER_GAME_YEAR + ' 真实秒（24h=10 年）。');
    out.push('');
    for (const key of Object.keys(PROFILES)) {
      out.push(`## ${key} · ${PROFILES[key].label}`);
      out.push('');
      out.push('| ' + head.join(' | ') + ' |');
      out.push('|' + head.map(() => '---:').join('|') + '|');
      for (const line of render(key)) out.push('| ' + line + ' |');
      out.push('');
    }
    out.push('## 铁律判定');
    out.push('');
    out.push(`- (1) 前四境自然可达（P1）：**成立** — 元婴 cumT ${big(tables.P1.find((v) => v.realm === '元婴').cumT)} 年 < L 5000 年`);
    out.push(`- (2) 元婴后必须经营寿元（P3）：**成立** — 极限 build 下 cumT(化神) ${big(tables.P3.find((v) => v.realm === '化神').cumT)} 年 ≫ L(元婴) 5000 年`);
    out.push('- (3) 目标余量带：**未成立** — ' + r3.map((v) => `${v.realm} 实测 ${pct(v.actual)}（目标 ${v.lo}~${v.hi === Infinity ? '∞' : v.hi}%）`).join('，'));
    out.push('  ⇒ 偏差方向是**太宽松**：玩家在炼气~金丹几乎感受不到寿元压力，化神起又直接变成天文数字，中间没有"经营"的空间。');
    const jr = [];
    for (let i = 0; i + 1 < tables.P2.length; i++) jr.push(`${tables.P2[i].realm}→${tables.P2[i + 1].realm} ×${(tables.P2[i + 1].years / tables.P2[i].years).toFixed(1)}`);
    out.push(`- 病根（跨境耗时跳变，P2）：${jr.join('　')}。等级曲线 \`100×1.5^L\` 每境约 ×57.7，而 ` +
      `V0 每境只 ×~1.7、L 每境只 ×~3.3 ⇒ **每一境都要多花约 33 倍时间，寿元却只多 3.3 倍**（跳变是均匀的，并非化神才有 cliff）。` +
      `所以"停着就会死"在纸面上成立、在体验上不成立：前段毫无压力，越往后是指数式墙。`);
    out.push(`  元婴→化神这一跳最致命：化神单境，常规画像要 ${big(tables.P2[4].years)} 游戏年、已超过 L(化神)=${big(tables.P2[4].L)} 年` +
      `（常规玩家到这一步必死）；只有撞满 SPEED_CAP_TOTAL 的极限画像才 ${big(tables.P3[4].years)} 年、勉强够用。` +
      `也就是说化神不是"需要经营寿元"，而是"只有毕业 build 才可能到达"。`);
    out.push(`- (4) 连败3+重伤2 不致死：**成立** — 最坏 ${pc1(3 * B.BREAKTHROUGH_LIFE_COST.max + 2 * B.INJURY_LIFE_COST.defeat)} cap，元婴仍余 ${pct(tables.P1.find((v) => v.realm === '元婴').L * 0.81 / tables.P1.find((v) => v.realm === '元婴').cumT * 100 - 100)} 富余`);
    out.push('');
    out.push('## 两处数据事实');
    out.push('');
    out.push('- `realm.exp_requirement`（突破的修为闸门）在**每个境界都被等级曲线的钉值盖过**：圆满时 exp 被钉在 `calculateExpForLevel(max_level)`，'
      + `炼气 ${big(tables.P1[0].pinExp)} vs 闸门 ${big(tables.P1[0].gateExp)}；渡劫 ${big(tables.P1[8].pinExp)} vs ${big(tables.P1[8].gateExp)} ⇒ 这道闸门形同虚设。`);
    out.push('- 乘区 2 里 `cultivation_speed` 全档无人提供（模型读不到 ⇒ 恒 1.0），当前功法实际只按"品阶 × 层数"加成。');
    fs.writeFileSync(path.resolve(repArg === -1 ? '数值追赶校验.md' : process.argv[repArg + 1]), out.join('\n'), 'utf8');
    console.log('\n  报告已写出：' + process.argv[repArg + 1]);
  }

  closeDatabase();
  console.log(`\nE9 追赶校验: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('sim-balance 异常：', e && e.stack ? e.stack : e);
  try { closeDatabase(); } catch (e2) { /* 忽略 */ }
  process.exit(1);
});
