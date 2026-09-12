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
 *   C. **延寿通道三段可达性**：`LIFE_GAIN` 点名的灵植必须 买得到（items+货架+价>0）/ 用得动（use-item 与 inventory 都引用
 *      lifespan-goods）/ 看得见（背包面板有按钮）。轮53 实测 0/3 ⇒ 登记为上线必修；轮55 打通并**转为硬锁**。
 *   C4. 其余未接线通道（延寿丹四档、宗门赏赐、长生功）必须**显式挂账**，棘轮基线 3 条，只减不增。
 *
 * 用法：node scripts/sim-economy.js [--report 文件.md] [--strict]
 *   门禁模式：A（印钞机）与 C（延寿通道三段）都是**硬锁**；A2/C4 是**棘轮基线**（只防更糟，不假装已修好）。
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
  // 轮56：系数被抽成独立常量（为了让锁能复用），"从源码抠函数"这种用法必须把**新的依赖一起注入**，
  // 否则这里会以 ReferenceError 崩掉；再加一发冒烟调用，确保抠出来的函数真能跑出数而不是 NaN。
  const tmMatch = src.match(/TYPE_SELL_MULTIPLIER\s*=\s*(\{[^}]*\})/);
  assert.ok(tmMatch, '找不到 TYPE_SELL_MULTIPLIER（类型系数搬家了，本脚本需同步）');
  const TM = new Function(`return (${tmMatch[1]});`)();
  const getSellPrice = new Function('QUALITY_PRICE', 'TYPE_SELL_MULTIPLIER', `${m[0]}; return getSellPrice;`)(QP, TM);
  assert.ok(Number.isFinite(getSellPrice({ quality: '凡品', type: '材料' })) && getSellPrice({ quality: '凡品', type: '材料' }) >= 1,
    '从 shop.js 抽出来的 getSellPrice 跑不出合法数 ⇒ 它依赖了没注入的东西（这条断言专防"抽函数"漂移）');

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

  // A2（轮56 由"基线锁 142"升级为**全量硬锁**）：只要一件道具在货架上卖，它的品质词就必须在表里，
  // 否则回收价落到 `||10` 兜底 —— 凡品杂草与道品仙草同价，等于这一整档道具没有定价。
  const onShelfItems = [...new Set(shelves.map((s) => Number(s.item_id)).map((id) => itemById.get(id)).filter(Boolean))];
  const allUncovered = db.items.filter((i) => !(i.quality in QP));
  const shelfUncovered = onShelfItems.filter((i) => !(i.quality in QP));
  const byQuality = {};
  for (const i of allUncovered) byQuality[i.quality] = (byQuality[i.quality] || 0) + 1;
  const sample = ['凡品', '灵品', '宝品', '仙品', '道品'].map((q) => `${q}→${getSellPrice({ quality: q, type: '材料' })}`).join('、');
  console.log(`\n  ℹ 品质词覆盖：全部 ${db.items.length} 件里未覆盖 ${allUncovered.length} 件（${Object.entries(byQuality).map(([k, v]) => `${k}×${v}`).join('、') || '全覆盖'}）；在售且未覆盖 ${shelfUncovered.length} 件`);
  console.log(`  ℹ 新阶梯回收价（材料，无类型系数）：${sample}`);
  await t('A2 品质词全覆盖（硬锁）：在售道具的品质词必须在 QUALITY_PRICE 里，且未覆盖件数不得回升', () => {
    assert.deepStrictEqual(shelfUncovered.map((i) => `${i.name}(${i.quality})`), [],
      `有 ${shelfUncovered.length} 件**在售**道具的品质词不在词表里，回收价走兜底 3 灵石：${shelfUncovered.slice(0, 6).map((i) => `${i.name}(${i.quality})`).join('、')}`);
    const BASELINE = 0;      // 轮56 补表后实测 0（此前 238 件 / 占 38%）；任何回升都说明又加了没定价的品质词
    assert.ok(allUncovered.length <= BASELINE,
      `未覆盖品质词的道具涨到 ${allUncovered.length} 件（基线 ${BASELINE}）：${Object.entries(byQuality).map(([k, v]) => `${k}×${v}`).join('、')}`);
  });

  // A3：词表里不许有"死键"——实测 0 件道具用这个品质（此前的 消耗品/材料/道具 是把品类当品质的分类错误）
  const PLACEHOLDER_TIERS = { '混沌至宝': '器级阶梯顶档，等 P1 后续补到该档装备再启用（与 圣阶/仙阶 对称保留）' };
  const qualityCount = db.items.reduce((a, i) => (a[i.quality] = (a[i.quality] || 0) + 1, a), {});
  const deadKeys = Object.keys(QP).filter((k) => !qualityCount[k] && !PLACEHOLDER_TIERS[k]);
  const orphanQualities = Object.keys(qualityCount).filter((q) => !(q in QP));
  console.log(`  ℹ 词表 ${Object.keys(QP).length} 键：死键 ${deadKeys.length} 个${deadKeys.length ? '（' + deadKeys.join('、') + '）' : ''}；占位档 ${Object.keys(PLACEHOLDER_TIERS).length} 个；未定罪的品质词 ${orphanQualities.length} 个${orphanQualities.length ? '（' + orphanQualities.join('、') + '）' : ''}`);
  await t('A3 词表不得有死键，也不得漏掉已在用的品质词', () => {
    assert.deepStrictEqual(deadKeys, [], `QUALITY_PRICE 里有 ${deadKeys.length} 个键没有任何道具使用（${deadKeys.join('、')}）：要么删掉，要么写进 PLACEHOLDER_TIERS 并说明为什么还没有道具`);
    assert.deepStrictEqual(orphanQualities, [], `这些品质词在道具里在用却不在词表：${orphanQualities.join('、')}`);
  });

  // A4：`price<=0` 的货架行被 A 锁有意排除（白送的东西无所谓"买了就卖"），
  //     但**白送 + 可回收**同样是铸币：0 价、库存 999、回收 3 ⇒ 点 999 次白赚。这条把排除项变成显式不变量。
  const freeRows = (db.shop || []).filter((s) => Number(s.price) <= 0);
  const freeUnbounded = freeRows.filter((s) => {
    const it = itemById.get(Number(s.item_id));
    return !it || Number(s.stock) > 5 || getSellPrice(it) > 5;
  });
  console.log(`  ℹ 0 价货架 ${freeRows.length} 条（A 锁不计入），其中库存无界或回收价偏高的 ${freeUnbounded.length} 条`);
  await t('A4 白送行必须"有界"：0 价货架的库存 ≤5 且回收价 ≤5（否则白拿+回收＝铸币）', () => {
    assert.deepStrictEqual(freeUnbounded.map((s) => `货架${s.id}/库存${s.stock}`), [],
      `0 价货架可以无限领或回收价过高：${freeUnbounded.map((s) => `货架${s.id}(库存${s.stock})`).join('、')} —— A 锁按 price>0 排除了这些行，必须在这里补上界`);
  });

  // A5（轮56 新增，本轮真正的风险）：采集节点能白拿**仙品/道品**材料（实测 30/28 个节点），
  // 对这类无取得成本的道具，回收价就是纯铸币，而 A 锁只看货架、抓不到"采集→卖出"。
  // 于是给一条速率锁：**单张地图一次采集的最高回收价 ≤ 该图一年挂机收入的 5%**；
  // 想抬高高品质材料的回收价，必须先给采集加冷却/日限（已登记 P5 前的结构性缺口）。
  const YEAR_SECONDS = 8640;                     // 与 sim-balance 同口径：1 游戏年 = 8640 真实秒
  const faucet = [];
  for (const mp of db.maps || []) {
    const nodes = mp.gather_nodes || [];
    if (!nodes.length) continue;
    const income = Number(mp.spirit_stone_per_second || 0) * YEAR_SECONDS;
    if (!(income > 0)) continue;                  // 没有挂机收入锚点的地图另计（下面单独打印）
    const best = nodes.map((n) => db.items.find((i) => i.name === n)).filter(Boolean)
      .reduce((mx, i) => Math.max(mx, getSellPrice(i)), 0);
    if (best / income > 0.05) faucet.push({ map: mp.name, best, income: Math.round(income), pct: (best / income * 100).toFixed(2) });
  }
  const noAnchorMaps = (db.maps || []).filter((m) => (m.gather_nodes || []).length && !(Number(m.spirit_stone_per_second || 0) > 0));
  console.log(`  ℹ 采集水龙头：${(db.maps || []).filter((m) => (m.gather_nodes || []).length).length} 张图有采集点，` +
    `超 5% 锚点的 ${faucet.length} 张${faucet.length ? '（' + faucet.slice(0, 4).map((f) => `${f.map}: 回收${f.best}/年入${f.income}=${f.pct}%`).join('、') + '）' : ''}；无收入锚点的 ${noAnchorMaps.length} 张${noAnchorMaps.length ? '（' + noAnchorMaps.map((m) => m.name).join('、') + '）' : ''}`);
  await t('A5 采集回收速率锁：一次采集最高回收价 ≤ 该图一年挂机收入的 5%', () => {
    assert.deepStrictEqual(faucet, [], `采集→卖出可成水龙头：${faucet.map((f) => `${f.map}(${f.pct}%)`).join('、')} ⇒ 先降品质表或先给采集加冷却/日限`);
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
  const reachable = lifeItems.filter((x) => x.item && x.shelf && Number(x.shelfPrice) > 0);
  const readSrc = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  // 三段缺一不可：**买得到**（items+货架+价>0）· **用得动**（use-item 与 inventory 都引用 lifespan-goods）·
  // **看得见**（背包面板渲染出按钮）—— 只补前两段就会造出"服务端可达、玩家无入口"的幽灵通道（轮52 起反复踩）。
  const usePathOk = /lifespan-goods/.test(readSrc('src/routes/shop.js')) && /lifespan-goods/.test(readSrc('src/routes/character.js'));
  const feEntry = /data-use-item/.test(readSrc('public/js/ui.js'));
  const cfgOk = lifeNames.length >= 3 && lifeNames.every((n) => {
    const p = B.LIFE_GAIN.plants[n];
    return p && Number(p.ratio) > 0 && Number(p.perLife) >= 1;
  });
  console.log('\n  ℹ LIFE_GAIN.plants 点名的灵植：' + lifeItems.map((x) => `${x.name}[items:${x.item ? '有' : '无'} 货架:${x.shelf ? '有' : '无'} 价:${x.shelfPrice == null ? '—' : x.shelfPrice}]`).join('、'));
  console.log(`  ℹ 延寿通道三段：买得到 ${reachable.length}/${lifeItems.length}　用得动 ${usePathOk ? '✓' : '✗'}　看得见 ${feEntry ? '✓' : '✗'}　配置自洽 ${cfgOk ? '✓' : '✗'}`);

  // LIFE_GAIN 里点名的其余通道：接不上就要**显式挂账**（只减不增，防止悄悄烂成无名配置）
  const allRoutes = ['src/routes/shop.js', 'src/routes/character.js', 'src/routes/sect.js', 'src/services/gameTime.js', 'src/services/lifespan-goods.js'].map(readSrc).join('\n');
  const pillGoods = db.items.filter((i) => { try { return Number((JSON.parse(i.stats || '{}') || {}).longevity_ratio) > 0; } catch (_) { return false; } });
  const unwired = [];
  if (!pillGoods.length) unwired.push(`延寿丹（LIFE_GAIN.pills 是 ${(B.LIFE_GAIN.pills || []).length} 个无名比例，items 里 0 件带 longevity_ratio）`);
  if (!/sectBoon/.test(allRoutes)) unwired.push('宗门赏赐 sectBoon（无兑换口）');
  if (!/longLifeArtPerYear/.test(allRoutes)) unwired.push('长生功 longLifeArtPerYear（无年度结算消费）');
  console.log(`  ℹ 仍未接线的延寿通道 ${unwired.length} 条${unwired.length ? '：' + unwired.join('；') : ''}`);

  await t('C 延寿通道已打通（硬锁：三件灵植 买得到 + 用得动 + 看得见）', () => {
    assert.ok(cfgOk, `LIFE_GAIN.plants 配置自洽性不通过（需 ≥3 件且 ratio>0、perLife≥1）：${JSON.stringify(B.LIFE_GAIN.plants)}`);
    const miss = lifeItems.filter((x) => !(x.item && x.shelf && Number(x.shelfPrice) > 0));
    assert.ok(miss.length === 0, `延寿灵植买不到：${miss.map((m) => `${m.name}(items:${m.item ? '有' : '无'}/货架:${m.shelf ? '有' : '无'}/价:${m.shelfPrice})`).join('、')} ⇒ 铁律(2) 又缺执行手段`);
    assert.ok(usePathOk, 'src/routes/shop.js 或 src/routes/character.js 不再引用 lifespan-goods ⇒ 延寿使用通道断了');
    assert.ok(feEntry, 'public/js/ui.js 背包面板没有「服用」入口 ⇒ 通道退化成只有服务端能碰的幽灵入口');
  });

  await t('C4 未接线的延寿通道必须显式挂账（棘轮基线 3 条；--strict 要求归零＝上线前目标态）', () => {
    const cap = STRICT ? 0 : 3;
    assert.ok(unwired.length <= cap,
      `未接线延寿通道 ${unwired.length} 条 > 基线 ${cap}${STRICT ? '（--strict 要求 LIFE_GAIN 点名的通道全部接线）' : ''}：${unwired.join('；')}`);
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
      `**词表错配已修（轮56）**：此前 238 件（占 38%）道具的品质词不在表里 ⇒ 回收价一律 floor(10×0.3)=3，凡品杂草与道品仙草同价。现在丹药/材料这一套"品"字辈按**温和阶梯**入表：凡品3 / 灵品12 / 宝品48 / 仙品192 / 道品750。`,
      `为什么不按 器/阶 那套量级给（道品=道器 100000 ⇒ 卖 3 万）：实测 32 张地图的采集节点里有 **28 个道品、30 个仙品**，采集是"点一下白拿"、无取得成本 ⇒ 对这类道具回收价就是纯铸币，而 A 锁只看货架、抓不到"采集→卖出"这条路；旧表把它们错打成 3 灵石，**实际是靠这个 bug 侥幸堵住了水龙头**。`,
      `⇒ 本轮改为"低档阶梯 + A5 速率锁"：单张地图一次采集的最高回收价必须 ≤ 该图一年挂机收入的 5%。` + ((() => { const Y = 8640; let mx = 0, name = "—"; for (const mp of db.maps || []) { const nd = mp.gather_nodes || []; const inc = Number(mp.spirit_stone_per_second || 0) * Y; if (!nd.length || !(inc > 0)) continue; const best = nd.map((n) => db.items.find((i) => i.name === n)).filter((Boolean)).reduce((m, i) => Math.max(m, getSellPrice(i)), 0); if (best / inc > mx) { mx = best / inc; name = mp.name; } } return `（当前最紧的一张图：${name} ${(mx * 100).toFixed(2)}%，上限 5%）`; })()),
      '', '## B 30 世净收支', '', '| 境界 | 主地图 | 灵/秒 | 年入 | 一世耗时(年) | 一世收入 | 期望出手 | 破境丹支出 |',
      '|---|---|---:|---:|---:|---:|---:|---:|');
    for (const x of rows) md.push(`| ${x.realm} | ${x.map} | ${x.ss} | ${Math.round(x.yearIncome)} | ${x.years < 100 ? x.years.toFixed(2) : Math.round(x.years)} | ${Math.round(x.income)} | ${x.attempts.toFixed(2)} | ${x.cost} |`);
    md.push('', `一世总收入 ≈ ${Math.round(totalIncomeOneLife)} 灵石；破境丹总支出 ${cumCost}；转世保留 30%（70% 折损），${LIVES} 世等比累计上限 ≈ ${Math.round(totalIncomeOneLife * (1 - Math.pow(0.3, LIVES)) / 0.7)}。`,
      '', '## C 延寿通道可达性（轮55 打通，三段硬锁）', '',
      '| LIFE_GAIN.plants | items 表 | 货架 | 货架价 | 比例 | 本世限用 |', '|---|---|---|---:|---:|---:|');
    for (const x of lifeItems) {
      const p = (B.LIFE_GAIN.plants || {})[x.name] || {};
      md.push(`| ${x.name} | ${x.item ? '✓' : '✗'} | ${x.shelf ? '✓' : '✗'} | ${x.shelfPrice == null ? '—' : x.shelfPrice} | ${p.ratio} | ${p.perLife} |`);
    }
    md.push('', `三段状态：**买得到 ${reachable.length}/${lifeItems.length}**　**用得动 ${usePathOk ? '✓（/shop/use-item 与 /character/inventory 都走 lifespan-goods）' : '✗'}` +
      `**　**看得见 ${feEntry ? '✓（背包面板「延寿」按钮）' : '✗'}** —— 三段都由 C 锁常驻门禁（不再是基线锁）。`,
      `延寿年数一律经 \`gameTime.addLifespanBonus()\` 计入 \`longevity_years\` 桶并受 ${(B.LONGEVITY_BONUS_CAP_RATIO * 100).toFixed(0)}% 硬闸；` +
      `本模块不重算任何寿元算术（\`G4 延寿通道\` ⑥ 有源码锁）。端到端行为（423 拒绝、不白扣道具、perLife、转世清零）在第 20 套。`,
      '', `### 仍未接线的延寿通道（棘轮基线 3 条，接一条删一条）`, '');
    for (const w of unwired) md.push(`- ${w}`);
    if (!unwired.length) md.push('- （无）—— LIFE_GAIN 点名的通道已全部接线，可把 C4 基线降到 0');
        md.push(`\n\n## DSH-HEADLINE（机器读，勿手改）\n\n\`\`\`json\n` + JSON.stringify({ kind:'economy', passed: pass, failed: fail, shelves: shelves.length, printers: printers.length, uncoveredAll: allUncovered.length, uncoveredOnShelf: shelfUncovered.length, deadKeys: deadKeys.length, freeRows: freeRows.length, freeUnbounded: freeUnbounded.length, faucetOverCap: faucet.length }, null, 1) + `\n\`\`\`\n`);
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
