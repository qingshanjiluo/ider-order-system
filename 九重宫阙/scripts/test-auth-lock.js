/**
 * E1 · auth 中间件的角色互斥回归测试（进程内，无端口冲突、不写真实库）
 * 证明：① 同角色并发请求临界区不交错；② 响应结束即释放（总耗时远小于看门狗，不靠兜底）；
 *      ③ 突发之后仍有请求可用（无锁泄漏）；④ 未鉴权仍是 401（无回归）。
 */
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const auth = require('../src/middleware/auth');
const charLock = require('../src/middleware/charLock');
const { loadDatabase } = require('../src/database');

const UID = 987654;
const CID = 987654;

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== E1 · auth 角色互斥（端到端中间件层）==');

  const db = loadDatabase();               // 仅进程内镜像，故意不 saveDatabase
  const tempChar = { id: CID, user_id: UID, name: '__lock_probe__', realm: '炼气', level: 1 };
  const tempUser = { id: UID, username: '__lock_probe__' };
  db.characters.push(tempChar);
  if (Array.isArray(db.users)) db.users.push(tempUser);
  const token = jwt.sign({ userId: UID }, config.jwt.secret, { expiresIn: '5m' });

  let inside = 0, maxInside = 0, served = 0;
  const app = express();
  app.get('/probe', auth, async (req, res) => {
    inside++; maxInside = Math.max(maxInside, inside); served++;
    await new Promise((r) => setTimeout(r, 25));   // 模拟跨 await 的读-改-写
    inside--;
    res.json({ ok: true });
  });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;

  const req = () => new Promise((resolve, reject) => {
    const rq = http.get({ host: '127.0.0.1', port, path: '/probe', headers: { Authorization: `Bearer ${token}` } },
      (rs) => { rs.resume(); resolve(rs.statusCode); });
    rq.on('error', reject);
  });
  const anon = () => new Promise((resolve, reject) => {
    const rq = http.get({ host: '127.0.0.1', port, path: '/probe' }, (rs) => { rs.resume(); resolve(rs.statusCode); });
    rq.on('error', reject);
  });

  await t('未鉴权请求仍返回 401（无回归）', async () => {
    assert.strictEqual(await anon(), 401);
  });

  await t('同角色 8 路并发：临界区最大并发恒为 1', async () => {
    maxInside = 0; served = 0;
    const t0 = Date.now();
    const codes = await Promise.all(Array.from({ length: 8 }, req));
    const ms = Date.now() - t0;
    assert.ok(codes.every((c) => c === 200), `状态码异常：${codes.join(',')}`);
    assert.strictEqual(served, 8, '有请求被吞掉');
    assert.strictEqual(maxInside, 1, `并发进入 ${maxInside}，锁未生效`);
    assert.ok(ms < 8000, `总耗时 ${ms}ms 逼近看门狗，说明释放失效、靠超时硬放行`);
  });

  await t('突发后仍有请求可用且响应迅速（无锁泄漏）', async () => {
    const t0 = Date.now();
    assert.strictEqual(await req(), 200);
    assert.ok(Date.now() - t0 < 500, '释放不彻底，请求被卡在队列里');
    assert.strictEqual(charLock.queueDepth(CID), 0, '锁链未回收');
  });

  await t('无角色的用户不加锁也不报错（降级路径）', async () => {
    const orphan = jwt.sign({ userId: 424242 }, config.jwt.secret, { expiresIn: '5m' });
    const code = await new Promise((resolve, reject) => {
      const rq = http.get({ host: '127.0.0.1', port, path: '/probe', headers: { Authorization: `Bearer ${orphan}` } },
        (rs) => { rs.resume(); resolve(rs.statusCode); });
      rq.on('error', reject);
    });
    assert.strictEqual(code, 200);
  });

  server.close();
  const ci = db.characters.indexOf(tempChar); if (ci >= 0) db.characters.splice(ci, 1);
  if (Array.isArray(db.users)) { const ui = db.users.indexOf(tempUser); if (ui >= 0) db.users.splice(ui, 1); }

  console.log(`\nE1 auth 锁测试: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
