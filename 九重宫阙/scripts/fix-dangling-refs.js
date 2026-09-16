/**
 * P7 悬空引用修补（轮103）
 *
 * dedupe-items 合并「火灵草 #59 → #536」时，漏掉了 dungeons.rewards.items 里的引用，
 * 结果副本 39/60 的奖励指着已删除的 #59（玩家通关拿不到东西，或直接报错）。
 * 本脚本按"已删除 id → 保留 id"的映射，把全库残留引用一次性扫干净。
 *
 * 与 dedupe-items 的区别：dedupe 是"边合并边改指"，本脚本是"事后全库补扫"，
 * 覆盖 dungeons.rewards / announcements / achievements 等 dedupe 没走到的集合。
 *
 * 用法：node scripts/fix-dangling-refs.js [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase, saveDatabase } = require(path.join(ROOT, 'src', 'database'));

/** 已执行的合并映射：删除的 id → 保留的 id */
const REDIRECT = {
  59: 536,   // 火灵草（冗余件）
  51: 45,    // 新手礼包
  49: 55,    // 传音符
  50: 56     // 回城符
};

const db = loadDatabase();
const items = db.items || [];
const liveIds = new Set(items.map((i) => Number(i.id)));
const parseMaybe = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } } return v; };

let touchedTotal = 0;

/**
 * 递归把已删 id 换成保留 id；返回是否改动。
 *
 * ⚠ 轮103 事故：初版对**任何** JSON 值都递归改写，于是 monsters.level_range = [46,55]
 *   里的 55 撞上"回城符 #50→#56"之类的映射时会被误改（实测把雷泽蛟龙改成 Lv46-55 越出地图、
 *   把金光法相改成 [536,62]）。等级数组里的数字**不是物品引用**，必须挡在外面。
 *
 * 现在三重防线：
 *   ① 只认语义外键名的数字字段（item_id/result/... ）；
 *   ② 值域闸：物品 id 只可能是 items 表里出现过的数字，其它一律不碰；
 *   ③ 字段名黑名单：level_range / stats / materials 的纯数字数组不递归。
 */
const NON_ITEM_FIELDS = new Set(['level_range', 'stats', 'drops_raw', 'coords', 'position']);
const ITEM_ID_MIN = 1;
const ITEM_ID_MAX = 100000;

function rewrite(node, keyHint) {
  let touched = false;
  // 字段在黑名单里 → 整个子树不动
  if (keyHint && NON_ITEM_FIELDS.has(keyHint)) return false;

  if (Array.isArray(node)) {
    // 纯数字数组（如 level_range）不当作物品引用列表
    const allNumbers = node.every((x) => typeof x === 'number');
    if (allNumbers) return false;
    for (let i = 0; i < node.length; i++) {
      const x = node[i];
      if (x && typeof x === 'object') { if (rewrite(x, keyHint)) touched = true; }
    }
    return touched;
  }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (NON_ITEM_FIELDS.has(k)) continue;
      const isItemKey = /^(item_id|itemId|result|result_id|output|output_id)$/.test(k);
      if (isItemKey && typeof v === 'number' && REDIRECT[v] !== undefined
          && v >= ITEM_ID_MIN && v <= ITEM_ID_MAX) {
        if (!DRY) node[k] = REDIRECT[v];
        touched = true; touchedTotal++;
      } else if (isItemKey && Array.isArray(v)) {
        // rewards: { items: [ {item_id} ] } 这类
        for (let i = 0; i < v.length; i++) {
          const x = v[i];
          if (typeof x === 'number' && REDIRECT[x] !== undefined) { if (!DRY) v[i] = REDIRECT[x]; touched = true; touchedTotal++; }
          else if (x && typeof x === 'object') { if (rewrite(x, k)) touched = true; }
        }
      } else if (v && typeof v === 'object') {
        if (rewrite(v, k)) touched = true;
      }
    }
    return touched;
  }
  return false;
}

// 扫所有"内容类"集合（玩家数据不动）
const SKIP = new Set(['characters', 'users', 'inventory', 'equipments', 'player_skills', 'guilds', 'guild_members', 'checkin', 'character_buffs']);
for (const table of Object.keys(db)) {
  if (!Array.isArray(db[table]) || SKIP.has(table)) continue;
  if (table === 'items') continue;   // 物品表本身由 dedupe 管
  for (const row of db[table]) {
    // 只对可能含引用的字段做解析式改写
    for (const key of Object.keys(row)) {
      const v = row[key];
      if (typeof v === 'string' && /^[[{]/.test(v.trim())) {
        const parsed = parseMaybe(v);
        if (rewrite(parsed)) { if (!DRY) row[key] = JSON.stringify(parsed); console.log(`  改 ${table}.${key} (id=${row.id})`); }
      } else if (Array.isArray(v) || (v && typeof v === 'object')) {
        if (rewrite(v)) console.log(`  改 ${table}.${key} (id=${row.id})`);
      }
    }
  }
}

// 顺带报出仍存在的悬空（对不上任何在用物品的引用）
const stillDangling = [];
const checkRefs = (node, ctx) => {
  if (Array.isArray(node)) { node.forEach((x) => checkRefs(x, ctx)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (/^(item_id|itemId)$/.test(k) && Number(v) > 0 && !liveIds.has(Number(v))) stillDangling.push(`${ctx} → #${v}`);
      else checkRefs(v, ctx);
    }
  }
};
for (const d of (db.dungeons || [])) {
  for (const key of ['rewards', 'reward_items']) if (d[key]) checkRefs(parseMaybe(d[key]), `副本${d.id} ${d.name}.${key}`);
}

if (!DRY && touchedTotal) saveDatabase(db);

// ---- 事后自查：等级区间必须仍在地图区间内（挡住"误改等级数组"这类事故）----
const mapById = new Map((db.maps || []).map((m) => [Number(m.id), m]));
const badRange = [];
for (const mo of (db.monsters || [])) {
  let r = mo.level_range;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { continue; } }
  if (!Array.isArray(r) || r.length < 2) continue;
  const [lo, hi] = r.map(Number);
  const mm = mapById.get(Number(mo.map_id));
  if (!mm) continue;
  const ML = Number(mm.min_level || 0), MH = Number(mm.max_level || 999);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi || hi > MH + 3 || lo < ML - 3) {
    badRange.push(`${mo.name}(id=${mo.id}) Lv${lo}-${hi} vs 图${mm.name}(Lv${ML}-${MH})`);
  }
}
if (badRange.length) {
  console.log(`\n❌ 事后自查失败：${badRange.length} 只怪的等级区间不合法（本脚本误改了非物品字段？）`);
  badRange.slice(0, 8).forEach((s) => console.log('   ' + s));
  process.exitCode = 1;
} else {
  console.log('\n✅ 事后自查：全部怪的等级区间仍在所属地图区间内');
}

console.log(`\n${DRY ? '[演练] ' : ''}改指引用 ${touchedTotal} 处`);
console.log(`副本奖励仍悬空：${stillDangling.length}${stillDangling.length ? ' → ' + stillDangling.join('; ') : ''}`);
