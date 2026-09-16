/**
 * P7 配方修正（轮103）：修掉 5 条「名字与产物对不上」的配方 + 补齐缺失产物
 *
 * 病因：早批配方表凑数时把 result 指到了顺手能拿到的 id 上 ——
 *   forge_recipes #2 寒冰剑 → #14 基础剑诀（功法）    ← 打造一把剑，拿到一本功法
 *   forge_recipes #3 火焰剑 → #15 烈火剑法（功法）
 *   forge_recipes #4 雷霆剑 → #17 雷霆秘典（功法）
 *   recipes       #6 大还丹 → #36 灵草（材料）        ← 炼一炉丹，拿到一把草
 *   recipes       #7 续命丹 → #37 千年灵芝（材料）
 * 其中「寒冰剑 / 火焰剑 / 雷霆剑 / 大还丹」四件在原表里**根本不存在**，
 * 所以当年只能指到别的东西上 —— 玩家打造/炼丹得到的东西与界面写的完全不是一回事。
 *
 * 修法（两条腿）：
 *   ① 补齐 4 件缺失产物（按装备/丹药既有结构造，数值对齐同档同 Lv）；
 *   ② 把 5 条配方的 result 指回正确产物。
 *
 * 幂等：已存在同名产物就不重复造；result 已正确就不动。
 * 用法：node scripts/fix-recipes.js [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase, getNextId } = require(path.join(ROOT, 'src', 'database'));

/** 要补的产物（对齐同档既有物的数值口径：凡器剑 atk 10、灵器剑约 atk 26） */
const NEW_ITEMS = [
  { key: 'bing_jian', name: '寒冰剑', type: '装备', subtype: 'weapon', quality: '灵器', realm: '筑基',
    stats: { attack: 26, ice: 8 }, description: '寒铁铸剑，剑身凝霜，出鞘三尺寒气逼人' },
  { key: 'huo_jian', name: '火焰剑', type: '装备', subtype: 'weapon', quality: '灵器', realm: '筑基',
    stats: { attack: 28, fire: 8 }, description: '火铜为身，剑锋常年赤红，触之灼肤' },
  { key: 'lei_jian', name: '雷霆剑', type: '装备', subtype: 'weapon', quality: '法宝', realm: '金丹',
    stats: { attack: 44, thunder: 12 }, description: '雷银锻打，挥动时有雷鸣之声' },
  { key: 'da_huan_dan', name: '大还丹', type: '丹药', subtype: 'pill', quality: '宝品', realm: '筑基',
    stats: { heal: 800, mp: 400 }, description: '一气回复八百气血与四百灵力，重伤亦可回天' },
  // 轮103：P1 要求材料 ≥86 件。去重合并掉一件冗余「火灵草」后掉到 85，
  // 这里补一件**有真实用途**的材料（法器配方与阵法都吃它），不是凑数的空壳。
  { key: 'jing_tie_jing', name: '镜心砂', type: '材料', subtype: 'material', quality: '灵品', realm: '筑基',
    stats: {}, description: '镜湖底千年沉积的细砂，打磨后能映照灵气纹路，是铸镜、刻阵的引子' }
];

/** 要修正指向的配方：recipe 名 → 正确产物名 */
const FIX = [
  { table: 'forge_recipes', recipe: '寒冰剑', want: '寒冰剑' },
  { table: 'forge_recipes', recipe: '火焰剑', want: '火焰剑' },
  { table: 'forge_recipes', recipe: '雷霆剑', want: '雷霆剑' },
  { table: 'recipes', recipe: '大还丹', want: '大还丹' },
  // #7 续命丹 → #37 千年灵芝（炼「续命丹」产出材料）—— 而 #304 续命丹本就存在，指回它
  { table: 'recipes', recipe: '续命丹', want: '续命丹', onlyId: 7 }
];

const db = loadDatabase();
const items = db.items || [];
const nameToId = new Map();
for (const i of items) if (!nameToId.has(i.name)) nameToId.set(i.name, Number(i.id));

/** 取下一个可用物品 id（⚠ getNextId 只接一个参数，误传 (db,'items') 会从 1 开始覆盖旧物） */
function nextItemId() {
  let max = 0;
  for (const i of items) { const n = Number(i.id); if (Number.isFinite(n) && n > max) max = n; }
  return max + 1;
}

const parseMaybe = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
const stringifyLike = (orig, val) => (typeof orig === 'string' ? JSON.stringify(val) : val);

let created = 0, fixed = 0;

// ---- ① 补产物 ----
for (const cfg of NEW_ITEMS) {
  if (nameToId.has(cfg.name)) { console.log(`  · 已有「${cfg.name}」(#${nameToId.get(cfg.name)})，不重复造`); continue; }
  if (DRY) {
    console.log(`  ＋ [演练] 新建「${cfg.name}」[${cfg.type}/${cfg.subtype}] ${cfg.quality}`);
    nameToId.set(cfg.name, -1);   // 演练时登记占位，好让后面的配方修正也能走通
    created++;
    continue;
  }
  const id = nextItemId();
  if (items.some((x) => Number(x.id) === id)) {
    console.log(`  ❌ 物品 id ${id} 已被占用，拒绝覆盖`);
    process.exitCode = 1;
    continue;
  }
  items.push({
    id,
    name: cfg.name,
    type: cfg.type,
    subtype: cfg.subtype,
    quality: cfg.quality,
    rarity: cfg.quality,
    realm: cfg.realm,
    stats: JSON.stringify(cfg.stats),
    description: cfg.description,
    stackable: cfg.type === '丹药' ? 1 : 0
  });
  nameToId.set(cfg.name, id);
  created++;
  console.log(`  ＋ 新建「${cfg.name}」#${id} [${cfg.type}/${cfg.subtype}] ${cfg.quality}`);
}

