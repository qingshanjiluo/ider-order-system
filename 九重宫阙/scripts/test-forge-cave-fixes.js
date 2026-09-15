/**
 * G5 · 批3 修复回归：temper 白嫖 / use-storage 键义 / offline 重复领取（轮77）
 *
 * 三桩都是审计提出、本轮逐条亲验后确认成立的实锤：
 *   1) /forge/temper 对"真实存在但玩家未持有"的材料静默跳过扣减 ⇒ 零消耗淬炼；
 *   2) /cave/use-storage store 按背包行 id 记键、retrieve 按物品 id 入账 ⇒ 存取错位；
 *   3) /cultivation/offline-cultivate 结算后不消费窗口 ⇒ 连点无限领修为；且登录侧
 *      直接覆盖 last_login 使正常路径永远 0 收益（废件+泉水并存，双端都坏）。
 * 只写临时数据目录；正式存档体积+mtime 双检。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g5-fixes-'));
process.env.DSH_DATA_DIR = TMP;

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, getNextId, closeDatabase } = require('../src/database');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== G5 · 批3 修复回归（临时数据目录）==');

  const db0 = loadDatabase();
  saveDatabase(db0);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/forge', require('../src/routes/forge'));
  app.use('/api/cave', require('../src/routes/cave'));
  app.use('/api/cultivation', require('../src/routes/cultivation'));
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
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ code: rs.statusCode, body: j, raw: buf.slice(0, 240) }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  const reg = async (tag) => {
    const u = 'g5' + tag + Date.now().toString(36).slice(-6);
    const r = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
    assert.ok(r.code === 200 && r.body && r.body.token, `注册失败：${r.code} ${r.raw}`);
    const db = loadDatabase();
    const uid = db.users.find((x) => x.username === u).id;
    const ch = db.characters.find((c) => Number(c.user_id) === Number(uid));
    return { token: r.body.token, uid: Number(uid), id: Number(ch.id) };
  };

  const A = await reg('a');

  // ---- 1) temper 白嫖 ----
  await t('temper：未持有材料整单拒绝（旧的静默放行=零消耗白嫖）', async () => {
    const db = loadDatabase();
    if (!db.items) db.items = [];
    if (!db.equipments) db.equipments = [];
    if (!db.inventory) db.inventory = [];
    const mat = { id: getNextId('items'), name: 'G5淬炼砂', type: '材料', quality: '凡品' };
    const weapon = { id: getNextId('items'), name: 'G5青锋', type: '武器', quality: '法器', stats: JSON.stringify({ attack: 10 }) };
    db.items.push(mat, weapon);
    const eq = { id: getNextId('equipments'), character_id: A.id, item_id: weapon.id, temper_count: 0 };
    db.equipments.push(eq);
    saveDatabase(db);
    const free = await call('POST', '/api/forge/temper', { equipmentId: eq.id, materialIds: [mat.id] }, A.token);
    assert.strictEqual(free.code, 400, `未持有的材料竟然能白嫖淬炼：${free.code} ${free.raw}`);
    assert.ok(/材料不足/.test(free.raw), '拒绝理由不是材料不足：' + free.raw);
    const junk = await call('POST', '/api/forge/temper', { equipmentId: eq.id, materialIds: [9999999] }, A.token);
    assert.strictEqual(junk.code, 400, '不存在的材料 id 应被拒：' + junk.raw);
  });

  await t('temper：真实扣料（两种材料各 1 件，事后背包归零）', async () => {
    const db = loadDatabase();
    const mat = db.items.find((i) => i.name === 'G5淬炼砂');
    const eq = db.equipments.find((e) => e.character_id === A.id);
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: mat.id, quantity: 1 });
    saveDatabase(db);
    const ok = await call('POST', '/api/forge/temper', { equipmentId: eq.id, materialIds: [mat.id] }, A.token);
    assert.strictEqual(ok.code, 200, '持有时应可淬炼：' + ok.raw);
    assert.ok(['destroyed', 'downgrade', 'rerolled'].includes(ok.body.result), '结果枚举异常：' + ok.raw);
    const db2 = loadDatabase();
    const left = db2.inventory.filter((i) => i.character_id === A.id && i.item_id === mat.id && (i.quantity || 0) > 0);
    assert.strictEqual(left.length, 0, '材料没有被真实扣掉：' + JSON.stringify(left));
  });

  // ---- 2) use-storage 键义统一 ----
  await t('use-storage：存入→取出回到**同一件**物品（旧键义分裂会取出错位物品）', async () => {
    const db = loadDatabase();
    const mat = db.items.find((i) => i.name === 'G5淬炼砂');
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: mat.id, quantity: 3 });
    saveDatabase(db);
    const st = await call('POST', '/api/cave/use-storage', { action: 'store', itemId: mat.id, quantity: 2 }, A.token);
    assert.strictEqual(st.code, 200, '存入失败：' + st.raw);
    const mid = await call('POST', '/api/cave/use-storage', { action: 'retrieve', itemId: mat.id, quantity: 2 }, A.token);
    assert.strictEqual(mid.code, 200, '取出失败（旧实现这里必报"物品不足"）：' + mid.raw);
    const db2 = loadDatabase();
    const rows = db2.inventory.filter((i) => i.character_id === A.id && i.item_id === mat.id);
    const total = rows.reduce((s, r) => s + (r.quantity || 0), 0);
    assert.strictEqual(total, 3, `存取一圈后数量不守恒（${total}≠3）`);
    const cave = (db2.caves || []).find((c) => c.character_id === A.id) || (db2.characters.find((c) => c.id === A.id) || {}).cave;
    if (cave && cave.storage) {
      assert.ok(!Object.values(cave.storage).some((v) => v > 0), '取出后仓库存量未清零：' + JSON.stringify(cave.storage));
    }
  });

  // ---- 3) offline-cultivate 窗口消费 ----
  await t('offline-cultivate：账本领一次即清零，连点第二次不得再发修为（旧版=无限泉水）', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === A.id);
    ch.pending_offline_seconds = 7200;
    saveDatabase(db);
    const before = Number(ch.exp || ch.cultivation || 0);
    const one = await call('POST', '/api/cultivation/offline-cultivate', {}, A.token);
    assert.strictEqual(one.code, 200, '第一次领取失败：' + one.raw);
    assert.ok(Number(one.body.expGained) > 0, `两小时账本竟领出 ${one.body.expGained} 修为：` + one.raw);
    const two = await call('POST', '/api/cultivation/offline-cultivate', {}, A.token);
    assert.strictEqual(two.code, 200, '第二次调用应和平返回：' + two.raw);
    assert.ok(!two.body.expGained, '第二次竟然又发了修为（窗口未消费）：' + two.raw);
    const db2 = loadDatabase();
    const ch2 = db2.characters.find((c) => c.id === A.id);
    assert.strictEqual(Number(ch2.pending_offline_seconds || 0), 0, '账本没被清零：' + ch2.pending_offline_seconds);
  });

  await t('登录把离线窗口存进账本而不是踩死（last_login 覆盖前先记账）', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === A.id);
    ch.last_login = new Date(Date.now() - 3600 * 1000).toISOString();
    ch.pending_offline_seconds = 0;
    saveDatabase(db);
    const u = loadDatabase().users.find((x) => x.id === A.uid);
    const r = await call('POST', '/api/auth/login', { username: u.username, password: 'pw-dummy-123' });
    assert.strictEqual(r.code, 200, '登录失败：' + r.raw);
    const db2 = loadDatabase();
    const ch2 = db2.characters.find((c) => c.id === A.id);
    assert.ok(Number(ch2.pending_offline_seconds) >= 3500, `登录没把一小时窗口入账（账本=${ch2.pending_offline_seconds}）`);
    assert.ok(Number(ch2.pending_offline_seconds) <= 7200, '入账超 2h 上限说明封顶没生效');
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
  console.log(`\nG5 批3修复: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('G5 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
});
