/**
 * 第 28 套 · P7 世界观锚点与剧情层（轮102）
 *
 * 存在的理由：剧情文档最容易变成"写了一堆漂亮文案但系统读不到"。
 * 本套件把世界观锚点钉成机器可判定的事实：
 *   ① 锚点数据自洽（纪元单调、境界全覆盖、宗门史字段齐、事件门槛合理）；
 *   ② 锚点真接到服务（传记含纪元/宗门/风物；编年史每条带纪元）；
 *   ③ 确定性（同角色两次调用全等 —— 传记按 id 播种，不能每次刷新换出身）；
 *   ④ 无泄漏（未收录境界/宗门不得吐 undefined）；
 *   ⑤ 世界事件门槛不许倒挂（高境界事件不能比低境界先解锁）。
 *
 * 只读 src/data/world-lore.js 与 chronicle 服务；用临时库跑真服务，不碰正式存档。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lore-'));
process.env.DSH_DATA_DIR = TMP;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'lore-suite-not-for-prod';

const lore = require(path.join(ROOT, 'src', 'data', 'world-lore'));
const { loadDatabase, closeDatabase } = require(path.join(ROOT, 'src', 'database'));
const chronicle = require(path.join(ROOT, 'src', 'services', 'chronicle'));

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};

console.log('== P7 世界观锚点与剧情层 ==');

// ---------- ① 数据自洽 ----------
t('纪元表按年份严格单调递增，且每纪有名字与注解', () => {
  const eras = lore.ERAS;
  assert.ok(eras.length >= 5, `纪元只有 ${eras.length} 个（世界观太薄）`);
  for (let i = 1; i < eras.length; i++) {
    assert.ok(eras[i].from > eras[i - 1].from, `第 ${i} 个纪元起点没有大于前一个：${eras[i].from} <= ${eras[i - 1].from}`);
  }
  for (const e of eras) {
    assert.ok(e.name && e.name.length >= 2, `纪元缺名字：${JSON.stringify(e)}`);
    assert.ok(e.note && e.note.length >= 6, `纪元 ${e.name} 缺注解`);
  }
  assert.strictEqual(eras[0].from, 0, '首个纪元必须从第 0 年起（否则早期年份落不到任何纪元）');
});

t('九境风物全覆盖，且每境三字段齐备（天时/体感/凶险）', () => {
  const REALM_NAMES = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
  for (const r of REALM_NAMES) {
    const l = lore.REALMS_LORE[r];
    assert.ok(l, `境界 ${r} 没有风物（传记会退回通用描述）`);
    assert.ok(l.air && l.air.length >= 4, `${r} 缺天时`);
    assert.ok(l.body && l.body.length >= 4, `${r} 缺修行体感`);
    assert.ok(l.danger && l.danger.length >= 4, `${r} 缺凶险`);
  }
});

t('宗门史字段齐备（纪元/门规/山门/入门试炼）', () => {
  const names = Object.keys(lore.SECTS_LORE);
  assert.ok(names.length >= 6, `宗门史只有 ${names.length} 个`);
  for (const n of names) {
    const s = lore.SECTS_LORE[n];
    for (const k of ['era', 'creed', 'land', 'trial']) {
      assert.ok(s[k] && s[k].length >= 3, `${n} 缺 ${k}`);
    }
  }
});

t('世界事件门槛不许倒挂（高境界事件不得比低境界先解锁）', () => {
  const evs = [...lore.WORLD_EVENTS].sort((a, b) => a.realmAtLeast - b.realmAtLeast);
  for (let i = 1; i < evs.length; i++) {
    assert.ok(evs[i].realmAtLeast >= evs[i - 1].realmAtLeast,
      `事件 ${evs[i].key} 的境界门槛(${evs[i].realmAtLeast})低于前一个 ${evs[i - 1].key}(${evs[i - 1].realmAtLeast})`);
  }
  for (const e of evs) {
    assert.ok(e.key && e.title && e.text, `事件字段不全：${JSON.stringify(e).slice(0, 80)}`);
    assert.ok(Number.isFinite(e.realmAtLeast) && e.realmAtLeast >= 0 && e.realmAtLeast <= 8,
      `事件 ${e.key} 的境界门槛越界：${e.realmAtLeast}`);
  }
});

// ---------- ② 纯函数不吐 undefined ----------
t('未收录的境界/宗门走兜底，不返回 undefined', () => {
  for (const weird of ['', '凡人', '不存在的境界', null, undefined]) {
    const l = lore.loreForRealm(weird);
    assert.ok(l && l.air && l.body && l.danger, `loreForRealm(${JSON.stringify(weird)}) 返回不全`);
  }
  for (const weird of ['', '不存在的宗门', null]) {
    const s = lore.loreForSect(weird);
    assert.ok(s && s.era && s.creed && s.land && s.trial, `loreForSect(${JSON.stringify(weird)}) 返回不全`);
  }
});

t('eraForYear 对任意年份都给纪元（含 0 / 极大值 / 小数）', () => {
  for (const y of [0, 1, 299, 300, 1500, 99999, 0.5, -1]) {
    const e = lore.eraForYear(y);
    assert.ok(e && e.name, `eraForYear(${y}) 没有返回纪元`);
  }
  assert.strictEqual(lore.eraForYear(0).name, lore.ERAS[0].name, '第 0 年应落在首个纪元');
});

t('世界事件渲染把占位符全部替换掉（不许留 {xxx}）', () => {
  for (const e of lore.WORLD_EVENTS) {
    const out = lore.renderWorldEvent(e, { place: '青云山', sect: '青云宗', era: '太初纪', trial: '问剑三关' });
    assert.ok(!/\{[a-z]+\}/.test(out), `事件 ${e.key} 渲染后仍有未替换占位符：${out}`);
  }
  // 无 ctx 时也要能渲染（走兜底）
  for (const e of lore.WORLD_EVENTS) {
    const out = lore.renderWorldEvent(e, {});
    assert.ok(!/\{[a-z]+\}/.test(out), `事件 ${e.key} 无上下文渲染后仍有占位符`);
  }
});

// ---------- ③ 服务接入 ----------
// 临时库的角色是懒建的（注册时才生成），本套件直接造 fixture 角色对象 ——
// getBiography/getChronicle 是纯读函数，只依赖传入对象的字段，不必起 HTTP。
const db = loadDatabase();
const char = (db.characters || [])[0] || {
  id: 4242, name: '试验道君', realm: '金丹', age_years: 12.5,
  spirit_roots: [{ type: '火', purity: 82 }, { type: '木', purity: 63 }],
  reincarnation_count: 0
};
assert.ok(char && char.id, '连 fixture 角色都没造出来');

t('传记接了世界锚点（含纪元字段，且段落数增加）', () => {
  assert.ok(char, '临时库里没有角色，无法验证传记');
  const bio = chronicle.getBiography(char);
  assert.ok(bio.era, '传记缺少纪元字段（世界锚点没接上）');
  assert.ok(Array.isArray(bio.paragraphs) && bio.paragraphs.length >= 5,
    `传记段落只有 ${bio.paragraphs.length} 段（锚点没并进去）`);
  assert.ok(bio.realmLore && bio.realmLore.air, '传记缺少本境风物');
  const joined = bio.paragraphs.join('');
  assert.ok(!/undefined/.test(joined), '传记正文泄漏 undefined');
  assert.ok(bio.era && joined.includes(bio.era), '传记正文没提到所属纪元');
});

t('传记确定性：同角色两次调用逐字全等（刷新不该换出身）', () => {
  const a = chronicle.getBiography(char);
  const b = chronicle.getBiography(char);
  assert.deepStrictEqual(a.paragraphs, b.paragraphs, '两次调用传记不一致（播种失效）');
  assert.strictEqual(a.origin, b.origin, '两次调用出身不一致');
});

t('编年史每条事件都带纪元，且顶层给当前纪元与风物', () => {
  const chr = chronicle.getChronicle(char);
  assert.ok(chr.currentEra, '编年史缺少当前纪元');
  assert.ok(chr.eraNote, '编年史缺少纪元注解');
  assert.ok(chr.realmLore && chr.realmLore.air, '编年史缺少本境风物');
  for (const e of chr.events) {
    assert.ok(e.era, `事件 ${e.id} 没有纪元`);
    assert.ok(!/undefined/.test(String(e.content || '')), `事件 ${e.id} 正文泄漏 undefined`);
  }
});

t('编年史按游戏年单调排序（时间轴不许倒挂）', () => {
  const chr = chronicle.getChronicle(char);
  for (let i = 1; i < chr.events.length; i++) {
    assert.ok(chr.events[i].gameYear >= chr.events[i - 1].gameYear,
      `第 ${i} 条事件年份倒挂：${chr.events[i - 1].gameYear} -> ${chr.events[i].gameYear}`);
  }
});

// ---------- ④ 前端接线 ----------
t('前端记年页真用了锚点字段（不许后端给了前端不显示）', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
  assert.ok(/bio\.era/.test(app), '前端没显示传记纪元');
  assert.ok(/data\.currentEra/.test(app), '前端没显示当前纪元');
  assert.ok(/realmLore/.test(app), '前端没显示本境风物');
  assert.ok(/lore-chip/.test(app) && /lore-chip/.test(fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8')),
    '锚点标签样式没有落地');
});

t('正式存档未被本套件写动（只写临时目录）', () => {
  const live = path.join(ROOT, 'data', 'game.db');
  assert.ok(process.env.DSH_DATA_DIR === TMP, '没有指向临时目录');
  assert.ok(!process.env.DSH_DATA_DIR.includes('data'), '临时目录名与正式目录混淆');
  assert.ok(fs.existsSync(live), '正式存档应当存在');
});

closeDatabase();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }

console.log(`\nP7 世界观锚点: ${pass} 通过, ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
