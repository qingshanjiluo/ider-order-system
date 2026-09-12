/**
 * 内容对账与导出（轮41）
 *
 * 起因：轮41 的 `scripts/rebuild-check.js` 实测发现，把 seed 链在空库上跑完，
 * monsters 只有 36 / 在用存档 86，items 328/566，shop 28/136，dungeons 20/32，blueprints 0/21。
 * 也就是说**大量内容定义只存在于 data/game.db 里，代码里没有任何一份**。
 * 这推翻了我轮38 记下的结论（"game.db 是构建产物，内容真源 = init-db + expand-data"）——
 * 那句话当时只对 realms/maps/recipes/forge_recipes 成立，我把它当成了全局事实。
 *
 * 两个模式：
 *   node src/scripts/content-sync.js export   读存档 → 写 src/data/content-export.json（**绝不写库**）
 *   node src/scripts/content-sync.js import   读该文件 → 按 id 补齐库里缺的行（幂等，第二次补 0 行）
 *
 * 有了 import 这一步，"空库重出一份与在用存档内容一致的库"才第一次成为可验证的事实，
 * 也让 P1 补定义从此以**可 diff 的文本**落地，而不是悄悄改二进制存档。
 */
const fs = require('fs');
const path = require('path');
const { loadDatabase, saveDatabase } = require('../database');

const OUT = path.join(__dirname, '..', 'data', 'content-export.json');
// 只导"定义类"集合；characters / users / inventory / player_skills / guild* 等是运行时与玩家数据，绝不能进导出
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
  const payload = { _exported_at: null, _counts: {} };
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
  console.log('  本模式不写数据库；要让存档获得导出内容，请跑 import。');
} else if (mode === 'import') {
  if (!fs.existsSync(OUT)) {
    console.error('[content-sync] 缺少 ' + path.relative(process.cwd(), OUT) + '，请先 export');
    process.exitCode = 1;
  } else {
    const payload = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const db = loadDatabase();
    let added = 0, touched = false;
    const report = [];
    for (const name of DEFINITIONS) {
      const rows = Array.isArray(payload[name]) ? payload[name] : [];
      if (!Array.isArray(db[name])) db[name] = [];
      const have = new Set(db[name].map(x => String(x && x.id)));
      let n = 0;
      for (const row of rows) {
        const id = String(row && row.id);
        if (have.has(id)) continue;
        db[name].push(row);
        have.add(id);
        n++;
      }
      if (n) { touched = true; added += n; }
      report.push(`${name}+${n}/${rows.length}`);
    }
    if (touched) saveDatabase(db);
    console.log('[content-sync] 按 id 补入缺失定义 ' + added + ' 行（0 = 已与导出内容一致，幂等成立）');
    console.log('  ' + report.join('  '));
  }
} else {
  console.log('用法：node src/scripts/content-sync.js export|import');
  console.log('  export  存档 -> src/data/content-export.json（不写库）');
  console.log('  import  该文件 -> 存档（按 id 幂等补齐）');
  process.exitCode = 1;
}
