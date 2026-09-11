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

function itemKeyOf(kind, itemId) {
  const db = loadDatabase();
  const item = (db.items || []).find(i => i.id === itemId);
  return item ? `${kind}:${item.name}` : `${kind}:#${itemId}`;
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

  const fee = Math.ceil(priceEach * qty * LIST_FEE);
  if ((character.spirit_stone || 0) < fee) return { ok: false, error: `挂单费不足（${fee} 灵石）` };
  character.spirit_stone -= fee;

  inv.quantity -= qty;
  if (inv.quantity <= 0) db.inventory.splice(db.inventory.indexOf(inv), 1);

  const key = itemKeyOf('item', item.id);
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
  if (!listing || listing.status !== 'open') return { ok: false, error: '挂单不存在或已关闭' };
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

module.exports = { list, buy, cancel, listings, myListings, getRate, shiftRate, LIST_FEE, SALE_TAX, RATE_MIN, RATE_MAX };
