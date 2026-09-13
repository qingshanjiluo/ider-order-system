/**
 * G2 · 好友与市场经济端到端（P2 · 章程 E8；轮48）
 *
 * 断言的是 E8 的验收原文，而不是"接口存在"：
 *   A 申请 B -> B 同意 -> A 看到 B 在列 -> friends 类成就进度 > 0 -> 互删后亲密度归零。
 * 市场侧：真实成交一笔 -> 7 日成交价可用（样本/均价/中位/指导价）-> 天价挂单被拒 ->
 *   自买被拒 -> 同角色同物反复挂撤被限频 -> 全程灵石守恒（只少了挂单费与成交税）。
 * 反证：往库里灌 50 条 pending 申请，成就进度不得上涨（只认 accepted）。
 *
 * 只写 DSH_DATA_DIR 指到的临时目录；正式存档逐字节不得动（末尾有体积+mtime 双检）。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-friend-e2e-'));
process.env.DSH_DATA_DIR = TMP;

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const materials = require('../src/services/materials');
const market = require('../src/services/market');
const friend = require('../src/services/friend');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== G2 · 好友与市场经济（临时数据目录）==');

  const db0 = loadDatabase();
  materials.ensureAll(db0);
  saveDatabase(db0);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/shop', require('../src/routes/shop'));
  app.use('/api/market', require('../src/routes/market'));
  app.use('/api/friend', require('../src/routes/friend'));
  app.use('/api/achievement', require('../src/routes/achievement'));
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
    // 轮63：用户名必须落在 /api/auth/register 的 schema 规则内（3-20 字符，[A-Za-z0-9_汉字]）；
    // 旧写法带 13 位毫秒时间戳 + 4 位随机，实测 25 字符，一挂校验就 400。
    const u = String(tag).replace(/[^A-Za-z0-9]/g, "").slice(0, 5) + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1e3);
    const r = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
    assert.ok(r.code === 200 && r.body && r.body.token, `注册 ${tag} 失败：${r.code} ${r.raw}`);
    const db = loadDatabase();
    const uid = db.users.find((x) => x.username === u).id;
    const ch = db.characters.find((c) => Number(c.user_id) === Number(uid));
    return { token: r.body.token, name: ch.name, id: Number(ch.id) };
  };

  const A = await reg('gf_a');
  const B = await reg('gf_b');
  let storeKey = null, storePrice = 0;      // 市场腿之间共享的样本（成交过的那件材料与它的指导价）

  await t('E8 主链：A 申请 B -> B 同意 -> A 看到 B 在列', async () => {
    const rq = await call('POST', '/api/friend/request', { target: B.name }, A.token);
    assert.ok(rq.code === 200 && rq.body && rq.body.ok, '申请失败：' + rq.code + ' ' + rq.raw);
    const bin = await call('GET', '/api/friend/list', undefined, B.token);
    assert.strictEqual(bin.code, 200, 'B 拉列表失败：' + bin.raw);
    assert.strictEqual((bin.body.incoming || []).length, 1, 'B 的收件箱应恰好 1 条申请');
    const rid = bin.body.incoming[0].requestId;
    const dp = await call('POST', '/api/friend/respond', { requestId: rid, accept: true }, B.token);
    assert.ok(dp.code === 200 && dp.body.status === 'accepted', 'B 同意失败：' + dp.raw);
    const aList = await call('GET', '/api/friend/list', undefined, A.token);
    assert.strictEqual((aList.body.friends || []).length, 1, 'A 的好友列表没看到 B（E8 验收原文）');
    assert.strictEqual(aList.body.friends[0].character.name, B.name, '列表里那个不是 B');
  });

  const friendsProgress = async (tok) => {
    const r = await call('GET', '/api/achievement', undefined, tok);      // 这个接口实时计算 progress（/progress 读的是领取快照）
    assert.strictEqual(r.code, 200, '成就列表异常：' + r.raw);
    const list = Array.isArray(r.body) ? r.body : (r.body && r.body.achievements) || [];
    const one = list.find((a) => Number(a.id) === 40);
    assert.ok(one, '成就 40（社交达人，type=friends）不在列表里：' + r.raw.slice(0, 120));
    return Number(one.progress);
  };

  await t('friends 类成就进度第一次 > 0（D4 关闭的机器判据）', async () => {
    const v = await friendsProgress(A.token);
    assert.ok(Number.isFinite(v), '进度不是数字：' + v);
    assert.ok(v > 0, `有了 1 个好友，friends 成就进度仍然是 ${v}（恒 0 的 D4 老毛病没修掉）`);
    assert.ok(v <= 1, '进度不该超过 1：' + v);
  });

  await t('灌 50 条 pending 申请不得刷满社交成就（只认 accepted）', async () => {
    const before = await friendsProgress(A.token);
    assert.ok(before > 0, '前置失效：此刻 A 应该已有 1 个好友');
    const db = loadDatabase();
    for (let i = 0; i < 50; i++) {
      db.friends.push({ id: 900000 + i, character_id: A.id, friend_id: B.id + i, status: 'pending', intimacy: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    saveDatabase(db);
    const after = await friendsProgress(A.token);
    assert.ok(Math.abs(after - before) < 1e-9, `pending 灌水让进度从 ${before} 涨到 ${after}（申请数就能刷满成就）`);
    const junk = db.friends.filter((f) => Number(f.id) >= 900000);
    for (const x of junk) db.friends.splice(db.friends.indexOf(x), 1);
    saveDatabase(db);
    const cleaned = await friendsProgress(A.token);
    assert.ok(Math.abs(cleaned - before) < 1e-9, '清掉灌水行后进度回不到原值：' + cleaned);
  });

  await t('拜访洞府加亲密度、非好友不得拜访、每日限次', async () => {
    const v1 = await call('POST', '/api/friend/visit', { hostId: B.id }, A.token);
    assert.ok(v1.code === 200 && v1.body.ok, '好友拜访失败：' + v1.raw);
    assert.strictEqual(Number(v1.body.intimacy), friend.VISIT_INTIMACY, '亲密度增量不等于设定值');
    const C = await reg('gf_c');
    const bad = await call('POST', '/api/friend/visit', { hostId: B.id }, C.token);
    assert.strictEqual(bad.code, 400, '非好友竟然能进别人洞府：' + bad.raw);
    for (let i = 0; i < friend.VISIT_DAILY_LIMIT; i++) await call('POST', '/api/friend/visit', { hostId: B.id }, A.token);
    const over = await call('POST', '/api/friend/visit', { hostId: B.id }, A.token);
    assert.strictEqual(over.code, 400, `拜访超过每日 ${friend.VISIT_DAILY_LIMIT} 次没被拦`);
  });

  await t('互删后关系与亲密度一起归零（蓝图 §6.2 验收口径）', async () => {
    const rm = await call('POST', '/api/friend/remove', { friendId: B.id }, A.token);
    assert.ok(rm.code === 200 && rm.body.ok, '删除失败：' + rm.raw);
    assert.ok(Number(rm.body.intimacyLost) > 0, '删除时没报告失去的亲密度（说明前面没积累）');
    const aList = await call('GET', '/api/friend/list', undefined, A.token);
    assert.strictEqual((aList.body.friends || []).length, 0, 'A 删了但 B 还在 A 列表里（单向删除=关系没断）');
    const bList = await call('GET', '/api/friend/list', undefined, B.token);
    assert.strictEqual((bList.body.friends || []).length, 0, 'B 侧还残留好友行');
  });

  await t('自我申请与重复申请都被拒', async () => {
    const self = await call('POST', '/api/friend/request', { target: A.name }, A.token);
    assert.strictEqual(self.code, 400, '能给自己发好友申请：' + self.raw);
    const one = await call('POST', '/api/friend/request', { target: B.name }, A.token);
    assert.ok(one.code === 200, '首次申请失败：' + one.raw);
    const two = await call('POST', '/api/friend/request', { target: B.id }, A.token);
    assert.strictEqual(two.code, 400, '重复申请没被拒：' + two.raw);
    assert.ok(/已发出申请/.test(two.raw), '重复申请的拒绝理由异常：' + two.raw);
  });

  // —— 市场：先造一次真实成交，才有 7 日成交价可谈 ——
  const shopRowOf = async (tok) => {
    const r = await call('GET', '/api/shop/items', undefined, tok);
    const rows = Array.isArray(r.body) ? r.body : (r.body && (r.body.items || r.body.shop)) || [];
    const db = loadDatabase();
    const cand = rows.map((s) => {
      const it = db.items.find((i) => Number(i.id) === Number(s.item_id));
      return it && it.type === '材料' ? { shopId: Number(s.id), item: it, price: Number(s.price) } : null;
    }).filter(Boolean).sort((x, y) => x.price - y.price)[0];
    assert.ok(cand, '坊市里没有可买的材料');
    return cand;
  };

  await t('一笔真实成交：灵石守恒、物品转移、订单落表', async () => {
    const db1 = loadDatabase();
    const a0 = db1.characters.find((c) => Number(c.id) === A.id);
    a0.spirit_stone = 2000;                     // 夹具：模拟挂机所得，避免新号 100 灵石的偶然性
    const b0 = db1.characters.find((c) => Number(c.id) === B.id);
    b0.spirit_stone = 2000;
    saveDatabase(db1);

    const target = await shopRowOf(A.token);
    const buy = await call('POST', '/api/shop/buy', { itemId: target.shopId, quantity: 6 }, A.token);
    assert.ok(buy.code === 200, 'A 买材料失败：' + buy.raw);
    const inv = loadDatabase().inventory.find((i) => Number(i.character_id) === A.id && Number(i.item_id) === Number(target.item.id));
    assert.ok(inv && Number(inv.quantity) >= 6, '材料没进背包');

    const stoneA0 = Number(loadDatabase().characters.find((c) => Number(c.id) === A.id).spirit_stone);
    const stoneB0 = Number(loadDatabase().characters.find((c) => Number(c.id) === B.id).spirit_stone);
    const price = target.price;
    const lst = await call('POST', '/api/market/list', { inventoryId: inv.id, quantity: 1, price }, A.token);
    assert.ok(lst.code === 200 && lst.body.ok, `按指导价 ${price} 挂单被拒：${lst.raw}`);
    const listingId = lst.body.listingId, fee = Number(lst.body.fee);

    const pur = await call('POST', '/api/market/buy', { listingId, quantity: 1 }, B.token);
    assert.ok(pur.code === 200 && pur.body.ok, 'B 购买失败：' + pur.raw);
    const paid = Number(pur.body.paid), proceeds = Number(pur.body.sellerProceeds);
    const db2 = loadDatabase();
    const a1 = Number(db2.characters.find((c) => Number(c.id) === A.id).spirit_stone);
    const b1 = Number(db2.characters.find((c) => Number(c.id) === B.id).spirit_stone);
    assert.strictEqual(a1, stoneA0 - fee + proceeds, `卖方账目不守恒：应 ${stoneA0 - fee + proceeds} 实 ${a1}`);
    assert.strictEqual(b1, stoneB0 - paid, `买方账目不守恒：应 ${stoneB0 - paid} 实 ${b1}`);
    assert.strictEqual(proceeds, Math.floor(paid * (1 - market.SALE_TAX)), '成交税不是 3%');
    const invB = db2.inventory.find((i) => Number(i.character_id) === B.id && Number(i.item_id) === Number(target.item.id));
    assert.ok(invB && Number(invB.quantity) >= 1, '物品没转给买家');
    assert.ok(market.orderRows(`item:${target.item.name}`, 7).length >= 1, 'market_orders 没留下成交明细');
    storeKey = `item:${target.item.name}`;
    storePrice = price;
  });

  await t('7 日成交价可用：有样本、有均价/中位、有指导价与允许区间', async () => {
    const r = await call('GET', `/api/market/prices?item=${encodeURIComponent(storeKey.replace(/^item:/, ''))}`, undefined, A.token);
    assert.strictEqual(r.code, 200, '行情接口异常：' + r.raw);
    const row = ((r.body || {}).prices || [])[0];
    assert.ok(row, '查不到刚成交那件的行情：' + r.raw);
    assert.strictEqual(Number(row.windowDays), 7, '窗口不是 7 日');
    assert.ok(Number(row.samples) >= 1, '成交样本数为 0，聚合没接上 market_orders');
    assert.ok(Number.isFinite(Number(row.median)) && Number(row.median) > 0, '中位数不可用：' + JSON.stringify(row));
    assert.ok(Number.isFinite(Number(row.avg)) && Number(row.avg) > 0, '均价不可用');
    assert.ok(Number(row.guidance) > 0, '指导价不可用（source=' + row.guidanceSource + '）');
    assert.ok(row.priceBand && Number(row.priceBand.low) > 0 && Number(row.priceBand.high) > Number(row.priceBand.low), '允许区间异常：' + JSON.stringify(row.priceBand));
    assert.ok(['7d_median', 'shop_base'].includes(row.guidanceSource), '指导价来源异常：' + row.guidanceSource);
  });

  await t('天价挂单被拒（对倒洗钱的典型形态）、买自己挂单被拒、同物反复挂撤被限频', async () => {
    const db = loadDatabase();
    const inv = db.inventory.find((i) => Number(i.character_id) === A.id && String((db.items.find((x) => Number(x.id) === Number(i.item_id)) || {}).name) === storeKey.replace(/^item:/, ''));
    assert.ok(inv && Number(inv.quantity) >= 3, `A 手上没有足够${storeKey}做后续反证（剩 ${inv && inv.quantity}）`);
    const high = await call('POST', '/api/market/list', { inventoryId: inv.id, quantity: 1, price: Math.ceil(storePrice * 3) }, A.token);
    assert.strictEqual(high.code, 400, '三倍于指导价的挂单竟然成功：' + high.raw);
    assert.ok(/偏离指导价/.test(high.raw), '拒绝理由不是偏离指导价：' + high.raw);

    const l2 = await call('POST', '/api/market/list', { inventoryId: inv.id, quantity: 1, price: storePrice }, A.token);
    assert.ok(l2.code === 200, '第二单应成功：' + l2.raw);
    const self = await call('POST', '/api/market/buy', { listingId: l2.body.listingId, quantity: 1 }, A.token);
    assert.strictEqual(self.code, 400, '买自己的挂单没被拒：' + self.raw);

    const l3 = await call('POST', '/api/market/list', { inventoryId: inv.id, quantity: 1, price: storePrice }, A.token);
    assert.ok(l3.code === 200, '第三单应成功：' + l3.raw);
    const l4 = await call('POST', '/api/market/list', { inventoryId: inv.id, quantity: 1, price: storePrice }, A.token);
    assert.strictEqual(l4.code, 400, `第 ${market.LIST_MAX_PER_WINDOW + 1} 单没被限频拦住：` + l4.raw);
    assert.ok(/防刷单|最多挂/.test(l4.raw), '拒绝理由不是限频：' + l4.raw);
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
  console.log(`\nG2 好友与市场: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  // 轮63：exitCode 不强退 ⇒ 异常路径上未关的 server 句柄会吊住事件循环（门禁假死过一次）
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('G2 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  // 轮63：exitCode 不强退 ⇒ 异常路径上未关的 server 句柄会吊住事件循环（门禁假死过一次）
  setTimeout(() => process.exit(process.exitCode), 300).unref();
});
