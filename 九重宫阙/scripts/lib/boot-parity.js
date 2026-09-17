/**
 * 临时档 boot 平价（轮108 立）。
 *
 * ## 为什么需要这个模块
 *
 * 大量套件用 `mkdtempSync` + `DSH_DATA_DIR` 起隔离档，然后只跑 `materials.ensureAll`。
 * 但 `ensureAll` 的定位是**兜底回填**（补材料 grade、补货架、补地图采集点），它
 * **假设 db.items 已有基础数据** —— 空档里跑完只有 **327 件物品**，而正式档有 **634 件**。
 *
 * 后果不是理论风险，轮108 实测踩到两次：
 *   · 写仙玉商城 e2e 时，商城要卖的「回城符」在临时档里根本不存在 → 报 500
 *   · 更早写剧情钩子 e2e 时，`db.monsters` 只有 36 只（临时档兜底）而正式档 134 只，
 *     战斗直接回"战斗单位不存在"
 *
 * 危险的方向是**假绿**：断言一条在临时档里偶然成立、在正式档不成立的性质，门禁会放它过去。
 *
 * ## 用法
 *
 *   const { bootParity } = require('./lib/boot-parity');
 *   process.env.DSH_DATA_DIR = TMP;          // 先设数据目录
 *   const parity = bootParity();             // 播种 + ensureAll + 自检
 *
 * `bootParity()` 会跑 `content-sync import`（= npm run seed:content）把
 * `src/data/content-export.json` 按 id 覆盖式灌进空档，再跑 `materials.ensureAll`
 * （真服务器起动时的同一 boot 钩子），最后**自检规模**：低于基线就抛错，
 * 让套件立刻失败而不是带着一个"瘦档"继续跑出不可信的结论。
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

/** 正式档的规模基线（取自 content-export.json 台账，不是硬编码想象值） */
function baselineFromLedger() {
  const p = path.join(ROOT, 'src', 'data', 'content-export.json');
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j._counts || null;
  } catch (e) { return null; }
}

/**
 * 播种临时档并自检内容等价。
 *
 * ## 只能读一次 DATA_DIR（重要）
 *
 * `src/db/store.js` 里 `const DATA_DIR = process.env.DSH_DATA_DIR || …` 是**模块加载时**
 * 固化的。所以本函数**必须在任何 `require('../src/database')` 之前调用** ——
 * 否则本进程指向的还是旧目录（或已缓存的库），子进程把 634 件灌进了新库文件，
 * 本进程手里却还是那份 327 件的瘦档，测试照样假绿。轮108 实测踩过这个坑。
 *
 * `selfCheck()` 会显式核对"本进程实际用的数据目录"与 `DSH_DATA_DIR` 是否一致，不一致直接报错。
 *
 * @param {{strict?:boolean, quiet?:boolean}} opts
 *   strict=true（默认）时规模不达标抛错；false 时只打印警告
 * @returns {{items:number, monsters:number, maps:number, dungeons:number}}
 */
function bootParity(opts) {
  const o = opts || {};
  const strict = o.strict !== false;
  const dataDir = process.env.DSH_DATA_DIR;
  if (!dataDir) throw new Error('bootParity：请先设 process.env.DSH_DATA_DIR 指向临时目录');
  if (path.resolve(dataDir) === path.resolve(ROOT, 'data')) {
    throw new Error('bootParity：DSH_DATA_DIR 指向了正式档目录，拒绝播种（会污染真数据）');
  }

  // ① 内容播种（CLI，走子进程）
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'src', 'scripts', 'content-sync.js'), 'import'],
      { env: { ...process.env, DSH_DATA_DIR: dataDir }, stdio: 'pipe' });
  } catch (e) {
    throw new Error('bootParity：content-sync import 失败 —— ' + (e.stderr ? e.stderr.toString().slice(0, 300) : e.message));
  }

  // ①′ 核对本进程实际用的目录（DATA_DIR 在模块加载时固化，这里把它读出来比对）
  const storePath = path.join(ROOT, 'src', 'db', 'store.js');
  if (!require.cache[require.resolve(storePath)]) {
    // store 还没被加载 —— 正常，播种后第一次 require 才会固化 DATA_DIR，此时它是我们想要的目录
  } else {
    const storeMod = require(storePath);
    const actualDir = storeMod._DATA_DIR || storeMod.DATA_DIR;
    if (actualDir && path.resolve(actualDir) !== path.resolve(dataDir)) {
      throw new Error(
        'bootParity：本进程的数据目录已固化为 ' + actualDir + '，而 DSH_DATA_DIR=' + dataDir + '。\n'
        + '  DATA_DIR 在 store.js 模块加载时固化 —— 请把 bootParity() 调用移到任何\n'
        + '  `require(\'../src/database\')` / `loadDatabase()` **之前**（套件顶部设完 DSH_DATA_DIR 就调）。\n'
        + '  否则测试跑在瘦档上，结论不可信。');
    }
  }

  // ② 真服务器的 boot 钩子
  const { loadDatabase, saveDatabase, invalidateCache } = require(path.join(ROOT, 'src', 'database'));
  if (typeof invalidateCache === 'function') invalidateCache();
  const materials = require(path.join(ROOT, 'src', 'services', 'materials'));
  const db = loadDatabase();
  materials.ensureAll(db);
  saveDatabase(db);

  // ③ 自检规模
  const actual = {
    items: (db.items || []).length,
    monsters: (db.monsters || []).length,
    maps: (db.maps || []).length,
    dungeons: (db.dungeons || []).length
  };
  const base = baselineFromLedger();
  const problems = [];
  if (base) {
    // 台账里的 items 含 ensureAll 补的材料/装备/丹药，所以临时档可能略多；
    // 判据取"不得少于台账的 95%"，容忍 ensureAll 的增补而不容忍整体缺失。
    for (const k of ['items', 'monsters', 'maps', 'dungeons']) {
      if (typeof base[k] !== 'number') continue;
      const floor = Math.floor(base[k] * 0.95);
      if (actual[k] < floor) problems.push(`${k}=${actual[k]} < 台账 ${base[k]} 的 95%（${floor}）`);
    }
  }
  if (problems.length) {
    const msg = 'bootParity：临时档内容与正式档不等价 → ' + problems.join('；')
      + '。带着瘦档跑测试，结论不可信（可能假绿）。';
    if (strict) throw new Error(msg);
    console.warn('⚠ ' + msg);
  }
  if (!o.quiet) {
    console.log(`  boot 平价：物品 ${actual.items} / 怪 ${actual.monsters} / 图 ${actual.maps} / 副本 ${actual.dungeons}`);
  }
  return actual;
}

module.exports = { bootParity, baselineFromLedger };
