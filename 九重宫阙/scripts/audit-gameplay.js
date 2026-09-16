/**
 * 玩法闭环审计（P7 批3 · 只读探针）
 *
 * 目的：找出"数据造了但玩法没接"和"玩法接了但数据不存在"的两类断点。
 *   ① 每类物品是否有获取途径（掉落/商店/炼制/采集）
 *   ② 每类物品是否有消耗途径（服用/装备/材料）
 *   ③ 每个系统是否有入口（路由）与出口（写库）
 *
 * 只读：跑在存档副本上，不写正式库。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const LIVE = path.join(ROOT, 'data', 'game.db');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-audit-'));
process.env.DSH_DATA_DIR = TMP;

// 用快照读，不碰正式库
const { snapshotDatabase } = require(path.join(ROOT, 'src', 'db', 'snapshot'));
try { snapshotDatabase(LIVE, path.join(TMP, 'game.db')); }
catch (e) {
  fs.copyFileSync(LIVE, path.join(TMP, 'game.db'));
  console.log('（快照失败，退回裸拷贝：' + e.message + '）');
}

const { loadDatabase, closeDatabase } = require(path.join(ROOT, 'src', 'database'));
const materials = require(path.join(ROOT, 'src', 'services', 'materials'));
const db = loadDatabase();
materials.ensureAll(db);   // 让种子数据齐备（只写临时库）

const items = db.items || [];
const shop = db.shop || [];
const dungeons = db.dungeons || [];
const monsters = db.monsters || [];
const maps = db.maps || [];
const recipes = db.recipes || [];
const forgeRecipes = db.forge_recipes || [];
const blueprints = db.blueprints || [];

console.log('== 玩法闭环审计 ==');
console.log(`items=${items.length} shop=${shop.length} dungeons=${dungeons.length} monsters=${monsters.length} maps=${maps.length}`);
console.log(`recipes=${recipes.length} forge_recipes=${forgeRecipes.length} blueprints=${blueprints.length}`);

// ---- ① 物品获取途径覆盖 ----
const shopItemIds = new Set();
for (const s of shop) {
  const id = Number(s.item_id || s.itemId || 0);
  if (id) shopItemIds.add(id);
}
const dropItemIds = new Set();
for (const m of monsters) {
  let drops = m.drops;
  if (typeof drops === 'string') { try { drops = JSON.parse(drops); } catch (e) { drops = []; } }
  for (const d of (Array.isArray(drops) ? drops : [])) {
    const id = Number(d.item_id || d.itemId || d.id || 0);
    if (id) dropItemIds.add(id);
  }
}
}
const dungeonItemIds = new Set();
for (const d of dungeons) {
  for (const id of (d.items || [])) dungeonItemIds.add(Number(id));
}
const recipeOutputIds = new Set();
for (const r of [...recipes, ...forgeRecipes]) {
  const id = Number(r.result_item_id || r.output_item_id || r.result_id || 0);
  if (id) recipeOutputIds.add(id);
}

const obtainable = new Set([...shopItemIds, ...dropItemIds, ...dungeonItemIds, ...recipeOutputIds]);
const orphanItems = items.filter((i) => !obtainable.has(Number(i.id)));
console.log(`\n① 获取途径：可获取 ${items.length - orphanItems.length}/${items.length}`);
if (orphanItems.length) {
  console.log(`   无获取途径（${orphanItems.length} 项，前 12）：`);
  orphanItems.slice(0, 12).forEach((i) => console.log(`     #${i.id} ${i.name} [${i.type || '?'}]`));
}

// ---- ② 物品消耗途径 ----
const consumable = items.filter((i) => (i.type || '').includes('消耗') || (i.type || '').includes('丹'));
const equipable = items.filter((i) => (i.type || '').includes('装备'));
const materialish = items.filter((i) => (i.type || '').includes('材料'));
console.log(`\n② 消耗途径：消耗品 ${consumable.length} / 装备 ${equipable.length} / 材料 ${materialish.length}`);

// 材料是否被配方引用
const usedInRecipe = new Set();
for (const r of [...recipes, ...forgeRecipes]) {
  let mats = r.materials || r.ingredients;
  if (typeof mats === 'string') { try { mats = JSON.parse(mats); } catch (e) { mats = []; } }
  for (const m of (Array.isArray(mats) ? mats : [])) {
    const id = Number(m.item_id || m.id || m);
    if (id) usedInRecipe.add(id);
  }
}
const deadMaterials = materialish.filter((i) => !usedInRecipe.has(Number(i.id)));
console.log(`   材料被配方引用：${materialish.length - deadMaterials.length}/${materialish.length}`);
if (deadMaterials.length) {
  console.log(`   死材料（${deadMaterials.length} 项，前 12）：`);
  deadMaterials.slice(0, 12).forEach((i) => console.log(`     #${i.id} ${i.name}`));
}

// ---- ③ 地图与怪物覆盖 ----
const mapIds = new Set(maps.map((m) => Number(m.id)));
const monsterMaps = new Set(monsters.map((m) => Number(m.map_id)));
const emptyMaps = maps.filter((m) => !monsterMaps.has(Number(m.id)));
console.log(`\n③ 地图有怪：${maps.length - emptyMaps.length}/${maps.length}`);
if (emptyMaps.length) console.log(`   空地图：${emptyMaps.map((m) => m.name).join(', ')}`);

closeDatabase();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
