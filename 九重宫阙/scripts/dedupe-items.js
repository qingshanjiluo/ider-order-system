/**
 * P7 数据去重（轮103）：清掉 8 组同类重名物品
 *
 * 病因：物品表由多轮追加生成，两批内容撞了名字。危害是"按名引用"的系统
 *   （怪物掉落表、图纸 materials、坊市文案）会指向其中一件，另一件成为幽灵，
 *   玩家看到"火灵草"却炼不出东西时无法判断是 bug 还是自己拿错了。
 *
 * 分三类处理（依据 _dup-report 的引用次数与品质差异）：
 *   A 纯冗余（描述相同、仅 id 不同）：保留被引用多的，把少的引用改指过去，再删除少的。
 *   B 同名不同档（功法品质不同，是两门功法）：不合并 —— 改名字让两门都能存在。
 *   C 同名不同效（造化丹：一增属性一重置装备）：改名字区分用途。
 *
 * 幂等：处理过的组不会再次命中（重名检测在改动后再跑应为 0）。
 * 用法：node scripts/dedupe-items.js [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase } = require(path.join(ROOT, 'src', 'database'));

// A 类：合并（keep 保留，drop 的引用全部改指 keep，然后删除 drop）
const MERGE = [
  { name: '火灵草', keep: 536, drop: 59 },
  { name: '新手礼包', keep: 45, drop: 51 },
  { name: '传音符', keep: 55, drop: 49 },
  { name: '回城符', keep: 56, drop: 50 }
];

// B/C 类：改名（改名后两件共存，语义不再歧义）
const RENAME = [
  { id: 5, from: '青云剑诀', to: '青云剑诀·入门', why: '与 #628 同名，品质同为玄阶但描述不同（这是入门篇，628 是进阶篇）' },
  { id: 628, from: '青云剑诀', to: '青云剑诀·进阶', why: '与 #5 同名，本件描述明写「进阶功法」，改名为进阶篇' },
  { id: 22, from: '混沌诀', to: '混沌诀·圣阶', why: '与 #637 同名，本件圣阶（637 为地阶），档位不同应区分' },
  { id: 23, from: '造化功', to: '造化功·仙阶', why: '与 #644 同名，本件仙阶（644 为天阶），档位不同应区分' },
  { id: 317, from: '造化丹', to: '造化丹·增元', why: '与 #333 同名但功效不同（本件全属性+50%，333 重置装备品质）' },
  { id: 333, from: '造化丹', to: '造化丹·洗炼', why: '与 #317 同名但功效不同（本件重置装备品质）' }
];

const db = loadDatabase();
const items = db.items || [];
const byId = new Map(items.map((i) => [Number(i.id), i]));

const parseMaybe = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };
const stringifyLike = (orig, val) => (typeof orig === 'string' ? JSON.stringify(val) : val);

let merged = 0, renamed = 0, refs = 0;

// ---- A 类：合并引用 + 删除多余件 ----
for (const { name, keep, drop } of MERGE) {
  const k = byId.get(keep), d = byId.get(drop);
  if (!k || !d) { console.log(`  ⚠ 合并组「${name}」缺件（keep=${!!k} drop=${!!d}），跳过`); continue; }
  if (k.name !== name || d.name !== name) { console.log(`  ⚠ 合并组「${name}」名字已变（#${keep}=${k.name} #${drop}=${d.name}），跳过`); continue; }

  // 坊市
  for (const s of (db.shop || [])) {
    if (Number(s.item_id) === drop) { if (!DRY) s.item_id = keep; refs++; }
  }
  // 怪物掉落
  for (const mo of (db.monsters || [])) {
    const arr = parseMaybe(mo.drops);
    if (!Array.isArray(arr)) continue;
    let touched = false;
    for (const x of arr) {
      if (x && typeof x === 'object' && Number(x.item_id || x.id) === drop) { if (!DRY) { x.item_id = keep; x.name = name; } touched = true; refs++; }
    }
    if (touched && !DRY) mo.drops = stringifyLike(mo.drops, arr);
  }
  // 配方材料（数字或对象）
  for (const r of [...(db.recipes || []), ...(db.forge_recipes || [])]) {
    const mats = parseMaybe(r.materials);
    if (!Array.isArray(mats)) continue;
    let touched = false;
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (typeof m === 'number' && m === drop) { if (!DRY) mats[i] = keep; touched = true; refs++; }
      else if (m && typeof m === 'object' && Number(m.item_id || m.id) === drop) { if (!DRY) m.item_id = keep; touched = true; refs++; }
    }
    if (touched && !DRY) r.materials = stringifyLike(r.materials, mats);
  }
  // 副本奖励（rewards.items / reward_items）
  for (const d of (db.dungeons || [])) {
    for (const key of ['rewards', 'reward_items']) {
      if (!d[key]) continue;
      const v = parseMaybe(d[key]);
      let touched = false;
      const walk = (node) => {
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i++) {
            const x = node[i];
            if (typeof x === 'number' && x === drop) { if (!DRY) node[i] = keep; touched = true; refs++; }
            else if (x && typeof x === 'object') {
              if (Number(x.item_id || x.id) === drop) { if (!DRY) { if (x.item_id !== undefined) x.item_id = keep; else x.id = keep; } touched = true; refs++; }
              else walk(x);
            }
          }
        } else if (node && typeof node === 'object') {
          for (const [k, val] of Object.entries(node)) {
            if (Array.isArray(val)) walk(val);
            else if (k === 'items' || k.endsWith('_items')) walk(val);
          }
        }
      };
      walk(v);
      if (touched && !DRY) d[key] = stringifyLike(d[key], v);
    }
  }
  // 玩家背包/装备（把已存在的 drop 实例换成 keep）
  for (const inv of (db.inventory || [])) if (Number(inv.item_id) === drop) { if (!DRY) inv.item_id = keep; refs++; }

  if (!DRY) {
    const ix = items.indexOf(d);
    if (ix >= 0) items.splice(ix, 1);
  }
  merged++;
  console.log(`  ⊕ 合并「${name}」：#${drop} → #${keep}（引用改指 ${refs} 处，删冗余件）`);
}

// ---- B/C 类：改名 ----
for (const { id, from, to } of RENAME) {
  const it = byId.get(id);
  if (!it) { console.log(`  ⚠ 改名目标 #${id} 不存在，跳过`); continue; }
  if (it.name !== from) { console.log(`  ⚠ #${id} 名字已是「${it.name}」（期望「${from}」），跳过`); continue; }
  // 目标名不能已被占用
  if (items.some((x) => x.name === to && Number(x.id) !== id)) { console.log(`  ⚠ 目标名「${to}」已被占用，跳过 #${id}`); continue; }
  if (!DRY) it.name = to;
  renamed++;
  console.log(`  ✎ #${id} 「${from}」→「${to}」`);
}

if (!DRY) saveDatabase(db);

console.log(`\n${DRY ? '[演练] ' : ''}合并 ${merged} 组（改指 ${refs} 处引用），改名 ${renamed} 件`);
console.log('复跑检测：node scripts/test-gameplay-loop.js');
