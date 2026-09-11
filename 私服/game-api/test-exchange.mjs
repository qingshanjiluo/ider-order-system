// 交易所路由集成测试（Worker 版）
// 运行：
//   npx esbuild test-exchange.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\exchange-bundle.mjs
//   node D:\Temp\opencode\exchange-bundle.mjs
import { handleExchangeRoute, __exchangeTestReset } from './src/routes/exchange.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';

const store = new Map();
let seq = 1000;
function rows(keyPrefix) {
  const out = [];
  for (const [k, v] of store) if (k.startsWith(keyPrefix)) out.push(v);
  return out;
}
function setRow(k, v) { store.set(k, v); return { meta: { last_row_id: seq++ } }; }

function parseSnap(s) {
  try { const o = JSON.parse(String(s || '{}')); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; }
}
function nowSec() { return Math.floor(Date.now() / 1000); }

function sellerName(accountId) {
  const a = store.get('a:' + Number(accountId));
  const p = store.get('p:' + Number(accountId));
  let name = '';
  if (p) { try { name = String(JSON.parse(p.data).name || ''); } catch (_) {} }
  return { seller_username: a?.username || null, seller_player_name: name || null };
}

function isWeaponSubtype(sub) { return ['剑','刀','长兵','弓','拳爪','音律','节杖'].includes(String(sub)); }
function isArmorSlot(sub) { return ['head','shoulder','chest','legs','hands','ring','amulet','back'].includes(String(sub)); }

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const sql = this.sql, args = this.args;
    const results = [];
    if (sql.includes('SELECT data FROM players') || sql.includes('FROM players WHERE account_id = ?')) {
      const p = store.get('p:' + Number(args[0]));
      if (p) results.push({ data: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) });
    } else if (sql.includes('FROM accounts') && sql.includes('WHERE id = ?')) {
      const a = store.get('a:' + Number(args[0]));
      if (a) results.push(a);
    } else if (sql.includes('SELECT id FROM mailbox_messages') && sql.includes('dedupe_key')) {
      const rec = rows('mm:').find(v => Number(v.account_id) === Number(args[0]) && String(v.dedupe_key) === String(args[1]));
      if (rec) results.push({ id: rec.id });
    } else if (sql.includes('FROM exchange_listings l') && sql.includes('l.seller_account_id = ?')) {
      // listMyExchangeListings
      const aid = Number(args[0]);
      let arr = rows('el:').filter(v => Number(v.seller_account_id) === aid);
      if (sql.includes("l.status IN ('open','partial')")) arr = arr.filter(v => ['open','partial'].includes(String(v.status)));
      arr.sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
      for (const v of arr) results.push({ ...v, ...sellerName(v.seller_account_id) });
    } else if (sql.includes('FROM exchange_listings l')) {
      // listExchangeListings（市场）
      let arr = rows('el:').filter(v => ['open','partial'].includes(String(v.status)) && Number(v.quantity_left) > 0 && (Number(v.expires_at) || 0) > nowSec());
      let i = 0;
      if (sql.includes('l.side = ?')) { const side = String(args[i++]); arr = arr.filter(v => String(v.side) === side); }
      if (sql.includes('l.item_id = ?')) { const iid = Number(args[i++]); arr = arr.filter(v => Number(v.item_id) === iid); }
      if (sql.includes('l.item_name LIKE ?')) { const kw = String(args[i++]); arr = arr.filter(v => String(v.item_name).includes(kw)); }
      if (sql.includes('l.unit_price >= ?')) { const m = Number(args[i++]); arr = arr.filter(v => Number(v.unit_price) >= m); }
      if (sql.includes('l.unit_price <= ?')) { const m = Number(args[i++]); arr = arr.filter(v => Number(v.unit_price) <= m); }
      if (sql.includes("json_extract(l.item_snapshot_json, '$.quality'")) {
        const q = Number(args[i++]);
        arr = arr.filter(v => { const s = parseSnap(v.item_snapshot_json); return Number(s.quality) === q || Number(s.equipment_criteria?.min_quality) === q || Number(s.equipment_criteria?.minQuality) === q; });
      }
      if (sql.includes("json_type(json_extract(l.item_snapshot_json, '$.equipment_criteria')) = 'object'")) {
        const types = args.slice(i, i + 9); i += 9;
        arr = arr.filter(v => { const s = parseSnap(v.item_snapshot_json); return (s.equipment_criteria && typeof s.equipment_criteria === 'object') || types.includes(String(s.type)); });
      } else if (sql.includes("$.type') = 'material'")) {
        arr = arr.filter(v => String(parseSnap(v.item_snapshot_json).type) === 'material');
      } else if (sql.includes("$.type') IN ('herb', 'medicine')")) {
        arr = arr.filter(v => ['herb','medicine'].includes(String(parseSnap(v.item_snapshot_json).type)));
      } else if (sql.includes("$.type') = 'consumable'")) {
        arr = arr.filter(v => String(parseSnap(v.item_snapshot_json).type) === 'consumable');
      } else if (sql.includes("$.type') = 'book'")) {
        arr = arr.filter(v => String(parseSnap(v.item_snapshot_json).type) === 'book');
      } else if (sql.includes("$.type') = 'talisman'")) {
        arr = arr.filter(v => String(parseSnap(v.item_snapshot_json).type) === 'talisman');
      }
      if (sql.includes("$.equipment_criteria.slot'), '') = 'weapon'")) {
        const s1 = String(args[i++]); const s2 = String(args[i++]);
        arr = arr.filter(v => { const s = parseSnap(v.item_snapshot_json); return (s.type === 'weapon' && String(s.subtype) === s1) || (s.equipment_criteria?.slot === 'weapon' && String(s.equipment_criteria?.subtype) === s2); });
      } else if (sql.includes("$.equipment_criteria.slot'), '') = ?")) {
        const slot = String(args[i++]);
        arr = arr.filter(v => { const s = parseSnap(v.item_snapshot_json); return String(s.type) === slot || String(s.equipment_criteria?.slot) === slot; });
      } else if (sql.includes("$.equipment_criteria.subtype'")) {
        const sub = String(args[i++]);
        arr = arr.filter(v => { const s = parseSnap(v.item_snapshot_json); return String(s.subtype || s.equipment_criteria?.subtype || '') === sub; });
      } else if (sql.includes("$.equipment_criteria.material'")) {
        const m = String(args[i++]);
        arr = arr.filter(v => { const s = parseSnap(v.item_snapshot_json); return String(s.material || s.equipment_criteria?.material || '') === m; });
      }
      let orderBy = (a, b) => (Number(a.unit_price) || 0) - (Number(b.unit_price) || 0) || (Number(a.created_at) || 0) - (Number(b.created_at) || 0);
      if (sql.includes("ORDER BY l.unit_price DESC")) orderBy = (a, b) => (Number(b.unit_price) || 0) - (Number(a.unit_price) || 0);
      if (sql.includes("ORDER BY l.created_at DESC, l.id DESC")) orderBy = (a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0) || (Number(b.id) || 0) - (Number(a.id) || 0);
      if (sql.includes("ORDER BY l.created_at ASC, l.id ASC")) orderBy = (a, b) => (Number(a.created_at) || 0) - (Number(b.created_at) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0);
      arr = arr.sort(orderBy);
      const limIdx = sql.indexOf('LIMIT ? OFFSET ?');
      if (limIdx >= 0) {
        const ps = Number(args[args.length - 2]) || 20;
        const off = Number(args[args.length - 1]) || 0;
        arr = arr.slice(off, off + ps);
      }
      for (const v of arr) results.push({ ...v, ...sellerName(v.seller_account_id) });
    } else if (sql.includes('FROM exchange_listings') && sql.includes('WHERE id=')) {
      const rec = store.get('el:' + Number(args[0]));
      if (rec) results.push(rec);
    } else if (sql.includes('FROM exchange_listings') && sql.includes('expires_at <=')) {
      const arr = rows('el:').filter(v => ['open','partial'].includes(String(v.status)) && Number(v.quantity_left) > 0 && (Number(v.expires_at) || 0) > 0 && (Number(v.expires_at) || 0) <= nowSec());
      for (const v of arr) results.push(v);
    } else if (sql.includes('FROM exchange_trades') && sql.includes('unit_price')) {
      const iid = Number(args[0]); const minTs = Number(args[1]); const lim = Number(args[2]) || 300;
      const arr = rows('et:').filter(v => Number(v.item_id) === iid && (Number(v.created_at) || 0) >= minTs && String(v.side) === 'sell')
        .sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0)).slice(0, lim);
      for (const v of arr) results.push({ unit_price: Number(v.unit_price) || 0 });
    }
    return { results };
  }
  async run() {
    const sql = this.sql, args = this.args;
    if (sql.includes('INSERT INTO players') || sql.includes('ON CONFLICT(account_id)')) {
      return setRow('p:' + Number(args[0]), { account_id: Number(args[0]), slot: Number(args[1]), data: args[2] });
    }
    if (sql.includes('INSERT INTO exchange_listings')) {
      const id = seq++;
      store.set('el:' + id, {
        id,
        seller_account_id: Number(args[0]),
        item_id: Number(args[1]),
        item_name: String(args[2]),
        item_snapshot_json: String(args[3]),
        unit_price: Number(args[4]),
        quantity_total: Number(args[5]),
        quantity_left: Number(args[6]),
        status: 'open',
        side: String(args[7]),
        tax_per_unit: Number(args[8]),
        created_at: Number(args[9]),
        updated_at: Number(args[10]),
        expires_at: Number(args[11])
      });
      return { meta: { last_row_id: id } };
    }
    if (sql.includes("SET status = CASE WHEN quantity_left <= ? THEN 'filled' ELSE 'partial' END")) {
      const qty = Number(args[0]);
      const lid = Number(args[2]);
      const rec = store.get('el:' + lid);
      if (!rec || !['open','partial'].includes(String(rec.status)) || (Number(rec.quantity_left) || 0) < qty) return { meta: { changes: 0 } };
      rec.quantity_left = (Number(rec.quantity_left) || 0) - qty;
      rec.status = rec.quantity_left <= 0 ? 'filled' : 'partial';
      rec.updated_at = nowSec();
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status='cancelled'")) {
      const rec = store.get('el:' + Number(args[0]));
      if (!rec) return { meta: { changes: 0 } };
      rec.status = 'cancelled';
      rec.updated_at = nowSec();
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status='expired'")) {
      const rec = store.get('el:' + Number(args[0]));
      if (!rec) return { meta: { changes: 0 } };
      rec.status = 'expired';
      rec.updated_at = nowSec();
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status='partial'")) {
      let n = 0;
      for (const v of rows('el:')) if (v.status === 'filled' && (Number(v.quantity_left) || 0) > 0) { v.status = 'partial'; n++; }
      return { meta: { changes: n } };
    }
    if (sql.includes("SET status='filled'")) {
      let n = 0;
      for (const v of rows('el:')) if (['open','partial'].includes(String(v.status)) && (Number(v.quantity_left) || 0) <= 0) { v.status = 'filled'; n++; }
      return { meta: { changes: n } };
    }
    if (sql.includes('INSERT INTO exchange_trades')) {
      const id = seq++;
      store.set('et:' + id, {
        id,
        listing_id: Number(args[0]),
        seller_account_id: Number(args[1]),
        buyer_account_id: Number(args[2]),
        item_id: Number(args[3]),
        item_name: String(args[4]),
        quantity: Number(args[5]),
        unit_price: Number(args[6]),
        total_price: Number(args[7]),
        tax_amount: Number(args[8]),
        seller_income: Number(args[9]),
        side: String(args[10]),
        created_at: nowSec()
      });
      return { meta: { last_row_id: id } };
    }
    if (sql.includes('INSERT INTO mailbox_messages')) {
      const id = seq++;
      if (sql.includes('dedupe_key')) {
        store.set('mm:' + id, {
          id, account_id: Number(args[0]), type: String(args[1]), title: String(args[2]), content: String(args[3]),
          attachments_json: String(args[4]), status: 'unread', created_at: Number(args[5]), claimed_at: 0,
          expires_at: Number(args[6]), dedupe_key: String(args[7])
        });
      } else {
        store.set('mm:' + id, {
          id, account_id: Number(args[0]), type: String(args[1]), title: String(args[2]), content: String(args[3]),
          attachments_json: String(args[4]), status: 'unread', created_at: Number(args[5]), claimed_at: 0,
          expires_at: Number(args[6]), dedupe_key: ''
        });
      }
      return { meta: { last_row_id: id } };
    }
    return { meta: { last_row_id: seq++ } };
  }
}

