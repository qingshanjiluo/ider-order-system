/**
 * 交易行 / 拍卖行（阶段6 · 原始设定 10 + 决议 D3）
 * 使用 SQLite 关系表 market_listings / market_orders / market_rates（阶段1 预建）。
 * 价格单位：下品灵石基准。供需调控系数 rate ∈ [0.7, 1.3]：
 *   成交 → 需求↑（rate +0.01）；新挂单 → 供给↑（rate −0.005），按 itemKey 独立浮动。
 */
const store = require('../db/store');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const RATE_MIN = 0.7, RATE_MAX = 1.3;
const LISTING_HOURS = 72;
const LIST_FEE = 0.01;   // 挂单费 1%（挂单即扣）
const SALE_TAX = 0.03;   // 成交税 3%

// —— 轮48（P2 · 章程 E8「市场 7 日成交价可用」）——————————————————————
// 实施蓝图画的是：/market 暴露 7 日成交均价与中位数，偏离指导价 ±40% 的挂单直接拒绝（防对倒洗钱）。
// 此前 market_orders 只是流水，没人聚合；挂单价想写多少写多少，等于 1 灵石的仙器也能上架。
const PRICE_WINDOW_DAYS = 7;      // 成交价回看窗口
const PRICE_MIN_SAMPLES = 5;      // 样本不足就不拿成交价冒充指导价，退回坊市基准价
const PRICE_DEVIATION = 0.4;      // 允许偏离指导价 ±40%
const LIST_WINDOW_HOURS = 1;      // 单角色单资源限频窗口（tierLimit 只按前缀限总请求数，管不住"同一件货反复挂撤"）
const LIST_MAX_PER_WINDOW = 3;

function itemKeyOf(kind, itemId) {
  const db = loadDatabase();
  const item = (db.items || []).find(i => i.id === itemId);
  return item ? `${kind}:${item.name}` : `${kind}:#${itemId}`;
}

function keyOfItem(item) {
  return item ? `item:${item.name}` : null;
}

function keyOfListing(l, db) {
  const item = (db || loadDatabase()).items.find(i => Number(i.id) === Number(l.item_ref));
  return keyOfItem(item);
}

