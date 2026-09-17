/**
 * E1 · HTTP 级并发守恒（P4 章程硬指标 · 轮52）
 *
 * 章程 E1 的验收原文："50 并发扣灵石余额精确；20 并发锻造材料不负、成品守恒"。
 * 此前的 test-lock.js 是在**服务层**用 Promise.all 打的（证明 withCharacterLock 本身对），
 * test-auth-lock.js 打的是 HTTP 但只看"临界区不交错"。也就是说：
 * **真实路由 + 真实中间件 + 50 路并发写同一角色的钱包/背包，从来没有被量过。**
 * 这一套补的就是这一段。
 *
 * 装配方式：只挂 auth（内含 `charLock.withCharacterLock` 看门狗）+ 真实业务路由，
 * **故意不挂全局 IP rateLimit / tierLimit** —— 那是 E2 攻击模拟的靶子，
 * 混在这里会让"50 路并发"退化成"50 路里有 30 路被 429 挡在门外"，守恒当然成立，但那什么都没测。
 *
 * 反超卖与"不同角色必须并行"也一起测：前者是玩家资产的底线，
 * 后者证明我们的锁是**按角色**的，不会把服务器串行化成一台打字机。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-concurrency-'));
process.env.DSH_DATA_DIR = TMP;


// 轮108 boot 平价（scripts/lib/boot-parity.js）：空档只跑 materials.ensureAll 是**兜底回填**，
// 它假设 db.items 已有基础数据 —— 实测跑完只有 327 件物品，而正式档 634 件。带着瘦档跑
// 测试会得出不可信的结论（可能假绿）。这里先按台账播种并自检规模。
// 位置要求：必须在任何 require('../src/database') 之前 —— store.js 的 DATA_DIR 在模块加载时固化。
require('./lib/boot-parity').bootParity({ quiet: true });
const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};
const nextId = (arr) => (arr || []).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;

(async () => {
  console.log('== E1 · HTTP 级并发守恒（临时数据目录）==');

  const boot = loadDatabase();
  require('../src/services/materials').ensureAll(boot);
  // 夹具：一个"2 材料 → 1 成品"的确定性配方（/forge/craft 本身无掷骰，成功数可精确断言）。
  // 临时空档没有 recipes 内容，这里自建不影响被测代码路径。
  const matItem = { id: nextId(boot.items), name: '并发测试矿', type: '材料', quality: '凡品', price: 1 };
  const outItem = { id: nextId(boot.items) + 1, name: '并发测试胚', type: '材料', quality: '凡品', price: 2 };
  boot.items.push(matItem, outItem);
  const recipe = { id: nextId(boot.recipes), name: '并发测试配方', result: outItem.id, quantity: 1, cost: 0, materials: [{ item_id: matItem.id, quantity: 2 }] };
  boot.recipes = boot.recipes || [];
  boot.recipes.push(recipe);
  saveDatabase(boot);

  // ⚠ 命名陷阱（本轮实测踩到，值得记下来）：POST /api/shop/buy 的 `itemId` 参数其实是**货架行 id**
  // （`db.shop.find(s => s.id === itemId)`），扣款用 `shop.price`，入库落到 `shop.item_id`。
  // 拿 items.id 去买会买到"另一条恰好同 id 的货架"，价格完全不同。这里两个 id 都取出来分开用。
  const dbSh = loadDatabase();
  assert.ok((dbSh.shop || []).length > 0, '临时档没有货架（materials.ensureAll 未生效？）');
  const goods = dbSh.shop.filter((s) => Number(s.price) > 0).sort((a, b) => Number(a.price) - Number(b.price))[0];
  goods.stock = -1;                       // 夹具：让这一格无限供应，测的是钱包守恒而不是库存守恒
  saveDatabase(dbSh);
  const buyRowId = Number(goods.id);       // 请求参数
  const buyItemId = Number(goods.item_id); // 入库后的物品 id
  const buyPrice = Number(goods.price);
  console.log(`  ℹ 夹具商品：货架行 ${buyRowId}（单价 ${buyPrice}）→ 物品 ${buyItemId}`);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/shop', require('../src/routes/shop'));
  app.use('/api/forge', require('../src/routes/forge'));
  app.use('/api/character', require('../src/routes/character'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;

  const call = (method, p, body, token) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers, timeout: 20000 }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ code: rs.statusCode, body: j, raw: buf.slice(0, 200) }); });
    });
    r.on('error', reject);
    // 轮63：加超时 ⇒ 对端不回时 Promise 一定 settle，不会把整个门禁吊住
    r.on('timeout', () => { r.destroy(); resolve({ code: 0, body: null, raw: 'timeout' }); });
    if (data) r.write(data);
    r.end();
  });

  const reg = async (tag) => {
    const u = String(tag).replace(/[^A-Za-z0-9_]/g, '').slice(0, 4) + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 100); // 轮63：旧拼法 23 字符超 schema 上限 20
    const r = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
    assert.ok(r.code === 200 && r.body && r.body.token, `注册 ${tag} 失败：${r.code} ${r.raw}`);
    const db = loadDatabase();
    const uid = db.users.find((x) => x.username === u).id;
    const ch = db.characters.find((c) => Number(c.user_id) === Number(uid));
    return { token: r.body.token, id: Number(ch.id) };
  };
  const setStone = (id, v) => { const db = loadDatabase(); db.characters.find((c) => c.id === id).spirit_stone = v; saveDatabase(db); };
  const stone = (id) => Number(loadDatabase().characters.find((c) => c.id === id).spirit_stone);
  const qtyOf = (cid, itemId) => loadDatabase().inventory.filter((i) => i.character_id === cid && i.item_id === itemId).reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  const A = await reg('cc_a');

  await t('50 路并发买同一商品：余额扣减精确到枚，库存增量等于成功数', async () => {
    setStone(A.id, 100000);
    const start = stone(A.id);
    const inv0 = qtyOf(A.id, buyItemId);
    const res = await Promise.all(Array.from({ length: 50 }, () => call('POST', '/api/shop/buy', { itemId: buyRowId, quantity: 1 }, A.token)));
    const ok = res.filter((r) => r.code === 200).length;
    assert.strictEqual(ok, 50, `只成功 ${ok}/50，其余：${[...new Set(res.filter((r) => r.code !== 200).map((r) => r.code + ' ' + r.raw))].join(' | ')}`);
    const end = stone(A.id);
    assert.strictEqual(end, start - 50 * buyPrice, `余额不精确：${start} - 50×${buyPrice} ≠ ${end}`);
    assert.strictEqual(qtyOf(A.id, buyItemId), inv0 + 50, '库存增量不等于成功数（丢失更新或重复计入）');
    assert.ok(end >= 0, '余额被扣成负数');
  });

  await t('余额只够 K 次时不得超卖：成功数恰为 K、余额恰为 0、其余全被拒', async () => {
    const K = 7;
    setStone(A.id, K * buyPrice);
    const res = await Promise.all(Array.from({ length: 50 }, () => call('POST', '/api/shop/buy', { itemId: buyRowId, quantity: 1 }, A.token)));
    const ok = res.filter((r) => r.code === 200).length;
    const rejected = res.filter((r) => r.code === 400);
    assert.strictEqual(ok, K, `并发下成功 ${ok} 次，应恰为可负担的 ${K} 次（超卖或漏卖）`);
    assert.strictEqual(rejected.length, 50 - K, `被拒 ${rejected.length} 次，应为 ${50 - K}`);
    assert.strictEqual(stone(A.id), 0, `余额应为 0，实际 ${stone(A.id)}（扣多了或读的是旧值）`);
    assert.ok(rejected.every((r) => /不足/.test(r.raw)), '拒绝理由不是"灵石不足"');
  });

  await t('20 路并发锻造：材料零负数、消耗量==成功数×用量、成品==成功数', async () => {
    const have = 9;                       // 4 份够、第 5 次必须材料不足
    const db = loadDatabase();
    db.inventory = db.inventory.filter((i) => !(i.character_id === A.id && (i.item_id === matItem.id || i.item_id === outItem.id)));
    db.inventory.push({ id: nextId(db.inventory), character_id: A.id, item_id: matItem.id, quantity: have });
    saveDatabase(db);
    const out0 = qtyOf(A.id, outItem.id);

    const res = await Promise.all(Array.from({ length: 20 }, () => call('POST', '/api/forge/craft', { recipeId: recipe.id }, A.token)));
    const ok = res.filter((r) => r.code === 200).length;
    const expectOk = Math.floor(have / 2);
    assert.strictEqual(ok, expectOk, `成功 ${ok} 次，材料 ${have} 份 / 每次 2 份应恰成功 ${expectOk} 次`);
    assert.ok(res.filter((r) => r.code !== 200).every((r) => /材料不足/.test(r.raw)), '非成功原因不是材料不足：' + res.filter((r) => r.code !== 200).map((r) => r.raw).join(' | '));
    assert.strictEqual(qtyOf(A.id, matItem.id), have - expectOk * 2, '材料消耗量与成功数不吻合');
    assert.ok(qtyOf(A.id, matItem.id) >= 0, '材料被扣成负数');
    assert.strictEqual(qtyOf(A.id, outItem.id), out0 + expectOk, '成品数量不守恒（丢失更新/重复生成）');
    for (const row of loadDatabase().inventory.filter((i) => i.character_id === A.id)) {
      assert.ok(Number(row.quantity) > 0, `背包里留下 quantity=${row.quantity} 的僵尸行（应为 0 时删行）`);
    }
  });

  await t('混合写压（50 买 + 20 锻同时打）：灵石、材料、成品三项同时精确', async () => {
    setStone(A.id, 100000);
    const db = loadDatabase();
    db.inventory = db.inventory.filter((i) => !(i.character_id === A.id && (i.item_id === matItem.id || i.item_id === outItem.id)));
    db.inventory.push({ id: nextId(db.inventory), character_id: A.id, item_id: matItem.id, quantity: 8 });
    saveDatabase(db);
    const s0 = stone(A.id);
    const buyInv0 = qtyOf(A.id, buyItemId);
    const out0 = qtyOf(A.id, outItem.id);

    const all = await Promise.all([
      ...Array.from({ length: 50 }, () => call('POST', '/api/shop/buy', { itemId: buyRowId, quantity: 1 }, A.token)),
      ...Array.from({ length: 20 }, () => call('POST', '/api/forge/craft', { recipeId: recipe.id }, A.token))
    ]);
    const buys = all.slice(0, 50).filter((r) => r.code === 200).length;
    const crafts = all.slice(50).filter((r) => r.code === 200).length;
    assert.strictEqual(buys, 50, `混合负载下购买成功 ${buys}/50（互相挤掉了）`);
    assert.strictEqual(crafts, 4, `混合负载下锻造成功 ${crafts}，材料 8/每次 2 应恰为 4`);
    assert.strictEqual(stone(A.id), s0 - 50 * buyPrice, '混合负载下灵石扣减不精确');
    assert.strictEqual(qtyOf(A.id, matItem.id), 0, '混合负载下材料不守恒');
    assert.strictEqual(qtyOf(A.id, outItem.id), out0 + 4, '混合负载下成品不守恒');
    assert.strictEqual(qtyOf(A.id, buyItemId), buyInv0 + 50, '混合负载下购买入库不守恒');
  });

  await t('多角色各 15 路并发写：四份资产各自精确、跨角色不串（并行度由 test-auth-lock 证明）', async () => {
    const chars = [A];
    for (const tag of ['cc_b', 'cc_c', 'cc_d']) chars.push(await reg(tag));
    for (const c of chars) setStone(c.id, 200000);
    const before = chars.map((c) => stone(c.id));
    const invBefore = chars.map((c) => qtyOf(c.id, buyItemId));

    const groups = chars.map((c) => Array.from({ length: 15 }, () => call('POST', '/api/shop/buy', { itemId: buyRowId, quantity: 1 }, c.token)));
    const flat = await Promise.all(groups.map((g) => Promise.all(g)));
    flat.forEach((rs, i) => {
      const ok = rs.filter((r) => r.code === 200).length;
      assert.strictEqual(ok, 15, `角色 ${i} 只成功 ${ok}/15`);
      assert.strictEqual(stone(chars[i].id), before[i] - 15 * buyPrice, `角色 ${i} 余额不精确`);
      assert.strictEqual(qtyOf(chars[i].id, buyItemId), invBefore[i] + 15, `角色 ${i} 库存不守恒`);
    });

    // 全局唯一性：并发下 getNextId 若被交错就会撞 id（撞了就是一条背包行覆盖另一条）
    for (const coll of ['inventory', 'equipments']) {
      const rows = loadDatabase()[coll] || [];
      const ids = rows.map((r) => Number(r.id));
      const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
      assert.deepStrictEqual([...new Set(dup)], [], `${coll} 出现重复 id：${[...new Set(dup)].join(',')}（并发取号被打断了）`);
    }
  });

  await t('并发不得把资源写进别人的账户（跨角色串味）', () => {
    const db = loadDatabase();
    const ids = new Set(['cc_a'].length ? db.characters.map((c) => Number(c.id)) : []);
    for (const row of db.inventory) {
      assert.ok(ids.has(Number(row.character_id)), `背包行 ${row.id} 指向不存在的角色 ${row.character_id}`);
    }
    const aStones = qtyOf(A.id, matItem.id);
    assert.ok(aStones >= 0, '夹具矿数量异常');
    const others = db.inventory.filter((i) => i.character_id !== A.id && (i.item_id === matItem.id || i.item_id === outItem.id));
    assert.strictEqual(others.length, 0, `测试夹具材料串到了别的角色：${others.map((o) => o.character_id).join(',')}`);
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
  console.log(`\nE1 HTTP 并发守恒: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error('E1 并发套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
});