const env = {
  DB: {
    prepare(sql) { return new Stmt(sql); },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; }
  },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper'
};

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label, JSON.stringify(detail)); }
}

function makeReq(method, path, body, token) {
  const headers = token
    ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
  return {
    method,
    url: path,
    headers: { get: (name) => headers[name] || null },
    json: async () => body || {}
  };
}

async function call(method, path, body, token) {
  const res = await handleExchangeRoute(makeReq(method, 'http://test/api' + path, body, token), env, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function reset() { __exchangeTestReset(); }

const db = createDb(env);
const tokenA = await signToken(21, 'playerA', env);
const tokenB = await signToken(22, 'playerB', env);
const tokenC = await signToken(23, 'playerC', env);

// 玩家 A：铁剑 x1（[0][0]）、寒潭沙 x20（[0][1]）
const pa = await createInitialPlayerData('甲修士', [1, 2, 3], env);
pa.inventory[0][0] = { item: { id: 11, name: '铁剑', type: 'weapon', subtype: '剑', material: '金属', quality: 1 }, count: 1 };
pa.inventory[0][1] = { item: { id: 27, name: '寒潭沙', type: 'material', material: '土石', quality: 2 }, count: 20 };
pa.spirit_stones = 100000;
await db.savePlayer(21, 1, pa);
// 玩家 B：寒潭沙 x40、沉泥 x20
const pb = await createInitialPlayerData('乙修士', [1, 2, 3], env);
pb.inventory[0][1] = { item: { id: 27, name: '寒潭沙', type: 'material', material: '土石', quality: 2 }, count: 40 };
pb.inventory[0][2] = { item: { id: 20, name: '沉泥', type: 'material', material: '土石', quality: 1 }, count: 20 };
pb.spirit_stones = 100000;
await db.savePlayer(22, 1, pb);
// 玩家 C：寒潭沙 x10、沉泥 x20
const pc = await createInitialPlayerData('丙修士', [1, 2, 3], env);
pc.inventory[0][1] = { item: { id: 27, name: '寒潭沙', type: 'material', material: '土石', quality: 2 }, count: 10 };
pc.inventory[0][2] = { item: { id: 20, name: '沉泥', type: 'material', material: '土石', quality: 1 }, count: 20 };
pc.spirit_stones = 100000;
await db.savePlayer(23, 1, pc);
store.set('a:21', { id: 21, username: 'playerA' });
store.set('a:22', { id: 22, username: 'playerB' });
store.set('a:23', { id: 23, username: 'playerC' });

console.log('== 1. 列表与鉴权 ==');
await reset();
let r = await call('GET', '/exchange/listings', null, null);
assert('未登录 401', r.status === 401, { status: r.status });
await reset();
r = await call('GET', '/exchange/listings', null, tokenA);
assert('空列表 + 税率 + 市场令牌', r.data && r.data.ok === true && Array.isArray(r.data.list) && r.data.list.length === 0 && Math.abs((r.data.tax_rate || 0) - 0.05) < 1e-9 && typeof r.data.market_token === 'string' && r.data.market_token.length > 0, r.data);

console.log('== 2. 询价 ==');
await reset();
r = await call('GET', '/exchange/quote?side=sell&page=0&slot_index=0&quantity=1&unit_price=100', null, tokenA);
assert('出售询价(背包铁剑)', r.data && r.data.ok === true && r.data.item_id === 11 && r.data.unit_price === 100 && r.data.tax_per_unit > 0 && r.data.estimated_income_per_unit === 100 - r.data.tax_per_unit, r.data);
await reset();
r = await call('GET', '/exchange/quote?side=sell&item_id=27&quantity=2&unit_price=50', null, tokenA);
assert('出售询价(按id)', r.data && r.data.ok === true && r.data.item_id === 27 && r.data.tax_per_unit > 0 && r.data.estimated_income_total === r.data.estimated_income_per_unit * 2, r.data);
await reset();
r = await call('GET', '/exchange/quote?side=buy&item_id=27&quantity=5&unit_price=50', null, tokenB);
assert('求购询价(预存计算)', r.data && r.data.ok === true && r.data.barter_enabled === false && r.data.tax_per_unit > 0 && r.data.escrow_total === (50 + r.data.tax_per_unit) * 5 && r.data.total_price === 250, r.data);
await reset();
r = await call('GET', '/exchange/quote?side=sell&item_id=11&quantity=1&unit_price=100', null, null);
assert('询价未登录 401', r.status === 401, { status: r.status });

console.log('== 3. 上架出售 ==');
await reset();
r = await call('POST', '/exchange/listings', { page: 0, slot_index: 0, expect_item_id: 11, quantity: 1, unit_price: 100 }, tokenA);
assert('上架铁剑', r.data && r.data.ok === true && r.data.listing_id > 0 && r.data.quantity === 1, r.data);
const swordListingId = r.data.listing_id;
await reset();
r = await call('POST', '/exchange/listings', { page: 0, slot_index: 1, expect_item_id: 27, quantity: 2, unit_price: 50 }, tokenA);
assert('上架寒潭沙x2', r.data && r.data.ok === true && r.data.listing_id > 0, r.data);
const sandListingId = r.data.listing_id;
await reset();
r = await call('POST', '/exchange/listings', { page: 0, slot_index: 0, expect_item_id: 11, quantity: 1, unit_price: 100 }, tokenA);
assert('槽位物品已变动拦截(SLOT_MISMATCH)', r.data && r.data.ok === false && r.data.code === 'SLOT_MISMATCH', r.data);
await reset();
r = await call('POST', '/exchange/listings', { page: 0, slot_index: 1, expect_item_id: 27, quantity: 999, unit_price: 50 }, tokenA);
assert('数量超可售拦截', r.data && r.data.ok === false, r.data);

console.log('== 4. 我的挂单 / 市场列表 ==');
await reset();
r = await call('GET', '/exchange/my/listings', null, tokenA);
assert('我的挂单 2 条', r.data && r.data.ok === true && r.data.list.length === 2, r.data);
await reset();
r = await call('GET', '/exchange/listings?side=sell', null, tokenB);
assert('市场列表含2条 + 卖家名', r.data && r.data.ok === true && r.data.list.length === 2 && r.data.list.every(x => x.seller_player_name === '甲修士') && typeof r.data.market_token === 'string', r.data);
const sellToken = r.data.market_token;
const sandListing = r.data.list.find(x => x.listing_id === sandListingId);
assert('寒潭沙挂单在列表中', sandListing && sandListing.item_id === 27 && sandListing.quantity_left === 2 && sandListing.seller_account_id === 21, sandListing);

console.log('== 5. 购买 ==');
await reset();
r = await call('POST', '/exchange/buy', { listing_id: sandListingId, quantity: 1, market_token: sellToken }, tokenB);
assert('购买寒潭沙x1', r.data && r.data.ok === true && r.data.total_price === 50 && r.data.tax_amount === r.data.tax_per_unit * 1 && r.data.seller_income === r.data.total_price - r.data.tax_amount && r.data.delivery_warning === false && r.data.tax_locked === true, r.data);
await reset();
r = await call('GET', '/exchange/listings?side=sell', null, tokenB);
const remaining = r.data && r.data.list.find(x => x.listing_id === sandListingId);
assert('挂单剩余1件(partial)', remaining && remaining.quantity_left === 1 && remaining.status === 'partial', remaining);
await reset();
r = await call('POST', '/exchange/buy', { listing_id: sandListingId, quantity: 1, market_token: sellToken }, tokenB);
assert('购买剩余1件(售罄)', r.data && r.data.ok === true && r.data.total_price === 50, r.data);
await reset();
r = await call('GET', '/exchange/my/listings?include_closed=1', null, tokenA);
const filledSand = r.data && r.data.list.find(x => x.listing_id === sandListingId);
assert('寒潭沙挂单已售罄(filled)', filledSand && filledSand.status === 'filled' && filledSand.quantity_left === 0, filledSand);
await reset();
r = await call('GET', '/exchange/listings?side=sell', null, tokenB);
assert('售罄挂单不再出现在市场', r.data && r.data.ok === true && !r.data.list.some(x => x.listing_id === sandListingId), r.data);
await reset();
r = await call('GET', '/exchange/listings?side=sell', null, tokenA);
const ownToken = r.data && r.data.market_token;
await reset();
r = await call('POST', '/exchange/buy', { listing_id: swordListingId, quantity: 1, market_token: ownToken }, tokenA);
assert('不能购买自己的挂单', r.data && r.data.ok === false && /自己/.test(r.data.error || ''), r.data);
// 买家应已收到邮件
assert('买家收到到货邮件', rows('mm:').some(v => Number(v.account_id) === 22 && v.type === 'trade_buy'), rows('mm:').map(v => v.account_id + ':' + v.type));
assert('卖家收到灵石邮件', rows('mm:').some(v => Number(v.account_id) === 21 && v.type === 'trade_sale'), rows('mm:').map(v => v.account_id + ':' + v.type));

console.log('== 6. 撤单 ==');
await reset();
r = await call('GET', '/exchange/listings?side=sell', null, tokenA);
const cancelToken = r.data && r.data.market_token;
await reset();
r = await call('POST', '/exchange/listings/' + swordListingId + '/cancel', { market_token: cancelToken }, tokenA);
assert('撤销铁剑挂单', r.data && r.data.ok === true && r.data.refunded_quantity === 1 && r.data.delivery_warning === false, r.data);
assert('卖家收到退回邮件', rows('mm:').some(v => Number(v.account_id) === 21 && v.type === 'trade_refund'), rows('mm:').map(v => v.account_id + ':' + v.type));

console.log('== 7. 求购单（灵石）==');
await reset();
r = await call('POST', '/exchange/buy_orders', { item_id: 27, item_name: '寒潭沙', quantity: 5, unit_price: 30 }, tokenB);
assert('发布求购单', r.data && r.data.ok === true && r.data.listing_id > 0 && r.data.escrow_total > 0 && r.data.tax_per_unit > 0, r.data);
const buyOrderId = r.data.listing_id;
const escrowTotal = r.data.escrow_total;
await reset();
r = await call('GET', '/exchange/listings?side=buy', null, tokenC);
assert('求购列表可见 + 令牌', r.data && r.data.ok === true && r.data.list.some(x => x.listing_id === buyOrderId) && typeof r.data.market_token === 'string', r.data);
const buyToken = r.data.market_token;
const buyListing = r.data.list.find(x => x.listing_id === buyOrderId);
assert('求购单信息', buyListing && buyListing.side === 'buy' && buyListing.unit_price === 30 && buyListing.quantity_left === 5, buyListing);

console.log('== 8. 成交求购单（灵石）==');
await reset();
r = await call('POST', '/exchange/fulfill_buy', { listing_id: buyOrderId, quantity: 5, expect_item_id: 27, market_token: buyToken }, tokenC);
assert('C 交付寒潭沙x5', r.data && r.data.ok === true && r.data.total_price === 150 && r.data.player && r.data.delivery_warning === false, r.data);
assert('买家收到求购到货邮件', rows('mm:').some(v => Number(v.account_id) === 22 && v.type === 'trade_buy'), rows('mm:').map(v => v.account_id + ':' + v.type));
assert('卖家收到灵石邮件', rows('mm:').some(v => Number(v.account_id) === 23 && v.type === 'trade_sale'), rows('mm:').map(v => v.account_id + ':' + v.type));
await reset();
r = await call('GET', '/exchange/my/listings?include_closed=1', null, tokenB);
const closedBuy = r.data && r.data.list.find(x => x.listing_id === buyOrderId);
assert('求购单已成交(filled)', closedBuy && closedBuy.status === 'filled', closedBuy);

console.log('== 9. 以物易物求购 + 成交 ==');
await reset();
r = await call('GET', '/exchange/quote?side=buy&item_id=20&quantity=3&barter_pay_item_id=27&barter_pay_unit_count=10', null, tokenB);
assert('以物易物询价', r.data && r.data.ok === true && r.data.barter_enabled === true && r.data.barter_pay_item_id === 27 && r.data.escrow_pay_item_total === 30 && r.data.escrow_spirit_stones === r.data.tax_per_unit * 3, r.data);
const barterQuoteTaxPerUnit = r.data.tax_per_unit;
await reset();
r = await call('POST', '/exchange/buy_orders', { item_id: 20, item_name: '沉泥', quantity: 3, barter_pay_item_id: 27, barter_pay_unit_count: 10 }, tokenB);
assert('发布以物易物求购', r.data && r.data.ok === true && r.data.barter_enabled === true && r.data.escrow_pay_item_total === 30 && r.data.escrow_spirit_stones === barterQuoteTaxPerUnit * 3, r.data);
const barterOrderId = r.data.listing_id;
await reset();
r = await call('GET', '/exchange/listings?side=buy', null, tokenC);
const barterToken = r.data && r.data.market_token;
await reset();
r = await call('POST', '/exchange/fulfill_buy', { listing_id: barterOrderId, quantity: 3, expect_item_id: 20, market_token: barterToken }, tokenC);
assert('C 交付沉泥x3 获得寒潭沙x30', r.data && r.data.ok === true && r.data.barter_enabled === true && r.data.barter_pay_item_id === 27 && r.data.barter_pay_total === 30 && r.data.delivery_warning === false, r.data);
assert('C 收到以物易物支付邮件', rows('mm:').some(v => Number(v.account_id) === 23 && v.type === 'trade_sale'), rows('mm:').map(v => v.account_id + ':' + v.type));

console.log('== 10. 撤销售卖挂单（无剩余）==');
await reset();
r = await call('POST', '/exchange/listings', { page: 0, slot_index: 1, expect_item_id: 27, quantity: 5, unit_price: 60 }, tokenC);
assert('C 上架寒潭沙x5', r.data && r.data.ok === true && r.data.listing_id > 0, r.data);
const cListingId = r.data.listing_id;
await reset();
r = await call('GET', '/exchange/listings?side=sell', null, tokenC);
const cToken = r.data && r.data.market_token;
await reset();
r = await call('POST', '/exchange/listings/' + cListingId + '/cancel', { market_token: cToken }, tokenC);
assert('撤销并退回x5', r.data && r.data.ok === true && r.data.refunded_quantity === 5, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
