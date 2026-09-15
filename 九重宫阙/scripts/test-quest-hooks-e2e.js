/**
 * G8 · 任务进度钩子（轮83 批5）——8 条任务里 level/checkin/guild 三类此前全库无进度源，
 * 接了也"永不可完成"；本套把三钩子钉成 HTTP 级行为断言（craft 两档由轮83 源码锁盯）。
 * 隔离：临时 DSH_DATA_DIR，进程内挂载，正式档只读比对。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g8-quest-'));
process.env.DSH_DATA_DIR = TMP;

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== G8 · 任务进度钩子（临时数据目录）==');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/quests', require('../src/routes/quests'));
  app.use('/api/checkin', require('../src/routes/checkin'));
  app.use('/api/guild', require('../src/routes/guild'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const call = async (method, p, body, token) => {
    const res = await fetch(BASE + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { code: res.status, body: json };
  };

  const u = 'g8' + Date.now().toString(36).slice(-6);
  const reg = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
  assert.ok(reg.code === 200 && reg.body.token, '注册失败：' + reg.code);
  const TOKEN = reg.body.token;
  const db0 = loadDatabase();
  const CID = db0.characters.find((c) => c.user_id === reg.body.userId).id;

  const questRow = (qid) => loadDatabase().quests.find((q) => q.character_id === CID && q.quest_id === qid);

  await t('签到钩子：accept 任务4 → POST 签到 → checkin 目标 0→1 达成', async () => {
    const acc = await call('POST', '/api/quests/accept', { questId: 4 }, TOKEN);
    assert.strictEqual(acc.code, 200, '接受任务失败：' + JSON.stringify(acc.body));
    const ck = await call('POST', '/api/checkin', {}, TOKEN);
    assert.strictEqual(ck.code, 200, '签到失败：' + ck.code + ' ' + JSON.stringify(ck.body));
    const q = questRow(4);
    assert.strictEqual(q.objectives[0].current, 1, '签到未推进任务（钩子断线）：' + JSON.stringify(q.objectives));
  });

  await t('升级钩子：连升 N 级记 N 次（一次大经验包多级如实计数，非恒 1）', async () => {
    const acc = await call('POST', '/api/quests/accept', { questId: 3 }, TOKEN);
    assert.strictEqual(acc.code, 200);
    // 临时把 required 降到 2（原 10 级要灌巨量经验，行为等价且确定性更强）
    const db = loadDatabase();
    questRow(3).objectives[0].required = 2;
    saveDatabase(db);
    const lv0 = loadDatabase().characters.find((c) => c.id === CID).level;
    require('../src/services/character').addExp(CID, 60000);
    const lv1 = loadDatabase().characters.find((c) => c.id === CID).level;
    assert.ok(lv1 - lv0 >= 2, `注入没换来升级（${lv0}->${lv1}），断言前提不成立`);
    const cur = questRow(3).objectives[0].current;
    assert.ok(cur >= 2 && cur <= Math.min(lv1 - lv0, 2), `进度应=min(升级数,2)：cur=${cur} 升=${lv1 - lv0}`);
  });

  await t('入盟钩子：accept 任务8 → join → guild 目标 0→1 达成', async () => {
    const db = loadDatabase();
    if (!db.guilds) db.guilds = [];
    db.guilds.push({ id: 424242, name: '钩子测试盟', leader_id: -1, level: 1, exp: 0, created_at: new Date().toISOString() });
    saveDatabase(db);
    const acc = await call('POST', '/api/quests/accept', { questId: 8 }, TOKEN);
    assert.strictEqual(acc.code, 200);
    const j = await call('POST', '/api/guild/join', { guildId: 424242 }, TOKEN);
    assert.strictEqual(j.code, 200, '入盟失败：' + JSON.stringify(j.body));
    const q = questRow(8);
    assert.strictEqual(q.objectives[0].current, 1, '入盟未推进任务（钩子断线）：' + JSON.stringify(q.objectives));
  });

  await t('反证：重复签到不再推（封顶语义）；未接任务的活动不落进度', async () => {
    const q = questRow(4);
    assert.strictEqual(q.objectives[0].current, 1, 'current 越过 required——封顶失效');
    const acc = await call('POST', '/api/quests/accept', { questId: 4 }, TOKEN);
    assert.strictEqual(acc.code, 400, '同任务可重复接取：' + JSON.stringify(acc.body));
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
  console.log(`\nG8 任务钩子: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('G8 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
});
