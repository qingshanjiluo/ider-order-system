/**
 * 玩法闭环审计 v2（P7 批3）—— 修正 v1 的假阳性
 *
 * v1 的错：把"某行某个数字字段等于物品 id"当成"引用了该物品"，
 *   于是 characters.id=2 / monsters.id=2 / users.id=2 全被算成"物品 #2 的获取途径"。
 *   结果既虚高（有途径的算成有）又虚低（真引用漏判）。
 *
 * v2 的规矩：只认**语义外键字段名**。物品被引用 = 字段名命中下列白名单之一。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const LIVE = path.join(ROOT, 'data', 'game.db');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-audit2-'));
process.env.DSH_DATA_DIR = TMP;
fs.copyFileSync(LIVE, path.join(TMP, 'game.db'));
for (const s of ['-wal', '-shm']) if (fs.existsSync(LIVE + s)) fs.copyFileSync(LIVE + s, path.join(TMP, 'game.db' + s));

const { loadDatabase, closeDatabase } = require(path.join(ROOT, 'src', 'database'));
const materials = require(path.join(ROOT, 'src', 'services', 'materials'));
const db = loadDatabase();
materials.ensureAll(db);

// 语义字段名白名单：只有这些名字的字段才代表"指向物品"
const ITEM_FK = new Set(['item_id', 'itemId', 'result', 'result_id', 'result_item_id', 'output', 'output_id', 'product_id', 'reward_item_id', 'prize_item_id']);
const MATS_FK = new Set(['materials', 'ingredients', 'cost_items', 'requires']);

/** 从任意 JSON 结构里递归挖出 {item_id / id / name} 形式的物品引用 */
function digItemIds(v, out) {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) { v.forEach((x) => digItemIds(x, out)); return; }
  if (typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      if (ITEM_FK.has(k)) { const n = Number(val); if (Number.isFinite(n) && n > 0) out.add(n); }
      else if (k === 'id' || k === 'item') { const n = Number(val); if (Number.isFinite(n) && n > 0) out.add(n); }
      else if (k === 'name' && typeof val === 'string') out.add('name:' + val);   // 按名字引用（图纸用这种）
      else digItemIds(val, out);
    }
    return;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('{') || s.startsWith('[')) { try { digItemIds(JSON.parse(s), out); } catch (e) { /* 非 JSON */ } }
  }
}

const nameToIds = new Map();
for (const it of (db.items || [])) {
  if (!nameToIds.has(it.name)) nameToIds.set(it.name, []);
  nameToIds.get(it.name).push(Number(it.id));
}

function parseMaybe(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; }

console.log('== 玩法闭环审计 v2（只认语义外键）==');
console.log(`items=${(db.items || []).length} shop=${(db.shop || []).length} dungeons=${(db.dungeons || []).length} monsters=${(db.monsters || []).length} maps=${(db.maps || []).length} recipes=${(db.recipes || []).length} forge=${(db.forge_recipes || []).length} blueprints=${(db.blueprints || []).length}`);

// ---- 获取途径 ----
const obtainRefs = new Set();     // 数字 id
const obtainNames = new Set();    // 名字
const addRef = (set, nset, v) => {
  if (typeof v === 'string' && v.startsWith('name:')) nset.add(v.slice(5));
  else set.add(Number(v));
};

// ① 商店
for (const s of (db.shop || [])) addRef(obtainRefs, obtainNames, Number(s.item_id));
// ② 怪物掉落
for (const m of (db.monsters || [])) {
  const drops = parseMaybe(m.drops) || parseMaybe(m.drop_items) || [];
  const out = new Set(); digItemIds(drops, out);
  for (const v of out) addRef(obtainRefs, obtainNames, v);
}
// ③ 副本奖励
for (const d of (db.dungeons || [])) {
  for (const k of ['rewards', 'reward_items', 'drops', 'item_rewards']) {
    if (!d[k]) continue;
    const out = new Set(); digItemIds(parseMaybe(d[k]), out);
    for (const v of out) addRef(obtainRefs, obtainNames, v);
  }
}
// ④ 配方产出（炼丹 recipes + 炼器 forge_recipes）
for (const r of [...(db.recipes || []), ...(db.forge_recipes || [])]) {
  for (const k of ['result', 'result_id', 'result_item_id', 'output_id', 'output']) {
    const n = Number(r[k]);
    if (Number.isFinite(n) && n > 0) obtainRefs.add(n);
  }
}
// ⑤ 图纸产出（blueprints 造装备/符/阵）
for (const b of (db.blueprints || [])) {
  const out = new Set(); digItemIds(parseMaybe(b.result) || parseMaybe(b.output) || b, out);
  for (const v of out) addRef(obtainRefs, obtainNames, v);
}

