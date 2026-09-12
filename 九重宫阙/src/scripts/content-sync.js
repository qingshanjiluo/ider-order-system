/**
 * 内容台账与对账（轮41 立，轮42 升级为覆盖式）
 *
 * 定位（轮42 定稿，重要）：**内容真源 = 存档 + 本文件的导出台账**，不是 seed 脚本。
 * 轮42 的行级诊断证明，seed 脚本之间以及与一次性脚本之间存在 id 抢位：
 *   - `init-db` 与 `expand-data` 都往 maps 的 id 1-20 塞**不同**的地图，谁先跑谁赢（都是"id 已存在则跳过"）；
 *   - 存档里那 6 张图的 monsters/gather_nodes 是 `fix-maps.js` 这类一次性脚本后补的，**从来不在链里**；
 *   - items 有 46 行同名重复、77 行是代码多出的（历史上做过改名/去重，没回写种子）。
 * 因此把 seed 当权威去考古不划算；改成：seed 负责"能开机的结构 + 基础内容"，
 * 台账负责"定义内容的精确一致"，`verify:rebuild` 用台账把定义集合逐项钉死。
 * seed 与台账的差异不会被藏起来 —— rebuild-check 会把"代码多出 / 与台账不同"如实打印成反向漂移清单。
 *
 * 两个模式：
 *   node src/scripts/content-sync.js export   读存档 -> 写 src/data/content-export.json（**绝不写库**）
 *   node src/scripts/content-sync.js import   读该文件 -> 按 id 覆盖式对齐（幂等：第二次 0 补 0 改）
 *
 * 改了定义内容之后的顺序固定为：改代码或改存档 -> export -> verify:rebuild -> 门禁。
 */
const fs = require('fs');
const path = require('path');
const { loadDatabase, saveDatabase } = require('../database');

const OUT = path.join(__dirname, '..', 'data', 'content-export.json');
// 只导"定义类"集合；characters / users / inventory / player_skills / guild* 等是运行时与玩家数据，绝不能进台账
const DEFINITIONS = [
  'realms', 'maps', 'items', 'monsters', 'dungeons', 'blueprints',
  'recipes', 'forge_recipes', 'shop', 'skills', 'gongfa', 'pets', 'achievements'
];

function byId(list) {
  return (list || []).slice().sort((a, b) => (Number(a && a.id) || 0) - (Number(b && b.id) || 0));
}

const mode = process.argv[2];
if (mode === 'export') {
  const db = loadDatabase();
  const payload = { _counts: {} };
  for (const name of DEFINITIONS) {
    const rows = byId(db[name]);
    payload[name] = rows;
    payload._counts[name] = rows.length;
  }
  // 注意不要用数组当 replacer：那会在每一层生效，把行对象的字段滤光（静默丢数据）。
  // 确定性来自 byId 排序 + 文档键序本身稳定，因此无需再排顶层键。
  const json = JSON.stringify(payload);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json, 'utf8');
  console.log('[content-sync] 导出 ' + DEFINITIONS.length + ' 个定义集合 -> ' + path.relative(process.cwd(), OUT)
    + '（' + (json.length / 1024).toFixed(0) + ' KB）');
  console.log('  ' + DEFINITIONS.map(n => `${n}=${payload._counts[n]}`).join('  '));
  console.log('  本模式不写数据库；要让存档与台账对齐，请跑 import。');
} else if (mode === 'import') {
  if (!fs.existsSync(OUT)) {
    console.error('[content-sync] 缺少 ' + path.relative(process.cwd(), OUT) + '，请先 export');
    process.exitCode = 1;
  } else {
    const payload = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const db = loadDatabase();
    let added = 0;
    let changed = 0;
    let touched = false;
    const report = [];
    for (const name of DEFINITIONS) {
      const rows = Array.isArray(payload[name]) ? payload[name] : [];
      if (!Array.isArray(db[name])) db[name] = [];
      const index = new Map();
      db[name].forEach((x, i) => index.set(String(x && x.id), i));
      let nAdd = 0;
      let nChg = 0;
      for (const row of rows) {
        const id = String(row && row.id);
        if (!index.has(id)) {
          db[name].push(row);
          index.set(id, db[name].length - 1);
          nAdd++;
          continue;
        }
        const i = index.get(id);
        // 覆盖式对齐：seed 与一次性脚本的历史差异在此收敛，定义内容由台账说了算
        if (JSON.stringify(db[name][i]) !== JSON.stringify(row)) {
          db[name][i] = row;
          nChg++;
        }
      }
      if (nAdd || nChg) touched = true;
      added += nAdd;
      changed += nChg;
      report.push(`${name}+${nAdd}/~${nChg}/${rows.length}`);
    }
    if (touched) saveDatabase(db);
    console.log('[content-sync] 台账对齐：补入 ' + added + ' 行，覆盖 ' + changed + ' 行（两者都为 0 = 幂等成立）');
    console.log('  ' + report.join('  '));
  }
} else {
  console.log('用法：node src/scripts/content-sync.js export|import');
  console.log('  export  存档 -> src/data/content-export.json（不写库）');
  console.log('  import  该文件 -> 存档（按 id 覆盖式对齐，幂等）');
  process.exitCode = 1;
}
