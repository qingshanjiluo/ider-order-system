/**
 * 内容目录回填的一次性显式入口（轮44 · P1）
 * 与 server.js 启动时那道工序完全相同（materials.ensureAll：材料入库/分级、采集点、图纸、货架、
 * 副本库、怪物库、丹方、卫生），只是不必起服务。P1 补定义后用它把目录灌进存档，再 content:export 出台账。
 * 幂等：第二次运行 changed 必须为 0，否则非零退出（说明某道工序每次都改写数据，seed 不收敛）。
 */
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const materials = require('../src/services/materials');

function snapshot(db) {
  const n = (c) => (Array.isArray(db[c]) ? db[c].length : 0);
  return { items: n('items'), 材料: (db.items || []).filter(i => i.type === '材料').length, maps: n('maps'), blueprints: n('blueprints'), dungeons: n('dungeons'), monsters: n('monsters'), shop: n('shop'), recipes: n('recipes'), forge: n('forge_recipes') };
}

const before = snapshot(loadDatabase());
const res = materials.ensureAll(loadDatabase());
const db = loadDatabase();
if (res.changed > 0) saveDatabase(db);
const after = snapshot(loadDatabase());
closeDatabase();

console.log(`[content:ensure] ensureAll changed = ${res.changed}（材料入库 ${res.equipment || 0}／分级 ${res.materialGrades}／图纸 ${res.blueprints}／副本 ${res.dungeons}／货架 ${res.shopEntries}／卫生 ${res.hygiene}）`);
for (const k of Object.keys(after)) {
  const mark = after[k] === before[k] ? ' =' : ' ->';
  console.log(`    ${k.padEnd(11)} ${before[k]}${mark}${after[k]}`);
}

const db2 = loadDatabase();
const res2 = materials.ensureAll(db2);
closeDatabase();
console.log(`[content:ensure] 二次运行 changed = ${res2.changed}（应为 0 = 幂等收敛）`);
if (res2.changed !== 0) {
  console.log('🔴 内容回填不收敛：二次仍有改动 —— ' + JSON.stringify(res2));
  process.exitCode = 1;
}
