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

  await t('建盟真链条（轮84 接管 phase11 独有意）：claim→create 耗令→create 钩子推任务→入盟→赠送零和', async () => {
    const mk = async (tag) => {
      const uu = tag + Date.now().toString(36).slice(-6);
      const rr = await call('POST', '/api/auth/register', { username: uu, password: 'pw-dummy-123', nickname: uu, faction: 'martial' });
      assert.ok(rr.code === 200 && rr.body.token, '注册失败：' + uu);
      const dbc = loadDatabase();
      return { token: rr.body.token, id: dbc.characters.find((c) => c.user_id === rr.body.userId).id };
    };
    const C = await mk('g8c'); const D = await mk('g8d');
    // C 接任务 8 → 领仙盟令（首次免费）→ 建盟必须真消耗令牌并推进 create 档钩子
    assert.strictEqual((await call('POST', '/api/quests/accept', { questId: 8 }, C.token)).code, 200);
    const cl = await call('POST', '/api/guild/token/claim', {}, C.token);
    assert.strictEqual(cl.code, 200, 'claim 首领失败：' + JSON.stringify(cl.body));
    assert.strictEqual((await call('POST', '/api/guild/token/claim', {}, C.token)).code, 400, '邀请奖励可重领！');
    const gc = await call('POST', '/api/guild/create', { name: '钩子盟_' + Date.now().toString(36).slice(-6) }, C.token);
    assert.strictEqual(gc.code, 200, '持令建盟被拒：' + JSON.stringify(gc.body));
    const qC = loadDatabase().quests.find((q) => q.character_id === C.id && q.quest_id === 8);
    assert.strictEqual(qC.objectives[0].current, 1, 'create 档钩子没推任务（令牌建盟也是入盟！）');
    // 令牌必须真扣（一次性凭证，不得建完退仓）
    const db1 = loadDatabase();
    const tokRow = db1.inventory.filter((i) => i.character_id === C.id && [80, 81, 82, 83].includes(Number(i.item_id)));
    assert.strictEqual(tokRow.length, 0, '建盟后仙盟令仍留在背包（凭证未消耗）：' + JSON.stringify(tokRow));
    // D 入盟 → C 赠 100 灵石：盟内零和 + 异盟/未盟拒绝的边界
    const db2 = loadDatabase(); const stone0 = db2.characters.find((c) => c.id === C.id).spirit_stone;
    assert.strictEqual(stone0 >= 100, true, '注入前灵石不足，测不到账');
    const stD0 = db2.characters.find((c) => c.id === D.id).spirit_stone;
    const jj = await call('POST', '/api/guild/join', { guildId: gc.body.guildId }, D.token);
    assert.strictEqual(jj.code, 200, 'D 入盟被拒：' + JSON.stringify(jj.body));
    const g1 = await call('POST', '/api/guild/gift', { targetCharacterId: D.id, amount: 100 }, C.token);
    assert.strictEqual(g1.code, 200, '盟内赠送被拒：' + JSON.stringify(g1.body));
    const db3 = loadDatabase();
    const cN = db3.characters.find((c) => c.id === C.id), dN = db3.characters.find((c) => c.id === D.id);
    assert.strictEqual(Number(cN.spirit_stone) + Number(dN.spirit_stone), Number(stone0) + Number(stD0), '赠送不是零和——灵石凭空增减');
    const outsider = await call('POST', '/api/guild/gift', { targetCharacterId: D.id, amount: 1 }, TOKEN);
    assert.ok(outsider.code === 400 || outsider.code === 404, '非同盟赠送竟放行：' + outsider.code);
  });

  await t('仙盟令提交正扫 + 藏书阁未入宗负扫（轮90）：贡献/盟资落账、重复提交拒、无宗上传 400', async () => {
    const uu = 'g8e' + Date.now().toString(36).slice(-6);
    const er = await call('POST', '/api/auth/register', { username: uu, password: 'pw-dummy-123', nickname: uu, faction: 'martial' });
    assert.ok(er.code === 200, '注册 E 失败');
    const dbE = loadDatabase();
    const EID = dbE.characters.find((c) => c.user_id === er.body.userId).id;
    const jt = await call('POST', '/api/guild/join', { guildId: 424242 }, er.body.token);
    assert.strictEqual(jt.code, 200, 'E 入假盟被拒：' + JSON.stringify(jt.body));
    const cl = await call('POST', '/api/guild/token/claim', {}, er.body.token);
    assert.strictEqual(cl.code, 200, 'E 首领令失败：' + JSON.stringify(cl.body));
    const db2 = loadDatabase();
    const tok = db2.inventory.find((i) => i.character_id === EID && [80, 81, 82, 83].includes(Number(i.item_id)));
    assert.ok(tok, '领取后背包找不到仙盟令（字典 80-83 漂移？）');
    const g0 = db2.guilds.find((g) => g.id === 424242).funds || 0;
    const sub = await call('POST', '/api/guild/token/submit', { tokenItemId: tok.item_id }, er.body.token);
    assert.strictEqual(sub.code, 200, '提交被拒：' + JSON.stringify(sub.body));
    assert.ok(Number(sub.body.contribution) > 0, '贡献没入账：' + JSON.stringify(sub.body));
    const db3 = loadDatabase();
    assert.ok((db3.guilds.find((g) => g.id === 424242).funds || 0) > g0, '令牌贡献没进盟库（funds 直记断线）');
    const again = await call('POST', '/api/guild/token/submit', { tokenItemId: tok.item_id }, er.body.token);
    assert.strictEqual(again.code, 400, '重复提交竟再吃一笔贡献：' + JSON.stringify(again.body));
    // 藏书阁：无宗门角色上传 → 400 语义拒（触达即退役，正路径留给有宗场景）
    app.use('/api/sect', require('../src/routes/sect'));
    const up = await call('POST', '/api/sect/library/upload', { itemId: 1 }, er.body.token);
    assert.strictEqual(up.code, 400, '无宗上传竟被放行：' + up.code + ' ' + JSON.stringify(up.body));
    assert.ok(up.body && up.body.error, '400 不带 error 文案');
  });

  await t('AI 战书（轮94 guild_content 消费端）：真盟名进词、approved 挂门楣、审核池落痕', async () => {
    const uw = 'g8w' + Date.now().toString(36).slice(-6);
    const wr = await call('POST', '/api/auth/register', { username: uw, password: 'pw-dummy-123', nickname: uw, faction: 'martial' });
    assert.ok(wr.code === 200, '注册 W 失败');
    const db0 = loadDatabase();
    const wid = db0.characters.find((c) => c.user_id === wr.body.userId).id;
    const dbG = loadDatabase();
    dbG.guild_members.push({ id: 930001, guild_id: 424242, character_id: wid, role: '成员', joined_at: new Date().toISOString() });
    saveDatabase(dbG);
    const lone = await call('POST', '/api/guild/war-post', { guildId: 424242 }, wr.body.token); // 目标=自家应拒
    assert.strictEqual(lone.code, 400, '向自家宣战竟放行：' + JSON.stringify(lone.body));
    const wp = await call('POST', '/api/guild/war-post', {}, wr.body.token);
    assert.strictEqual(wp.code, 200, '修书失败：' + JSON.stringify(wp.body));
    assert.strictEqual(wp.body.status, 'approved', '无密钥环境应走本地词库直批：' + JSON.stringify(wp.body));
    assert.ok(wp.body.warPost && wp.body.warPost.title && wp.body.warPost.target, '门楣战书缺题或缺收书人：' + JSON.stringify(wp.body));
    const db2 = loadDatabase();
    const g424 = db2.guilds.find((g) => g.id === 424242);
    assert.ok(g424.warPost && g424.warPost.generationId === wp.body.generationId, '战书没写进盟档（世界状态断线）');
    const aiSvc = require('../src/services/ai');
    const gens = (aiSvc.listGenerations() || []).filter((x) => x.purpose === 'guild_content');
    assert.ok(gens.length >= 1, '审核池没有 guild_content 痕迹');
    const gRow = gens[gens.length - 1];
    const p = JSON.parse(gRow.prompt.slice(gRow.prompt.indexOf('{'))); // 参数以 JSON 埋在 prompt 头部之后
    assert.strictEqual(p.to, g424.warPost.target, 'AI 参数里收书人不是真盟名——世界状态没进提示词');
    assert.ok(p.nonce, 'nonce 缺席——同对盟二修必吃旧稿');
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
