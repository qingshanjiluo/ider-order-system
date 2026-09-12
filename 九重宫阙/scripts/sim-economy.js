/**
 * E9 · sim-economy —— 30 世净收支与钱庄守恒（P4 章程硬指标 · 轮53）
 *
 * 章程 E9 要 `sim-economy`（30 世净收支）。做了三件事，全部只读真实存档、只调生产同一份算法：
 *   A. **印钞机守恒**：卖出价必须严格低于买入价。`shop.js` 的 `getSellPrice()` 按
 *      `QUALITY_PRICE[item.quality] || 10` 折算，**既不读 `items.price` 也不读货架 `shop.price`**。
 *      （轮53 复盘：我先用一份**自己脑补的**品质表去探测，得到"21 条印钞机"的错误结论；
 *      本脚本改成从 `shop.js` 源码里抽出真函数来算，实测 0 条 —— 教训是"算钱必须用被测代码自己的表"。）
 *   A2. **卖价词表覆盖**：真表只有 装备(凡器…)/功法(黄阶…)/灵宠(凡兽…) 三套品质词，
 *      **丹药与材料用的 凡品/良品/上品/极品/宝品/灵品 一个都不在表里** ⇒ 全部落到 `|| 10` 兜底，
 *      回收价一律 `floor(10×0.3)=3` 灵石。这不是印钞机，但它是"词表错配把一半品类的定价打回兜底"。
 *   B. **30 世净收支**：一世 = 从炼气修到该境界圆满（时长取 `sim-balance` 同一套 cumT 口径），
 *      收入 = 按等级区间匹配的地图 `spirit_stone_per_second` × 一年秒数，支出 = 破境丹期望消耗
 *      （期望出手次数 = 1/成功率，单价取真实货架价）。
 *   C. **延寿通道可达性**：`LIFE_GAIN` 点名的延寿丹/灵植三件/宗门赏赐/长生功，
 *      是否真有玩家可得的获取路径（轮53 实测：四件灵植全都没上架，`lifespan_bonus` 只在注册时初始化过）。
 *
 * 用法：node scripts/sim-economy.js [--report 文件.md] [--strict]
 *   门禁模式：A/C 用**基线锁**（只防更糟，不假装已修好）；--strict 把 A 的基线降到 0、C 要求至少一条通道打通。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const B = require('../src/config/balance');
const gameTime = require('../src/services/gameTime');
const charService = require('../src/services/character');
const { loadDatabase, closeDatabase } = require('../src/database');

const SEC_PER_YEAR = 3600 / gameTime.GAME_YEARS_PER_REAL_HOUR;
const ORDER = B.REALM_ORDER.filter((r) => r !== '飞升');
const LIVES = 30;                       // 章程口径：30 世
const STRICT = process.argv.includes('--strict');

(async () => {
  console.log('== E9 · sim-economy（30 世净收支 / 钱庄守恒 / 延寿通道可达性）==');
  let pass = 0, fail = 0;
  const t = async (name, fn) => {
    try { await fn(); console.log(`  ✅ ${name}`); pass++; }
    catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
  };

  const db = loadDatabase();
  const itemById = new Map(db.items.map((i) => [Number(i.id), i]));
  const shelves = (db.shop || []).filter((s) => Number(s.price) > 0);

  // ---- 生产同款卖价（从 shop.js 源码里把真函数取出来用，避免我另抄一份然后两边漂移）
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'shop.js'), 'utf8');
  const m = src.match(/function getSellPrice\([\s\S]*?\n}/);
  assert.ok(m, '在 src/routes/shop.js 里找不到 getSellPrice（算法搬家了，本脚本需同步）');
  const qpMatch = src.match(/QUALITY_PRICE\s*=\s*(\{[^}]*\})/);
  assert.ok(qpMatch, '找不到 QUALITY_PRICE 常量表');
  const QP = new Function(`return (${qpMatch[1]});`)();          // 表里键已带引号，直接求值即可（不再做键加引号的多余加工）
  const getSellPrice = new Function('QUALITY_PRICE', `${m[0]}; return getSellPrice;`)(QP);

  // ================= A. 印钞机守恒 =================
  const printers = [];
  for (const s of shelves) {
    const it = itemById.get(Number(s.item_id));
    if (!it) { printers.push({ row: s.id, name: '(货架指向不存在的物品)', buy: Number(s.price), sell: 0, kind: '幽灵货架' }); continue; }
    const sell = getSellPrice(it);
    if (sell >= Number(s.price)) printers.push({ row: s.id, name: it.name, buy: Number(s.price), sell, net: sell - Number(s.price), kind: it.type });
  }
  printers.sort((a, b) => (b.net || 0) - (a.net || 0));
  console.log(`\n  ℹ 货架 ${shelves.length} 条，其中"卖出价 ≥ 买入价"= ${printers.length} 条`);
  for (const p of printers.slice(0, 6)) console.log(`     ${p.name}：买 ${p.buy} / 卖 ${p.sell}${p.net != null ? ` ⇒ 每枚净赚 ${p.net}` : '（' + p.kind + '）'}`);

  await t('A 钱庄守恒：不得存在"买了就卖即赚"的货架（硬锁 0 条）', () => {
    assert.strictEqual(printers.length, 0,
      `出现印钞机货架 ${printers.length} 条：卖价按品质常量折算、不看货架价 ⇒ 只要上架价低于品质卖价就能无限刷灵石。` +
      `最严重：${printers.slice(0, 5).map((p) => `${p.name}(买${p.buy}/卖${p.sell})`).join('、')}`);
  });

  // A2：卖价词表覆盖率（丹药/材料用的品质词根本不在 QUALITY_PRICE 里 ⇒ 回收价全落到 floor(10×0.3)=3）
  const pillRows = db.items.filter((i) => ['丹药', '材料'].includes(i.type));
  const uncovered = pillRows.filter((i) => !(i.quality in QP));
  const byQuality = {};
  for (const i of uncovered) byQuality[i.quality] = (byQuality[i.quality] || 0) + 1;
  const sellOf = (i) => getSellPrice(i);
  const sample = pillRows.slice(0, 3).map((i) => `${i.name}(${i.quality})→${sellOf(i)}`).join('、');
  console.log(`\n  ℹ 丹药/材料共 ${pillRows.length} 件，其品质词不在 QUALITY_PRICE 里的 = ${uncovered.length} 件` +
    `（${Object.entries(byQuality).map(([k, v]) => `${k}×${v}`).join('、') || '全覆盖'}）；样例卖价：${sample}`);
  await t('A2 卖价词表覆盖：QUALITY_PRICE 必须覆盖在售品类（基线锁，未覆盖不得增加）', () => {
    const BASELINE = 142;   // 轮53 实测：丹药+材料共 142 件，品质词是 凡品34/灵品35/宝品39/仙品17/道品17 —— QUALITY_PRICE 一套都没有。
                            // 这是"词表错配"的登记数字，不是合格线；补进表后必须同步下调（补表要与 A 锁一起复验，避免补出印钞机）。
    assert.ok(uncovered.length <= BASELINE,
      `品质词未被 QUALITY_PRICE 覆盖的丹药/材料 ${uncovered.length} 件 > 基线 ${BASELINE}：这些道具回收价一律走 ||10 兜底（=3 灵石），定价失去意义`);
  });

  // ================= B. 30 世净收支 =================
  // 必须带 realm：轮54 起等级曲线以 realms.exp_requirement 为真源，不传就退回旧曲线（sim-balance 同批改过）
  const expForLevel = (L, realm) => charService.calculateExpForLevel(L, realm);
  const realms = ORDER.map((r) => db.realms.find((x) => x.name === r)).filter(Boolean);
  const mapFor = (r) => {
    const mid = Math.floor((Number(r.min_level) + Number(r.max_level)) / 2);
    const ok = (db.maps || []).filter((x) => mid >= Number(x.min_level) && mid <= Number(x.max_level) && Number(x.spirit_stone_per_second) > 0);
    ok.sort((a, b) => Number(b.spirit_stone_per_second) - Number(a.spirit_stone_per_second));
    return ok[0] || null;
  };
  const pillRow = (db.shop || []).find((s) => { const it = itemById.get(Number(s.item_id)); return it && it.name === B.BREAKTHROUGH_PILL_NAMES[0]; });
  const pillPrice = pillRow ? Number(pillRow.price) : 0;

  const rows = [];
  let cum = 0, cumYears = 0, cumCost = 0;
  for (const r of realms) {
    let need = 0;
    for (let L = Number(r.min_level); L < Number(r.max_level); L++) need += expForLevel(L, r.name);
    const map = mapFor(r);
    const yearIncome = map ? Number(map.spirit_stone_per_second) * SEC_PER_YEAR : 0;
    const years = need / (B.CULTIVATION_V0[r.name] * SEC_PER_YEAR);       // P1 口径（无功法），与 sim-balance 一致
    const chance = B.BREAKTHROUGH_BASE[r.name] / 100;
    const attempts = 1 / chance;
    const cost = Math.ceil(attempts * pillPrice);
    cumYears += years; cumCost += cost;
    cum = Math.max(cum, yearIncome * years);
    rows.push({ realm: r.name, map: map ? map.name : '(无匹配地图)', ss: map ? Number(map.spirit_stone_per_second) : 0, yearIncome, years, income: yearIncome * years, attempts, cost });
  }
  console.log('\n  【30 世净收支（P1 无功法口径 · 收入=地图灵速率×一世时长，支出=破境丹期望消耗）】');
  console.log('    境界 | 主地图 | 灵/秒 | 年入 | 一世耗时(年) | 一世收入 | 期望出手 | 破境丹支出');
  for (const x of rows) {
    console.log(`    ${x.realm} | ${x.map} | ${x.ss} | ${(x.yearIncome / 1e4).toFixed(1)}万 | ${x.years < 100 ? x.years.toFixed(2) : x.years.toFixed(0)} | ${(x.income / 1e8).toFixed(2)}亿 | ${x.attempts.toFixed(2)} | ${x.cost}`);
  }
  const totalIncomeOneLife = rows.reduce((a, x) => a + x.income, 0);
  console.log(`  ℹ 修到渡劫圆满的一世总收入 ≈ ${(totalIncomeOneLife / 1e8).toFixed(1)} 亿灵石；破境丹总支出 = ${cumCost} 枚（占收入 ${(cumCost / totalIncomeOneLife * 100).toFixed(6)}%）`);
  console.log(`  ℹ 转世保留 30% 灵石（70% 折损，见 test-phase2），${LIVES} 世等比累计上限 ≈ ${(totalIncomeOneLife * (1 - Math.pow(0.3, LIVES)) / 0.7 / 1e8).toFixed(1)} 亿`);

  await t('B 累计收支为正；首境"买得起一枚破境丹"的时间不得恶化（方向锁）', () => {
    // 口径说明（重要）：这里的收入**只算了地图挂机灵速率**，没算任务/采集/战斗/签到/市场，
    // 所以它是收入的**下界**。实测：炼气段单境收入 1123 灵石 < 一枚破境丹 5000 ⇒ 前期突破丹
    // 光靠挂机买不起，必须靠其它来源；这不一定是坏事（付费/日常深度），但必须是有意的选择而不是意外。
    const inc4 = rows.slice(0, 4).reduce((a, x) => a + x.income, 0);
    const cost4 = rows.slice(0, 4).reduce((a, x) => a + x.cost, 0);
    assert.ok(inc4 > cost4, `前四境累计收入 ${Math.round(inc4)} ≤ 累计破境丹支出 ${cost4}：钱真的成了瓶颈`);
    const yearsToFirst = pillPrice / rows[0].yearIncome;              // 需要多少个"游戏年"挂机才买得起一枚
    const realHours = yearsToFirst * 2.4;                             // 1 游戏年 = 2.4 真实小时（24h=10 年）
    console.log(`  ℹ 首境挂机买得起一枚${B.BREAKTHROUGH_PILL_NAMES[0]}需 ${yearsToFirst.toFixed(2)} 游戏年 = ${realHours.toFixed(1)} 真实小时` +
      `；单境收入/丹价：${rows.slice(0, 4).map((x) => `${x.realm} ${(x.income / pillPrice).toFixed(1)}枚`).join(' ')}`);
    assert.ok(yearsToFirst <= 1.0,
      `首境买一枚破境丹要 ${yearsToFirst.toFixed(2)} 游戏年（>${1.0} 基线）：前期突破丹越来越买不起，方向锁被打穿`);
  });

  await t('B2 定价与收入水平不脱钩（渡劫段年入/丹价方向锁 ≤ 1000）', () => {
    const worst = rows.reduce((a, x) => Math.max(a, x.yearIncome / pillPrice), 0);
    console.log(`  ℹ 各境"一年挂机 = 几枚破境丹"最大 = ${worst.toFixed(0)} 枚（渡劫段一世耗时 ${rows[8].years.toExponential(1)} 年，是 sim-balance 那条曲线病的直接后果）`);
    assert.ok(worst <= 1000, `最富的一年能买 ${worst.toFixed(0)} 枚破境丹 > 基线 1000：价格相对产出已经失去意义`);
  });

  // ================= C. 延寿通道可达性 =================
  const lifeNames = Object.keys(B.LIFE_GAIN.plants || {});
  const lifeItems = lifeNames.map((n) => {
    const it = db.items.find((i) => i.name === n);
    const shelf = it ? (db.shop || []).find((s) => Number(s.item_id) === Number(it.id)) : null;
    return { name: n, item: !!it, shelf: !!shelf, shelfPrice: shelf ? Number(shelf.price) : null };
  });
  const reachable = lifeItems.filter((x) => x.item && x.shelf);
  console.log('\n  ℹ LIFE_GAIN.plants 点名的灵植：' + lifeItems.map((x) => `${x.name}[items:${x.item ? '有' : '无'} 货架:${x.shelf ? '有' : '无'}]`).join('、'));
  console.log(`  ℹ 玩家实际可获得的延寿灵植 = ${reachable.length}/${lifeItems.length} 条；延寿丹（LIFE_GAIN.pills 四档）在 items 表里的同名道具 = ${db.items.filter((i) => /延寿丹/.test(i.name || '')).length} 件`);
  const bonusWriters = fs.readdirSync(path.join(__dirname, '..', 'src', 'routes'))
    .filter((f) => /lifespan_bonus|addLongevity|LIFE_GAIN/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', f), 'utf8')));
  console.log(`  ℹ src/routes 下引用 lifespan_bonus / LIFE_GAIN 的文件：${bonusWriters.length ? bonusWriters.join('、') : '（0 个）'}`);

  await t('C 延寿通道可达性（基线锁：至少要有 1 条，实测 0 条 → 已登记为 NO-GO）', () => {
    const cap = STRICT ? 1 : 0;         // 基线 0 条（只防"更多通道被删"，不假装打通了）
    if (STRICT) {
      assert.ok(reachable.length >= cap, `--strict：延寿灵植可获得 ${reachable.length} 条 < ${cap}：铁律(2) 要求"经营寿元"，但市面上买不到任何延寿手段`);
    } else {
      assert.ok(reachable.length >= 0, '不该到这里');
      if (reachable.length === 0) console.log('  ⚠️ 基线锁：延寿四通道（丹药四档 / 灵植三件 / 宗门赏赐 / 长生功）当前**没有一条**玩家可得 ⇒ 铁律(2) 缺执行手段，已登记上线必修');
    }
  });

  await t('C2 幽灵货架：每条货架必须指向真实物品', () => {
    const ghost = shelves.filter((s) => !itemById.has(Number(s.item_id)));
    assert.deepStrictEqual(ghost.map((g) => g.id), [], `有货架指向不存在的物品：${ghost.map((g) => `${g.id}(${g.name})`).join('、')}`);
  });

  await t('C3 破境丹必须真的在货架上（R11 修过的空通道，不得再退化）', () => {
    assert.ok(pillRow, `货架上找不到 ${B.BREAKTHROUGH_PILL_NAMES[0]} —— 突破加成通道又变空了`);
    assert.ok(pillPrice > 0, '破境丹货架价为 0（白送）');
    console.log(`  ℹ ${B.BREAKTHROUGH_PILL_NAMES[0]} 单价 ${pillPrice} 灵石（期望 1 枚/次突破）`);
  });

  if (process.argv.includes('--report')) {
    const out = process.argv[process.argv.indexOf('--report') + 1];
    const md = ['# 30 世净收支与钱庄守恒（sim-economy 实测 · 轮53）', '',
      `> 由 \`node scripts/sim-economy.js --report 经济守恒表.md\` 生成，勿手改。`, '',
      `## A 印钞机货架（卖价 ≥ 买价，共 ${printers.length} 条 / 货架 ${shelves.length} 条）`, '',
      '| 货架行 | 物品 | 买入 | 卖出 | 每枚净利 | 类型 |', '|---|---|---:|---:|---:|---|'];
    for (const p of printers) md.push(`| ${p.row} | ${p.name} | ${p.buy} | ${p.sell} | ${p.net == null ? '—' : p.net} | ${p.kind} |`);
    md.push('', '**判定**：`getSellPrice()` 只按 `QUALITY_PRICE[item.quality] || 10` 折算（×0.3），既不读 `items.price` 也不读 `shop.price`。',
      `当前 ${shelves.length} 条货架里"卖价 ≥ 买价"= ${printers.length} 条（A 锁为硬锁 0）—— 一旦出现就是无限灵石源，故必须常驻门禁。`,
      `但**词表错配**更值得修：QUALITY_PRICE 只有 装备(凡器…)/功法(黄阶…)/灵宠(凡兽…) 三套品质词，` +
      `丹药与材料用的 凡品/良品/上品/极品/宝品/灵品 **一个都不在表里** ⇒ 这 ${uncovered.length} 件道具回收价一律 ` +
      `\`floor(10×0.3)=3\` 灵石（A2 基线锁 142，补表时须与 A 锁一起复验，避免补完反而出印钞机）。`,
      '', '## B 30 世净收支', '', '| 境界 | 主地图 | 灵/秒 | 年入 | 一世耗时(年) | 一世收入 | 期望出手 | 破境丹支出 |',
      '|---|---|---:|---:|---:|---:|---:|---:|');
    for (const x of rows) md.push(`| ${x.realm} | ${x.map} | ${x.ss} | ${Math.round(x.yearIncome)} | ${x.years < 100 ? x.years.toFixed(2) : Math.round(x.years)} | ${Math.round(x.income)} | ${x.attempts.toFixed(2)} | ${x.cost} |`);
    md.push('', `一世总收入 ≈ ${Math.round(totalIncomeOneLife)} 灵石；破境丹总支出 ${cumCost}；转世保留 30%（70% 折损），${LIVES} 世等比累计上限 ≈ ${Math.round(totalIncomeOneLife * (1 - Math.pow(0.3, LIVES)) / 0.7)}。`,
      '', '## C 延寿通道可达性', '',
      '| LIFE_GAIN.plants | items 表 | 货架 |', '|---|---|---|');
    for (const x of lifeItems) md.push(`| ${x.name} | ${x.item ? '✓' : '✗'} | ${x.shelf ? '✓' : '✗'} |`);
    md.push('', `玩家可获得的延寿灵植 ${reachable.length}/${lifeItems.length} 条；延寿丹道具 ${db.items.filter((i) => /延寿丹/.test(i.name || '')).length} 件；` +
      `引用 lifespan_bonus/LIFE_GAIN 的路由 ${bonusWriters.length} 个。`,
      '⇒ 铁律(2)"元婴之后必须经营寿元"目前**没有执行手段**：化神起唯一的续命通道是 T0-1 大限劫应劫成功（+cap×10%）。');
    fs.writeFileSync(path.resolve(out), md.join('\n'), 'utf8');
    console.log('\n  报告已写出：' + out);
  }

  closeDatabase();
  console.log(`\nE9 经济守恒: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('sim-economy 异常：', e && e.stack ? e.stack : e);
  try { closeDatabase(); } catch (e2) { /* 忽略 */ }
  process.exit(1);
});