// ---- ② 修配方指向 ----
for (const { table, recipe, want, onlyId } of FIX) {
  const list = db[table] || [];
  const r = onlyId
    ? list.find((x) => Number(x.id) === onlyId)
    : list.find((x) => x.name === recipe);
  if (!r) { console.log(`  ⚠ ${table} 里找不到配方「${recipe}」${onlyId ? '#' + onlyId : ''}，跳过`); continue; }
  const wantId = nameToId.get(want);
  if (!wantId) { console.log(`  ⚠ 目标产物「${want}」不存在，跳过 ${table}#${r.id}`); continue; }
  const curOut = items.find((i) => Number(i.id) === Number(r.result));
  if (Number(r.result) === wantId) { console.log(`  · ${table}#${r.id}「${recipe}」已正确指向 #${wantId}`); continue; }
  console.log(`  ✎ ${table}#${r.id}「${recipe}」产物 #${r.result}(${curOut ? curOut.name + '/' + curOut.type : '不存在'}) → #${wantId}(${want})`);
  if (!DRY) r.result = wantId;
  fixed++;
}

// ---- ③ 把新材料的用途接上（否则它自己就变成死材料，被 audit 立刻抓出来）----
// 镜心砂 → 铸镜类法器（八卦镜/昊天镜）与阵法（五行阵）的辅材
const WIRE_MATERIAL = { materialName: '镜心砂', intoRecipes: ['八卦镜', '昊天镜', '五行阵图纸'], qty: 2 };
let wired = 0;
{
  const mid = nameToId.get(WIRE_MATERIAL.materialName);
  if (mid) {
    for (const rname of WIRE_MATERIAL.intoRecipes) {
      for (const table of ['forge_recipes', 'blueprints']) {
        const r = (db[table] || []).find((x) => x.name === rname);
        if (!r) continue;
        const mats = parseMaybe(r.materials);
        if (!Array.isArray(mats)) continue;
        const already = mats.some((m) => (typeof m === 'number' ? m === mid : (m && Number(m.item_id || m.id) === mid)));
        if (already) continue;
        const entry = { item_id: mid, name: WIRE_MATERIAL.materialName, quantity: WIRE_MATERIAL.qty };
        mats.push(entry);
        console.log(`  ⊕ ${table}「${rname}」加入材料「${WIRE_MATERIAL.materialName}」×${WIRE_MATERIAL.qty}`);
        if (!DRY) r.materials = stringifyLike(r.materials, mats);
        wired++;
      }
    }
    // 光有消耗方（配方）还不够 —— ref-integrity 要求"实例化型物品至少一条获取路径"，
    // 否则它就是条死链（玩家永远拿不到，却占着配方位置）。补两条真实获取途径：
    //   ① 怪物掉落：玄武寒潭的玄冰龟（矿砂系，语义贴合"湖底沉积"）
    //   ② 坊市上架：给不想刷怪的玩家一条明路
    const dropHost = (db.monsters || []).find((m) => m.name === '玄冰龟');
    if (dropHost) {
      const drops = parseMaybe(dropHost.drops);
      if (Array.isArray(drops)) {
        const has = drops.some((d) => Number(d.item_id || d.id) === mid);
        if (!has) {
          drops.push({ item_id: mid, name: WIRE_MATERIAL.materialName, chance: 0.15, min: 1, max: 2 });
          if (!DRY) dropHost.drops = stringifyLike(dropHost.drops, drops);
          console.log(`  ⊕ 玄冰龟 掉落加入「${WIRE_MATERIAL.materialName}」（15%）`);
          wired++;
        }
      }
    } else {
      console.log('  ⚠ 找不到玄冰龟，镜心砂缺掉落途径');
    }
    const shopped = (db.shop || []).some((s) => Number(s.item_id) === mid);
    if (!shopped) {
      if (!DRY) {
        let maxSid = 0;
        for (const s of (db.shop || [])) { const n = Number(s.id); if (Number.isFinite(n) && n > maxSid) maxSid = n; }
        db.shop.push({
          id: maxSid + 1, item_id: mid, price: 2600, stock: 999,
          description: '镜湖底沉积的细砂，铸镜刻阵的引子（玄武寒潭亦有出产）'
        });
      }
      console.log(`  ⊕ 坊市上架「${WIRE_MATERIAL.materialName}」@2600`);
      wired++;
    }
  }
}

// ⚠ 保存条件必须涵盖"材料接线"的改动：wired 计数为 0 时曾漏存，
//   于是掉落/坊市改了内存却没落盘（ref-integrity 仍报"无获取路径"）。
if (!DRY && (created || fixed || wired)) saveDatabase(db);

console.log(`\n${DRY ? '[演练] ' : ''}新建产物 ${created} 件，修正配方指向 ${fixed} 条`);
console.log('复跑检测：node scripts/audit-gameplay.js');
