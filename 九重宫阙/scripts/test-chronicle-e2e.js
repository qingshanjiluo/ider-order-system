/**
 * G7 · 传记/编年史/AI 润色审核闭环（轮82 由孤儿 test-phase9-integration.js 进程内改造）
 *
 * 孤儿档案要"预起服 + 固定端口 + 直删正式档"，早已 FATAL 出局；而 test-world.js 并不测
 * chronicle——传记确定性与 pending→approve→自动生效这条 AI 内容管线在门禁里实际零覆盖。
 * 现在：临时 DSH_DATA_DIR + 挂 auth/chronicle/ai 路由，断言照旧（只严不松）。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g7-chron-'));
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
  console.log('== G7 · 传记与编年史（临时数据目录）==');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/chronicle', require('../src/routes/chronicle'));
  app.use('/api/ai', require('../src/routes/ai'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const api = async (method, p, body, token, headers = {}) => {
    const res = await fetch(BASE + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body === undefined || body === null ? undefined : JSON.stringify(body)
    });
    let json; const text = await res.text();
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
  const H = { 'X-Admin-Token': 'dev-admin' };

  const u = 'g7' + Date.now().toString(36).slice(-6);
  const reg = await api('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
  assert.ok(reg.status === 200 && reg.json.token, '注册失败：' + reg.status);
  const TOKEN = reg.json.token;

  // inject：重伤事件入史（编年史素材，直写临时镜像——本进程无"运行中的服务器"之争）
  {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.user_id === reg.json.userId);
    ch.spirit_stone = 5000;
    ch.injury = 100;
    ch.injury_status = '重伤';
    const gameTime = require('../src/services/gameTime');
    gameTime.logEvent(ch, 'heavy_injury', '重伤', '与妖兽搏命，经脉尽碎');
    saveDatabase(db);
  }

  await t('开局传记：出身/段落结构完整且确定性（两次 GET 逐字节一致）', async () => {
    const r1 = await api('GET', '/api/chronicle/biography', null, TOKEN);
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.json).slice(0, 150));
    assert.ok(r1.json.origin, '缺出身');
    assert.ok(Array.isArray(r1.json.paragraphs) && r1.json.paragraphs.length >= 3, '段落不足 3');
    const r2 = await api('GET', '/api/chronicle/biography', null, TOKEN);
    assert.deepStrictEqual(r1.json, r2.json, '传记应确定性（同角色两次生成必须一字不差）');
  });

  await t('编年史：出生+重伤在录、按游戏年升序、类型标题齐', async () => {
    const r = await api('GET', '/api/chronicle', null, TOKEN);
    assert.strictEqual(r.status, 200);
    const evs = r.json.events || [];
    assert.ok(evs.length >= 2, 'events=' + evs.length);
    const types = evs.map((e) => e.type);
    assert.ok(types.includes('birth'), '缺出生事件');
    assert.ok(types.includes('heavy_injury'), '缺重伤事件（logEvent 注入未入史）');
    const years = evs.map((e) => e.gameYear);
    assert.deepStrictEqual(years, [...years].sort((a, b) => a - b), '编年史未按游戏年升序');
    const heavy = evs.find((e) => e.type === 'heavy_injury');
    assert.strictEqual(heavy.typeTitle, '重伤');
    assert.ok(heavy.content.includes('妖兽'), '事件正文丢失：' + heavy.content);
    assert.ok(evs.every((e) => e.typeTitle), '有事件缺类型标题');
  });

  await t('AI 润色闭环：enhance 一律 pending → 未审不得生效 → approve 后读取自动生效', async () => {
    const r1 = await api('POST', '/api/chronicle/biography/enhance', {}, TOKEN);
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.json).slice(0, 150));
    assert.strictEqual(r1.json.status, 'pending', '文案类必须进审核池（forcePending 被摘了？）：' + JSON.stringify(r1.json));
    const before = await api('GET', '/api/chronicle/biography', null, TOKEN);
    assert.ok(!before.json.aiParagraphs, '未审核的 AI 文案竟然已生效——审核池被绕过');
    const ok = await api('POST', `/api/ai/admin/generations/${r1.json.generationId}/review`, { action: 'approved', note: 'OK' }, TOKEN, H);
    assert.strictEqual(ok.status, 200, '审核落锤失败：' + JSON.stringify(ok.json));
    const after = await api('GET', '/api/chronicle/biography', null, TOKEN);
    assert.ok(after.json.aiParagraphs && after.json.aiEnhanced, 'approve 后传记未自动更新（读取路径失效）');
    const db2 = loadDatabase();
    const ch2 = db2.characters.find((c) => c.user_id === reg.json.userId);
    assert.ok(!ch2.biography_pending, '生效后 pending 指针未清——每次读传记都会重复应用');
  });

  await t('重复 enhance：已生效者再次提交仍走 pending，不脏写 biography_ai', async () => {
    const prev = loadDatabase().characters.find((c) => c.user_id === reg.json.userId).biography_ai;
    const r = await api('POST', '/api/chronicle/biography/enhance', {}, TOKEN);
    assert.strictEqual(r.json.status, 'pending', '第二次润色应回审核池：' + JSON.stringify(r.json));
    assert.deepStrictEqual(loadDatabase().characters.find((c) => c.user_id === reg.json.userId).biography_ai, prev,
      '未过审就覆盖了已生效文案');
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
  console.log(`\nG7 传记编年史: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('G7 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
});
