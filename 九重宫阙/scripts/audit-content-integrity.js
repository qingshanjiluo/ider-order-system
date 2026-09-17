/**
 * 内容完整性审计（轮108 立）。
 *
 * ## 存在理由
 *
 * 全项目有 **20 处「内存常量内容定义」**（商城/配方/设施/成就/图鉴…），此前只有 2 处
 * 被任何脚本提到。也就是说绝大多数内容库**没有被机器检查过**：里面的物品名对不对、
 * 引用的技能 id 存不存在、价格是否离谱 —— 全靠人眼。
 *
 * 这不是假想风险。首次运行就抓到 3 处真断链（仙玉商城）：
 *   · j3 回城符 → 硬编码 itemId 50（物品表缺号，**不存在**）
 *   · j4 传音符 → itemId 49（缺号，**不存在**）
 *   · j12 复活令 → itemId 56 实为**回城符**，且"复活令"这个物品在表里根本没有
 * 玩家花仙玉能买到一件查不到定义的空物品 —— 而所有既有门禁全绿。
 *
 * ## 口径（为什么这样查）
 *
 * 判据不是"文本里有没有 itemId"，而是**运行时能不能解析出真实实体**。
 * 踩过的坑：第一版用正则匹配 `itemId:\s*\d+` 做对账，改动写法（改存名字）后
 * 正则失配，报告变成一片"非物品"的假绿 —— 所以这里坚持走运行时解析 + 正向断言。
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase } = require(path.join(ROOT, 'src', 'database'));
const db = loadDatabase();

let pass = 0, fail = 0;
const issues = [];
const t = (name, fn) => {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); issues.push(name + '：' + e.message); fail++; }
};

const itemByName = new Map((db.items || []).map((i) => [i.name, i]));
const itemById = new Map((db.items || []).map((i) => [Number(i.id), i]));
const skillIds = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'services', 'skill.js'), 'utf8');
  return new Set([...src.matchAll(/id:\s*'([a-z_]+)'/g)].map((m) => m[1]));
})();
const gongfaIds = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'forge-systems.js'), 'utf8');
  const i = src.indexOf('const GONGFA_LIST');
  return new Set([...src.slice(i, i + 9000).matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]));
})();
const realmNames = new Set((db.realms || []).map((r) => r.name));
const mapNames = new Set((db.maps || []).map((m) => m.name));
const monsterNames = new Set((db.monsters || []).map((m) => m.name));
const dungeonNames = new Set((db.dungeons || []).map((d) => d.name));

console.log('== 内容完整性审计 ==');
console.log(`真源：物品 ${itemByName.size} / 技能 ${skillIds.size} / 功法 ${gongfaIds.size}`
  + ` / 地图 ${mapNames.size} / 怪 ${monsterNames.size} / 副本 ${dungeonNames.size} / 境界 ${realmNames.size}`);
console.log('');

// ────────────────────────────────────────────────────────────
// 一、仙玉商城（运行时解析，已从硬编码 id 改为按名解析）
// ────────────────────────────────────────────────────────────
t('仙玉商城：每个商品都能解析出真实物品（不卖虚空货）', () => {
  const vip = require(path.join(ROOT, 'src', 'routes', 'vip'));
  const shop = vip._resolveJadeShop ? vip._resolveJadeShop(db) : null;
  if (!shop) throw new Error('vip 模块未导出 _resolveJadeShop（无法在测试里解析商城）');
  const bad = [];
  for (const it of shop) {
    if (it.type === 'item') {
      const found = itemById.get(Number(it.itemId));
      if (!found) { bad.push(`${it.id}「${it.name}」→ itemId ${it.itemId} 不存在`); continue; }
      // 名字必须与 itemName 对得上（防"卖复活令给回城符"这类错位）
      const want = it.name.split('x')[0];
      if (found.name !== want) bad.push(`${it.id}「${it.name}」→ 实际是「${found.name}」`);
    } else if (it.type === 'spirit_stone') {
      if (!(it.value > 0)) bad.push(`${it.id}「${it.name}」→ 灵石数量非正`);
    } else {
      bad.push(`${it.id}「${it.name}」→ 未知类型 ${it.type}`);
    }
  }
  if (bad.length) throw new Error('商品引用的物品有问题：' + bad.join('；'));
  if (shop.length < 12) throw new Error(`商城只有 ${shop.length} 件商品（原设计 12 件，内容被削了？）`);
});

t('仙玉商城：定价单调（量越大单位越便宜，不许买大份反而更亏）', () => {
  const vip = require(path.join(ROOT, 'src', 'routes', 'vip'));
  const shop = vip._resolveJadeShop(db);
  // 按 itemName 分组，比"每件单价"
  const groups = new Map();
  for (const it of shop) {
    if (it.type !== 'item') continue;
    const key = it.itemName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: it.id, cost: it.cost, qty: it.quantity, unit: it.cost / it.quantity });
  }
  const bad = [];
  for (const [name, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.qty - b.qty);
    for (let i = 1; i < list.length; i++) {
      if (list[i].unit > list[i - 1].unit + 1e-9) {
        bad.push(`${name}：买 ${list[i].qty} 件的单价(${list[i].unit.toFixed(2)}) 高于买 ${list[i - 1].qty} 件(${list[i - 1].unit.toFixed(2)})`);
      }
    }
  }
  if (bad.length) throw new Error(bad.join('；'));
});

// ────────────────────────────────────────────────────────────
// 二、仙盟商店
// ────────────────────────────────────────────────────────────
t('仙盟商店：每个商品指向真实物品', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'guild.js'), 'utf8');
  const i = src.indexOf('const GUILD_SHOP');
  if (i < 0) throw new Error('找不到 GUILD_SHOP');
  const start = src.indexOf('[', i);
  let depth = 0, j = start;
  for (; j < src.length; j++) { if (src[j] === '[') depth++; else if (src[j] === ']') { depth--; if (depth === 0) break; } }
  const block = src.slice(start, j + 1);
  const entries = [...block.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  const bad = [];
  for (const e of entries) {
    const name = (e.match(/name:\s*'([^']+)'/) || [])[1];
    const idm = (e.match(/item_?[Ii]d:\s*(\d+)/) || [])[1];
    if (!name) continue;
    if (!idm) { bad.push(`「${name}」没有 itemId`); continue; }
    const it = itemById.get(Number(idm));
    if (!it) { bad.push(`「${name}」→ itemId ${idm} 不存在`); continue; }
    if (it.name !== name.split('x')[0]) bad.push(`「${name}」→ 实际是「${it.name}」`);
  }
  if (bad.length) throw new Error(bad.join('；'));
});

// ────────────────────────────────────────────────────────────
// 三、成就的 requirement 必须是"游戏真的能判定"的类型
// ────────────────────────────────────────────────────────────
t('成就：requirement.type 都在游戏可判定集合内，且境界名真实存在', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'achievement.js'), 'utf8');
  const i = src.indexOf('const ACHIEVEMENTS');
  const start = src.indexOf('[', i);
  let depth = 0, j = start;
  for (; j < src.length; j++) { if (src[j] === '[') depth++; else if (src[j] === ']') { depth--; if (depth === 0) break; } }
  const block = src.slice(start, j + 1);
  const reqs = [...block.matchAll(/requirement:\s*\{\s*type:\s*'([^']+)'(?:,\s*value:\s*'?([^',}]+)'?)?/g)];
  // 路由里真正实现了判定的类型（读 assess 分支的 case）
  const implemented = new Set([...src.matchAll(/case\s+'([a-zA-Z]+)'/g)].map((m) => m[1]));
  const bad = [];
  const seenTypes = new Set();
  for (const [, type, value] of reqs) {
    seenTypes.add(type);
    if (implemented.size && !implemented.has(type)) bad.push(`requirement.type='${type}' 没有对应的判定分支`);
    if (type === 'realm' && value && realmNames.size && !realmNames.has(value)) {
      bad.push(`requirement 要求境界「${value}」，但境界表里没有`);
    }
  }
  if (!reqs.length) throw new Error('一条 requirement 都没解析到（正则失配？）');
  if (bad.length) throw new Error(bad.join('；'));
  console.log(`     （解析到 ${reqs.length} 条 requirement，${seenTypes.size} 种类型）`);
});

// ────────────────────────────────────────────────────────────
// 四、存档里所有"引用型外键"不悬空
// ────────────────────────────────────────────────────────────
t('存档外键：inventory / shop / equipments 的 item_id 都指向真实物品', () => {
  const bad = [];
  for (const [tbl, rows] of [['inventory', db.inventory], ['shop', db.shop], ['equipments', db.equipments]]) {
    for (const r of rows || []) {
      if (r.item_id == null) continue;
      if (!itemById.has(Number(r.item_id))) bad.push(`${tbl} id=${r.id} → item_id ${r.item_id} 不存在`);
    }
  }
  if (bad.length) throw new Error(bad.slice(0, 8).join('；') + (bad.length > 8 ? ` …另 ${bad.length - 8} 处` : ''));
});

t('存档外键：player_skills 的 skill_id 都在技能库里', () => {
  const bad = (db.player_skills || []).filter((r) => !skillIds.has(r.skill_id));
  if (bad.length) throw new Error(bad.slice(0, 5).map((r) => `char=${r.character_id} skill=${r.skill_id}`).join('；'));
});

console.log('');
console.log(`内容完整性: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
