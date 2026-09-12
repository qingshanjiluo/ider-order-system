/**
 * S2 · P3 可见性端到端（轮50）
 *
 * 这一套断言的不是"接口存在"，而是规划 P3 的三条硬要求：
 *   1) 突破来源可见：/api/cultivation/can-breakthrough 必须把**概率构成**（境界基础/心魔/连败/
 *      天道庇护/契机丹/阵法/灵脉/功法大成/顿悟/道伤）与**契机丹持有数**吐给前端，前端才有东西可显示；
 *   2) 展示与结算同源（铁律）：面板预告的"失败折寿 X 年"必须**等于**真失败时扣掉的寿元 ——
 *      这条是本轮最重要的断言，它保证 realm.js 里没有第二处寿元公式；
 *   3) 槽位 n÷8 与掉落保底进度：/api/skill/list 的 maxSlots 必须等于 balance.skillSlotCap，
 *      且旧的"等级/天赋/功法"分解字段（早已不参与计算）不得再随响应下发；
 *      /api/character 的 lootPity 阈值必须取自 balance，不得由界面写死。
 *
 * 只写 DSH_DATA_DIR 指到的临时目录；正式存档逐字节不得动（末尾有体积+mtime 双检）。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-p3-vis-'));
process.env.DSH_DATA_DIR = TMP;

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const balance = require('../src/config/balance');
const realmService = require('../src/services/realm');
const gameTime = require('../src/services/gameTime');

const PART_KEYS = ['base', 'innerDemon', 'failures', 'heavenShield', 'pill',
  'formation', 'vein', 'artPerfect', 'epiphany', 'daoDamage'];

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

const nextRowId = (arr) => (arr || []).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;

(async () => {
  console.log('== S2 · P3 可见性（临时数据目录）==');

  loadDatabase();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/character', require('../src/routes/character'));
  app.use('/api/cultivation', require('../src/routes/cultivation'));
  app.use('/api/skill', require('../src/routes/skill'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;

  const call = (method, p, body, token) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ code: rs.statusCode, body: j, raw: buf.slice(0, 260) }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  const uname = `vis_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
  const reg = await call('POST', '/api/auth/register', { username: uname, password: 'pw-dummy-123', nickname: uname, faction: 'martial' });
  assert.ok(reg.code === 200 && reg.body && reg.body.token, `注册失败：${reg.code} ${reg.raw}`);
  const db0 = loadDatabase();
  const uid = db0.users.find((x) => x.username === uname).id;
  const cid = Number(db0.characters.find((c) => Number(c.user_id) === Number(uid)).id);
  const tok = reg.body.token;

  await t('突破面板字段齐全（概率 + 构成 + 契机丹 + 失败预览 + 计数器一次取全）', async () => {
    const r = await call('GET', '/api/cultivation/can-breakthrough', undefined, tok);
    assert.strictEqual(r.code, 200, 'HTTP ' + r.code + ' ' + r.raw);
    for (const k of ['canBreakthrough', 'chance', 'parts', 'mods', 'pill', 'failurePreview', 'counters']) {
      assert.ok(k in r.body, `响应缺字段 ${k}：` + r.raw);
    }
    assert.ok(typeof r.body.canBreakthrough === 'boolean', 'canBreakthrough 不是布尔');
    assert.ok(PART_KEYS.every((k) => k in (r.body.parts || {})), `parts 十项构成不齐：${JSON.stringify(r.body.parts)}`);
    assert.ok(Number.isFinite(r.body.pill.held) && r.body.pill.bonusEach > 0, '契机丹字段不可用：' + JSON.stringify(r.body.pill));
    for (const k of ['years', 'ratio', 'cap', 'expFallbackRatio', 'innerDemonAfter']) {
      assert.ok(k in r.body.failurePreview, `失败预览缺 ${k}`);
    }
  });

  await t('chance 与服务端掷骰同一个函数，且被夹在 5~95', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === cid);
    const direct = realmService.breakthroughProbability(ch).chance;
    const viaHttp = await call('GET', '/api/cultivation/can-breakthrough', undefined, tok);
    assert.ok(Number.isFinite(direct), 'breakthroughProbability 没给数字');
    if (viaHttp.body.canBreakthrough) {
      assert.strictEqual(viaHttp.body.chance, direct, '面板 chance 与结算函数不同源');
    }
    const oldDemon = ch.inner_demon || 0;
    ch.inner_demon = 9999;
    const floor = realmService.breakthroughProbability(ch).chance;
    ch.inner_demon = 0;
    ch.breakthrough_failures = 0;
    const boost = realmService.breakthroughProbability(ch, { pill: true, formation: true, epiphany: true, artPerfect: true, veinLevel: 99 });
    ch.inner_demon = oldDemon;
    saveDatabase(db);
    assert.ok(floor >= 5, `心魔再重也不该跌破 5%，实际 ${floor}`);
    assert.ok(boost.chance <= 95, `加成再满也不该超过 95%，实际 ${boost.chance}`);
  });

  await t('持有契机丹 → 构成里立刻出现 +15 且 held 报出真实枚数', async () => {
    const db = loadDatabase();
    const names = balance.BREAKTHROUGH_PILL_NAMES || [];
    assert.ok(names.length >= 1, 'balance 里没有契机丹名单');
    // 临时库是空档，没有坊市种子；这里自备一行同名物品作为"背包里有丹"的夹具。
    // （破境丹在正式内容里的**可得性**由 test-content 十二期那组锁负责，不在本套件重复证明。）
    let pillItem = db.items.find((i) => names.includes(i.name));
    if (!pillItem) {
      pillItem = { id: nextRowId(db.items), name: names[0], type: '丹药', quality: '凡品', price: 5000 };
      db.items.push(pillItem);
      saveDatabase(db);
    }
    const before = await call('GET', '/api/cultivation/can-breakthrough', undefined, tok);
    assert.strictEqual(before.body.pill.held, 0, '新角色不该已有契机丹');

    const dbI = loadDatabase();
    dbI.inventory.push({ id: nextRowId(dbI.inventory), character_id: cid, item_id: pillItem.id, quantity: 2 });
    saveDatabase(dbI);

    const after = await call('GET', '/api/cultivation/can-breakthrough', undefined, tok);
    assert.strictEqual(after.body.pill.held, 2, 'held 没反映背包枚数：' + JSON.stringify(after.body.pill));
    assert.strictEqual(after.body.parts.pill, balance.BREAKTHROUGH_MODS.pill,
      `持有丹却拿不到构成里的 +${balance.BREAKTHROUGH_MODS.pill}`);
    assert.strictEqual(after.body.pill.oneShot, true, '必须告诉前端这是一次性消耗');

    const ix = db.inventory.findIndex((i) => i.item_id === pillItem.id && i.character_id === cid);
    db.inventory.splice(ix, 1);
    saveDatabase(db);
    const back = await call('GET', '/api/cultivation/can-breakthrough', undefined, tok);
    assert.strictEqual(back.body.parts.pill, 0, '卖掉后构成里仍残留丹药加成');
  });

  await t('【铁律】面板预告的失败折寿 == 真失败时实际扣掉的寿元', () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === cid);
    ch.inner_demon = 0;
    ch.breakthrough_failures = 0;
    saveDatabase(db);

    const preview = realmService.breakthroughPanel(ch).failurePreview;
    assert.ok(preview.years >= 1, `预览折寿至少 1 年（比例制保底），实际 ${preview.years}`);
    assert.ok(preview.cap > 0, '预览拿不到寿元上限');

    const capBefore = gameTime.effectiveLifespan(ch);
    ch._pending_breakthrough_failure = true;   // 模拟"判定掷骰已失败"，只走结算
    saveDatabase(db);
    realmService.handleBreakthroughFailure(cid);

    const db2 = loadDatabase();
    const ch2 = db2.characters.find((c) => c.id === cid);
    const capAfter = gameTime.effectiveLifespan(ch2);
    const lost = capBefore - capAfter;
    assert.strictEqual(lost, preview.years,
      `展示说折 ${preview.years} 年，实际扣了 ${lost} 年 —— 界面与结算出现两套寿元公式`);
    assert.strictEqual(ch2.breakthrough_failures, 1, '连败计数没 +1');
    assert.strictEqual(ch2.inner_demon, preview.innerDemonAfter, '心魔层数与预览不符');
    assert.ok(!ch2._pending_breakthrough_failure, '失败标记未清（会重复扣寿）');
  });

  await t('闸门未过（无标记）不得罚寿：连败为 0 时直接结算应原样返回', () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === cid);
    ch._pending_breakthrough_failure = false;
    const capBefore = gameTime.effectiveLifespan(ch);
    const failsBefore = ch.breakthrough_failures || 0;
    realmService.handleBreakthroughFailure(cid);
    const ch2 = loadDatabase().characters.find((c) => c.id === cid);
    assert.strictEqual(gameTime.effectiveLifespan(ch2), capBefore, '没失败却扣了寿元');
    assert.strictEqual(ch2.breakthrough_failures || 0, failsBefore, '没失败却加了连败');
  });

  await t('连败累进：第二次失败的预告折寿更多且封顶生效', () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === cid);
    const p1 = realmService.previewBreakthroughFailureCost(ch);
    ch.breakthrough_failures = (balance.BREAKTHROUGH_LIFE_COST.max - balance.BREAKTHROUGH_LIFE_COST.base) / balance.BREAKTHROUGH_LIFE_COST.perFail + 40;
    saveDatabase(db);
    const p2 = realmService.previewBreakthroughFailureCost(loadDatabase().characters.find((c) => c.id === cid));
    assert.ok(p2.ratio > p1.ratio, `累进没生效 ${p1.ratio} -> ${p2.ratio}`);
    assert.ok(Math.abs(p2.ratio - balance.BREAKTHROUGH_LIFE_COST.max) < 1e-9, '未封顶在 max');
    ch.breakthrough_failures = 0;
    saveDatabase(db);
  });

  await t('/api/skill/list 的 maxSlots 取自 skillSlotCap 且旧的等级/天赋/功法分解已下线', async () => {
    const r = await call('GET', '/api/skill/list', undefined, tok);
    assert.strictEqual(r.code, 200, 'HTTP ' + r.code + ' ' + r.raw);
    const ch = loadDatabase().characters.find((c) => c.id === cid);
    const want = balance.skillSlotCap(balance.REALM_ORDER.indexOf(ch.realm));
    assert.strictEqual(r.body.maxSlots, want, `maxSlots ${r.body.maxSlots} != skillSlotCap ${want}`);
    for (const gone of ['baseSlots', 'levelBonus', 'talentBonus', 'gongfaBonus']) {
      assert.ok(!(gone in r.body), `响应仍在下发过期分解字段 ${gone}（前端会据此展示已废弃的构成）`);
    }
    assert.ok(Array.isArray(r.body.skills) && r.body.slotLimits, 'skills/slotLimits 结构变了');
    assert.ok(Number.isFinite(r.body.equippedCount), '缺少 equippedCount（前端总槽位 n/N 要用）');
  });

  await t('/api/character 的 lootPity 阈值取自 balance 且满阈值报"下次必出"', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === cid);
    ch.loot_dry_streak = 0;
    saveDatabase(db);
    const r = await call('GET', '/api/character', undefined, tok);
    assert.strictEqual(r.code, 200, 'HTTP ' + r.code + ' ' + r.raw);
    assert.ok(r.body.lootPity, '响应没有 lootPity 字段：' + r.raw);
    assert.strictEqual(r.body.lootPity.threshold, balance.LOOT_PITY.dryStreakToGuarantee, '阈值不是 balance 那份');
    assert.strictEqual(r.body.lootPity.dryStreak, 0, 'dryStreak 与角色列不一致');
    assert.strictEqual(r.body.lootPity.nextIsGuaranteed, false, '0 次空手不该就必出');

    const db2 = loadDatabase();
    db2.characters.find((c) => c.id === cid).loot_dry_streak = balance.LOOT_PITY.dryStreakToGuarantee;
    saveDatabase(db2);
    const r2 = await call('GET', '/api/character', undefined, tok);
    assert.strictEqual(r2.body.lootPity.nextIsGuaranteed, true, '到保底了却没报必出（前端进度条会骗人）');

    const db3 = loadDatabase();
    db3.characters.find((c) => c.id === cid).loot_dry_streak = 0;
    saveDatabase(db3);
  });

  await t('前端确实把这三项显示出来（静态接线锁）', () => {
    const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    const apijs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf8');
    assert.ok(/async getBreakthroughPanel\(\)[\s\S]{0,80}\/cultivation\/can-breakthrough/.test(apijs), 'api.js 没有 getBreakthroughPanel 包装');
    assert.ok(/api\.getBreakthroughPanel\(\)/.test(app), '修炼页没调用突破面板');
    assert.ok(/BT_PART_LABELS/.test(app) && /天道庇护/.test(app), '概率构成没有中文标签表');
    assert.ok(/失败代价[\s\S]{0,240}折寿/.test(app), '没有"失败折寿"提示');
    assert.ok(/已用 \$\{totalEquipped\}\/\$\{data\.maxSlots/.test(app), '技能页没显示总槽位 n/N');
    assert.ok(/掉落保底/.test(app) && /lootPity/.test(app), '角色页没显示掉落保底进度');
    assert.ok(/lootPity \|\| \{\}\)\.threshold/.test(app), '保底阈值取的是后端字段而不是写死的数字');
    assert.ok(!/\$\{5\}\s*场/.test(app), '界面里疑似写死了 5 场保底');
  });

  await t('正式存档 data/game.db 未被本套件写动（只写临时目录）', () => {
    if (!liveBefore) { assert.ok(!fs.existsSync(LIVE_DB), '本不该存在正式存档'); return; }
    const after = fs.statSync(LIVE_DB);
    assert.strictEqual(after.size, liveBefore.size, `正式存档体积变了 ${liveBefore.size} -> ${after.size}`);
    assert.strictEqual(after.mtimeMs, liveBefore.mtimeMs, '正式存档修改时间变了（说明写到了正式档）');
  });

  server.close();
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nS2 P3 可见性: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error('S2 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
});
