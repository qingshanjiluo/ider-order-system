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
const realmService = require('../src/services/realm');
const { loadDatabase, closeDatabase } = require('../src/database');

const SECONDS_PER_GAME_YEAR = 3600 / gameTime.GAME_YEARS_PER_REAL_HOUR;
const ORDER = B.REALM_ORDER.filter((r) => r !== '飞升');
const STRICT = process.argv.includes('--strict');
const ri = (r) => ORDER.indexOf(r);

// (3) 的目标带（原文照抄《修炼与寿元系统模型.md》§2.2）
/**
 * 铁律(3) 目标带。轮54 两处修订，理由都是实测出来的，不是审美：
 *  ① 炼气原来是 `(60, ∞]` —— 没有上限，正是它让"余量 100%（本境只用掉 0.03 年）"一路绿灯，
 *     前四境变成毫无追赶压力的走过场。故加上限 80%。
 *  ② 金丹 15~30 → 25~35、元婴 5~15 → 20~28：原文的元婴带与**铁律(4) 直接互斥** ——
 *     (4) 要求"连败 3 + 重伤 2"后 cap 仍够修完本境，而最坏折寿本身就是 19% cap
 *     （3×BREAKTHROUGH_LIFE_COST.max 5% + 2×INJURY_LIFE_COST.defeat 2%）⇒ 余量低于 19% 时
 *     (4) 必红。轮54 首轮实测（元婴 cumT 4471 > capAfter 4050）把这条矛盾钉住了，故把下限抬到 19% 之上。
 * 判定口径同时改为 **P1 裸修**（详见下面铁律(3) 的注释）。
 */
