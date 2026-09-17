/**
 * G20 · 同一行上的同义字段共现（轮115 立）。
 *
 * ## 存在理由
 *
 * 轮113/114/115 一路试了三种"找断链"的判据，前两种都因误报被推翻：
 *
 * | 判据 | 误报来源 | 实测误报 |
 * |---|---|---|
 * | 变量名扫描（`pet.is_active`） | 同一对象有无数别名 | `p.is_active` 有 8 处消费端却报死 |
 * | 字段名相似度（`isAdmin`/`is_admin`） | 不同对象恰好同名 | `req.isAdmin` vs `user.is_admin` 本就该并存 |
 * | **同一行共现**（本套件） | — | 收紧外键前缀规则后为 0 |
 *
 * 第三种是唯一没有误报的：**同一行数据上同时存在两个疑似同义的键**，
 * 才是"同一个事实有两个代言人"。这是数据事实，既不受别名影响，
 * 也不受"不同对象恰好同名"影响。
 *
 * 该判据在实测存档上精准命中 4 组（都在 `characters` 的 2 行上）：
 * `hp_max‖max_hp`、`mp_max‖max_mp`、`maxHp‖max_hp`、`maxMp‖max_mp` ——
 * 正是轮114 发现"三处血量上限不一致"的那两行。
 *
 * ## 判据
 *
 * - 已知的 4 组共现**只减不增**（清理掉一组就在白名单里删一组）
 * - 白名单外的任何新增共现都要红 —— 强迫加字段的人先想清楚是不是重复概念
 * - 嵌套字段（如 `stats.mood`）也要覆盖：那是轮113 真断链的形态
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g20-dup-'));
process.env.DSH_DATA_DIR = TMP;
require('./lib/boot-parity').bootParity({ quiet: true });

const { loadDatabase, saveDatabase } = require('../src/database');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

console.log('== G20 · 同一行上的同义字段共现 ==');

/** 同义判定（保守：宁漏报，不误报） */
const FK_SUFFIX = new Set(['id', 'ids', 'key', 'name', 'at', 'time']);
function sameSynonym(a, b) {
  if (a === b) return false;
  // ① camel ↔ snake 同形
  const aSnake = a.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  const bSnake = b.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  if (aSnake === bSnake) return true;
  // ② X_max ↔ max_X
  const m1 = a.match(/^(.+)_max$/); if (m1 && b === 'max_' + m1[1]) return true;
  const m2 = b.match(/^(.+)_max$/); if (m2 && a === 'max_' + m2[1]) return true;
  // ③ 前缀式同义 —— 但外键名（id/key/name/at…）不算：
  //    `character_id` 是指向主键的外键，与 `id` 本就该并存
  for (const pre of ['sect_', 'guild_', 'pet_', 'cave_', 'character_', 'player_']) {
    if (a === pre + b || b === pre + a) {
      const base = a.startsWith(pre) ? b : a;
      if (!FK_SUFFIX.has(base)) return true;
    }
  }
  return false;
}

/** 找出所有"同一行/同一对象上共现的同义键"（含嵌套一层） */
function scan(db) {
  const found = [];
  const checkObj = (obj, where, depth) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (sameSynonym(keys[i], keys[j])) {
          found.push({ where, a: keys[i], b: keys[j], nested: depth > 0 });
        }
      }
    }
    if (depth < 1) {
      for (const k of keys) {
        if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
          checkObj(obj[k], where + '.' + k, depth + 1);
        }
      }
    }
  };
  for (const [name, v] of Object.entries(db)) {
    if (/^col_/.test(name)) continue;
    if (Array.isArray(v)) {
      for (const row of v.slice(0, 200)) {
        if (row && typeof row === 'object') checkObj(row, name, 0);
      }
    } else if (v && typeof v === 'object') {
      checkObj(v, name, 0);
    }
  }
  return found;
}

/**
 * 已知共现白名单（只减不增）。
 *
 * 每一条都必须有**处置结论**，不能只是"知道了"：
 *   · `hp_max` / `mp_max` —— 遗留字段，只有 2/32 角色持有；真源是 `max_hp`/`max_mp`；
 *     暂不删（在那 2 行上可能与旧代码兼容），但要随轮次清理。
 *   · `maxHp` / `maxMp` —— 轮115 已由 `healCharacterFields` **清理**。
 *     保留在这里是因为**旧存档再被读入时可能再次出现**（比如从旧备份恢复），
 *     自愈会再清一次。若确认永不复现，可从此表删除。
 */
