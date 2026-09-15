/**
 * G10 · 交易行经济行为套件（轮97，服务级）
 * 真 money 面审计三问：货去哪了（托管/回仓）、钱去哪了（费/税守恒）、
 * 空子在哪（自洗/价带/限频/供需系数越界）。tmp 数据目录，正式档只读比对。
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.DSH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g10-'));
const { loadDatabase, saveDatabase } = require('../src/database');
const store = require('../src/db/store');
const market = require('../src/services/market');

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const live0 = fs.existsSync(LIVE_DB) ? { size: fs.statSync(LIVE_DB).size, mtime: fs.statSync(LIVE_DB).mtimeMs } : null;

const results = [];
async function t(name, fn) {
  try { await fn(); results.push('  ✅ ' + name); }
  catch (e) { results.push('  ❌ ' + name + ': ' + e.message); }
}

(async () => {
  const db = loadDatabase();
  // boot 平价（r89 教训通用化）：货架目录靠 server boot 的 ensureAll 回填，套件必须自己跑
  const materials = require('../src/services/materials');
  materials.ensureAll(db);
  saveDatabase(db);
  const shopRow = (db.shop || []).find((s) => Number(s.price) > 0);
  assert.ok(shopRow, 'tmp 库无商店货架（seed 未跑？）');
  const item = db.items.find((i) => Number(i.id) === Number(shopRow.item_id));
  assert.ok(item, '货架指向幽灵物品');
  const mk = (id, name, stone) => {
    db.characters.push({ id, user_id: id, name, faction: 'martial', realm: '炼气', level: 1, spirit_stone: stone, created_at: new Date().toISOString() });
    return db.characters[db.characters.length - 1];
  };
  const seller = mk(970001, 'G10卖', 1000);
  const buyer = mk(970002, 'G10买', 100000);
  db.inventory.push({ id: 970101, character_id: seller.id, item_id: item.id, quantity: 10 });
  saveDatabase(db);

  let listingId = null;
  await t('挂单托管：货离仓、费先扣（1% 定价×量）', async () => {
    const before = seller.spirit_stone;
    const r = market.list(seller, 970101, 4, Number(shopRow.price));
    assert.ok(r.ok, '挂单被拒：' + r.error);
    listingId = r.listingId;
    const db2 = loadDatabase();
    assert.strictEqual(db2.inventory.find((i) => i.id === 970101).quantity, 6, '托管没扣足量');
    assert.strictEqual(before - seller.spirit_stone, r.fee, '挂单费对不上：' + r.fee);
    assert.strictEqual(r.fee, Math.ceil(4 * Number(shopRow.price) * market.LIST_FEE));
  });

  await t('价带闸：偏离指导价 ±40% 外拒挂（对倒天价单不再可能）', async () => {
    const r = market.list(seller, 970101, 1, Number(shopRow.price) * 9);
    assert.ok(!r.ok && /偏离指导价/.test(r.error || ''), '天价单竟挂上了：' + JSON.stringify(r));
  });

  await t('限频闸：同资源 1 小时窗第 4 单拒（防挂撤刷单）', async () => {
    for (let i = 0; i < 2; i++) {
      const r = market.list(seller, 970101, 1, Number(shopRow.price));
      assert.ok(r.ok, '窗口内第 ' + (i + 2) + ' 单被误拒：' + r.error);
    }
    const last = market.list(seller, 970101, 1, Number(shopRow.price));
    assert.ok(!last.ok && /最多挂/.test(last.error || ''), '第 4 单没被限频拦住');
  });

  await t('自洗禁令：卖家买自己挂单直接拒', async () => {
    const r = market.buy(seller, listingId, 1);
    assert.ok(!r.ok && /自己的挂单/.test(r.error || ''), '自买自卖没拦住：' + JSON.stringify(r));
  });

  await t('买方卖方账目守恒：付=收+税，供需系数参与定价', async () => {
    const db0 = loadDatabase();
    const l = store.queryRel('market_listings', { id: listingId })[0];
    const rate = market.getRate(`item:${item.name}`);
    const b0 = buyer.spirit_stone, s0 = seller.spirit_stone;
    const r = market.buy(buyer, listingId, 2);
    assert.ok(r.ok, '买二拒单：' + r.error);
    assert.strictEqual(r.paid, r.unitPrice * 2);
    assert.strictEqual(r.unitPrice, Math.ceil(l.price * rate), '成交价没吃供需系数');
    assert.strictEqual(b0 - buyer.spirit_stone, r.paid, '买家扣款不账实相符');
    assert.strictEqual(seller.spirit_stone - s0, r.sellerProceeds, '卖家入账不账实相符');
    assert.ok(r.paid - r.sellerProceeds >= Math.floor(r.paid * market.SALE_TAX * 0.5), '税差过小（钱凭空多了=印钞嫌疑）');
  });

  await t('过期单可撤回仓（轮97 硬伤：旧版货永久卡死）', async () => {
    const r2 = market.list(seller, 970101, 1, Number(shopRow.price)); // 窗口未满？刚限过频——用第二资源不行，改判：
    if (!r2.ok) { // 限频窗口内的合法拒单（前一测已把窗口用满）→ 手工造 expired 单：
      const fid = store.insertRel('market_listings', {
        seller_character_id: seller.id, item_kind: 'item', item_ref: item.id,
        quantity: 3, price: Number(shopRow.price), currency: 'spirit_stone', status: 'expired',
        created_at: new Date(Date.now() - 100 * 3600e3).toISOString(),
        expires_at: new Date(Date.now() - 3600e3).toISOString()
      });
      const sum = () => loadDatabase().inventory.filter((i) => i.character_id === seller.id && Number(i.item_id) === Number(item.id)).reduce((s, i) => s + (i.quantity || 0), 0);
      const s0 = sum();
      const c = market.cancel(seller, fid);
      assert.ok(c.ok, 'expired 单撤不回（硬伤复发）：' + JSON.stringify(c));
      assert.strictEqual(sum(), s0 + 3, '回仓量不对（合并语义=加进既有行，断言须看总量）');
      void r2; return;
    }
    store.updateRel('market_listings', r2.listingId, { expires_at: new Date(Date.now() - 1000).toISOString() });
    const c = market.cancel(seller, r2.listingId);
    assert.ok(c.ok, '到期单撤不回（硬伤复发）：' + JSON.stringify(c));
    assert.ok(store.queryRel('market_listings', { id: r2.listingId })[0].status === 'cancelled');
  });

  await t('供需系数钳制：千次shift 不越 [0.7,1.3]', async () => {
    for (let i = 0; i < 500; i++) market.shiftRate('item:' + item.name, 0.05);
    const hi = market.getRate('item:' + item.name);
    for (let i = 0; i < 500; i++) market.shiftRate('item:' + item.name, -0.05);
    const lo = market.getRate('item:' + item.name);
    assert.ok(hi <= market.RATE_MAX + 1e-9 && lo >= market.RATE_MIN - 1e-9, `越界 ${lo}~${hi}`);
  });

  await t('正式存档 data/game.db 未被本套件写动', () => {
    if (live0) {
      const now = fs.statSync(LIVE_DB);
      assert.strictEqual(now.size, live0.size, 'game.db 大小变了');
      assert.ok(Math.abs(now.mtime - live0.mtime) < 1, 'game.db 被摸过 mtime');
    }
  });

  for (let i = 0; i < 10; i++) { try { fs.rmSync(process.env.DSH_DATA_DIR, { recursive: true, force: true }); break; } catch (e) { await new Promise((r) => setTimeout(r, 400)); } }
  const fails = results.filter((r) => r.startsWith('  ❌')).length;
  console.log(results.join('\n'));
  console.log(`\nG10 经济行为: ${results.length - fails} 通过, ${fails} 失败`);
  process.exit(fails ? 1 : 0);
})();
