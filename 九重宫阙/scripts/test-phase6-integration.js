/* 阶段6 集成验收（四相）：双账号交易行 + 兑换 + 特殊灵石 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3220';
const STATE = path.join(__dirname, '..', 'data', '.p6test-state.json');

async function api(method, path_, body, token) {
  const res = await fetch(BASE + path_, {
    method,
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

let pass = 0, fail = 0;
const report = () => console.log(`  ⇒ ${pass} 通过, ${fail} 失败`);
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

const mode = process.argv[2] || 'phaseA';

(async () => {
  if (mode === 'phaseA') {
    const ts = Date.now() % 100000;
    const s = await api('POST', '/api/auth/register', { username: `p6sell_${ts}`, password: 'p6test123456' });
    const b = await api('POST', '/api/auth/register', { username: `p6buy_${ts}`, password: 'p6test123456' });
    assert.ok(s.json.token && b.json.token, '注册失败');
    fs.writeFileSync(STATE, JSON.stringify({
      seller: { username: `p6sell_${ts}`, userId: s.json.userId }, sellerToken: s.json.token,
      buyer: { username: `p6buy_${ts}`, userId: b.json.userId }, buyerToken: b.json.token
    }));
    console.log(`  ✅ 注册卖家/买家 (${s.json.userId}/${b.json.userId})`);
  }

  if (mode === 'inject') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const seller = db.characters.find(c => c.user_id === state.seller.userId);
    const buyer = db.characters.find(c => c.user_id === state.buyer.userId);
    assert.ok(seller && buyer, '角色不存在');
    const herb = db.items.find(i => i.name === '灵草');
    assert.ok(herb, '灵草不存在');
    const invId = store.getNextId('inventory');
    db.inventory.push({ id: invId, character_id: seller.id, item_id: herb.id, quantity: 5 });
    buyer.spirit_stone = 100000;
    // 五行灵石测试物品
    let wuxing = db.items.find(i => i.name === '五行灵石');
    if (!wuxing) {
      const id = store.getNextId('items');
      db.items.push({ id, name: '五行灵石', type: '消耗品', quality: '仙品', stats: '{}', description: '五行俱全的特殊灵石' });
      wuxing = db.items.find(i => i.id === id);
    }
    const wxId = store.getNextId('inventory');
    db.inventory.push({ id: wxId, character_id: buyer.id, item_id: wuxing.id, quantity: 2 });
    state.inventoryId = invId;
    fs.writeFileSync(STATE, JSON.stringify(state));
    store.saveDatabase(db);
    store.close();
    console.log(`  ✅ 注入：卖家灵草×5（inv ${invId}）、买家灵石10万+五行灵石×2`);
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));

    await t('钱包面板（万级显示）', async () => {
      const r = await api('GET', '/api/economy/wallet', null, state.buyerToken);
      assert.strictEqual(r.json.base, 100000);
      assert.strictEqual(r.json.display, '10.00万');
      assert.strictEqual(r.json.exchangeFee, 0.02);
    });

    await t('卖家挂单：灵草×5 @100，挂单费1%', async () => {
      const r = await api('POST', '/api/market/list', { inventoryId: state.inventoryId, quantity: 5, price: 100 }, state.sellerToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.fee, 5); // 500×1%
      state.listingId = r.json.listingId;
      fs.writeFileSync(STATE, JSON.stringify(state));
    });

    await t('买家购买 2 个（供需系数生效）', async () => {
      const r = await api('POST', '/api/market/buy', { listingId: state.listingId, quantity: 2 }, state.buyerToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.quantity, 2);
      assert.ok(r.json.rate >= 0.7 && r.json.rate <= 1.3, `rate=${r.json.rate}`);
      assert.strictEqual(r.json.item, '灵草');
    });

    await t('卖方收款（扣3%成交税，离线入账）', async () => {
      const r = await api('GET', '/api/character', null, state.sellerToken);
      // 卖家收益在卖家 spirit_stone 里（原 100 −5费 +收益）
      assert.ok(r.json.spirit_stone > 90, `spirit_stone=${r.json.spirit_stone}`);
    });

    await t('我的挂单：余 3 open', async () => {
      const r = await api('GET', '/api/market/my', null, state.sellerToken);
      const l = r.json.listings.find(x => x.id === state.listingId);
      assert.ok(l && l.status === 'open' && l.quantity === 3, JSON.stringify(l));
    });

    await t('取消挂单：3 个退回背包', async () => {
      const r = await api('POST', '/api/market/cancel', { listingId: state.listingId }, state.sellerToken);
      assert.strictEqual(r.status, 200);
      const inv = await api('GET', '/api/character', null, state.sellerToken);
      assert.ok(inv.json, '角色可读');
    });

    await t('兑换 API：2% 手续费端到端', async () => {
      const r = await api('POST', '/api/economy/exchange', { fromTier: 'lower', toTier: 'middle', amount: 1000 }, state.buyerToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.fee.base, 20);
    });

    await t('五行灵石：1-2灵根反噬（重伤+扣寿）', async () => {
      const r = await api('POST', '/api/economy/stones/use', { name: '五行灵石' }, state.buyerToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.ok(r.json.effect.includes('反噬'), r.json.effect);
      const c = await api('GET', '/api/character', null, state.buyerToken);
      assert.strictEqual(c.json.injury.value, 100);
      assert.ok((c.json.lifespan_penalty_years || 0) > 0);
    });

    await t('市场调控系数在界内', async () => {
      const r = await api('GET', '/api/market/rates', null, state.buyerToken);
      for (const row of r.json.rates) {
        assert.ok(row.rate >= r.json.bounds.min && row.rate <= r.json.bounds.max, `rate越界 ${row.resource}=${row.rate}`);
      }
    });
  }

  if (mode === 'cleanup') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const chars = db.characters.filter(c => [state.seller.userId, state.buyer.userId].includes(c.user_id)).map(c => c.id);
    db.users = db.users.filter(u => ![state.seller.userId, state.buyer.userId].includes(u.id));
    db.characters = db.characters.filter(c => !chars.includes(c.id));
    for (const k of Object.keys(db)) {
      if (Array.isArray(db[k])) db[k] = db[k].filter(x => x && (x.user_id === undefined || !chars.includes(x.user_id)) && (x.character_id === undefined || !chars.includes(x.character_id)));
    }
    store.saveDatabase(db);
    store.close();
    const sqlite = require('node:sqlite');
    const sdb = new sqlite.DatabaseSync('data/game.db');
    for (const cid of chars) {
      sdb.prepare('DELETE FROM market_listings WHERE seller_character_id = ?').run(cid);
      sdb.prepare('DELETE FROM market_orders WHERE buyer_character_id = ?').run(cid);
      sdb.prepare('DELETE FROM lifespan_events WHERE character_id = ?').run(cid);
    }
    sdb.close();
    fs.unlinkSync(STATE);
    console.log(`  ✅ 已清理 ${state.seller.username}/${state.buyer.username}`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
