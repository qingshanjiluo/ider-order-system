/**
 * G3 · 经验曲线真源与"速度只填满境界"探针（轮54）
 *
 * 为什么单独成套：轮54 把 `realms.exp_requirement` 提为唯一真源并整体调平了曲线，
 * 但全套门禁里**没有任何一条测试真正走过 addExp 升级路径**（359 全绿只说明"没人依赖旧曲线"，不说明新曲线接上了）——
 * 而且此前 `routes/quests.js` 自带一套私有升级循环（无境界封顶 ⇒ 可绕开突破判定）。
 * 这里把四件事钉住：
 *   ① 出厂 exp_to_next 来自真源（不再是硬编码 100）
 *   ② 加满 exp_requirement ⇒ 等级**恰好停在 max_level**、exp 被钉在下一级、突破闸门打开
 *   ③ 再灌十倍经验也**不得越过 max_level / 不得越过本境界**（T0-2 铁律：速度只填满境界）
 *   ④ `exp_to_next` / `character.level` 的赋值点只允许出现在真源文件里（源码级锁，先剥注释再扫）
 *
 * 只读正式存档：整轮跑在 DSH_DATA_DIR 的副本上（`characterService.addExp` 内部会 saveDatabase ⇒ 不能碰 data/game.db）。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'g3-expcurve-'));
fs.copyFileSync(path.join(ROOT, 'data', 'game.db'), path.join(TMP, 'game.db'));
process.env.DSH_DATA_DIR = TMP;

const { loadDatabase, closeDatabase } = require('../src/database');
const charService = require('../src/services/character');
const realmService = require('../src/services/realm');
const expCurve = require('../src/services/exp-curve');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};

const db = loadDatabase();
const mk = (over) => Object.assign({
  id: 990001, user_id: 990001, name: 'G3探针', faction: 'martial',
  realm: '炼气', realm_stage: 1, level: 1, exp: 0,
  exp_to_next: expCurve.needForLevel((db.realms || []).find((r) => r.name === '炼气'), 1) || 100,
  hp: 100, max_hp: 100, mp: 50, max_mp: 50, attack: 10, defense: 10, speed: 10,
  spirit_stone: 0, vip_level: 0, injury: 0, age_years: 16,
  lifespan_bonus_years: 0, lifespan_penalty_years: 0, reincarnation_count: 0,
  creations: 0, dao_heart: 0, location: '青云山麓'
}, over);

console.log('== G3 · 经验曲线真源 ==');

// ---------- ① 真源与三处定义一致 ----------
t('① 出厂 exp_to_next 来自真源且不再等于旧硬编码 100', () => {
  const row = db.realms.find((r) => r.name === '炼气');
  const n = expCurve.needForLevel(row, 1);
  assert.ok(n > 1000, `炼气第一级需求 ${n}：仍是旧量级，说明出厂值没接上真源`);
  const c = mk({ exp_to_next: n });
  assert.strictEqual(c.exp_to_next, n);
  // 旧曲线在 level=1 时给 100；新真源必须给出与"整境需求"同量级的数
  console.log(`  ℹ 炼气第一级 = ${n}，满境需求 = ${row.exp_requirement}，境界内 9 次之和 = ${expCurve.fillTotal(row)}`);
});

t('①b 境界内摊分之和 == realms.exp_requirement（±1%，10 境全查）', () => {
  for (const row of db.realms) {
    const total = Number(row.exp_requirement);
    const sum = expCurve.fillTotal(row);
    const drift = Math.abs(sum - total) / total;
    assert.ok(drift <= 0.01, `${row.name}：摊分合计 ${sum} 与 exp_requirement ${total} 偏离 ${(drift * 100).toFixed(2)}%`);
  }
});

t('①c realm.js 源码里的 REALMS 常量表与存档 realms 逐境一致（防两处定义源漂移）', () => {
  // realm.js 不把 REALMS 导出出来（`module.exports = new RealmService()`），所以这里按源码文本比对：
  // 要防的正是"改了 realm.js 忘了导台账 / 重建后又回退"这一类漂移，值对不对上才是要紧的。
  const s = fs.readFileSync(path.join(ROOT, 'src/services/realm.js'), 'utf8');
  const rows = [...s.matchAll(/name: '([^']+)',[^\n]*?exp_requirement: (\d+)/g)];
  assert.ok(rows.length >= 10, `realm.js 里只解析到 ${rows.length} 个境界行，比对无意义`);
  for (const [, name, v] of rows) {
    const dbRow = db.realms.find((r) => r.name === name);
    assert.ok(dbRow, `realm.js 有境界 ${name}，存档没有`);
    assert.strictEqual(Number(dbRow.exp_requirement), Number(v),
      `${name}：realm.js=${v} vs 存档=${dbRow.exp_requirement} ⇒ 两处定义源已漂移（改了没生效/重建后回退）`);
  }
});

// ---------- ② 加满整境：恰停 max_level + 闸门打开 ----------
t('② 灌入 exp_requirement ⇒ 等级恰为 max_level、exp 钉在下一级、可冲突破', () => {
  const row = db.realms.find((r) => r.name === '炼气');
  db.characters = db.characters.filter((c) => c.id !== 990001);
  db.characters.push(mk({}));
  const r = charService.addExp(990001, Number(row.exp_requirement));
  const c = r.character;
  assert.strictEqual(c.level, Number(row.max_level), `灌满整境后等级 ${c.level} ≠ max_level ${row.max_level}`);
  assert.strictEqual(r.bottleneck, true, '到顶却没报 bottleneck ⇒ 前端拿不到"圆满·待突破"');
  assert.strictEqual(realmService.canBreakthrough(c), true, '圆满却不可冲突破');
  console.log(`  ℹ 灌入 ${row.exp_requirement} ⇒ level=${c.level}，exp=${c.exp}（钉在下一级 ${c.exp_to_next}）`);
});

t('②b 未灌满不得开闸（等级未到 max_level ⇒ canBreakthrough false）', () => {
  const row = db.realms.find((r) => r.name === '炼气');
  db.characters = db.characters.filter((c) => c.id !== 990001);
  db.characters.push(mk({}));
  const c = charService.addExp(990001, Math.floor(Number(row.exp_requirement) * 0.5)).character;
  assert.ok(c.level < Number(row.max_level), `半境经验就到 ${c.level} 级 ⇒ 曲线与需求不匹配`);
  assert.strictEqual(realmService.canBreakthrough(c), false, '没圆满就能冲突破 ⇒ 瓶颈形同虚设');
});

// ---------- ③ 铁律：速度只填满境界，不得越境 ----------
t('③ T0-2 铁律：十倍溢出经验也不得把角色推出本境界', () => {
  const row = db.realms.find((r) => r.name === '炼气');
  db.characters = db.characters.filter((c) => c.id !== 990001);
  db.characters.push(mk({}));
  const c = charService.addExp(990001, Number(row.exp_requirement) * 10).character;
  assert.strictEqual(c.level, Number(row.max_level), `溢出了 10 倍经验，等级却到 ${c.level}（>${row.max_level}）⇒ 刷经验可绕开突破`);
  assert.strictEqual(c.realm, '炼气', '没调用突破却自行换境界');
  assert.ok(c.exp <= c.exp_to_next, `圆满时 exp ${c.exp} 超过钉值 ${c.exp_to_next} ⇒ 多余经验在偷偷累积`);
});

t('③b 每个境界都不得被经验溢出推过（逐境验，不只看炼气）', () => {
  for (const row of db.realms) {
    db.characters = db.characters.filter((c) => c.id !== 990001);
    db.characters.push(mk({ realm: row.name, level: Number(row.min_level), exp: 0,
      exp_to_next: expCurve.needForLevel(row, Number(row.min_level)) || 100 }));
    const c = charService.addExp(990001, Number(row.exp_requirement) * 50).character;
    assert.strictEqual(c.level, Number(row.max_level),
      `${row.name}：灌 50 倍整境需求后等级到 ${c.level}，越过了 max_level ${row.max_level}`);
    assert.strictEqual(c.realm, row.name, `${row.name}：仅靠经验就换了境界 ⇒ 突破判定被绕过`);
  }
});

// ---------- ④ 源码级：赋值点唯一 ----------
t('④ exp_to_next / character.level 的赋值点只在真源文件内', () => {
  // 合法：唯一入口与其结算方（character.js 结算、exp-curve 定义、auth/gameTime 出厂、realm.js 突破清池与失败回落）
  const ALLOW = new Set(['src/services/character.js', 'src/services/exp-curve.js', 'src/services/gameTime.js',
    'src/routes/auth.js', 'src/services/realm.js']);
  // 已知债（轮54 登记，只减不增）：这些路由直接 `character.exp = 原有 + 奖励`，绕开 addExp
  // ⇒ 加了修为却**不结算等级/属性/寿元/圆满钉值**，要等下一个走 addExp 的路径才一次性补上，节奏不一致。
  // 逐处改成 characterService.addExp 后从这张表里删名；多一处都不行。
  const DEBT = new Set(['src/routes/battle.js', 'src/routes/gathering.js', 'src/routes/guild.js']);
  const DEBT_SITES = 6;        // 轮54 实测：battle 2 + gathering 2 + guild 2 = 6（棘轮上限）
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
  const bad = [];
  let debtCount = 0;
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (ALLOW.has(rel)) continue;
    // 先剥注释：轮52 的教训 —— 文本锁不剥注释就会被我自己写的说明文案判红
    const s = fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/exp_to_next\s*=[^=]/.test(s)) bad.push(`${rel} 直接赋值 exp_to_next`);
    if (/character\.level\s*=[^=]/.test(s)) bad.push(`${rel} 直接赋值 character.level`);
    if (/while\s*\([^)]*\bexp_to_next\b/.test(s)) bad.push(`${rel} 自带"角色升级消耗"循环（第二真源）`);
    // 只盯**角色**修为池：炼丹熟练度（character.alchemy.exp）与灵宠经验（pet.exp）是各自独立的成长线，合法 ✓
    debtCount += [...s.matchAll(/character\.exp\s*=[^=]/g)].length;
    if (!DEBT.has(rel) && /character\.exp\s*=[^=]/.test(s)) bad.push(`${rel} 绕过 addExp 直接改角色修为（新点，不许加）`);
  }
  assert.deepStrictEqual(bad, [], `出现新的第二处经验真源：\n      ${bad.join('\n      ')}`);
  assert.ok(debtCount <= DEBT_SITES,
    `只加不算的修为发放点 ${debtCount} 处 > 基线 ${DEBT_SITES}：债被扩大了（应改走 characterService.addExp）`);
  if (debtCount < DEBT_SITES) console.log(`  ℹ 债已少 ${DEBT_SITES - debtCount} 处，请把 DEBT_SITES 与 DEBT 名单同步下调`);
});

t('④b 交任务必须走唯一入口 addExp（quests.js 不再自拼升级）', () => {
  const s = fs.readFileSync(path.join(ROOT, 'src/routes/quests.js'), 'utf8');
  assert.ok(/services\/character/.test(s), 'quests.js 没有引用 character 服务 ⇒ 疑似又自带了一套升级');
  assert.ok(!/max_hp\s*=\s*\(?\s*character\.max_hp[^)]*\+\s*10/.test(s), 'quests.js 还在用"+10 自算 max_hp"这套私有属性公式');
});

closeDatabase();
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\nG3 经验真源: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
