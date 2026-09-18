/**
 * G19 · 老存档字段自愈（轮114 立）。
 *
 * ## 存在理由
 *
 * 轮114 用"存档字段驱动"的扫描器找到 4 个真死字段
 *（`hp_max`/`mp_max`/`exp_max`/`sect_contribution`，都只有 2/32 个角色持有）。
 * 深查时发现更严重的问题不是这些死字段本身，而是**它们为什么不能删**：
 *
 *     角色 2「最中幻想」缺 `max_hp`/`max_mp`/`exp_to_next`
 *         · 它是更早期版本创建的角色
 *         · `auth.js` 的新建路径字段齐全，但只在"新建时"执行
 *         · `services/character.js` 的升级路径只在"升了一级"时才算这些值
 *         · **没有任何路径会给一个 level 1 的老角色补齐**
 *         · 于是旧字段 `hp_max=100`/`mp_max=50` 成了它唯一的上限来源
 *
 * 后果不是一个崩溃，而是**同一个概念在三个地方给出三个值**：
 *
 *     存档 hp=120 · 战斗 getEntity 算出 maxHp=144 · calculateHpMax(1,炼气)=110
 *
 * 每处靠各自的兜底（`character.max_hp || 100`）苟活，玩家看到的血条上限
 * 取决于哪段代码先说话。**这类"沉默的数据漂移"不会报错，只会让数值对不上账。**
 *
 * ## 判据
 *
 * - 缺真源字段的老角色，在 boot 后必须被补齐，且**数值与服务层同源**
 * - 补齐后 hp/mp **必须收敛**到新上限（老档可能带着超上限的血）
 * - **幂等**：已有值一律不动，第二次自愈报告 0 个补齐
 * - 旧字段**保留不删**（可能与别处兼容读取）
 * - 补出来的值必须让战斗可用（maxHp > 0，不因缺失而算成 0）
 * - 正式存档零侧写
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g19-heal-'));
process.env.DSH_DATA_DIR = TMP;
require('./lib/boot-parity').bootParity({ quiet: true });

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const store = require('../src/db/store');
const { loadDatabase, saveDatabase } = require('../src/database');
const combat = require('../src/services/battle/combat');
const charSvc = require('../src/services/character');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

console.log('== G19 · 老存档字段自愈 ==');

/** 造一个"缺真源的老角色"，与存档实测的角色 2 同形态 */
const LEGACY_ID = 990001;
function seedLegacyChar(over) {
  const db = loadDatabase();
  db.characters = (db.characters || []).filter((c) => Number(c.id) !== LEGACY_ID);
  db.characters.push(Object.assign({
    id: LEGACY_ID, user_id: LEGACY_ID, name: '老档角色', faction: 'martial',
    realm: '炼气', realm_stage: 1, level: 1, exp: 0,
    hp: 120, mp: 60,                                  // 高于即将补出的上限
    hp_max: 100, mp_max: 50, exp_max: 100, sect_contribution: 0,   // 旧字段
    spirit_stone: 100
    // 故意不给 max_hp / max_mp / exp_to_next
  }, over || {}));
  saveDatabase(db);
}

const get = () => loadDatabase().characters.find((c) => Number(c.id) === LEGACY_ID);
const EXPECT_HP = charSvc.calculateHpMax(1, '炼气');
const EXPECT_MP = charSvc.calculateMpMax(1, '炼气');

t('前提：服务层确实能算出上限（否则本套件没意义）', () => {
  assert.ok(Number.isFinite(EXPECT_HP) && EXPECT_HP > 0, 'calculateHpMax 返回 ' + EXPECT_HP);
  assert.ok(Number.isFinite(EXPECT_MP) && EXPECT_MP > 0, 'calculateMpMax 返回 ' + EXPECT_MP);
});

t('自愈补齐缺失的属性上限，且数值与服务层同源', () => {
  seedLegacyChar();
  assert.strictEqual(get().max_hp, undefined, '前提：造的角色应当缺 max_hp');
  const healed = store.healCharacterFields(loadDatabase());
  const c = get();
  assert.strictEqual(c.max_hp, EXPECT_HP, `max_hp 应补为 ${EXPECT_HP}，实际 ${c.max_hp}`);
  assert.strictEqual(c.max_mp, EXPECT_MP, `max_mp 应补为 ${EXPECT_MP}，实际 ${c.max_mp}`);
  assert.strictEqual(healed, 2, `应报告补齐 2 个属性上限，实际 ${healed}`);
});

