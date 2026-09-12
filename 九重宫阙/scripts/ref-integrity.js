/**
 * 内容引用完整性审计（轮43）
 *
 * 为什么现在做：轮42 查明"代码里有、存档里没有"的反向漂移（items +77、dungeons +5 且 5 个副本在存档中
 * 完全不存在）。光看行数判断不了后果 —— 真正会伤到玩家的是**悬空引用**：
 * 掉落指向不存在的物品、丹方/锻造产出与耗材指向不存在的 id、图纸要求的材料名在物品表里没有、
 * 地图刷的怪与采集点没有对应定义、player_skills 的 skill_id 在代码技能表里查不到。
 *
 * 判据：任何一条边出现悬空引用即非零退出（除非该边登记在 KNOWN_ACCEPTABLE 里并写明理由）。
 * 只读：本脚本不写数据库。
 * 用法：node scripts/ref-integrity.js [--json]
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data', 'game.db');

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { return JSON.parse(v); } catch (e) { return []; }
  }
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try { return JSON.parse(v); } catch (e) { return {}; }
  }
  return v === undefined || v === null ? [] : v;
}

const db = new DatabaseSync(DB, { readOnly: true });
try {
  db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  const cols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'col_%'")
    .all().map(r => r.name.slice(4));
  const data = {};
  for (const c of cols) data[c] = db.prepare(`SELECT data FROM col_${c}`).all().map(r => JSON.parse(r.data));
  db.close();

  const items = data.items || [];
  const itemIds = new Set(items.map(o => Number(o.id)));
  const itemNames = new Set(items.map(o => String(o.name)));
  const monsters = data.monsters || [];
  const monsterIds = new Set(monsters.map(o => Number(o.id)));
  const monsterNames = new Set(monsters.map(o => String(o.name)));
  const mapIds = new Set((data.maps || []).map(o => Number(o.id)));
  const mapNames = new Set((data.maps || []).map(o => String(o.name)));
  const recipeIds = new Set((data.recipes || []).map(o => Number(o.id)));
  const forgeIds = new Set((data.forge_recipes || []).map(o => Number(o.id)));
  const blueprintIds = new Set((data.blueprints || []).map(o => Number(o.id)));
  const dungeonIds = new Set((data.dungeons || []).map(o => Number(o.id)));
  const realmNames = new Set((data.realms || []).map(o => String(o.name)));

  // 技能定义在代码里（col_skills 是空集合）。正则猜不出生成式技能，必须 require 真模块再深走：
  // skill-expansion 导出的是 buildSkills() 函数，sects / services.skill 导出的是数组常量。
  const skillKeys = new Set();
  const codeSkillSources = [];
  const walk = (v, depth) => {
    if (!v || depth > 6) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v === 'function') { try { walk(v(), depth + 1); } catch (e) { /* 需要参数的构建函数：跳过 */ } return; }
    if (typeof v !== 'object') return;
    if (typeof v.id === 'string' && /^[a-z][a-z0-9_]{2,}$/.test(v.id)) skillKeys.add(v.id);
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  for (const rel of ['src/services/skill.js', 'src/data/skill-expansion.js', 'src/data/sects.js', 'src/data/gongfa-library.js']) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    try {
      const before = skillKeys.size;
      walk(require(file), 0);
      codeSkillSources.push(`${rel}(+${skillKeys.size - before})`);
    } catch (e) {
      codeSkillSources.push(`${rel}(加载失败:${e.message.slice(0, 24)})`);
    }
  }

  // 引用字段既可能是裸 id，也可能是 {item_id, quantity} —— 两种形状在库里并存（实测
  // recipes 8 行裸数组 / 17 行对象数组，forge 9 / 19），只认一种会把合法的当成悬空（轮43 我的误报）。
  const refId = (m) => {
    if (m && typeof m === 'object') {
      const v = m.item_id !== undefined ? m.item_id : (m.id !== undefined ? m.id : m.value);
      return Number(v);
    }
    return Number(m);
  };

  const edges = [];
  const add = (label, list) => edges.push({ label, dangling: list });

  // 怪物掉落 -> items
  const dropBad = [];
  for (const m of monsters) {
    for (const d of asArray(m.drops)) {
      if (d && d.item_id !== undefined && !itemIds.has(Number(d.item_id))) {
        dropBad.push(`${m.name}(#${m.id}) 掉落到不存在的物品 #${d.item_id}`);
      }
    }
  }
  add('monsters.drops.item_id -> items.id', dropBad);

  // 怪物所属地图 -> maps
  add('monsters.map_id -> maps.id', monsters
    .filter(m => m.map_id !== undefined && m.map_id !== null && !mapIds.has(Number(m.map_id)))
    .map(m => `${m.name}(#${m.id}) 指向不存在地图 #${m.map_id}`));

  // 地图刷怪与采集 -> monsters.name / items.name
  const mapMonBad = [], mapGatherBad = [];
  for (const mp of (data.maps || [])) {
    for (const n of asArray(mp.monsters)) if (!monsterNames.has(String(n))) mapMonBad.push(`${mp.name}(#${mp.id}) 刷不存在的怪 "${n}"`);
    for (const n of asArray(mp.gather_nodes)) if (!itemNames.has(String(n))) mapGatherBad.push(`${mp.name}(#${mp.id}) 采集点无对应物品 "${n}"`);
  }
  add('maps.monsters[] 名 -> monsters.name', mapMonBad);
  add('maps.gather_nodes[] 名 -> items.name', mapGatherBad);

  // 丹方 / 锻造：materials 与 result -> items
  const recBad = [];
  for (const [coll, rows] of [['丹方', data.recipes || []], ['锻造', data.forge_recipes || []]]) {
    for (const r of rows) {
      for (const mid of asArray(r.materials)) {
        const id = refId(mid);
        if (Number.isFinite(id) && id > 0) {
          if (!itemIds.has(id)) recBad.push(`${coll} ${r.name}(#${r.id}) 耗材指向不存在物品 #${mid && mid.item_id !== undefined ? mid.item_id : mid}`);
        } else if (mid && mid.name && !itemNames.has(String(mid.name))) {
          recBad.push(`${coll} ${r.name}(#${r.id}) 耗材按名字引用但物品不存在 "${mid.name}"`);
        } else if (!Number.isFinite(id)) {
          recBad.push(`${coll} ${r.name}(#${r.id}) 耗材形状无法识别: ${JSON.stringify(mid).slice(0, 40)}`);
        }
      }
      const rid = refId(r.result);
      if (r.result !== undefined && r.result !== null && !itemIds.has(rid)) {
        recBad.push(`${coll} ${r.name}(#${r.id}) 产出指向不存在物品 #${r.result}`);
      }
    }
  }
  add('(recipes|forge_recipes).{materials,result} -> items', recBad);

  // 图纸材料按名字引用 -> items.name（也可能是 {item_id} 形状，两种都判）
  const bpBad = [];
  for (const b of (data.blueprints || [])) {
    for (const m of asArray(b.materials)) {
      if (!m || typeof m !== 'object') { bpBad.push(`图纸 ${b.name}(#${b.id}) 材料形状异常: ${JSON.stringify(m)}`); continue; }
      if (m.item_id !== undefined) {
        if (!itemIds.has(Number(m.item_id))) bpBad.push(`图纸 ${b.name}(#${b.id}) 需要物品 #${m.item_id} 不存在`);
      } else if (m.name && !itemNames.has(String(m.name))) {
        bpBad.push(`图纸 ${b.name}(#${b.id}) 需要物品 "${m.name}" 不存在`);
      }
    }
  }
  add('blueprints.materials[] -> items(name|id)', bpBad);

  // 副本奖励里的 items 数组 -> items.id；副本 min/max_level 合理性
  const dgBad = [];
  for (const d of (data.dungeons || [])) {
    const rw = asArray(d.rewards);
    if (rw && typeof rw === 'object' && !Array.isArray(rw) && Array.isArray(rw.items)) {
      for (const iid of rw.items) if (!itemIds.has(Number(iid))) dgBad.push(`副本 ${d.name}(#${d.id}) 奖励指向不存在物品 #${iid}`);
    }
    if (Number(d.min_level) > Number(d.max_level)) dgBad.push(`副本 ${d.name}(#${d.id}) min_level>max_level`);
  }
  add('dungeons.rewards.items[] -> items.id', dgBad);

  // 玩家已学技能的 skill_id 必须能在代码技能表里查到（T0-3：player_skills 是唯一真源）
  const psBad = [];
  for (const s of (data.player_skills || [])) {
    const key = String(s.skill_id);
    if (skillKeys.size && !skillKeys.has(key)) psBad.push(`player_skill#${s.id} char#${s.character_id} 的 skill_id "${key}" 在代码技能表里查不到`);
  }
  add('player_skills.skill_id -> 代码技能表', skillKeys.size ? psBad : []);

  // 物品 realm 必须是已定义境界名
  const itemRealmBad = [];
  for (const it of items) {
    if (it.realm && !realmNames.has(String(it.realm))) itemRealmBad.push(`物品 ${it.name}(#${it.id}) realm "${it.realm}" 不是已定义境界`);
  }
  add('items.realm -> realms.name', itemRealmBad);

  let total = 0;
  const asJson = process.argv.includes('--json');
  const report = [];
  for (const e of edges) {
    total += e.dangling.length;
    report.push(e);
    if (asJson) continue;
    const flag = e.dangling.length ? '✗' : '✓';
    console.log(`  ${flag} ${e.label.padEnd(46)} 悬空 ${String(e.dangling.length).padStart(4)}`);
    for (const x of e.dangling.slice(0, 5)) console.log(`        · ${x}`);
    if (e.dangling.length > 5) console.log(`        … 其余 ${e.dangling.length - 5} 条同类`);
  }
  if (asJson) console.log(JSON.stringify({ total, edges: edges.map(e => ({ label: e.label, n: e.dangling.length, sample: e.dangling.slice(0, 20) })) }, null, 2));
  console.log(`\n技能 key 采集自: ${codeSkillSources.join(', ')}｜可识别 ${skillKeys.size} 个`);
  console.log(`集合行数: items=${items.length} monsters=${monsters.length} maps=${(data.maps || []).length} dungeons=${(data.dungeons || []).length} recipes=${(data.recipes || []).length} forge=${(data.forge_recipes || []).length} blueprints=${(data.blueprints || []).length} player_skills=${(data.player_skills || []).length}`);
  if (total) {
    console.log(`\n🔴 内容引用完整性不合格：共 ${total} 条悬空引用`);
    process.exitCode = 1;
  } else {
    console.log('\n🟢 全部引用边闭合（0 悬空）');
  }
} catch (e) {
  try { db.close(); } catch (_) { /* 已关 */ }
  console.error('审计自身出错: ' + e.message);
  process.exitCode = 2;
}