function median(sorted) {
  const n = sorted.length;
  if (!n) return null;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 某资源在窗口内的成交明细（market_orders.price 存的是**总价**，单价按 quantity 折算） */
function orderRows(resourceKey, days) {
  const db = loadDatabase();
  const listings = new Map(store.queryRel('market_listings').map(l => [Number(l.id), l]));
  const cut = Date.now() - (days || PRICE_WINDOW_DAYS) * 86400000;
  const out = [];
  for (const o of store.queryRel('market_orders')) {
    if (new Date(o.created_at).getTime() < cut) continue;
    const l = listings.get(Number(o.listing_id));
    if (!l || keyOfListing(l, db) !== resourceKey) continue;
    const q = Math.max(1, Number(o.quantity) || 1);
    out.push({ unit: (Number(o.price) || 0) / q, quantity: q, total: Number(o.price) || 0, at: o.created_at, buyer: o.buyer_character_id, seller: l.seller_character_id });
  }
  return out;
}

/** 指导价：优先 7 日成交中位数（样本够才用），否则退回坊市基准价，都没有就不设限 */
function guidanceOf(resourceKey) {
  const rows = orderRows(resourceKey, PRICE_WINDOW_DAYS);
  if (rows.length >= PRICE_MIN_SAMPLES) {
    const u = rows.map(r => r.unit).sort((a, b) => a - b);
    return { value: Number(median(u).toFixed(2)), source: '7d_median', samples: u.length };
  }
  const db = loadDatabase();
  const name = String(resourceKey).replace(/^item:/, '');
  const item = (db.items || []).find(i => String(i.name) === name);
  if (item) {
    const row = (db.shop || []).find(s => Number(s.item_id) === Number(item.id));
    if (row && Number(row.price) > 0) return { value: Number(row.price), source: 'shop_base', samples: rows.length };
  }
  return { value: null, source: 'none', samples: rows.length };
}

/** 7 日成交价聚合（E8 验收项：可用 = 有明细、有均价/中位、有指导价与允许区间） */
function priceStats(resourceKey) {
  const units = orderRows(resourceKey, PRICE_WINDOW_DAYS).map(r => r.unit).sort((a, b) => a - b);
  const g = guidanceOf(resourceKey);
  return {
    resource: resourceKey,
    windowDays: PRICE_WINDOW_DAYS,
    samples: units.length,
    avg: units.length ? Number((units.reduce((s, v) => s + v, 0) / units.length).toFixed(2)) : null,
    median: units.length ? Number(median(units).toFixed(2)) : null,
    min: units.length ? Number(units[0].toFixed(2)) : null,
    max: units.length ? Number(units[units.length - 1].toFixed(2)) : null,
    guidance: g.value,
    guidanceSource: g.source,
    priceBand: g.value ? { low: Math.max(1, Math.ceil(g.value * (1 - PRICE_DEVIATION))), high: Math.floor(g.value * (1 + PRICE_DEVIATION)) } : null
  };
}

/** 行情面板：有成交纪录的资源 + 当前在售的资源，各自带 7 日统计 */
function marketPrices() {
  const db = loadDatabase();
  const keys = new Set();
  for (const l of store.queryRel('market_listings')) { const k = keyOfListing(l, db); if (k) keys.add(k); }
  const listings = new Map(store.queryRel('market_listings').map(l => [Number(l.id), l]));
  const cut = Date.now() - PRICE_WINDOW_DAYS * 86400000;
  for (const o of store.queryRel('market_orders')) {
    if (new Date(o.created_at).getTime() < cut) continue;
    const k = keyOfListing(listings.get(Number(o.listing_id)) || {}, db);
    if (k) keys.add(k);
  }
  return [...keys].sort().map(priceStats);
}

function getRate(itemKey) {
  const rows = store.queryRel('market_rates', { resource: itemKey });
  if (rows.length) return rows[0].rate;
  store.insertRel('market_rates', { resource: itemKey, rate: 1.0, updated_at: new Date().toISOString() });
  return 1.0;
}

function shiftRate(itemKey, delta) {
  const cur = getRate(itemKey);
  const next = Math.min(RATE_MAX, Math.max(RATE_MIN, cur + delta));
  // market_rates 以 resource 为主键（无 id 列）
  store.updateRelWhere('market_rates', { resource: itemKey }, { rate: Number(next.toFixed(4)), updated_at: new Date().toISOString() });
  return next;
}

/** 挂单（inventory row 托管） */
function list(character, inventoryId, quantity, price) {
  const db = loadDatabase();
  const inv = db.inventory.find(i => i.id === Number(inventoryId) && i.character_id === character.id);
  if (!inv) return { ok: false, error: '背包物品不存在' };
  const item = db.items.find(i => i.id === inv.item_id);
  if (!item) return { ok: false, error: '物品定义不存在' };
  const qty = Math.floor(Number(quantity));
  const priceEach = Math.floor(Number(price));
  if (!(qty > 0) || !(priceEach > 0)) return { ok: false, error: '数量或价格无效' };
  if ((inv.quantity || 1) < qty) return { ok: false, error: `数量不足（持有 ${inv.quantity || 1}）` };

  const key = keyOfItem(item) || itemKeyOf('item', item.id);

  // 轮48 防刷一：单角色单资源在窗口内最多挂 N 单（此前只受 tierLimit 的前缀总请求数约束）
  const since = Date.now() - LIST_WINDOW_HOURS * 3600000;
  const recent = store.queryRel('market_listings', { seller_character_id: character.id })
    .filter(l => keyOfListing(l, db) === key && new Date(l.created_at).getTime() >= since).length;
  if (recent >= LIST_MAX_PER_WINDOW) {
    return { ok: false, error: `同一物品 ${LIST_WINDOW_HOURS} 小时内最多挂 ${LIST_MAX_PER_WINDOW} 单（防刷单）` };
  }

  // 轮48 防刷二：偏离指导价 ±40% 的挂单直接拒（对倒洗钱的典型形态就是天价挂单自买自卖）
  const guide = guidanceOf(key);
  if (guide.value) {
    const lo = Math.max(1, Math.ceil(guide.value * (1 - PRICE_DEVIATION)));
    const hi = Math.floor(guide.value * (1 + PRICE_DEVIATION));
    if (priceEach < lo || priceEach > hi) {
      return { ok: false, error: `挂单价 ${priceEach} 偏离指导价 ${guide.value}（${guide.source}）超过 ±${Math.round(PRICE_DEVIATION * 100)}%，允许区间 ${lo}~${hi}` };
    }
  }

  const fee = Math.ceil(priceEach * qty * LIST_FEE);
  if ((character.spirit_stone || 0) < fee) return { ok: false, error: `挂单费不足（${fee} 灵石）` };
  character.spirit_stone -= fee;

  inv.quantity -= qty;
  if (inv.quantity <= 0) db.inventory.splice(db.inventory.indexOf(inv), 1);

  const id = store.insertRel('market_listings', {
    seller_character_id: character.id,
    item_kind: 'item',
    item_ref: item.id,
    quantity: qty,
    price: priceEach,
    currency: 'spirit_stone',
    status: 'open',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + LISTING_HOURS * 3600 * 1000).toISOString()
  });
  shiftRate(key, -0.005);
  db.dirty = true;
  return { ok: true, listingId: id, fee, item: item.name, quantity: qty, priceEach, expiresHours: LISTING_HOURS };
}