t('自愈**不得**碰 exp_to_next（经验真源唯一，G3 锁的要求）', () => {
  // 第一版自愈补了 exp_to_next，被 `G3 经验真源` 抓红 ——
  // `test-exp-curve-e2e.js` 要求 exp_to_next 的赋值点只出现在
  // character.js / exp-curve.js / auth.js / gameTime.js / realm.js。
  // 那条锁是对的：经验曲线一旦有第二个写入点，就会分叉出"两处算出不同升级需求"。
  // 这条断言把"自愈不越权"钉住，防止以后有人图省事又加回来。
  seedLegacyChar({ exp_to_next: undefined });
  store.healCharacterFields(loadDatabase());
  assert.strictEqual(get().exp_to_next, undefined,
    'store.js 的自愈补了 exp_to_next —— 那是第二经验真源，必须由 characterService.addExp 路径负责');

  // 同时做源码级反证：自愈函数体内不得出现 exp_to_next 赋值
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'store.js'), 'utf8');
  const fnStart = src.indexOf('function healCharacterFields');
  assert.ok(fnStart > 0, '找不到 healCharacterFields');
  const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart));
  assert.ok(!/exp_to_next\s*=/.test(fnBody),
    'healCharacterFields 里出现了 exp_to_next 赋值 —— 会造出第二经验真源');
});

t('补齐后 hp/mp 收敛到新上限（老档可能带着超上限的血）', () => {
  seedLegacyChar();
  store.healCharacterFields(loadDatabase());
  const c = get();
  assert.strictEqual(c.hp, EXPECT_HP, `hp 应从 120 收敛到 ${EXPECT_HP}，实际 ${c.hp}`);
  assert.strictEqual(c.mp, EXPECT_MP, `mp 应从 60 收敛到 ${EXPECT_MP}，实际 ${c.mp}`);
});

t('已有值一律不动（自愈只补缺失，不覆盖）', () => {
  seedLegacyChar({ max_hp: 7777, max_mp: 8888 });
  store.healCharacterFields(loadDatabase());
  const c = get();
  assert.strictEqual(c.max_hp, 7777, 'max_hp 已有值被覆盖成 ' + c.max_hp);
  assert.strictEqual(c.max_mp, 8888, 'max_mp 已有值被覆盖成 ' + c.max_mp);
});

t('幂等：第二次自愈报告 0 个补齐，且不改变任何值', () => {
  seedLegacyChar();
  store.healCharacterFields(loadDatabase());
  const snap1 = JSON.stringify(get());
  const healed2 = store.healCharacterFields(loadDatabase());
  assert.strictEqual(healed2, 0, `第二次应补 0 个，实际 ${healed2}`);
  assert.strictEqual(JSON.stringify(get()), snap1, '第二次自愈改变了已有值');
});

t('旧字段已按轮116 结论清理（轮114 的"保留"假设被推翻）', () => {
  // 轮114 这里断言的是 **"旧字段保留不删"**，理由是"可能与别处兼容读取"。
  // 轮116 逐个核实了每个同名出现点挂在哪之后，那条理由不成立：
  //
  //   · `hp_max`/`mp_max`/`exp_max` —— 真源是 max_hp/max_mp/exp_to_next（32/32 持有），
  //     而 `src/routes/battle.js:57` 那处 `{ hp_max: ... }` 是**机会记录器自己的字段**，
  //     不同对象，与本清理解耦。
  //   · `sect_contribution` —— 宗门贡献真源是关系表 `sect_members.contribution`。
  //   · 四个字段的值实测全是出厂默认值（hp_max=100 mp_max=50 exp_max=100
  //     sect_contribution=0），即**不是玩家积累的数据**，删掉不丢东西。
  //
  // 所以断言改为**反向**：清理必须真的发生。
  // 注意这不是"削弱门禁" —— 它把"保留"这条被证伪的假设换成了"清理"这条有证据的结论，
  // 且同时保留了下一条断言（真源缺失时不得删）作为安全边界。
  seedLegacyChar();
  store.healCharacterFields(loadDatabase());
  const c = get();
  assert.strictEqual(c.hp_max, undefined, 'hp_max 残留应被清理，实际还是 ' + c.hp_max);
  assert.strictEqual(c.mp_max, undefined, 'mp_max 残留应被清理，实际还是 ' + c.mp_max);
  assert.strictEqual(c.sect_contribution, undefined,
    'sect_contribution 残留应被清理，实际还是 ' + c.sect_contribution);
  // 真源必须还在 —— 清理的代价不能是"角色失去上限"
  assert.ok(Number(c.max_hp) > 0, '清理后 max_hp 真源丢失了');
  assert.ok(Number(c.max_mp) > 0, '清理后 max_mp 真源丢失了');
});

t('exp_max 在真源缺失时保留（宁可留脏，不可留空）', () => {
  // 与 maxHp 同一条安全边界：`exp_max` 只在 `exp_to_next` 存在时才可删。
  // 存档实测的角色 2 就是这样 —— 它缺 exp_to_next，于是 exp_max 被保留下来。
  seedLegacyChar();                       // 这个角色造出来时就没有 exp_to_next
  store.healCharacterFields(loadDatabase());
  const c = get();
  if (c.exp_to_next == null) {
    assert.strictEqual(c.exp_max, 100,
      'exp_to_next 缺失时不该删 exp_max —— 那会把"数值不一致"变成"数值为空"');
  }
});