const KNOWN = new Set([
  'characters:hp_max|max_hp',
  'characters:max_mp|mp_max',
  'characters:maxHp|max_hp',
  'characters:maxMp|max_mp'
]);

const key = (f) => `${f.where}:${[f.a, f.b].sort().join('|')}`;

// 种入与实测存档同形态的两行（自愈已在启动时跑过，这里直接写库模拟"刚从旧备份恢复"）
(function seedKnownRows() {
  const db = loadDatabase();
  db.characters = (db.characters || []).filter((c) => Number(c.id) !== 800001 && Number(c.id) !== 800002);
  db.characters.push({
    id: 800001, user_id: 800001, name: '旧档甲', faction: 'martial',
    realm: '炼气', level: 1, exp: 0, hp: 100, mp: 50, max_hp: 100, max_mp: 50,
    hp_max: 100, mp_max: 50, exp_max: 100, sect_contribution: 0,
    maxHp: 120, maxMp: 60
  });
  db.characters.push({
    id: 800002, user_id: 800002, name: '旧档乙', faction: 'martial',
    realm: '炼气', level: 1, exp: 0, hp: 100, mp: 50, max_hp: 100, max_mp: 50,
    hp_max: 100, mp_max: 50, exp_max: 100, sect_contribution: 0,
    maxHp: 120, maxMp: 60
  });
  saveDatabase(db);
})();

t('实测存档里没有白名单之外的同义字段共现', () => {
  const found = scan(loadDatabase());
  const unknown = found.filter((f) => !KNOWN.has(key(f)));
  assert.deepStrictEqual(unknown.map(key), [],
    '出现新的同义字段共现 —— 同一个事实有了两个代言人。\n'
    + '这类问题在轮113（mood 双表示）和轮114（血量上限三源）都造成过真断链。\n'
    + '请先确认这不是重复概念；若确属历史残留，在处理后加进 KNOWN 白名单。\n'
    + '新增：\n      ' + unknown.map((f) => key(f) + (f.nested ? ' （嵌套）' : '')).join('\n      '));
});

t('已知的 4 组共现都在 characters 上（形态与轮114 一致，不是别的集合）', () => {
  const found = scan(loadDatabase()).filter((f) => KNOWN.has(key(f)));
  assert.ok(found.length > 0, '一组共现都没扫到 —— 扫描器坏了');
  for (const f of found) {
    assert.strictEqual(f.where, 'characters',
      `已知共现出现在 ${f.where} 而不是 characters —— 形态变了，需重新核实`);
  }
});

t('嵌套对象里的同义键也会被扫到', () => {
  // 注意：`mood` 与 `stats.mood` 是**同名不同层**，不是 snake/camel 变体 ——
  // 轮113 那条断链的识别不能靠本判据（它靠的是"战斗读的字段全档 0 处存在"）。
  // 本判据管的是**同一对象内**的同义键，嵌套只是为了覆盖 `stats: { max_hp, hp_max }`
  // 这种"真源与残留都藏在子对象里"的形态。
  const fake = { characters: [{ id: 1, stats: { max_hp: 100, hp_max: 100 } }] };
  const found = scan(fake);
  assert.ok(found.some((f) => f.nested && f.where === 'characters.stats'),
    '嵌套对象内的同义键没被扫到 —— 真源与残留都藏在子对象里时会漏报：'
    + JSON.stringify(found));
});

t('外键名不被误报（character_id 与 id 本就该并存）', () => {
  const fake = { inventory: [{ id: 1, character_id: 2, item_id: 3 }] };
  const found = scan(fake);
  assert.deepStrictEqual(found, [],
    '外键名被误判成同义字段 —— 这类误报会让门禁被绕过：\n      '
    + found.map(key).join('\n      '));
});

t('不同对象上的同名字段不被误报（req.isAdmin vs user.is_admin）', () => {
  // 两种角色行，各自字段集自洽，不应互相比对
  const fake = {
    users: [{ id: 1, is_admin: 1 }],
    requests: [{ id: 1, isAdmin: true }]
  };
  const found = scan(fake);
  assert.deepStrictEqual(found, [],
    '跨对象比对产生了误报 —— 本判据的核心价值就是排除这种误报，'
    + '退化了就与"字段名相似度"没区别了：\n      ' + found.map(key).join('\n      '));
});

console.log('');
console.log(`G20 同义共现: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
