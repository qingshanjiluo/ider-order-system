/**
 * 内容可达性审计（轮110 立）。
 *
 * ## 存在理由
 *
 * 表格要求把材料从 86 件扩到 >2000 件。扩产之前必须先有一条**机器判据**回答
 * 「这件材料玩家拿得到吗」—— 否则 2000 件里会有大量永远拿不到的孤儿，
 * 而门禁全绿（既有 42 个套件没有一条查这个）。
 *
 * ## 口径（这里踩过坑，写清楚）
 *
 * 一件材料"可达" = 至少在下列一条途径里出现：
 *   ① 地图采集点（maps 的 gather_nodes/nodes，可能是字符串数组或对象数组）
 *   ② 怪物掉落（monsters 的 drops/loot；**两种字段名并存**：rate 与 chance）
 *   ③ 商店货架（shop.item_id）
 *   ④ 配方产物（recipes / forge_recipes）
 *
 * **掉落必须同时按 item_id 与名字两个口径查**。第一版只用名字，结果把
 * 「千年妖丹 / 万年妖丹」误报成孤儿 —— 因为掉落条目里有的写 `name`、有的只写
 * `item_id`（`{"item_id":131,"rate":0.15}` 没有 name 字段）。按名字统计必然漏，
 * 而漏的方向是**假红**（把有途径的说成孤儿），会误导扩产决策。
 *
 * `--gate` 模式下：任何材料无途径 → exit 1。
 */
const path = require('path');
const { loadDatabase } = require('../src/database');

const GATE = process.argv.includes('--gate');

function parseMaybeJson(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** 采集点：返回 {names:Set, itemIds:Set} */
function gatherIndex(db) {
  const names = new Set();
  const ids = new Set();
  for (const m of db.maps || []) {
    const nodes = parseMaybeJson(m.gather_nodes || m.nodes || m.gatherNodes) || [];
    for (const n of nodes) {
      if (typeof n === 'string') { names.add(n); continue; }
      if (!n) continue;
      if (n.name) names.add(n.name);
      if (n.item) names.add(n.item);
      if (n.item_name) names.add(n.item_name);
      if (n.item_id != null) ids.add(Number(n.item_id));
    }
  }
  // 地图采集还能来自 materials.ensureMapNodes 的另一处结构
  for (const m of db.maps || []) {
    const gn = parseMaybeJson(m.gatherNodes) || [];
    for (const n of gn) { if (n && n.name) names.add(n.name); if (n && n.item_id != null) ids.add(Number(n.item_id)); }
  }
  return { names, ids };
}

/** 怪物掉落：双口径。字段名 rate / chance 并存。 */
function lootIndex(db) {
  const names = new Set();
  const ids = new Set();
  for (const mo of db.monsters || []) {
    const drops = parseMaybeJson(mo.drops || mo.loot || mo.drop_items) || [];
    for (const d of drops) {
      if (typeof d === 'string') { names.add(d); continue; }
      if (!d) continue;
      if (d.name) names.add(d.name);
      if (d.item) names.add(d.item);
      if (d.item_id != null) ids.add(Number(d.item_id));
    }
  }
  return { names, ids };
}

function recipeOutputs(db) {
  const names = new Set();
  const ids = new Set();
  for (const r of [...(db.recipes || []), ...(db.forge_recipes || [])]) {
    for (const k of ['result', 'result_name', 'output', 'product', 'name']) {
      if (typeof r[k] === 'string') names.add(r[k]);
    }
    for (const k of ['result_id', 'output_id', 'product_id']) {
      if (r[k] != null) ids.add(Number(r[k]));
    }
    // 材料目录里也可能只写 id
    const outs = parseMaybeJson(r.outputs) || [];
    for (const o of outs) { if (o && o.name) names.add(o.name); if (o && o.item_id != null) ids.add(Number(o.item_id)); }
  }
  return { names, ids };
}

function audit() {
  const db = loadDatabase();
  const items = db.items || [];
  const materials = items.filter((i) => i.type === '材料');

  const gather = gatherIndex(db);
  const loot = lootIndex(db);
  const recipe = recipeOutputs(db);
  const shopIds = new Set((db.shop || []).map((s) => Number(s.item_id)));

  const rows = [];
  for (const m of materials) {
    const id = Number(m.id);
    const via = [];
    if (gather.ids.has(id) || gather.names.has(m.name)) via.push('采集');
    if (loot.ids.has(id) || loot.names.has(m.name)) via.push('掉落');
    if (shopIds.has(id)) via.push('商店');
    if (recipe.ids.has(id) || recipe.names.has(m.name)) via.push('配方');
    rows.push({ id, name: m.name, via });
  }

  const orphans = rows.filter((r) => r.via.length === 0);
  return { db, total: materials.length, rows, orphans, gather, loot, recipe, shopIds };
}

function main() {
  const r = audit();
  console.log('== 内容可达性审计 ==');
  console.log(`材料 ${r.total} 件；采集点 ${r.gather.names.size} 名/${r.gather.ids.size} id`
    + ` · 掉落 ${r.loot.names.size} 名/${r.loot.ids.size} id`
    + ` · 商店 ${r.shopIds.size} id · 配方 ${r.recipe.names.size} 名`);
  console.log('');

  const dist = {};
  for (const x of r.rows) { const k = x.via.length ? x.via.join('+') : '（无途径）'; dist[k] = (dist[k] || 0) + 1; }
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  console.log('');

  if (r.orphans.length === 0) {
    console.log(`🟢 全部 ${r.total} 件材料至少有一条获取途径`);
    process.exit(0);
  }
  console.log(`🔴 ${r.orphans.length} 件材料没有任何获取途径（玩家永远拿不到）：`);
  for (const o of r.orphans.slice(0, 40)) console.log(`    · #${o.id} ${o.name}`);
  if (r.orphans.length > 40) console.log(`    …另 ${r.orphans.length - 40} 件`);
  if (GATE) process.exit(1);
}

module.exports = { audit, gatherIndex, lootIndex, recipeOutputs };
if (require.main === module) main();