/** 购买（成交价 = 挂单价 × 供需系数，+3% 成交税由卖方承担） */
function buy(character, listingId, quantity) {
  const db = loadDatabase();
  const rows = store.queryRel('market_listings', { id: Number(listingId) });
  const listing = rows[0];
  if (!listing || listing.status !== 'open') return { ok: false, error: '挂单不存在或已关闭' };
  if (new Date(listing.expires_at) < new Date()) {
    store.updateRel('market_listings', listing.id, { status: 'expired' });
    return { ok: false, error: '挂单已过期' };
  }
  if (listing.seller_character_id === character.id) return { ok: false, error: '不能购买自己的挂单' };
  const qty = Math.floor(Number(quantity) || listing.quantity);
  if (qty <= 0 || qty > listing.quantity) return { ok: false, error: `数量无效（余 ${listing.quantity}）` };

  const item = db.items.find(i => i.id === listing.item_ref);
  const key = item ? `item:${item.name}` : `item:#${listing.item_ref}`;
  const rate = getRate(key);
  const unitPrice = Math.ceil(listing.price * rate);
  const total = unitPrice * qty;
  if ((character.spirit_stone || 0) < total) return { ok: false, error: `灵石不足（需 ${total}）` };

  // 买家扣款 + 入库
  character.spirit_stone -= total;
  const inv = db.inventory.find(i => i.character_id === character.id && i.item_id === listing.item_ref);
  if (inv) inv.quantity = (inv.quantity || 1) + qty;
  else db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: listing.item_ref, quantity: qty });

  // 卖方收款（离线安全：立即入账，扣 3% 税）
  const seller = db.characters.find(c => c.id === listing.seller_character_id);
  const proceeds = Math.floor(total * (1 - SALE_TAX));
  if (seller) seller.spirit_stone = (seller.spirit_stone || 0) + proceeds;

  // 订单记录
  store.insertRel('market_orders', {
    listing_id: listing.id,
    buyer_character_id: character.id,
    quantity: qty,
    price: total,
    status: 'done',
    created_at: new Date().toISOString()
  });

  // 挂单关闭/减量
  if (qty >= listing.quantity) {
    store.updateRel('market_listings', listing.id, { status: 'sold' });
  } else {
    store.updateRel('market_listings', listing.id, { quantity: listing.quantity - qty });
  }

  shiftRate(key, 0.01);
  db.dirty = true;
  return {
    ok: true,
    item: item ? item.name : `#${listing.item_ref}`,
    quantity: qty,
    paid: total,
    unitPrice,
    rate,
    sellerProceeds: proceeds,
    balance: character.spirit_stone
  };
}

function cancel(character, listingId) {
  const db = loadDatabase();
  const listing = store.queryRel('market_listings', { id: Number(listingId) })[0];
  // 轮97 硬伤修复：旧版只许撤 open 单，而 72h 过期没人买时无人负责落状态——
  // 过期单既买不掉也撤不回，货永久卡死。现允许到期单（含已标 expired 与惰性到期）撤单回仓，挂单费不退（服务已占位 72h）。
  if (!listing || !['open', 'expired'].includes(listing.status)) return { ok: false, error: '挂单不存在或已关闭' };
  if (listing.seller_character_id !== character.id) return { ok: false, error: '非本人挂单' };
  // 退回物品
  const inv = db.inventory.find(i => i.character_id === character.id && i.item_id === listing.item_ref);
  if (inv) inv.quantity = (inv.quantity || 1) + listing.quantity;
  else db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: listing.item_ref, quantity: listing.quantity });
  store.updateRel('market_listings', listing.id, { status: 'cancelled' });
  db.dirty = true;
  return { ok: true, returned: listing.quantity };
}

function listings(filter = {}) {
  const db = loadDatabase();
  const all = store.queryRel('market_listings', filter.status ? { status: filter.status } : {}, 'id');
  return all.filter(l => l.status === 'open').map(l => {
    const item = db.items.find(i => i.id === l.item_ref);
    const key = item ? `item:${item.name}` : `item:#${l.item_ref}`;
    const seller = db.characters.find(c => c.id === l.seller_character_id);
    return {
      id: l.id,
      item: item ? { id: item.id, name: item.name, quality: item.quality, type: item.type } : null,
      quantity: l.quantity,
      priceEach: l.price,
      marketRate: getRate(key),
      unitNow: Math.ceil(l.price * getRate(key)),
      seller: seller ? seller.name : '未知',
      createdAt: l.created_at,
      expiresAt: l.expires_at
    };
  });
}

function myListings(character) {
  return store.queryRel('market_listings', { seller_character_id: character.id })
    .filter(l => ['open', 'sold', 'cancelled', 'expired'].includes(l.status))
    .map(l => {
      const item = (loadDatabase().items || []).find(i => i.id === l.item_ref);
      return { id: l.id, item: item ? item.name : `#${l.item_ref}`, quantity: l.quantity, priceEach: l.price, status: l.status, expiresAt: l.expires_at };
    });
}

module.exports = {
  list, buy, cancel, listings, myListings, getRate, shiftRate,
  priceStats, marketPrices, guidanceOf, orderRows,
  LIST_FEE, SALE_TAX, RATE_MIN, RATE_MAX,
  PRICE_WINDOW_DAYS, PRICE_MIN_SAMPLES, PRICE_DEVIATION, LIST_WINDOW_HOURS, LIST_MAX_PER_WINDOW
};
