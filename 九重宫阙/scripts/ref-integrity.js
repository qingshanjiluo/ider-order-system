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

// 列表字段的容错读取：真数组直接返回；"[..]"/"{..}" 串按 JSON 解；其它标量按空处理。
// 实测存档形状（轮44 统计）：maps.gather_nodes 与 maps.monsters 20/20 都是真数组，
// monsters.drops 86/86 都是 JSON 串 —— 逗号串分支只是对"字符串化列表"的容错，不是存档现状。
// （轮44 我一度把逗号串当成存档事实，起因是自己拿 JSON.parse 去解一个已经是数组的字段，
//  JS 先把数组 toString 成 "a,b,c" 才报的错。修的是我的读法，不是数据的形状。）
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[') || s.startsWith('{')) {
      try { return JSON.parse(s); } catch (e) { return []; }
    }
    if (!s) return [];
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  if (v && typeof v === 'object') return v;
  return v === undefined || v === null ? [] : [];
}

const db = new DatabaseSync(DB, { readOnly: true });
try {
  db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  const cols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'col_%'")
    .all().map(r => r.name.slice(4));
  const data = {};
  for (const c of cols) data[c] = db.prepare(`SELECT data FROM col_${c}`).all().map(r => JSON.parse(r.data));
  // 轮46：宗门功法架是"运行时按名物化"的来源（sect-library.learn() 才造出 items），
  // 只看静态引用会把它当成不存在 —— 这正是上一版审计把 72 门宗门功法误判为死内容的盲点。
  // 因此直读 sect_library 关系表；空架 = 玩家无处可学（轮46 实测：全库只有 4 行，全是玩家上传的）。
  let shelfRows = [];
  try { shelfRows = db.prepare('SELECT name, kind FROM sect_library').all(); } catch (e) { shelfRows = []; }
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

  // 轮46：功法书.stats.gongfa_id 必须指向一条真实存在的 功法 物品 —— 这是"研读得功法"闭环的另一半，
  // 此前既无人校验该引用、也没有任何代码消费 功法书，5 本书连同它的引用一起处于无人认领状态。
  const bookBad = [];
  let bookTotal = 0;
  for (const it of items) {
    if (it.type !== '功法书') continue;
    bookTotal++;
    let st = {};
    try { st = JSON.parse(it.stats || '{}'); } catch (e) { bookBad.push(`功法书 ${it.name}(#${it.id}) stats 非法 JSON`); continue; }
    const gid = Number(st.gongfa_id);
    const byName = st.gongfa ? String(st.gongfa) : null;
    if ((!Number.isFinite(gid) || gid <= 0) && !byName) { bookBad.push(`功法书 ${it.name}(#${it.id}) 既无 gongfa_id 也无 gongfa 名字`); continue; }
    let t = (Number.isFinite(gid) && gid > 0) ? items.find((o) => Number(o.id) === gid && o.type === '功法') : undefined;
    // 与 routes/gongfa.js 的 /study 同口径：id 只有在确实指向功法时才可信，否则按名解析
    // （items.id 在不同库里不稳定，全新档上 gongfa_id=14 会撞成材料）。
    if (!t && byName) t = items.find((o) => String(o.name) === byName && o.type === '功法');
    if (!t) bookBad.push(`功法书 ${it.name}(#${it.id}) 解析不到功法（gongfa_id=${st.gongfa_id == null ? '缺' : st.gongfa_id}${byName ? ' gongfa=' + byName : ''}）`);
  }
  add(`功法书.gongfa_id -> items(type=功法)［${bookTotal} 本］`, bookBad);

  // ===== 获取路径闭合（轮44 · P1/T1-1：定义存在但玩家永远拿不到 = 死内容） =====
  // 来源 = 采集点 / 怪物掉落 / 坊市货架 / 副本奖励 / 丹方产出 / 锻造产出；
  // 消耗 = 丹方与锻造的 materials、图纸的 materials。被消耗却没有来源，就是学得了却永远炼不成的死链。
  const parseArr = asArray;   // 与顶层同一套形状判别，避免两处各写一遍而行为不一致
  const nameOfId = new Map(items.map((o) => [Number(o.id), String(o.name)]));
  const srcSets = {
    采集: new Set(), 掉落: new Set(), 坊市: new Set(), 副本奖励: new Set(), 丹方产出: new Set(), 锻造产出: new Set(),
    宗门功法架: new Set(), 藏宝阁兑换: new Set()
  };
  for (const e of shelfRows) if (String(e.kind) === '功法' && e.name) srcSets.宗门功法架.add(String(e.name));
  try {
    for (const e of (require('../src/data/sects.js').EXCHANGE_TABLE || [])) if (e && e.item) srcSets.藏宝阁兑换.add(String(e.item));
  } catch (e) { /* 兑换表读不到则少一条来源，宁多报不漏报 */ }
  for (const mp of (data.maps || [])) for (const n of parseArr(mp.gather_nodes)) srcSets.采集.add(String(n));
  for (const m of monsters) for (const d of parseArr(m.drops)) { const n = nameOfId.get(Number(d && d.item_id !== undefined ? d.item_id : d)); if (n) srcSets.掉落.add(n); }
  for (const s of (data.shop || [])) { const n = nameOfId.get(Number(s.item_id)); if (n) srcSets.坊市.add(n); }
  for (const d of (data.dungeons || [])) { const rw = parseArr(d.rewards); if (rw && Array.isArray(rw.items)) for (const i of rw.items) { const n = nameOfId.get(Number(i)); if (n) srcSets.副本奖励.add(n); } }
  for (const r of (data.recipes || [])) { const n = nameOfId.get(Number(r.result)); if (n) srcSets.丹方产出.add(n); }
  for (const r of (data.forge_recipes || [])) { const n = nameOfId.get(Number(r.result)); if (n) srcSets.锻造产出.add(n); }

  const consumedNames = new Set();
  for (const r of [...(data.recipes || []), ...(data.forge_recipes || [])]) {
    for (const mid of parseArr(r.materials)) {
      const n = (mid && typeof mid === 'object') ? (mid.name ? String(mid.name) : nameOfId.get(Number(mid.item_id))) : nameOfId.get(Number(mid));
      if (n) consumedNames.add(n);
    }
  }
  for (const b of (data.blueprints || [])) for (const m of parseArr(b.materials)) if (m && m.name) consumedNames.add(String(m.name));

  // 轮46：口径从"只看材料"扩到"实例化型物品"—— 材料（被配方消耗）、功法（POST /gongfa/equip 只认
  // 背包里一件 type='功法' 的物品，否则 db.gongfa 永远 0 行）、灵宠（pet.js:84 同理）、
  // 功法书（轮46 新接上的 /study 使用路径 —— 先有消费方，再要求获取路径，顺序不能反过来，
  // 否则就是给一个没人用的类型硬造货架，把死定义刷成"看起来活着"）。拿不到 = 死内容。
  const ACQUISITION_TYPES = new Set(['材料', '功法', '功法书', '灵宠']);
  const noSource = [];
  const srcByType = {};
  for (const it of items) {
    if (!ACQUISITION_TYPES.has(it.type)) continue;
    const nm = String(it.name);
    const from = Object.keys(srcSets).filter((k) => srcSets[k].has(nm));
    const bucket = (srcByType[it.type] = srcByType[it.type] || { total: 0, ok: 0 });
    bucket.total++;
    if (from.length) { bucket.ok++; continue; }
    noSource.push(`${it.type} ${nm}(#${it.id}) 无任何获取路径${consumedNames.has(nm) ? '，且被配方/图纸消耗 = 死链' : ''}`);
  }
  add('四类实例化型物品（材料/功法/功法书/灵宠）至少一条获取路径', noSource);

  const srcCount = Object.keys(srcSets).reduce((a, k) => a + srcSets[k].size, 0);

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
  console.log(`来源路径索引规模（去重名计数之和）= ${srcCount}：${Object.keys(srcSets).map((k) => k + '=' + srcSets[k].size).join(' ')}｜消耗方名字 ${consumedNames.size} 个`);
  // 轮46：按类型给出"实例化型物品"的获取覆盖率（功法/灵宠拿不到，对应集合就永远 0 行）
  console.log(`实例化型物品获取覆盖：${Object.keys(srcByType).map((t) => `${t} ${srcByType[t].ok}/${srcByType[t].total}`).join('｜')}`);
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