t('补齐后战斗可用（maxHp > 0，不因真源缺失而算成 0）', () => {
  seedLegacyChar();
  store.healCharacterFields(loadDatabase());
  const e = combat.getEntity(LEGACY_ID, 'character');
  assert.ok(Number(e.maxHp) > 0, '战斗 maxHp 为 ' + e.maxHp);
  assert.ok(Number(e.hp) <= Number(e.maxHp), `战斗 hp ${e.hp} 超过 maxHp ${e.maxHp}`);
});

t('残留 camelCase 上限被清理（maxHp/maxMp 在角色行上是历史残留）', () => {
  // 存档实测：角色 1/2 的行上同时有 `maxHp=120`（两个角色都是 120）、
  // `max_hp=100/110`、`hp=100/110` —— 同一个概念三个值，而 `maxHp=120`
  // 既不等于真源上限也不等于当前血量。
  //
  // 删它的三条前提（都已核实）：
  //   ① 同集合所有行都用 snake_case 真源
  //   ② 前端 app.js 读的 `char.maxHp` 是**本地归一化副本**
  //      （`Object.assign({}, raw, { maxHp: pick(raw.max_hp, raw.maxHp, 0) })`），
  //      `raw.maxHp` 只是 `pick` 的兜底之一，删掉后仍拿 `raw.max_hp`
  //   ③ 真源存在，删了不会让角色失去上限
  seedLegacyChar({ maxHp: 120, maxMp: 60 });
  assert.strictEqual(get().maxHp, 120, '前提：造的残留字段应当存在');
  store.healCharacterFields(loadDatabase());
  const c = get();
  assert.strictEqual(c.maxHp, undefined, 'maxHp 残留应被清理，实际还是 ' + c.maxHp);
  assert.strictEqual(c.maxMp, undefined, 'maxMp 残留应被清理，实际还是 ' + c.maxMp);
  assert.strictEqual(c.max_hp, EXPECT_HP, '清理残留不该动真源 max_hp');
});

t('残留清理是幂等的（第二次没有可清的了）', () => {
  seedLegacyChar({ maxHp: 120, maxMp: 60 });
  store.healCharacterFields(loadDatabase());
  const snap = JSON.stringify(get());
  const healed2 = store.healCharacterFields(loadDatabase());
  assert.strictEqual(healed2, 0, '第二次应补 0 个');
  assert.strictEqual(JSON.stringify(get()), snap, '第二次自愈改变了值');
  assert.strictEqual(get().maxHp, undefined, 'maxHp 又回来了');
});

t('真源缺失时不删残留（避免把"数值不一致"变成"数值为空"）', () => {
  // 这是清理的**安全边界**：如果 `max_hp` 本身缺失且算不出来，
  // 删掉 `maxHp` 会让角色彻底没有上限 —— 那比留着一个错值更糟。
  const db = loadDatabase();
  db.characters = (db.characters || []).filter((c) => Number(c.id) !== LEGACY_ID);
  db.characters.push({
    id: LEGACY_ID, user_id: LEGACY_ID, name: '无真源角色', faction: 'martial',
    realm: '不存在的境界', level: 1, exp: 0, hp: 100, mp: 50,
    maxHp: 120, maxMp: 60
    // 既不给 max_hp，realm 也非法 ⇒ calculate* 返回的值不可用
  });
  saveDatabase(db);
  store.healCharacterFields(loadDatabase());
  const c = get();
  if (c.max_hp == null) {
    assert.strictEqual(c.maxHp, 120,
      'max_hp 补不出来时，绝不该删掉唯一的 maxHp 兜底');
  }
  // 若 realm 恰好能算出值，则清理是安全的，此时断言真源已存在
  if (c.maxHp === undefined) {
    assert.ok(Number(c.max_hp) > 0, '删了残留就必须有真源');
  }
});

t('健康角色的字段不被触碰（只有缺失的才补）', () => {
  const db = loadDatabase();
  db.characters = (db.characters || []).filter((c) => Number(c.id) !== LEGACY_ID);
  const good = {
    id: LEGACY_ID, user_id: LEGACY_ID, name: '健康角色', faction: 'martial',
    realm: '炼气', level: 1, exp: 0,
    hp: 50, mp: 20, max_hp: 300, max_mp: 200, exp_to_next: 999
  };
  db.characters.push(good);
  saveDatabase(db);
  const healed = store.healCharacterFields(loadDatabase());
  const c = get();
  assert.strictEqual(healed, 0, '健康角色不该被补，实际补了 ' + healed);
  assert.strictEqual(c.max_hp, 300, 'max_hp 被改了');
  assert.strictEqual(c.hp, 50, 'hp 被改了（50 < 300，不该收敛）');
  assert.strictEqual(c.exp_to_next, 999, 'exp_to_next 被改了');
});

const liveAfter = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;
t('正式存档零侧写（体积+mtime 双检）', () => {
  if (liveBefore && liveAfter) {
    assert.strictEqual(liveAfter.size, liveBefore.size, '正式档体积变了');
    assert.strictEqual(liveAfter.mtimeMs, liveBefore.mtimeMs, '正式档 mtime 变了');
  }
});

console.log('');
console.log(`G19 自愈: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