const nameMatched = new Set();
for (const nm of obtainNames) for (const id of (nameToIds.get(nm) || [])) { obtainRefs.add(id); nameMatched.add(id); }

const items = db.items || [];
const noPath = items.filter((i) => !obtainRefs.has(Number(i.id)));
console.log(`\n① 获取途径：${items.length - noPath.length}/${items.length} 有途径`);
const byType = {};
for (const i of noPath) { const t = i.type || '?'; byType[t] = (byType[t] || 0) + 1; }
console.log('   无途径物品按类型：' + Object.entries(byType).map(([k, v]) => `${k}=${v}`).join('  '));
if (noPath.length) {
  console.log(`   样例（前 15）：`);
  noPath.slice(0, 15).forEach((i) => console.log(`     #${i.id} ${i.name} [${i.type}]`));
}

// ---- 材料消耗 ----
const matUsed = new Set();
for (const r of [...(db.recipes || []), ...(db.forge_recipes || []), ...(db.blueprints || [])]) {
  let mats = r.materials || r.ingredients;
  mats = parseMaybe(mats);
  if (!Array.isArray(mats)) continue;
  for (const m of mats) {
    if (typeof m === 'number') { matUsed.add(m); continue; }
    if (m && typeof m === 'object') {
      if (m.name) for (const id of (nameToIds.get(m.name) || [])) matUsed.add(id);
      const n = Number(m.item_id || m.id);
      if (Number.isFinite(n) && n > 0) matUsed.add(n);
    }
  }
}
const matItems = items.filter((i) => (i.type || '').includes('材料'));
const deadMats = matItems.filter((i) => !matUsed.has(Number(i.id)) && !obtainRefs.has(Number(i.id)));
console.log(`\n② 材料：被配方引用 ${matItems.length - deadMats.length}/${matItems.length}`);
if (deadMats.length) {
  console.log(`   既不被配方用、也无获取途径（真死材料 ${deadMats.length} 项）：`);
  deadMats.slice(0, 15).forEach((i) => console.log(`     #${i.id} ${i.name}`));
}

// ---- 地图有怪 ----
const monsterMaps = new Set((db.monsters || []).map((m) => Number(m.map_id)).filter(Boolean));
const maps = db.maps || [];
const emptyMaps = maps.filter((m) => !monsterMaps.has(Number(m.id)));
console.log(`\n③ 地图有怪：${maps.length - emptyMaps.length}/${maps.length}`);
if (emptyMaps.length) console.log('   空地图：' + emptyMaps.map((m) => `${m.name}(Lv${m.min_level || '?'})`).join(', '));

// ---- ④ 同名物品（会让"按名字引用"的系统（图纸/配方/掉落）指向错的一件）----
const byName = new Map();
for (const i of items) {
  if (!byName.has(i.name)) byName.set(i.name, []);
  byName.get(i.name).push(i);
}
const dupNames = [...byName.entries()].filter(([, list]) => list.length > 1);
console.log(`\n④ 同名物品：${dupNames.length} 组（共 ${dupNames.reduce((s, [, l]) => s + l.length, 0)} 件）`);
if (dupNames.length) {
  console.log('   重名清单（名字相同但 id/类型不同，按名引用时会歧义）：');
  for (const [name, list] of dupNames) {
    const sameType = new Set(list.map((x) => x.type)).size === 1;
    console.log(`     ${name} ×${list.length} → ${list.map((x) => `#${x.id}[${x.type}]`).join(' ')}${sameType ? '  ⚠同类重名（纯冗余）' : ''}`);
  }
}

// ---- ⑤ 怪物等级是否落在地图区间内（配错图会让玩家越级或打空气）----
const mapById = new Map(maps.map((m) => [Number(m.id), m]));
const levelMismatch = [];
for (const mo of (db.monsters || [])) {
  const m = mapById.get(Number(mo.map_id));
  if (!m) continue;
  let lr = mo.level_range;
  if (typeof lr === 'string') { try { lr = JSON.parse(lr); } catch (e) { lr = null; } }
  if (!Array.isArray(lr) || lr.length < 2) continue;
  const [lo, hi] = lr.map(Number);
  const mlo = Number(m.min_level || 0), mhi = Number(m.max_level || 999);
  // 允许 ±3 级溢出（地图边界处常见）
  if (lo < mlo - 3 || hi > mhi + 3) {
    levelMismatch.push(`${mo.name}(Lv${lo}-${hi}) 在图 ${m.name}(Lv${mlo}-${mhi})`);
  }
}
console.log(`\n⑤ 怪物等级与地图区间：错配 ${levelMismatch.length} 只`);
if (levelMismatch.length) levelMismatch.slice(0, 12).forEach((s) => console.log('   ' + s));

closeDatabase();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