const TARGET_RATIO = { 炼气: [60, 80], 筑基: [40, 55], 金丹: [25, 35], 元婴: [20, 28] };

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
    ? (L, realm) => charService.calculateExpForLevel(L, realm)     // 必须带 realm：不带就退回旧曲线（轮54 首跑就被这个兼容分支骗过一次，于是加了下面的真源一致性锁）
    : (L) => Math.floor(100 * Math.pow(1.5, L - 1));

  // ---- 结构自检：等级区间必须连续覆盖 1..100，否则"填满本境界"的口径无从谈起
  const rows = ORDER.map((r) => realms.find((x) => x.name === r)).filter(Boolean);
  const struct = [];
  for (const r of rows) struct.push(`${r.name}:${r.min_level}-${r.max_level}`);
  assert.ok(rows.length === ORDER.length, `realms 表缺境界：只有 ${rows.length}/${ORDER.length}（${struct.join(' ')}）`);

  const fillExpOf = (r) => {
    let sum = 0;
    for (let L = Number(r.min_level); L < Number(r.max_level); L++) sum += expForLevel(L, r.name);
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
        gateExp: Number(r.exp_requirement) || 0, pinExp: expForLevel(Number(r.max_level), r.name)
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
  const maxDrift = Math.max(...tables.P1.map((x) => Math.abs(x.need - x.gateExp) / x.gateExp));
  console.log(`  ℹ 真源一致：境界内等级需求之和 vs realms.exp_requirement，十境最大偏差 ${(maxDrift * 100).toFixed(3)}%` +
    `（轮53 是两套数各说各话：曲线钉值恒盖过闸门 ⇒ 闸门形同虚设；轮54 起曲线由 exp_requirement 摊分而来）`);

  // ================= 轮54 前置锁：真源一致 + 突破行为探针 =================
  // 这两条是"曲线调平"的地基：如果等级曲线与 realms.exp_requirement 又各自说话，
  // 下面所有 cumT 表就都是假的（轮54 首跑就因未传 realm 而退回旧曲线、量出旧数字 ✗ 教训落成锁）。
  await t('真源一致：境界内等级需求之和 == realms.exp_requirement（±1%）', () => {
    for (const x of tables.P1) {
      const gate = Number(x.gateExp);
      assert.ok(gate > 0, `${x.realm} 的 exp_requirement 为 ${gate}：真源缺失，曲线无从校准`);
      const drift = Math.abs(x.need - gate) / gate;
      assert.ok(drift <= 0.01,
        `${x.realm}：曲线累计 ${big(x.need)} 与 exp_requirement ${big(gate)} 偏离 ${(drift * 100).toFixed(2)}% —— 两处又各说各话（形同虚设/重复计价的病会复发）`);
    }
  });

  await t('突破行为探针：满级即可冲、未满级不可冲、exp 不再被重复计价', () => {
    const lq = db.realms.find((r) => r.name === '炼气');
    const full = { realm: '炼气', realm_stage: 1, level: Number(lq.max_level), exp: 1 };
    assert.strictEqual(realmService.canBreakthrough(full), true,
      '炼气已圆满但 exp 远小于 exp_requirement 就不给突破 ⇒ 同一份修为被升级与闸门各收一次（重复计价回来了）');
    const notFull = { realm: '炼气', realm_stage: 1, level: Number(lq.max_level) - 1, exp: Number(lq.exp_requirement) * 10 };
    assert.strictEqual(realmService.canBreakthrough(notFull), false,
      '未达 max_level 却可突破，且给再多 exp 也算 ⇒ 铁律"速度只填满境界、不得绕过突破瓶颈"被打穿');
    const fs2 = db.realms.find((r) => r.name === '飞升');
    assert.strictEqual(realmService.canBreakthrough({ realm: '飞升', realm_stage: 4, level: Number(fs2.max_level), exp: 1e18 }), false,
      '飞升是终点境界，不该再给突破判定');
  });

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
    const x = tables.P1.find((v) => v.realm === realm);
    const [lo, hi] = TARGET_RATIO[realm];
    const ok = x.margin > lo && (hi === Infinity || x.margin <= hi);
    r3.push({ realm, actual: x.margin, lo, hi, ok });
    console.log(`  ${ok ? '✅' : '⚠️'} 铁律(3) ${realm}：实测余量比 ${pct(x.margin)}，目标 (${lo}%, ${hi === Infinity ? '∞' : hi}%]${ok ? '' : ' ← 偏离'}`);
  }
  const hua = tables.P1.find((v) => v.realm === '化神');
  console.log(`  ${hua.margin < 0 ? '✅' : '⚠️'} 铁律(3) 化神起应为负：实测 ${pct(hua.margin)}`);

  await t('铁律(3) 目标带锁（P1 裸修口径，四境必须落带内）', () => {
    // 轮53 的写法是"方向锁"（只准往目标带走），因为当时曲线整体偏松一个数量级。
    // 轮54 把 realms.exp_requirement 按 --solve 反解之后，带本身就是验收条件，于是升级为双边硬锁：
    // 上限防"走过场"（原来的 ∞ 就是这么把 100% 放过去的），下限防"把追赶压成不可能"（并受铁律(4) 的 19% 折寿底线约束）。
    const bad = r3.filter((v) => !v.ok);
    assert.deepStrictEqual(bad, [], `未落进目标带：${bad.map((v) => `${v.realm}=${pct(v.actual)}∉(${v.lo},${v.hi === Infinity ? '∞' : v.hi}]`).join(' ')}`);
    assert.ok(hua.margin < 0, `化神余量比 ${pct(hua.margin)} 不为负：化神仍可裸修自然达成，与准则(2) 矛盾（设计意图是这里必须有一道真墙）`);

    // 结构锁（取代轮53 的"最大跳变 ≤34.5"）：轮53 病根是**每一境都跳 ×33**（1.5^L 每境 ×57.7，V0 只 ×1.7、L 只 ×3.3），
    // 均匀陡峭 = 前段走过场 + 后段数学墙死。轮54 的设计意图换成"**前段平滑 + 元婴→化神一道真墙**"，
    // 所以这里锁的是形状而不是斜率：普通跨境不得超过 8×，唯独元婴→化神必须 ≥ 20×（墙必须存在且可感知）。
    const jumps = [];
    for (let i = 0; i + 1 < tables.P1.length; i++) {
      jumps.push({ from: tables.P1[i].realm, to: tables.P1[i + 1].realm, k: tables.P1[i + 1].years / tables.P1[i].years });
    }
    const by = (name) => jumps.find((j) => `${j.from}→${j.to}` === name);
    const cliff = by('元婴→化神');
    const smooth = jumps.filter((j) => j !== cliff);
    const worst = smooth.reduce((a, b) => (b.k > a.k ? b : a), smooth[0]);
    console.log(`  ℹ 跨境耗时跳变（P1）：${jumps.map((j) => `${j.from}→${j.to} ×${j.k.toFixed(1)}${j === cliff ? '【设计墙】' : ''}`).join('  ')}`);
    assert.ok(worst.k <= 8,
      `普通跨境最大跳变 ${worst.from}→${worst.to} ×${worst.k.toFixed(1)} 超过 8×：境界之间又变成"每境指数墙"，前段会退回走过场（轮53 病根复发）`);
    assert.ok(cliff && cliff.k >= 20,
      `元婴→化神跳变 ${cliff ? `×${cliff.k.toFixed(1)}` : '(未找到)'} < 20：那道"必须经营寿元"的墙被抹平了，化神起裸修就能自然达成`);
    // --strict 自轮54 起与默认口径等价（目标带已经从"方向锁"升级为双边硬锁），保留只为兼容既有命令。
    if (STRICT) console.log('  ℹ --strict：目标带锁已常驻，本开关不再改变判定强度');
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

  // ================= 反解：满足铁律(3) 目标带所需的每境需求 =================
  if (process.argv.includes('--solve')) {
    // 目标取《修炼与寿元系统模型.md》§2.2 各带的**中值**（炼气只有下限，取 70% 余量 = cumT 60 年，留追赶感）。
    // cumT 目标 = L(r) × (1 − 余量目标/100)，本境耗时 = cumT(r) − cumT(r−1)，
    // 每境需求 = 本境耗时 × V0(r) × 每年秒数（P1 口径：总乘区 1.0，即"新手裸修"也要落进带里）。
    // 目标带取 TARGET_RATIO 各带的**中值**（金丹/元婴的下限已被铁律(4) 的 19% 折寿底线抬高，见上面注释）。
    const TARGET_MARGIN = { 炼气: 70, 筑基: 47.5, 金丹: 30, 元婴: 22 };
    // 化神起余量必须为负（铁律 2/3），且元婴→化神必须有一道**可感知的真墙**（结构锁要求跳变 ≥20×）。
    // 这个数是按最严的那条反推的：铁律(2) 要 12 倍极限画像也修不满 ⇒
    //   need(化神) > L(元婴) × V0(化神) × 每年秒数 × SPEED_CAP_TOTAL = 5000 × 96 × 8640 × 12 ≈ 4.98e10 → 取 6.0e10（含 ~20% 余量）
    const CLIFF_NEED = 6.0e10;
    // 化神之后按"需求 ×6.5"递推（V0 每境 ×~1.72 ⇒ 净耗时每境 ×~3.8），刚好贴着 L 的阶梯（×2~3.4）略快于寿元增长，
    // 使铁律(2) 在每一对相邻境界上都成立而又不必再造第二套曲线。
    const TAIL = 6.5;
    console.log('\n  【反解：铁律(3) 目标带 ⇒ 每境所需 exp】（P1 裸修口径）');
    console.log('    境界 | 目标余量 | cumT 目标(年) | 本境耗时(年) | V0 | 需求 exp | 现状需求 | 倍差');
    let prevCum = 0, prevNeed = 0;
    const solve = [];
    for (const r of rows) {
      const L = B.lifespanOf(r.name);
      const v0 = B.CULTIVATION_V0[r.name];
      const cur = tables.P1.find((x) => x.realm === r.name);
      let need;
      if (TARGET_MARGIN[r.name] != null) {
        need = Math.max(0.01, L * (1 - TARGET_MARGIN[r.name] / 100) - prevCum) * v0 * SECONDS_PER_GAME_YEAR;
      } else if (r.name === '化神') {
        need = CLIFF_NEED;                               // 唯一的人为锚点：元婴→化神那道墙
      } else {
        need = prevNeed * TAIL;                          // 化神之后按固定倍率递推，不再另造曲线
      }
      const years = need / (v0 * SECONDS_PER_GAME_YEAR);
      const targetCum = prevCum + years;                 // 三个分支都必须落到这两个量上（漏一个就打印出 undefined/NaN）
      const round = Number(need.toPrecision(2));          // 2 位有效数字，便于当作人工设定的常数
      solve.push({ realm: r.name, need: round, years, targetCum });
      console.log(`    ${r.name} | ${TARGET_MARGIN[r.name] != null ? TARGET_MARGIN[r.name] + '%' : '负（墙）'}` +
        ` | ${big(targetCum)} | ${big(years)} | ${v0} | ${round.toExponential(1)} | ${big(cur.need)} | ×${(round / cur.need).toExponential(1)}`);
      prevCum = targetCum; prevNeed = round;
    }
    // 飞升是终点境界（无 cumT 判据），按同一尾率给出，只为让 realms 表自洽、不留旧数量级的孤儿值。
    const asc = Number((prevNeed * TAIL).toPrecision(2));
    const obj = {};
    for (const x of solve) obj[x.realm] = Math.round(x.need);
    obj['飞升'] = Math.round(asc);
    console.log('\n  建议 realms.exp_requirement（可直接喂给 apply-realm-need.js）：');
    console.log('    ' + Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', '));
    // 落成工件而不是打印一行"你自己复制过去"：数字进 git 才可评审，也不再靠 shell 传参（轮54 一次
    // Invoke-Expression 把中文标题行当命令执行的教训）。
    const artifact = path.join(__dirname, '..', 'src', 'data', 'realm-need.json');
    fs.writeFileSync(artifact, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    console.log('  已写出工件：src/data/realm-need.json  ⇒ node scripts/apply-realm-need.js src/data/realm-need.json');
    console.log('  （把上表写进 realms 定义并重跑本脚本：`--strict` 应当转绿）');
  }


  // ---- 报告
  const repArg = process.argv.indexOf('--report');
  if (repArg !== -1 && process.argv[repArg + 1]) {
    const out = [];
    out.push('# 数值追赶校验表（sim-balance 实测 · 轮53 建表 / 轮54 调平后重出）');
    out.push('');
    out.push(`> 由 \`node scripts/sim-balance.js --report 数值追赶校验.md\` 生成，勿手改。`);
    out.push(`> 口径：需求 = Σ \`characterService.calculateExpForLevel(L, realm)\`（**必须带 realm**，真源是存档 \`realms.exp_requirement\`；不传就退回旧曲线，轮54 踩过）；`);
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
    const e1ok = tables.P1.filter((v) => ri(v.realm) <= ri('元婴')).every((x) => x.cumT < x.L);
    const e2ok = (() => { const p3 = tables.P3; for (let i = ri('元婴'); i < p3.length - 1; i++) if (!(p3[i].L - p3[i + 1].cumT < 0)) return false; return true; })();
    out.push(`- (1) 前四境自然可达（P1）：**${e1ok ? '成立' : '不成立'}** — 元婴 cumT ${big(tables.P1.find((v) => v.realm === '元婴').cumT)} 年 vs L 5000 年`);
    out.push(`- (2) 元婴后必须经营寿元（P3）：**${e2ok ? '成立' : '不成立'}** — 极限 build 下 cumT(化神) ${big(tables.P3.find((v) => v.realm === '化神').cumT)} 年 vs L(元婴) 5000 年`);
    const ok3 = r3.every((v) => v.ok) && hua.margin < 0;
    out.push(`- (3) 目标余量带：**${ok3 ? '成立' : '未成立'}**（判定口径 = P1 裸修）— ` +
      r3.map((v) => `${v.realm} 实测 ${pct(v.actual)}（目标 ${v.lo}~${v.hi === Infinity ? '∞' : v.hi}%）`).join('，') +
      `；化神 ${pct(hua.margin)}`);
    out.push(ok3
      ? '  ⇒ 轮54 用 `--solve` 反解并重排 `realms.exp_requirement` 后，裸修节奏变成"追赶快到手时还剩一档余量"，化神起才是负值（必须经营寿元）。'
      : '  ⇒ 若普遍偏高＝前段走过场、偏低＝把追赶压成不可能；重排命令：`npm run realm:solve && npm run realm:apply`。');
    const jr = [];
    for (let i = 0; i + 1 < tables.P1.length; i++) jr.push(`${tables.P1[i].realm}→${tables.P1[i + 1].realm} ×${(tables.P1[i + 1].years / tables.P1[i].years).toFixed(1)}`);
    out.push(`- 跨境耗时跳变（P1，轮54 调平后）：${jr.join('　')}。` +
      `对照轮53 旧曲线的实测：每一境净跳 ×31.4~33.6，而 L 每境只 ×3.3 —— **均匀陡峭**＝前段走过场、化神起变数学墙。` +
      `现在"填满本境界"由 exp_requirement 单点决定，普通跨境收在 ×3~4（贴着 V0 每境 ×1.72 与净耗时 ×3.5 的自然比例），` +
      `只在元婴→化神保留一道约 ×25 的**设计墙**：铁律(2) 要求连 12 倍极限 build 也修不满化神，这条墙必须存在且可感知（结构锁：普通跨境 ≤8×、此境 ≥20×）。`);
    const worst4 = Math.min(...tables.P1.filter((v) => ri(v.realm) <= ri('元婴')).map(
      (x) => x.L * (1 - (3 * B.BREAKTHROUGH_LIFE_COST.max + 2 * B.INJURY_LIFE_COST.defeat)) - x.cumT));
    out.push(`- (4) 连败3+重伤2 不致死：**${worst4 >= 0 ? '成立' : '不成立'}** — 最坏 ${pc1(3 * B.BREAKTHROUGH_LIFE_COST.max + 2 * B.INJURY_LIFE_COST.defeat)} cap，` +
      `前四境最紧的一处还剩 ${big(Math.round(worst4))} 年富余`);
    out.push('');
    out.push('## 通道状态（轮54 更新）');
    out.push('');
    out.push(`- **\`realms.exp_requirement\` 已成为唯一真源**：境界内每次升级的需求由它按 \`EXP_SHAPE_RATIO=${require('../src/config/balance').EXP_SHAPE_RATIO}\` 摊分，`
      + `十境最大偏差 ${(maxDrift * 100).toFixed(3)}%（\`G3 经验真源\` 套有 ±1% 锁）。`);
    out.push('  轮53 记录的"圆满钉值恒盖过闸门 ⇒ 闸门形同虚设"与轮54 中途发现的"只改语义会让同一份 exp 被升级与闸门各收一次'
      + '（⇒ 永远冲不了突破）"是同一个数被两处消费的两面；现在两处消费同一个数、突破不再重复索要，病根消除。');
    out.push('- 突破的真实瓶颈 = **等级封顶 + 突破概率 + 寿元 + 契机**（`realm.js` 的 `canBreakthrough` 不再额外索要整境 exp，`quests.js` 的私有升级循环已删）。');
    out.push('- 仍未修（已登记上线必修）：乘区 2 的 `cultivation_speed` 全档无人提供（模型读不到 ⇒ 恒 1.0，功法实际只按"品阶 × 层数"加成）；'
      + '任务/副本/签到/采集的 exp 奖励量级仍按旧曲线写（50~1000），相对新需求 5.2e6 已近乎零头，需重标或明确其为零头。');
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
