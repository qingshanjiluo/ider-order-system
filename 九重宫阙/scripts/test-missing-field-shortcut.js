/**
 * G21 · 缺失字段不得变成捷径（轮116 立）。
 *
 * ## 存在理由
 *
 * 轮114 给老存档做字段自愈时，刻意**没补** `exp_to_next`（因为 `G3 经验真源`
 * 要求它的赋值点只出现在真源文件内）。自愈因此留下一条尾巴：
 * 角色 2「最中幻想」的 `exp_to_next` 仍是 `undefined`。
 *
 * 我当时判断"缺失没有功能影响"（升级时会重算）。**这个判断是错的。**
 * 实测：
 *
 *     角色 2 缺 exp_to_next
 *       → services/character.js:54 读 `character.exp_to_next || 100`
 *       → 真实需求 130994 被当成 100
 *       → **喂 100 修为就从 1 级升到 2 级**
 *
 * 差 **1310 倍**，且不报错、不留日志 —— 一个缺失字段直接变成一条越级捷径。
 *
 * ## 这条断言锁住的东西（可推广）
 *
 * **"兜底值"和"真值"必须在同一量级，否则兜底就是漏洞。**
 * 代码里 `x || 某常数` 的写法到处都是；只要那个常数比真值小几个数量级，
 * 字段一旦缺失就等价于给玩家发了个特权。
 *
 * 而 `exp_to_next` 的正确兜底方式是**就地取真源**（`calculateExpForLevel`
 * 本来就在同一个文件里，升级循环第 57 行也在用它）—— 缺失时现算，
 * 而不是编一个数。
 *
 * ## 判据
 *
 * - 缺 `exp_to_next` 的角色，喂**兜底值**（100）不得升级
 * - 喂**真源需求**（130994）必须升级 —— 证明不是"干脆不升级了"
 * - 升级后 `exp_to_next` 是真源算出的下一级需求，不是 100
 * - 缺失被**就地补齐**，且补齐值等于真源
 * - 正式存档零侧写
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g21-shortcut-'));
process.env.DSH_DATA_DIR = TMP;
require('./lib/boot-parity').bootParity({ quiet: true });

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const { loadDatabase, saveDatabase } = require('../src/database');
const charSvc = require('../src/services/character');
const expCurve = require('../src/services/exp-curve');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

console.log('== G21 · 缺失字段不得变成捷径 ==');

const CID = 910001;
function seedMissingExp() {
  const db = loadDatabase();
  db.characters = (db.characters || []).filter((c) => Number(c.id) !== CID);
  db.characters.push({
    id: CID, user_id: CID, name: '缺经验需求', faction: 'martial',
    realm: '炼气', realm_stage: 1, level: 1, exp: 0,
    hp: 110, mp: 55, max_hp: 110, max_mp: 55
    // 故意不给 exp_to_next —— 与存档实测的角色 2 同形态
  });
  saveDatabase(db);
}
const get = () => loadDatabase().characters.find((c) => Number(c.id) === CID);

const realmRow = () => (loadDatabase().realms || []).find((r) => r.name === '炼气');
const TRUE_NEED = expCurve.needForLevel(realmRow(), 1);
const OLD_FALLBACK = 100;      // 修复前代码里的 `|| 100`

t('前提：真源需求与旧兜底值差 3 个数量级（否则本套件没意义）', () => {
  assert.ok(Number.isFinite(TRUE_NEED) && TRUE_NEED > 0, 'needForLevel 返回 ' + TRUE_NEED);
  assert.ok(TRUE_NEED / OLD_FALLBACK > 100,
    `真源 ${TRUE_NEED} 与兜底 ${OLD_FALLBACK} 差距不够大，测不出问题`);
});

t('缺 exp_to_next 时，喂旧兜底值（100）**不得**升级', () => {
  seedMissingExp();
  assert.strictEqual(get().exp_to_next, undefined, '前提：应当缺 exp_to_next');
  charSvc.addExp(CID, OLD_FALLBACK);
  const c = get();
  assert.strictEqual(c.level, 1,
    `只喂 ${OLD_FALLBACK} 修为就升到了 ${c.level} 级 —— 真需求是 ${TRUE_NEED}，`
    + '`|| 100` 兜底把缺失字段变成了越级捷径');
});

t('缺 exp_to_next 时，喂真源需求必须升级（证明不是"干脆不升级"）', () => {
  seedMissingExp();
  charSvc.addExp(CID, TRUE_NEED);
  const c = get();
  assert.ok(c.level > 1,
    `喂了真源需求 ${TRUE_NEED} 却没升级（level=${c.level}）—— 修复过头了，`
    + '把"不该升级"变成了"永远升不了级"');
});

t('缺失被就地补齐，且补齐值等于真源', () => {
  seedMissingExp();
  charSvc.addExp(CID, 1);          // 喂一点点，只为触发结算路径
  const c = get();
  assert.strictEqual(c.exp_to_next, TRUE_NEED,
    `exp_to_next 应被补成真源 ${TRUE_NEED}，实际 ${c.exp_to_next}`);
});

t('升级后 exp_to_next 是**下一级**的真源需求（不是 100、不是上一级的值）', () => {
  seedMissingExp();
  charSvc.addExp(CID, TRUE_NEED);
  const c = get();
  const expectNext = expCurve.needForLevel(realmRow(), c.level);
  assert.ok(Number.isFinite(expectNext) && expectNext > 0,
    '下一级真源需求缺失：' + expectNext);
  assert.strictEqual(c.exp_to_next, expectNext,
    `2 级的 exp_to_next 应为 ${expectNext}，实际 ${c.exp_to_next}`);
  assert.notStrictEqual(c.exp_to_next, OLD_FALLBACK, 'exp_to_next 又变成了兜底值 100');
});

t('源码级反证：升级循环里不得再出现 exp_to_next 的数值兜底', () => {
  // 这是**防回流**断言：修复本身可能被后人"简化"回去。
  //
  // 判据要精确：**排除 `|| 0`**。`character.exp -= (character.exp_to_next || 0)`
  // 里的 0 是"减不下去就别减"的空操作保护，不会把需求变小；
  // 而 `|| 100`、`|| 1` 这类**非零**常数会被当成真实需求，才是漏洞。
  // （这一版先被自己的粗糙正则抓了一次红 —— 判据过宽同样是缺陷。）
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'character.js'), 'utf8');
  const bad = [...src.matchAll(/exp_to_next\s*\|\|\s*(\d+)/g)]
    .map((m) => m[1])
    .filter((v) => Number(v) !== 0);
  assert.deepStrictEqual(bad, [],
    '升级路径又用非零数字兜底 exp_to_next 了（' + bad.join(', ') + '）—— '
    + '真源一直在同一个文件里，缺失时应当现算，不该编一个数');
});

const liveAfter = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;
t('正式存档零侧写（体积+mtime 双检）', () => {
  if (liveBefore && liveAfter) {
    assert.strictEqual(liveAfter.size, liveBefore.size, '正式档体积变了');
    assert.strictEqual(liveAfter.mtimeMs, liveBefore.mtimeMs, '正式档 mtime 变了');
  }
});

console.log('');
console.log(`G21 缺失字段捷径: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
