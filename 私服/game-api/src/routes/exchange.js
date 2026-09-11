/**
 * 交易所 API（Worker 版）
 * 迁移自 server/routes/exchange.js（原 Express router，2301 行）。
 * 纯业务逻辑近原样复制；仅将路由分发改为 Worker handler，Redis/进程级锁去除，
 * 依赖 createDb 的 D1 封装（原子扣减由 SQL WHERE 保障，避免超卖）。
 *
 * 端点（均需登录）：
 *   GET  /exchange/listings            市场列表 + market_token
 *   GET  /exchange/my/listings         我的挂单
 *   GET  /exchange/quote               询价（动态税/锚点/以物易物）
 *   GET  /exchange/item_search         物品名搜索
 *   POST /exchange/listings            上架出售
 *   POST /exchange/buy_orders          发布求购单
 *   POST /exchange/buy                 购买（需 market_token）
 *   POST /exchange/fulfill_buy         成交求购单
 *   POST /exchange/listings/:id/cancel 撤单
 */

import { getItems, getItemById } from '../game/dataLoader.js';
import * as ops from '../game/playerOps.js';
import { createDb } from '../db.js';
import { verifyToken, signPayload, verifyPayload } from '../auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T, X-Market-Token',
  'Access-Control-Max-Age': '86400'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function parsePositiveInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n <= 0) return null;
  return n;
}

function parseNonNegativeInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n < 0) return fallback;
  return n;
}

const deepClone = typeof structuredClone === 'function'
  ? (v) => structuredClone(v)
  : (v) => JSON.parse(JSON.stringify(v));

function _clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ── 税率 / 锚点常量（与 config 默认一致） ──
const EXCHANGE_BASE_TAX_RATE = 0.05;
const EXCHANGE_ANCHOR_RECYCLE_FIXED_TAX_RATE = 0.05;
const EXCHANGE_ANCHOR_RECYCLE_Q4_MULTIPLIER = 20;
const EXCHANGE_ANCHOR_RECYCLE_Q5_PLUS_MULTIPLIER = 25;
const EXCHANGE_ANCHOR_DAY_WINDOW_SEC = 24 * 3600;
const EXCHANGE_ANCHOR_WEEK_WINDOW_SEC = 7 * 24 * 3600;
const EXCHANGE_ANCHOR_DAY_MIN_SAMPLES = 12;
const EXCHANGE_ANCHOR_WEEK_MIN_SAMPLES = 40;
const EXCHANGE_ANCHOR_TRIM_RATIO = 0.10;
const EXCHANGE_ANCHOR_TRIM_MIN_SAMPLES = 18;
const EXCHANGE_ANCHOR_CACHE_TTL_MS = 20 * 1000;
const EXCHANGE_ANCHOR_CLAMP_MIN_RATIO = 0.35;
const EXCHANGE_ANCHOR_CLAMP_MAX_RATIO = 8.0;

const EXCHANGE_DYNAMIC_HIGH_FULL_RATIO = 3.5;
const EXCHANGE_DYNAMIC_HIGH_MAX_RATE = 0.95;
const EXCHANGE_DYNAMIC_LOW_FLOOR_RATIO = 0.20;
const EXCHANGE_DYNAMIC_LOW_MAX_RATE = 0.90;
const EXCHANGE_DYNAMIC_HARD_BLOCK_RATIO = 20;
const EXCHANGE_DYNAMIC_LOW_CONFIDENCE_THRESHOLD = 0.45;
const EXCHANGE_DYNAMIC_LOW_CONFIDENCE_HIGH_FULL_RATIO = 8.5;
const EXCHANGE_DYNAMIC_LOW_CONFIDENCE_HARD_BLOCK_RATIO = 60;
const EXCHANGE_DYNAMIC_LOW_CONFIDENCE_NET_GROWTH_SLOPE_SELL = 0.22;
const EXCHANGE_DYNAMIC_LOW_CONFIDENCE_NET_GROWTH_SLOPE_BUY = 0.18;
const EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_THRESHOLD = 0.72;
const EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_MAX_RATE = 0.78;
const EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_GAP_SELL_MULTIPLIER = 0.90;
const EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_GAP_BUY_MULTIPLIER = 0.94;
const EXCHANGE_DYNAMIC_LOW_GAP_BUY_MIN_COEFF = 0.60;
const EXCHANGE_BARTER_GAP_TAX_RATIO = 1;
const EXCHANGE_DYNAMIC_TAX_APPLY_TO_DYNAMIC_ITEMS = false;

const EXCHANGE_FORCE_NO_MARKET_ITEM_IDS = new Set([168, 170]);
const EXCHANGE_INVITE_SOURCE_NO_MARKET_ITEM_IDS = new Set([128, 129, 130, 131, 132]);
const EXCHANGE_DYNAMIC_PRICE_ITEM_TYPES = new Set(['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back']);

const MARKET_TOKEN_TTL_MS = 5 * 60 * 1000;
const _recentMarketTokens = new Map();
const _priceAnchorCache = new Map();
const _quoteResultCache = new Map();
const _quoteIpRateState = new Map();
const _rateLimitState = new Map();

const EXCHANGE_QUOTE_RESULT_CACHE_TTL_MS = 8000;
const EXCHANGE_QUOTE_RESULT_CACHE_MAX_ENTRIES = 6000;
const EXCHANGE_QUOTE_IP_WINDOW_MS = 1000;
const EXCHANGE_QUOTE_IP_MAX_PER_WINDOW = 8;

function _cleanupExchangeGuards(now = Date.now()) {
  for (const [key, state] of _rateLimitState.entries()) {
    if (!state || (now - Number(state.lastAt || 0)) > 10 * 60 * 1000) _rateLimitState.delete(key);
  }
  for (const [ip, state] of _quoteIpRateState.entries()) {
    if (!state || (now - Number(state.windowStart || 0)) > EXCHANGE_QUOTE_IP_WINDOW_MS * 6) {
      _quoteIpRateState.delete(ip);
    }
  }
  for (const [aid, entry] of _recentMarketTokens.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) _recentMarketTokens.delete(aid);
  }
  for (const [key, entry] of _quoteResultCache.entries()) {
    if (!entry || (now - Number(entry.cachedAtMs || 0)) > EXCHANGE_QUOTE_RESULT_CACHE_TTL_MS * 3) {
      _quoteResultCache.delete(key);
    }
  }
  for (const [iid, entry] of _priceAnchorCache.entries()) {
    if (!entry || (now - Number(entry.cachedAtMs || 0)) > 10 * 60 * 1000) _priceAnchorCache.delete(iid);
  }
}

const RATE_LIMIT_RULES = [
  { method: 'GET', path: /^\/listings$/, minGap: 1000, key: 'GET:/listings' },
  { method: 'GET', path: /^\/quote$/, minGap: 350, key: 'GET:/quote' },
  { method: 'GET', path: /^\/item_search$/, minGap: 800, key: 'GET:/item_search' },
  { method: 'GET', path: /^\/my\/listings$/, minGap: 800, key: 'GET:/my/listings' },
  { method: 'POST', path: /^\/buy$/, minGap: 1500, key: 'POST:/buy' },
  { method: 'POST', path: /^\/fulfill_buy$/, minGap: 1500, key: 'POST:/fulfill_buy' },
  { method: 'POST', path: /^\/listings$/, minGap: 1200, key: 'POST:/listings' },
  { method: 'POST', path: /^\/buy_orders$/, minGap: 1200, key: 'POST:/buy_orders' },
  { method: 'POST', path: /^\/listings\/\d+\/cancel$/, minGap: 800, key: 'POST:/listings/:id/cancel' }
];

function _normalizeIp(raw) {
  let ip = String(raw || '').trim();
  if (!ip) return '';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

async function _checkRateLimit(method, subPath, accountId, ip) {
  const m = String(method || 'GET').toUpperCase();
  const rule = RATE_LIMIT_RULES.find((r) => r.method === m && r.path.test(String(subPath || '')));
  if (!rule) return null;
  const now = Date.now();
  if (Math.random() < 0.02) _cleanupExchangeGuards(now);
  const bucketKey = `${Number(accountId) || 0}:${rule.key}`;
  const prev = _rateLimitState.get(bucketKey);
  if (prev && (now - Number(prev.lastAt || 0)) < rule.minGap) {
    const waitMs = Math.max(0, rule.minGap - (now - Number(prev.lastAt || 0)));
    return { ok: false, waitMs };
  }
  if (rule.key === 'GET:/quote' && ip) {
    const ipState = _quoteIpRateState.get(ip);
    if (!ipState || (now - Number(ipState.windowStart || 0)) >= EXCHANGE_QUOTE_IP_WINDOW_MS) {
      _quoteIpRateState.set(ip, { windowStart: now, count: 1 });
    } else if (Number(ipState.count || 0) >= EXCHANGE_QUOTE_IP_MAX_PER_WINDOW) {
      const waitMs = Math.max(0, EXCHANGE_QUOTE_IP_WINDOW_MS - (now - Number(ipState.windowStart || 0)));
      return { ok: false, waitMs };
    } else {
      ipState.count = Number(ipState.count || 0) + 1;
      _quoteIpRateState.set(ip, ipState);
    }
  }
  _rateLimitState.set(bucketKey, { lastAt: now });
  return { ok: true };
}

function _buildQuoteCacheKey({ accountId, mode = 'buy', itemId = 0, quantity = 1, unitPrice = 0, barterPayItemId = 0, barterPayUnitCount = 0 } = {}) {
  return [
    Number(accountId) || 0,
    String(mode || 'buy'),
    Number(itemId) || 0,
    Math.max(1, Number(quantity) || 1),
    Math.max(0, Number(unitPrice) || 0),
    Math.max(0, Number(barterPayItemId) || 0),
    Math.max(0, Number(barterPayUnitCount) || 0)
  ].join('|');
}

function _getCachedQuotePayload(cacheKey) {
  const key = String(cacheKey || '').trim();
  if (!key) return null;
  const entry = _quoteResultCache.get(key);
  if (!entry) return null;
  if ((Date.now() - Number(entry.cachedAtMs || 0)) > EXCHANGE_QUOTE_RESULT_CACHE_TTL_MS) {
    _quoteResultCache.delete(key);
    return null;
  }
  return deepClone(entry.payload || null);
}

function _setCachedQuotePayload(cacheKey, payload) {
  const key = String(cacheKey || '').trim();
  if (!key || !payload || typeof payload !== 'object') return;
  if (_quoteResultCache.size >= EXCHANGE_QUOTE_RESULT_CACHE_MAX_ENTRIES) {
    const purgeCount = Math.max(1, Math.floor(EXCHANGE_QUOTE_RESULT_CACHE_MAX_ENTRIES * 0.12));
    for (let i = 0; i < purgeCount; i += 1) {
      const oldestKey = _quoteResultCache.keys().next().value;
      if (!oldestKey) break;
      _quoteResultCache.delete(oldestKey);
    }
  }
  _quoteResultCache.set(key, { cachedAtMs: Date.now(), payload: deepClone(payload) });
}

async function issueMarketToken(accountId, listingIds, secret) {
  const now = Date.now();
  _cleanupExchangeGuards(now);
  const aid = Number(accountId) || 0;
  const expiresAt = now + MARKET_TOKEN_TTL_MS;
  const ids = (Array.isArray(listingIds) ? listingIds : []).map((v) => Number(v)).filter((v) => v > 0);
  const token = await signPayload({ kind: 'market', accountId: aid, listingIds: ids }, secret, Math.max(1, Math.floor(MARKET_TOKEN_TTL_MS / 1000)));
  _recentMarketTokens.set(aid, { token, expiresAt });
  return { token, expiresAt };
}

function findRecentMarketToken(accountId) {
  const aid = Number(accountId) || 0;
  const now = Date.now();
  const entry = _recentMarketTokens.get(aid);
  if (!entry || Number(entry.expiresAt || 0) <= now) return null;
  return entry.token ? { token: entry.token } : null;
}

async function consumeMarketToken(accountId, listingId, body, headers, secret) {
  let rawToken = String(body?.market_token || headers?.get?.('x-market-token') || headers?.['x-market-token'] || '').trim();
  if (!rawToken) {
    const fallback = findRecentMarketToken(accountId);
    if (!fallback) return { ok: false, error: '操作已过期，请先刷新坊市列表后重试' };
    rawToken = fallback.token;
  }
  const decoded = await verifyPayload(rawToken, secret);
  if (!decoded || decoded.kind !== 'market') {
    return { ok: false, error: '坊市令牌无效，请刷新列表后重试' };
  }
  if (Number(decoded.accountId) !== Number(accountId)) {
    return { ok: false, error: '坊市令牌无效，请刷新列表后重试' };
  }
  const targetListingId = Number(listingId) || 0;
  const listingIds = Array.isArray(decoded.listingIds) ? decoded.listingIds.map((v) => Number(v)).filter((v) => v > 0) : [];
  if (targetListingId <= 0 || !listingIds.includes(targetListingId)) {
    return { ok: false, error: '该挂单不在当前列表中，请刷新后重试' };
  }
  return { ok: true };
}

function _isInviteShopNoMarketInstance(itemLike) {
  return Boolean(itemLike && typeof itemLike === 'object' && itemLike.invite_shop_no_market === true);
}

function _isNoMarketItem(itemLike) {
  if (itemLike == null) return false;
  if (_isInviteShopNoMarketInstance(itemLike)) return true;
  const rawId = (typeof itemLike === 'number' || typeof itemLike === 'string') ? itemLike : itemLike.id;
  const itemId = Number(rawId) || 0;
  if (EXCHANGE_FORCE_NO_MARKET_ITEM_IDS.has(itemId)) return true;
  const ignoreTemplateNoMarket = EXCHANGE_INVITE_SOURCE_NO_MARKET_ITEM_IDS.has(itemId);
  const tags = Array.isArray(itemLike?.tags) ? itemLike.tags : [];
  if (!ignoreTemplateNoMarket && tags.includes('no_market')) return true;
  if (itemId > 0) {
    const fullItem = getItemById(itemId);
    const fullTags = Array.isArray(fullItem?.tags) ? fullItem.tags : [];
    if (!ignoreTemplateNoMarket && fullTags.includes('no_market')) return true;
    if (EXCHANGE_FORCE_NO_MARKET_ITEM_IDS.has(Number(fullItem?.id) || 0)) return true;
  }
  return false;
}

function _isDynamicPriceItem(itemLike, fallbackItemId = 0) {
  const checkObj = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    const type = String(obj.type || '').trim();
    if (EXCHANGE_DYNAMIC_PRICE_ITEM_TYPES.has(type)) return true;
    if (obj.randomExtraStats && typeof obj.randomExtraStats === 'object' && Object.keys(obj.randomExtraStats).length > 0) return true;
    if (Array.isArray(obj.affixes) && obj.affixes.length > 0) return true;
    return false;
  };
  if (checkObj(itemLike)) return true;
  const rawId = (typeof itemLike === 'number' || typeof itemLike === 'string') ? itemLike : itemLike?.id;
  const itemId = Number(rawId) || Number(fallbackItemId) || 0;
  if (itemId <= 0) return false;
  const tpl = getItemById(itemId);
  return checkObj(tpl);
}

function _isLockedEquipmentItem(itemLike) {
  if (!itemLike || typeof itemLike !== 'object') return false;
  const type = String(itemLike.type || '').trim();
  if (!EXCHANGE_DYNAMIC_PRICE_ITEM_TYPES.has(type)) return false;
  return Boolean(itemLike.locked);
}

function _isEquipmentType(type) {
  const t = String(type || '').trim();
  if (!t) return false;
  if (EXCHANGE_DYNAMIC_PRICE_ITEM_TYPES.has(t)) return true;
  return t === 'equipment';
}

function _isEquipmentLike(itemLike, fallbackItemId = 0) {
  const checkObj = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.equipment_criteria && typeof obj.equipment_criteria === 'object') return true;
    return _isEquipmentType(obj.type);
  };
  if (checkObj(itemLike)) return true;
  const rawId = (typeof itemLike === 'number' || typeof itemLike === 'string') ? itemLike : itemLike?.id;
  const itemId = Number(rawId) || Number(fallbackItemId) || 0;
  if (itemId <= 0) return false;
  const tpl = getItemById(itemId);
  return checkObj(tpl);
}

function _normalizeItemName(name) {
  return String(name || '').trim().replace(/\s+/g, '').toLowerCase();
}

function _resolveItemByName(name) {
  const raw = String(name || '').trim();
  if (!raw) return { item: null, ambiguous: false };
  const items = getItems() || [];
  const exact = items.find((it) => it && String(it.name || '').trim() === raw);
  if (exact) return { item: exact, ambiguous: false };
  const normalized = _normalizeItemName(raw);
  if (!normalized) return { item: null, ambiguous: false };
  const exactNormalized = items.find((it) => it && _normalizeItemName(it.name) === normalized);
  if (exactNormalized) return { item: exactNormalized, ambiguous: false };
  if (normalized.length < 2) return { item: null, ambiguous: false };
  const fuzzy = items.filter((it) => it && _normalizeItemName(it.name).includes(normalized));
  if (fuzzy.length === 1) return { item: fuzzy[0], ambiguous: false };
  if (fuzzy.length > 1) return { item: null, ambiguous: true };
  return { item: null, ambiguous: false };
}

function normalizeTaxRate() {
  return EXCHANGE_BASE_TAX_RATE;
}

function getExchangeTaxPolicy() {
  return {
    base_tax_rate: EXCHANGE_BASE_TAX_RATE,
    anchor_recycle_fixed_tax_rate: EXCHANGE_ANCHOR_RECYCLE_FIXED_TAX_RATE,
    anchor_recycle_q4_multiplier: EXCHANGE_ANCHOR_RECYCLE_Q4_MULTIPLIER,
    anchor_recycle_q5_plus_multiplier: EXCHANGE_ANCHOR_RECYCLE_Q5_PLUS_MULTIPLIER,
    anchor_day_window_sec: EXCHANGE_ANCHOR_DAY_WINDOW_SEC,
    anchor_week_window_sec: EXCHANGE_ANCHOR_WEEK_WINDOW_SEC,
    anchor_trim_ratio: EXCHANGE_ANCHOR_TRIM_RATIO,
    high_price_full_ratio: EXCHANGE_DYNAMIC_HIGH_FULL_RATIO,
    high_price_full_tax_rate: EXCHANGE_DYNAMIC_HIGH_MAX_RATE,
    low_price_floor_ratio: EXCHANGE_DYNAMIC_LOW_FLOOR_RATIO,
    low_price_floor_tax_rate: EXCHANGE_DYNAMIC_LOW_MAX_RATE,
    low_confidence_threshold: EXCHANGE_DYNAMIC_LOW_CONFIDENCE_THRESHOLD,
    low_confidence_high_price_full_ratio: EXCHANGE_DYNAMIC_LOW_CONFIDENCE_HIGH_FULL_RATIO,
    low_confidence_hard_block_ratio: EXCHANGE_DYNAMIC_LOW_CONFIDENCE_HARD_BLOCK_RATIO,
    low_confidence_net_growth_slope_sell: EXCHANGE_DYNAMIC_LOW_CONFIDENCE_NET_GROWTH_SLOPE_SELL,
    low_confidence_net_growth_slope_buy: EXCHANGE_DYNAMIC_LOW_CONFIDENCE_NET_GROWTH_SLOPE_BUY,
    high_confidence_threshold: EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_THRESHOLD,
    high_confidence_low_price_floor_tax_rate: EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_MAX_RATE,
    high_confidence_low_gap_sell_multiplier: EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_GAP_SELL_MULTIPLIER,
    high_confidence_low_gap_buy_multiplier: EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_GAP_BUY_MULTIPLIER,
    low_gap_buy_min_coeff: EXCHANGE_DYNAMIC_LOW_GAP_BUY_MIN_COEFF,
    barter_gap_tax_ratio: EXCHANGE_BARTER_GAP_TAX_RATIO,
    apply_to_dynamic_items: EXCHANGE_DYNAMIC_TAX_APPLY_TO_DYNAMIC_ITEMS
  };
}

function parseItemSnapshotSafe(text) {
  try {
    const obj = JSON.parse(String(text || '{}'));
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

function _baseValueByQuality(quality) {
  if (quality <= 1) return 10;
  if (quality === 2) return 30;
  if (quality === 3) return 100;
  if (quality === 4) return 400;
  if (quality === 5) return 2000;
  if (quality === 6) return 3000;
  if (quality === 7) return 5000;
  return 8000;
}

function _fallbackUnitPriceForItem(itemId) {
  const it = getItemById(itemId);
  if (!it || typeof it !== 'object') return 1;
  const explicitValue = Number(it.value);
  if (Number.isFinite(explicitValue)) return Math.max(1, Math.floor(explicitValue));
  const quality = Math.max(1, Math.floor(Number(it.quality) || 1));
  const t = String(it.type || '');
  let v = _baseValueByQuality(quality);
  if (String(it.material || '') === '令牌') v *= 5;
  else if (['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back', 'consumable'].includes(t)) v *= 3;
  else if (t === 'book') v *= 5;
  return Math.max(1, Math.floor(v));
}

function _calcRecycleUnitPrice(itemLike, fallbackItemId = 0) {
  const src = (itemLike && typeof itemLike === 'object') ? itemLike : (getItemById(fallbackItemId) || {});
  if (!src || typeof src !== 'object') return 0;
  const val = Number(src.value);
  if (Number.isFinite(val)) return Math.max(0, Math.floor(val));
  const quality = Math.floor(Number(src.quality) || 1);
  const t = String(src.type || '');
  let baseValue = 0;
  if (quality === 1) baseValue = 10;
  else if (quality === 2) baseValue = 30;
  else if (quality === 3) baseValue = 100;
  else if (quality === 4) baseValue = 400;
  else if (quality === 5) baseValue = 2000;
  else if (quality === 6) baseValue = 3000;
  else if (quality === 7) baseValue = 5000;
  if (String(src.material || '') === '令牌') return baseValue * 5;
  if (['herb', 'medicine', 'material'].includes(t)) return baseValue;
  if (['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back', 'consumable'].includes(t)) return baseValue * 3;
  if (t === 'book') return baseValue * 5;
  return baseValue;
}

function _calcAnchorRecycleTaxRule(itemLike, fallbackItemId, unitPrice) {
  const src = (itemLike && typeof itemLike === 'object') ? itemLike : (getItemById(fallbackItemId) || {});
  const quality = Math.max(1, Math.floor(Number(src?.quality) || 1));
  let multiplier = 0;
  if (quality === 4) multiplier = EXCHANGE_ANCHOR_RECYCLE_Q4_MULTIPLIER;
  else if (quality >= 5) multiplier = EXCHANGE_ANCHOR_RECYCLE_Q5_PLUS_MULTIPLIER;
  if (multiplier <= 0) return { enabled: false, recycle_unit_price: 0, cap_anchor_price: 0, multiplier: 0 };
  const recycleUnitPrice = Math.max(0, Math.floor(_calcRecycleUnitPrice(src, fallbackItemId)));
  if (recycleUnitPrice <= 0) return { enabled: false, recycle_unit_price: 0, cap_anchor_price: 0, multiplier: 0 };
  const capAnchorPrice = Math.max(1, recycleUnitPrice * multiplier);
  const quotedUnitPrice = Math.max(1, Math.floor(Number(unitPrice) || 0));
  return {
    enabled: quotedUnitPrice <= capAnchorPrice,
    recycle_unit_price: recycleUnitPrice,
    cap_anchor_price: capAnchorPrice,
    multiplier
  };
}

function _taxFromRate(unitPrice, rate) {
  const up = Math.max(0, Math.floor(Number(unitPrice) || 0));
  if (up <= 0) return 0;
  const r = Math.max(0, Number(rate) || 0);
  if (r <= 0) return 0;
  return Math.max(1, Math.floor(up * r));
}

function _medianInt(values) {
  const arr = (Array.isArray(values) ? values : [])
    .map((v) => Math.floor(Number(v) || 0))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (arr.length <= 0) return 0;
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return Math.floor((arr[mid - 1] + arr[mid]) / 2);
}

function _percentileFromSorted(sortedAsc, p) {
  const arr = Array.isArray(sortedAsc) ? sortedAsc : [];
  if (arr.length <= 0) return 0;
  const pct = _clamp(Number(p) || 0, 0, 1);
  if (arr.length === 1) return arr[0];
  const idx = pct * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const w = idx - lo;
  return Math.floor(arr[lo] * (1 - w) + arr[hi] * w);
}

function _calcAdaptiveTrimRatio(sortedPrices, baseTrimRatio = EXCHANGE_ANCHOR_TRIM_RATIO) {
  const arr = Array.isArray(sortedPrices) ? sortedPrices : [];
  const n = arr.length;
  if (n < EXCHANGE_ANCHOR_TRIM_MIN_SAMPLES) return 0;
  const p10 = Math.max(1, _percentileFromSorted(arr, 0.10));
  const p90 = Math.max(1, _percentileFromSorted(arr, 0.90));
  const spreadRatio = p90 / p10;
  const base = _clamp(Number(baseTrimRatio) || 0, 0, 0.45);
  if (spreadRatio <= 1.18) return 0;
  if (spreadRatio <= 1.30) return Math.min(base, 0.01);
  if (spreadRatio <= 1.55) return Math.min(base, 0.03);
  if (spreadRatio <= 1.95) return Math.min(base, 0.05);
  if (spreadRatio <= 2.60) return Math.min(base, 0.07);
  return Math.min(base, 0.10);
}

function _trimmedPriceArray(values, trimRatio = EXCHANGE_ANCHOR_TRIM_RATIO) {
  const arr = (Array.isArray(values) ? values : [])
    .map((v) => Math.floor(Number(v) || 0))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (arr.length <= 2) return arr;
  const effectiveRatio = _calcAdaptiveTrimRatio(arr, trimRatio);
  let trimCount = Math.floor(arr.length * effectiveRatio);
  const minRemain = arr.length >= 120 ? 40
    : arr.length >= 80 ? 30
      : arr.length >= 40 ? 20
        : 12;
  const maxTrimByRemain = Math.max(0, Math.floor((arr.length - minRemain) / 2));
  trimCount = Math.min(trimCount, maxTrimByRemain);
  if (trimCount <= 0 || trimCount * 2 >= arr.length) return arr;
  return arr.slice(trimCount, arr.length - trimCount);
}

function _meanInt(values) {
  const arr = (Array.isArray(values) ? values : [])
    .map((v) => Math.floor(Number(v) || 0))
    .filter((v) => v > 0);
  if (arr.length <= 0) return 0;
  const sum = arr.reduce((s, v) => s + v, 0);
  return Math.floor(sum / arr.length);
}

function _calcAnchorConfidence(daySamples, weekSamples) {
  const day = Math.max(0, Math.floor(Number(daySamples) || 0));
  const week = Math.max(0, Math.floor(Number(weekSamples) || 0));
  const dayNeed = Math.max(1, EXCHANGE_ANCHOR_DAY_MIN_SAMPLES);
  const weekNeed = Math.max(1, EXCHANGE_ANCHOR_WEEK_MIN_SAMPLES);
  const dayConf = _clamp(day / (dayNeed * 1.2), 0, 1);
  const weekConf = _clamp(week / (weekNeed * 1.2), 0, 1);
  return _clamp(dayConf * 0.62 + weekConf * 0.38, 0, 1);
}

function _robustCenterPrice(values) {
  const trimmed = _trimmedPriceArray(values, EXCHANGE_ANCHOR_TRIM_RATIO);
  const med = _medianInt(trimmed);
  if (med <= 0) return 0;
  const mean = _meanInt(trimmed);
  if (mean <= 0) return med;
  return Math.max(1, Math.floor(med * 0.65 + mean * 0.35));
}

async function _listTradePrices(db, itemId, minCreatedAt, limit = 300) {
  const iid = Number(itemId) || 0;
  if (iid <= 0) return [];
  const lim = Math.max(20, Math.min(1500, Math.floor(Number(limit) || 300)));
  const prices = await db.listExchangeTradePrices(iid, Math.max(0, Math.floor(Number(minCreatedAt) || 0)), lim);
  return (Array.isArray(prices) ? prices : []).map((v) => Math.floor(Number(v) || 0)).filter((v) => v > 0);
}

async function _calcRobustAnchor(db, itemId, nowSec = Math.floor(Date.now() / 1000)) {
  const iid = Number(itemId) || 0;
  if (iid <= 0) {
    return {
      item_id: 0,
      anchor_price: 0,
      fallback_price: 0,
      day_samples: 0,
      week_samples: 0,
      day_center: 0,
      week_center: 0
    };
  }
  const dayMinTs = nowSec - EXCHANGE_ANCHOR_DAY_WINDOW_SEC;
  const weekMinTs = nowSec - EXCHANGE_ANCHOR_WEEK_WINDOW_SEC;
  const dayPrices = await _listTradePrices(db, iid, dayMinTs, 280);
  const weekPrices = await _listTradePrices(db, iid, weekMinTs, 1000);

  const dayCenter = _robustCenterPrice(dayPrices);
  const weekCenter = _robustCenterPrice(weekPrices);
  const anchorConfidence = _calcAnchorConfidence(dayPrices.length, weekPrices.length);
  const fallback = _fallbackUnitPriceForItem(iid);

  let anchorRaw = fallback;
  if (dayPrices.length >= EXCHANGE_ANCHOR_DAY_MIN_SAMPLES && weekPrices.length >= EXCHANGE_ANCHOR_WEEK_MIN_SAMPLES) {
    anchorRaw = Math.floor(dayCenter * 0.7 + weekCenter * 0.3);
  } else if (dayPrices.length >= 4 && weekPrices.length >= 10) {
    anchorRaw = Math.floor(dayCenter * 0.55 + weekCenter * 0.45);
  } else if (dayPrices.length >= 4 && dayCenter > 0) {
    anchorRaw = Math.floor(dayCenter * 0.75 + fallback * 0.25);
  } else if (weekPrices.length >= 10 && weekCenter > 0) {
    anchorRaw = Math.floor(weekCenter * 0.8 + fallback * 0.2);
  }

  let lo = Math.max(1, Math.floor(fallback * EXCHANGE_ANCHOR_CLAMP_MIN_RATIO));
  let hi = Math.max(lo, Math.floor(fallback * EXCHANGE_ANCHOR_CLAMP_MAX_RATIO));

  const mergedPrices = [...dayPrices, ...weekPrices].sort((a, b) => a - b);
  if (mergedPrices.length >= 10) {
    const obsP10 = Math.max(1, _percentileFromSorted(mergedPrices, 0.10));
    const obsP90 = Math.max(obsP10, _percentileFromSorted(mergedPrices, 0.90));
    const obsSpread = obsP90 / obsP10;
    const centerRef = Math.max(1, dayCenter, weekCenter, Math.floor(anchorRaw || fallback));
    const hasStrongSignal = dayPrices.length >= EXCHANGE_ANCHOR_DAY_MIN_SAMPLES
      || weekPrices.length >= EXCHANGE_ANCHOR_WEEK_MIN_SAMPLES
      || mergedPrices.length >= 30;
    if (hasStrongSignal) {
      lo = Math.max(1, Math.floor(Math.min(lo, obsP10 * 0.55)));
      hi = Math.max(
        hi,
        Math.floor(obsP90 * (obsSpread <= 1.35 ? 1.8 : 2.2)),
        Math.floor(centerRef * 2.0)
      );
    } else {
      hi = Math.max(hi, Math.floor(obsP90 * 1.6), Math.floor(centerRef * 1.5));
    }
  }

  hi = Math.max(lo, hi);
  const anchor = _clamp(Math.max(1, Math.floor(anchorRaw || fallback)), lo, hi);

  return {
    item_id: iid,
    anchor_price: anchor,
    anchor_confidence: anchorConfidence,
    fallback_price: fallback,
    day_samples: dayPrices.length,
    week_samples: weekPrices.length,
    day_center: dayCenter,
    week_center: weekCenter
  };
}

async function _getRobustPriceAnchor(db, itemId, nowSec = Math.floor(Date.now() / 1000)) {
  const iid = Number(itemId) || 0;
  if (iid <= 0) return await _calcRobustAnchor(db, iid, nowSec);
  const nowMs = Date.now();
  const cached = _priceAnchorCache.get(iid);
  if (cached && (nowMs - Number(cached.cachedAtMs || 0)) <= EXCHANGE_ANCHOR_CACHE_TTL_MS) {
    return cached.value;
  }
  const value = await _calcRobustAnchor(db, iid, nowSec);
  _priceAnchorCache.set(iid, { cachedAtMs: nowMs, value });
  return value;
}

async function _calcDynamicTaxPerUnit({ db, itemLike, itemId, unitPrice, side = 'sell', nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const up = Math.max(0, Math.floor(Number(unitPrice) || 0));
  const iid = Number(itemId) || Number(itemLike?.id) || 0;
  const baseTaxPerUnit = _taxFromRate(up, EXCHANGE_BASE_TAX_RATE);

  if (up <= 0) {
    return {
      blocked: true,
      reason: '单价异常',
      tax_per_unit: 0,
      base_tax_per_unit: 0,
      dynamic_tax_per_unit: 0,
      low_gap_tax_per_unit: 0,
      tax_rate: 0,
      anchor_price: 0,
      price_ratio: 0
    };
  }

  const isDynamic = _isDynamicPriceItem(itemLike, iid);
  if (iid <= 0 || (isDynamic && !EXCHANGE_DYNAMIC_TAX_APPLY_TO_DYNAMIC_ITEMS)) {
    return {
      blocked: false,
      reason: '',
      tax_per_unit: baseTaxPerUnit,
      base_tax_per_unit: baseTaxPerUnit,
      dynamic_tax_per_unit: baseTaxPerUnit,
      low_gap_tax_per_unit: 0,
      tax_rate: up > 0 ? (baseTaxPerUnit / up) : 0,
      anchor_price: 0,
      price_ratio: 1,
      anchor_source: 'dynamic_item_or_no_anchor'
    };
  }

  const anchorInfo = await _getRobustPriceAnchor(db, iid, nowSec);
  const anchorPrice = Math.max(1, Math.floor(Number(anchorInfo?.anchor_price) || _fallbackUnitPriceForItem(iid)));
  const anchorConfidence = _clamp(Number(anchorInfo?.anchor_confidence) || 0, 0, 1);
  const anchorRecycleTaxRule = _calcAnchorRecycleTaxRule(itemLike, iid, up);
  const ratio = up / anchorPrice;
  const lowLiquidity = anchorConfidence < EXCHANGE_DYNAMIC_LOW_CONFIDENCE_THRESHOLD;
  const hardBlockRatio = lowLiquidity
    ? EXCHANGE_DYNAMIC_LOW_CONFIDENCE_HARD_BLOCK_RATIO
    : EXCHANGE_DYNAMIC_HARD_BLOCK_RATIO;

  if (ratio >= hardBlockRatio) {
    return {
      blocked: true,
      reason: `报价过高（已超过锚点${hardBlockRatio}倍）`,
      tax_per_unit: 0,
      base_tax_per_unit: baseTaxPerUnit,
      dynamic_tax_per_unit: 0,
      low_gap_tax_per_unit: 0,
      tax_rate: 0,
      anchor_price: anchorPrice,
      anchor_confidence: anchorConfidence,
      price_ratio: ratio,
      anchor_source: 'robust'
    };
  }

  if (anchorRecycleTaxRule.enabled) {
    const fixedTaxPerUnit = _taxFromRate(up, EXCHANGE_ANCHOR_RECYCLE_FIXED_TAX_RATE);
    return {
      blocked: false,
      reason: '',
      tax_per_unit: fixedTaxPerUnit,
      base_tax_per_unit: baseTaxPerUnit,
      dynamic_tax_per_unit: fixedTaxPerUnit,
      low_gap_tax_per_unit: 0,
      tax_rate: up > 0 ? (fixedTaxPerUnit / up) : 0,
      anchor_price: anchorPrice,
      anchor_confidence: anchorConfidence,
      price_ratio: ratio,
      anchor_source: 'robust',
      recycle_unit_price: anchorRecycleTaxRule.recycle_unit_price,
      anchor_recycle_cap_price: anchorRecycleTaxRule.cap_anchor_price,
      anchor_recycle_multiplier: anchorRecycleTaxRule.multiplier,
      anchor_recycle_fixed_tax_applied: true
    };
  }

  let dynamicRate = EXCHANGE_BASE_TAX_RATE;
  let lowGapTaxPerUnit = 0;

  if (ratio > 1) {
    const highFullRatio = lowLiquidity
      ? EXCHANGE_DYNAMIC_LOW_CONFIDENCE_HIGH_FULL_RATIO
      : EXCHANGE_DYNAMIC_HIGH_FULL_RATIO;
    const progress = _clamp((ratio - 1) / Math.max(0.0001, highFullRatio - 1), 0, 1);
    let highMaxRate = EXCHANGE_DYNAMIC_HIGH_MAX_RATE;
    let curvePow = 1.22;
    if (lowLiquidity) {
      const confGap = Math.max(0, EXCHANGE_DYNAMIC_LOW_CONFIDENCE_THRESHOLD - anchorConfidence);
      highMaxRate = side === 'sell'
        ? _clamp(0.16 + confGap * 0.22, EXCHANGE_BASE_TAX_RATE + 0.06, 0.26)
        : _clamp(0.20 + confGap * 0.26, EXCHANGE_BASE_TAX_RATE + 0.10, 0.32);
      curvePow = 1.08;
    }
    dynamicRate = EXCHANGE_BASE_TAX_RATE
      + (highMaxRate - EXCHANGE_BASE_TAX_RATE) * Math.pow(progress, curvePow);
  } else if (ratio < 1) {
    const progress = _clamp((1 - ratio) / Math.max(0.0001, 1 - EXCHANGE_DYNAMIC_LOW_FLOOR_RATIO), 0, 1);
    const hotMarket = anchorConfidence >= EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_THRESHOLD;
    const lowMaxRate = hotMarket
      ? Math.min(EXCHANGE_DYNAMIC_LOW_MAX_RATE, EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_MAX_RATE)
      : EXCHANGE_DYNAMIC_LOW_MAX_RATE;
    dynamicRate = EXCHANGE_BASE_TAX_RATE
      + (lowMaxRate - EXCHANGE_BASE_TAX_RATE) * Math.pow(progress, 1.15);
    const gap = Math.max(0, anchorPrice - up);
    const sellGapMultiplier = hotMarket ? EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_GAP_SELL_MULTIPLIER : 1;
    const buyGapMultiplier = hotMarket ? EXCHANGE_DYNAMIC_HIGH_CONFIDENCE_LOW_GAP_BUY_MULTIPLIER : 1;
    const coeff = side === 'buy'
      ? ((0.30 * buyGapMultiplier) + (0.80 * buyGapMultiplier) * Math.pow(progress, 1.05))
      : ((0.18 * sellGapMultiplier) + (0.72 * sellGapMultiplier) * Math.pow(progress, 1.05));
    lowGapTaxPerUnit = Math.max(0, Math.floor(gap * coeff));
    if (side === 'buy') {
      const buyMinCoeff = hotMarket
        ? (EXCHANGE_DYNAMIC_LOW_GAP_BUY_MIN_COEFF * buyGapMultiplier)
        : EXCHANGE_DYNAMIC_LOW_GAP_BUY_MIN_COEFF;
      const buyLowGapFloorTax = Math.max(0, Math.floor(gap * Math.max(0, buyMinCoeff)));
      lowGapTaxPerUnit = Math.max(lowGapTaxPerUnit, buyLowGapFloorTax);
    }
  }

  const dynamicTaxPerUnit = _taxFromRate(up, dynamicRate);
  let taxPerUnit = Math.max(baseTaxPerUnit, dynamicTaxPerUnit, lowGapTaxPerUnit);

  if (ratio > 1 && lowLiquidity) {
    const ratioExcess = Math.max(0, ratio - 1);
    const growthSlope = side === 'sell'
      ? EXCHANGE_DYNAMIC_LOW_CONFIDENCE_NET_GROWTH_SLOPE_SELL
      : EXCHANGE_DYNAMIC_LOW_CONFIDENCE_NET_GROWTH_SLOPE_BUY;
    const anchorBaseNet = Math.max(1, Math.floor(anchorPrice * (1 - EXCHANGE_BASE_TAX_RATE)));
    const minTargetIncome = Math.max(anchorBaseNet, Math.floor(anchorBaseNet * (1 + ratioExcess * growthSlope)));
    const maxTaxByIncomeFloor = Math.max(0, up - minTargetIncome);
    if (maxTaxByIncomeFloor >= baseTaxPerUnit) {
      taxPerUnit = Math.min(taxPerUnit, maxTaxByIncomeFloor);
    }
  }

  return {
    blocked: false,
    reason: '',
    tax_per_unit: taxPerUnit,
    base_tax_per_unit: baseTaxPerUnit,
    dynamic_tax_per_unit: dynamicTaxPerUnit,
    low_gap_tax_per_unit: lowGapTaxPerUnit,
    tax_rate: up > 0 ? (taxPerUnit / up) : 0,
    anchor_price: anchorPrice,
    anchor_confidence: anchorConfidence,
    price_ratio: ratio,
    anchor_source: 'robust'
  };
}

async function _calcBarterGapTax({ db, targetItemLike, targetItemId, payItemLike, payItemId, payUnitCount, quantity = 1, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const targetId = Number(targetItemId) || Number(targetItemLike?.id) || 0;
  const payId = Number(payItemId) || Number(payItemLike?.id) || 0;
  const payCount = Math.max(1, Math.floor(Number(payUnitCount) || 0));
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));

  const targetAnchorInfo = await _getRobustPriceAnchor(db, targetId, nowSec);
  const payAnchorInfo = await _getRobustPriceAnchor(db, payId, nowSec);
  const targetAnchorPrice = Math.max(1, Math.floor(Number(targetAnchorInfo?.anchor_price) || _fallbackUnitPriceForItem(targetId)));
  const payAnchorPrice = Math.max(1, Math.floor(Number(payAnchorInfo?.anchor_price) || _fallbackUnitPriceForItem(payId)));
  const offeredValuePerUnit = Math.max(0, payCount * payAnchorPrice);
  const gapValuePerUnit = Math.abs(offeredValuePerUnit - targetAnchorPrice);
  const supplementTaxPerUnit = Math.max(0, Math.floor(gapValuePerUnit * EXCHANGE_BARTER_GAP_TAX_RATIO));

  return {
    target_anchor_price: targetAnchorPrice,
    target_anchor_confidence: _clamp(Number(targetAnchorInfo?.anchor_confidence) || 0, 0, 1),
    pay_anchor_price: payAnchorPrice,
    pay_anchor_confidence: _clamp(Number(payAnchorInfo?.anchor_confidence) || 0, 0, 1),
    pay_unit_count: payCount,
    expected_pay_unit_count: Math.max(0.0001, targetAnchorPrice / payAnchorPrice),
    offered_value_per_unit: offeredValuePerUnit,
    gap_value_per_unit: gapValuePerUnit,
    gap_direction: offeredValuePerUnit >= targetAnchorPrice ? 'overpay' : 'underpay',
    supplement_tax_per_unit: supplementTaxPerUnit,
    supplement_tax_total: supplementTaxPerUnit * qty,
    escrow_pay_item_total: payCount * qty
  };
}

function consumeFromInventorySlot(player, page, slotIndex, count) {
  const inv = player?.inventory;
  if (!Array.isArray(inv) || page < 0 || page >= inv.length) {
    return { ok: false, error: '无效背包页' };
  }
  const row = inv[page];
  if (!Array.isArray(row) || slotIndex < 0 || slotIndex >= row.length) {
    return { ok: false, error: '无效槽位' };
  }
  const slot = row[slotIndex];
  if (!slot || !slot.item) return { ok: false, error: '该槽位无物品' };
  if (_isLockedEquipmentItem(slot.item)) return { ok: false, error: '该装备已锁定，无法出售' };
  const n = Number(slot.count) || 1;
  const need = Math.max(1, Number(count) || 1);
  if (need > n) return { ok: false, error: '数量不足' };
  const itemSnapshot = deepClone(slot.item);
  if (need === n) {
    row[slotIndex] = null;
  } else {
    slot.count = n - need;
  }
  return { ok: true, itemSnapshot };
}

function countItemInInventoryById(player, itemId, { onlyMarketTradable = false } = {}) {
  const inv = player?.inventory;
  if (!Array.isArray(inv)) return 0;
  const targetId = Number(itemId) || 0;
  if (targetId <= 0) return 0;
  let total = 0;
  for (const page of inv) {
    if (!Array.isArray(page)) continue;
    for (const slot of page) {
      if (!slot || !slot.item) continue;
      if ((Number(slot.item.id) || 0) !== targetId) continue;
      if (onlyMarketTradable && _isNoMarketItem(slot.item)) continue;
      if (_isLockedEquipmentItem(slot.item)) continue;
      total += Math.max(1, Number(slot.count) || 1);
    }
  }
  return total;
}

function takeAndConsumeItemByIdFromInventory(player, itemId, count, { onlyMarketTradable = false } = {}) {
  const inv = player?.inventory;
  if (!Array.isArray(inv)) return { ok: false };
  const targetId = Number(itemId) || 0;
  const need = Math.max(1, Number(count) || 1);
  if (targetId <= 0) return { ok: false, error: '物品参数无效' };

  let available = 0;
  let itemSnapshot = null;
  const candidates = [];
  for (let p = 0; p < inv.length; p += 1) {
    const page = inv[p];
    if (!Array.isArray(page)) continue;
    for (let s = 0; s < page.length; s += 1) {
      const slot = page[s];
      if (!slot || !slot.item) continue;
      if ((Number(slot.item.id) || 0) !== targetId) continue;
      if (onlyMarketTradable && _isNoMarketItem(slot.item)) continue;
      if (_isLockedEquipmentItem(slot.item)) continue;
      if (!itemSnapshot) itemSnapshot = deepClone(slot.item);
      const have = Math.max(1, Number(slot.count) || 1);
      available += have;
      candidates.push({ page, slotIndex: s, have });
      if (available >= need) break;
    }
    if (available >= need) break;
  }

  if (available < need || !itemSnapshot) {
    return { ok: false, error: `背包物品数量不足（需要${need}，当前${available}）` };
  }

  let left = need;
  for (const c of candidates) {
    if (left <= 0) break;
    const slot = c.page[c.slotIndex];
    if (!slot || !slot.item) continue;
    const have = Math.max(1, Number(slot.count) || 1);
    const use = Math.min(have, left);
    const remain = have - use;
    if (remain <= 0) c.page[c.slotIndex] = null;
    else slot.count = remain;
    left -= use;
  }

  if (left > 0) {
    return { ok: false, error: '扣除背包物品失败，请重试' };
  }
  return { ok: true, itemSnapshot };
}

async function savePlayerImmediateStrict(db, accountId, player, scene = '') {
  const ret = await db.savePlayerImmediate(accountId, 1, player);
  if (ret && ret.conflict) {
    return { ok: false, error: '数据繁忙，请重试' };
  }
  return { ok: true };
}

async function grantAttachmentsDirect(db, accountId, attachments, scene = '') {
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length <= 0) return { ok: true };
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return { ok: false, error: '角色不存在' };
  for (const att of list) {
    if (!att || typeof att !== 'object') continue;
    if (att.kind === 'currency' && String(att.currency || '') === 'spirit_stones') {
      const amount = Math.max(0, Math.floor(Number(att.amount) || 0));
      if (amount > 0) player.spirit_stones = (Number(player.spirit_stones) || 0) + amount;
      continue;
    }
    if (att.kind === 'item' && att.item) {
      const count = Math.max(0, Math.floor(Number(att.count) || 0));
      if (count <= 0) continue;
      player.inventory = ops.ensureInventoryStructure(player.inventory || []);
      ops.putItemInInventory(player.inventory, att.item, count);
    }
  }
  return savePlayerImmediateStrict(db, accountId, player, `${scene}:direct_grant`);
}

async function deliverMailboxOrDirect(db, accountId, mailPayload, scene = '') {
  try {
    await db.createMailboxMessage(accountId, mailPayload);
    return { ok: true, via: 'mail' };
  } catch (e) {
    const fallback = await grantAttachmentsDirect(db, accountId, mailPayload?.attachments, scene);
    if (!fallback.ok) {
      return { ok: false, error: '发放失败，请联系管理员处理' };
    }
    return { ok: true, via: 'direct' };
  }
}

/* =============== 路由分发 =============== */

export async function handleExchangeRoute(request, env, route) {
  const method = request.method;
  const url = new URL(request.url);
  const subPath = route.replace(/^\/exchange/, '') || '/';
  const q = url.searchParams;

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = auth.accountId || auth.sub || 0;

  const xff = request.headers.get('x-forwarded-for') || '';
  const ip = _normalizeIp(xff);

  const rl = await _checkRateLimit(method, subPath, accountId, ip);
  if (rl && !rl.ok) {
    const waitSec = Math.max(0.1, Math.ceil((Number(rl.waitMs) || 0) / 100) / 10);
    return json({ ok: false, error: `操作过于频繁，请${waitSec}秒后再试` });
  }

  const db = createDb(env);
  const secret = env.JWT_SECRET || 'change-me-in-production-use-env';
  const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
  const headers = request.headers;
  const accountIdNum = Number(accountId) || 0;

  if (subPath === '/listings' && method === 'GET') return handleListings(db, accountIdNum, q, secret);
  if (subPath === '/my/listings' && method === 'GET') return handleMyListings(db, accountIdNum, q);
  if (subPath === '/quote' && method === 'GET') return handleQuote(db, accountIdNum, q, ip);
  if (subPath === '/item_search' && method === 'GET') return handleItemSearch(q);
  if (subPath === '/listings' && method === 'POST') return handleCreateListing(db, accountIdNum, body);
  if (subPath === '/buy_orders' && method === 'POST') return handleBuyOrders(db, accountIdNum, body);
  if (subPath === '/buy' && method === 'POST') return handleBuy(db, accountIdNum, body, headers, secret);
  if (subPath === '/fulfill_buy' && method === 'POST') return handleFulfillBuy(db, accountIdNum, body, headers, secret);
  const cancelMatch = subPath.match(/^\/listings\/(\d+)\/cancel$/);
  if (cancelMatch && method === 'POST') return handleCancelListing(db, accountIdNum, intVal(cancelMatch[1], 0), body, headers, secret);

  return null;
}

/* =============== GET /listings =============== */

async function handleListings(db, accountId, q, secret) {
  await db.settleExpiredExchangeListings();
  const page = Math.max(1, Math.floor(Number(q.get('page')) || 1));
  const pageSize = Math.max(1, Math.min(200, Math.floor(Number(q.get('page_size')) || 20)));
  const side = String(q.get('side') || 'all');
  const itemId = parseNonNegativeInt(q.get('item_id'), 0);
  const keyword = String(q.get('keyword') || '').trim();
  const minPrice = parseNonNegativeInt(q.get('min_price'), 0);
  const maxPrice = parseNonNegativeInt(q.get('max_price'), 0);
  const quality = parseNonNegativeInt(q.get('quality'), 0);
  const category = String(q.get('category') || '').trim().toLowerCase();
  const subtype = String(q.get('subtype') || '').trim();
  const sortBy = String(q.get('sort_by') || q.get('sortBy') || 'price_asc');
  const data = await db.listExchangeListings({
    page,
    pageSize,
    side,
    itemId,
    keyword,
    minPrice,
    maxPrice,
    quality,
    category,
    subtype,
    sortBy
  });
  const now = Math.floor(Date.now() / 1000);
  const list = data.list.map((r) => {
    let pn = (r.seller_player_name != null && r.seller_player_name !== '') ? String(r.seller_player_name).trim() : '';
    if (pn.length >= 2 && pn.startsWith('"') && pn.endsWith('"')) pn = pn.slice(1, -1).replace(/\\"/g, '"');
    const snapshot = parseItemSnapshotSafe(r.item_snapshot_json);
    const barter = snapshot?.barter && snapshot.barter.enabled ? snapshot.barter : null;
    return {
      listing_id: r.id,
      side: String(r.side || 'sell'),
      seller_account_id: r.seller_account_id,
      seller_username: r.seller_username || '未知',
      seller_player_name: pn || r.seller_username || '未知',
      item_id: r.item_id,
      item_name: r.item_name,
      unit_price: r.unit_price,
      tax_per_unit: Number(r.tax_per_unit || 0),
      quantity_total: r.quantity_total,
      quantity_left: r.quantity_left,
      status: r.status,
      item_snapshot: snapshot,
      barter_enabled: Boolean(barter),
      barter_pay_item_id: Number(barter?.pay_item_id) || 0,
      barter_pay_item_name: String(barter?.pay_item_name || ''),
      barter_pay_unit_count: Math.max(0, Number(barter?.pay_unit_count) || 0),
      created_at: r.created_at,
      expires_at: r.expires_at,
      expires_in: Math.max(0, Number(r.expires_at) - now)
    };
  });
  const marketTokenInfo = await issueMarketToken(accountId, list.map((r) => r.listing_id), secret);
  return json({
    ok: true,
    page: data.page,
    page_size: data.pageSize,
    total: data.total,
    tax_rate: normalizeTaxRate(),
    tax_policy: getExchangeTaxPolicy(),
    list,
    market_token: marketTokenInfo.token,
    market_token_expires_at: marketTokenInfo.expiresAt
  });
}

/* =============== GET /my/listings =============== */

async function handleMyListings(db, accountId, q) {
  await db.settleExpiredExchangeListings();
  const includeClosed = q.get('include_closed') === '1' || q.get('history') === '1';
  const rows = await db.listMyExchangeListings(accountId, { includeClosed });
  const now = Math.floor(Date.now() / 1000);
  const list = rows.map((r) => {
    const snapshot = parseItemSnapshotSafe(r.item_snapshot_json);
    const barter = snapshot?.barter && snapshot.barter.enabled ? snapshot.barter : null;
    return {
      listing_id: r.id,
      side: String(r.side || 'sell'),
      seller_account_id: r.seller_account_id,
      seller_username: r.seller_username || '未知',
      seller_player_name: r.seller_player_name || r.seller_username || '未知',
      item_id: r.item_id,
      item_name: r.item_name,
      unit_price: r.unit_price,
      tax_per_unit: Number(r.tax_per_unit || 0),
      quantity_total: r.quantity_total,
      quantity_left: r.quantity_left,
      status: r.status,
      item_snapshot: snapshot,
      barter_enabled: Boolean(barter),
      barter_pay_item_id: Number(barter?.pay_item_id) || 0,
      barter_pay_item_name: String(barter?.pay_item_name || ''),
      barter_pay_unit_count: Math.max(0, Number(barter?.pay_unit_count) || 0),
      created_at: r.created_at,
      expires_at: r.expires_at,
      expires_in: Math.max(0, Number(r.expires_at) - now)
    };
  });
  return json({ ok: true, list, tax_rate: normalizeTaxRate(), tax_policy: getExchangeTaxPolicy() });
}

/* =============== GET /item_search =============== */

function handleItemSearch(q) {
  const query = String(q.get('q') || '').trim();
  if (query.length < 1) return json({ ok: true, results: [] });
  const items = getItems() || [];
  const results = [];
  for (const it of items) {
    if (!it || !it.name) continue;
    if (_isNoMarketItem(it)) continue;
    const type = String(it.type || '');
    if (['equipment', 'weapon'].includes(type)) continue;
    if (String(it.name).includes(query)) {
      results.push({ id: Number(it.id), name: String(it.name), type, quality: Number(it.quality) || 1 });
      if (results.length >= 20) break;
    }
  }
  return json({ ok: true, results });
}

/* =============== GET /quote =============== */

async function handleQuote(db, accountId, q, ip) {
  const sideRaw = String(q.get('side') || 'sell').trim().toLowerCase();
  const side = sideRaw === 'buy' ? 'buy' : 'sell';
  const barterPayItemId = parsePositiveInt(q.get('barter_pay_item_id')) || 0;
  const barterPayUnitCount = parsePositiveInt(q.get('barter_pay_unit_count')) || 0;
  const wantsBarter = side === 'buy' && (barterPayItemId > 0 || barterPayUnitCount > 0);
  const isBarterQuote = side === 'buy' && barterPayItemId > 0 && barterPayUnitCount > 0;
  const unitPrice = isBarterQuote ? barterPayUnitCount : parsePositiveInt(q.get('unit_price'));
  const quantity = parsePositiveInt(q.get('quantity')) || 1;
  if (wantsBarter && !isBarterQuote) {
    return json({ ok: false, error: '以物易物参数不完整，请选择支付物并填写兑换单价' });
  }
  if (unitPrice == null) return json({ ok: false, error: '单价必须为正整数' });

  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });

  let itemLike = null;
  let itemId = parsePositiveInt(q.get('item_id')) || 0;
  let itemName = String(q.get('item_name') || '').trim();

  if (side === 'sell') {
    const pageStr = q.get('page');
    const slotStr = q.get('slot_index');
    const page = (pageStr !== null && pageStr !== '' && Number.isFinite(Number(pageStr))) ? Math.floor(Number(pageStr)) : -1;
    const slotIndex = (slotStr !== null && slotStr !== '' && Number.isFinite(Number(slotStr))) ? Math.floor(Number(slotStr)) : -1;
    if (page >= 0 && slotIndex >= 0) {
      const inv = player?.inventory;
      const row = Array.isArray(inv) && Array.isArray(inv[page]) ? inv[page] : null;
      const slot = Array.isArray(row) ? row[slotIndex] : null;
      if (!slot || !slot.item) return json({ ok: false, error: '请选择要上架的物品' });
      if (_isLockedEquipmentItem(slot.item)) return json({ ok: false, error: '该装备已锁定，无法出售' });
      const maxCount = Math.max(1, Math.floor(Number(slot.count) || 1));
      if (quantity > maxCount) return json({ ok: false, error: `数量不能超过背包数量（${maxCount}）` });
      itemLike = slot.item;
      itemId = Number(slot.item.id) || itemId;
      itemName = String(slot.item.name || itemName || '');
    } else if (itemId > 0) {
      itemLike = getItemById(itemId) || { id: itemId, name: itemName || '未知物品' };
      itemName = String(itemLike.name || itemName || '');
    } else {
      return json({ ok: false, error: '请选择要上架的物品' });
    }

    if (_isNoMarketItem(itemLike) || _isNoMarketItem(itemId)) {
      return json({ ok: false, error: '该物品不可在坊市交易' });
    }
  } else {
    const equipSlot = String(q.get('equip_slot') || '').trim();
    if (equipSlot) {
      if (wantsBarter) {
        return json({ ok: false, error: '以物易物仅支持非装备求购单' });
      }
      if (!EXCHANGE_DYNAMIC_PRICE_ITEM_TYPES.has(equipSlot)) {
        return json({ ok: false, error: '装备类别无效' });
      }
      const equipSubtype = String(q.get('equip_subtype') || '').trim();
      const equipMaterial = String(q.get('equip_material') || '').trim();
      const equipMinQuality = parseNonNegativeInt(q.get('equip_min_quality'), 0);
      const criteria = {
        slot: equipSlot,
        subtype: equipSubtype,
        material: equipMaterial,
        min_quality: equipMinQuality > 0 ? equipMinQuality : 1
      };
      itemId = 0;
      itemLike = {
        id: 0,
        name: itemName || `${criteria.min_quality}品${equipSlot || equipSlot}`,
        equipment_criteria: criteria,
        type: equipSlot
      };
      itemName = String(itemLike.name || itemName || '');
    } else {
      if (itemId <= 0 && itemName.length > 0) {
        const resolved = _resolveItemByName(itemName);
        if (resolved.ambiguous) {
          return json({ ok: false, error: '物品名不够精确，请从候选列表选择' });
        }
        if (resolved.item) itemId = Number(resolved.item.id) || 0;
      }
      if (itemId <= 0) return json({ ok: false, error: '未找到该物品，请检查名称' });
      if (_isNoMarketItem(itemId)) return json({ ok: false, error: '该物品不可在坊市交易' });
      const fullItem = getItemById(itemId);
      itemLike = fullItem ? { ...fullItem, name: itemName || fullItem.name } : { id: itemId, name: itemName || '未知物品' };
      itemName = String(itemLike.name || itemName || '');
    }
  }

  const canUseServerQuoteCache = side === 'buy' && itemId > 0 && String(q.get('equip_slot') || '').trim().length <= 0;
  const quoteCacheKey = canUseServerQuoteCache
    ? _buildQuoteCacheKey({
      accountId,
      mode: isBarterQuote ? 'buy_barter' : 'buy',
      itemId,
      quantity,
      unitPrice,
      barterPayItemId,
      barterPayUnitCount
    })
    : '';
  if (quoteCacheKey) {
    const cachedPayload = _getCachedQuotePayload(quoteCacheKey);
    if (cachedPayload) return json(cachedPayload);
  }

  if (isBarterQuote) {
    if (itemId <= 0 || _isEquipmentLike(itemLike, itemId)) {
      return json({ ok: false, error: '以物易物仅支持非装备求购单' });
    }
    if (_isNoMarketItem(itemLike) || _isNoMarketItem(itemId)) {
      return json({ ok: false, error: '该求购物品不可在坊市交易' });
    }

    const payItemTpl = getItemById(barterPayItemId);
    if (!payItemTpl || !payItemTpl.id) return json({ ok: false, error: '未找到支付物品' });
    if (_isEquipmentLike(payItemTpl, barterPayItemId)) {
      return json({ ok: false, error: '支付物品不能是装备' });
    }
    if (_isNoMarketItem(payItemTpl) || _isNoMarketItem(barterPayItemId)) {
      return json({ ok: false, error: '该支付物品不可用于坊市以物易物' });
    }

    const barterTaxInfo = await _calcBarterGapTax({
      db,
      targetItemLike: itemLike,
      targetItemId: itemId,
      payItemLike: payItemTpl,
      payItemId: barterPayItemId,
      payUnitCount: barterPayUnitCount,
      quantity
    });
    const taxPerUnit = Math.max(0, Math.floor(Number(barterTaxInfo.supplement_tax_per_unit) || 0));
    const targetAnchor = Math.max(1, Math.floor(Number(barterTaxInfo.target_anchor_price) || 1));

    const barterPayload = {
      ok: true,
      side,
      barter_enabled: true,
      item_id: itemId,
      item_name: itemName || '未知物品',
      quantity,
      unit_price: barterPayUnitCount,
      tax_per_unit: taxPerUnit,
      total_tax: taxPerUnit * quantity,
      tax_rate: targetAnchor > 0 ? (taxPerUnit / targetAnchor) : 0,
      base_tax_per_unit: 0,
      dynamic_tax_per_unit: 0,
      low_gap_tax_per_unit: 0,
      anchor_price: targetAnchor,
      anchor_confidence: _clamp(Number(barterTaxInfo.target_anchor_confidence) || 0, 0, 1),
      price_ratio: targetAnchor > 0 ? (Number(barterTaxInfo.offered_value_per_unit || 0) / targetAnchor) : 1,
      barter_pay_item_id: barterPayItemId,
      barter_pay_item_name: String(payItemTpl.name || '未知物品'),
      barter_pay_unit_count: Math.max(1, Math.floor(Number(barterTaxInfo.pay_unit_count) || 1)),
      barter_expected_pay_unit_count: Number(barterTaxInfo.expected_pay_unit_count || 1),
      barter_offered_value_per_unit: Math.max(0, Math.floor(Number(barterTaxInfo.offered_value_per_unit) || 0)),
      barter_gap_value_per_unit: Math.max(0, Math.floor(Number(barterTaxInfo.gap_value_per_unit) || 0)),
      barter_gap_direction: String(barterTaxInfo.gap_direction || 'underpay'),
      pay_anchor_price: Math.max(1, Math.floor(Number(barterTaxInfo.pay_anchor_price) || 1)),
      pay_anchor_confidence: _clamp(Number(barterTaxInfo.pay_anchor_confidence) || 0, 0, 1),
      escrow_pay_item_total: Math.max(1, Math.floor(Number(barterTaxInfo.escrow_pay_item_total) || 0)),
      escrow_spirit_stones: Math.max(0, Math.floor(Number(barterTaxInfo.supplement_tax_total) || 0)),
      tax_policy: getExchangeTaxPolicy()
    };
    if (quoteCacheKey) _setCachedQuotePayload(quoteCacheKey, barterPayload);
    return json(barterPayload);
  }

  const taxInfo = await _calcDynamicTaxPerUnit({
    db,
    itemLike,
    itemId,
    unitPrice,
    side
  });
  if (taxInfo.blocked) {
    const anchor = Math.max(0, Number(taxInfo.anchor_price) || 0);
    return json({ ok: false, error: `${taxInfo.reason}${anchor > 0 ? `（锚点价${anchor}）` : ''}` });
  }

  const taxPerUnit = Math.max(0, Math.floor(Number(taxInfo.tax_per_unit) || 0));
  const payload = {
    ok: true,
    side,
    barter_enabled: false,
    item_id: itemId,
    item_name: itemName || '未知物品',
    quantity,
    unit_price: unitPrice,
    tax_per_unit: taxPerUnit,
    total_tax: taxPerUnit * quantity,
    tax_rate: Number(taxInfo.tax_rate || 0),
    base_tax_per_unit: Math.max(0, Math.floor(Number(taxInfo.base_tax_per_unit) || 0)),
    dynamic_tax_per_unit: Math.max(0, Math.floor(Number(taxInfo.dynamic_tax_per_unit) || 0)),
    low_gap_tax_per_unit: Math.max(0, Math.floor(Number(taxInfo.low_gap_tax_per_unit) || 0)),
    anchor_price: Math.max(0, Number(taxInfo.anchor_price) || 0),
    anchor_confidence: _clamp(Number(taxInfo.anchor_confidence) || 0, 0, 1),
    price_ratio: Number(taxInfo.price_ratio || 1),
    tax_policy: getExchangeTaxPolicy()
  };

  if (side === 'buy') {
    const escrowPerUnit = unitPrice + taxPerUnit;
    payload.escrow_per_unit = escrowPerUnit;
    payload.escrow_total = escrowPerUnit * quantity;
    payload.total_price = unitPrice * quantity;
    if (quoteCacheKey) _setCachedQuotePayload(quoteCacheKey, payload);
  } else {
    const incomePerUnit = Math.max(0, unitPrice - taxPerUnit);
    payload.estimated_income_per_unit = incomePerUnit;
    payload.estimated_income_total = incomePerUnit * quantity;
  }

  return json(payload);
}

/* =============== POST /listings（上架出售） =============== */

const MAX_SELL_LISTINGS = 8;

async function handleCreateListing(db, accountId, body) {
  await db.settleExpiredExchangeListings();
  const page = Math.floor(Number(body?.page));
  const slotIndex = Math.floor(Number(body?.slot_index));
  const expectItemId = parsePositiveInt(body?.expect_item_id) || 0;
  const quantity = parsePositiveInt(body?.quantity);
  const unitPrice = parsePositiveInt(body?.unit_price);
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(slotIndex) || slotIndex < 0) {
    return json({ ok: false, error: '上架槽位参数无效' });
  }
  if (quantity == null) {
    return json({ ok: false, error: '数量必须为正整数' });
  }
  if (unitPrice == null) {
    return json({ ok: false, error: '标价必须为正整数' });
  }
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });

  const myOpenListings = await db.listMyExchangeListings(accountId, { includeClosed: false });
  const activeSellCount = (Array.isArray(myOpenListings) ? myOpenListings : [])
    .filter((r) => String(r?.side || 'sell') === 'sell').length;
  if (activeSellCount >= MAX_SELL_LISTINGS) {
    return json({ ok: false, error: `每人最多同时上架${MAX_SELL_LISTINGS}个订单` });
  }

  const inv = player?.inventory;
  const preSlot = Array.isArray(inv) && inv[page] && inv[page][slotIndex];
  if (expectItemId > 0) {
    const slotItemId = Number(preSlot?.item?.id) || 0;
    if (slotItemId !== expectItemId) {
      return json({ ok: false, error: '背包物品已变动，请刷新后重试', code: 'SLOT_MISMATCH' });
    }
  }
  let sellTaxInfo = null;
  if (preSlot?.item) {
    if (_isNoMarketItem(preSlot.item)) {
      return json({ ok: false, error: '该物品不可在坊市交易' });
    }
    if (_isLockedEquipmentItem(preSlot.item)) {
      return json({ ok: false, error: '该装备已锁定，无法出售' });
    }
    sellTaxInfo = await _calcDynamicTaxPerUnit({
      db,
      itemLike: preSlot.item,
      itemId: Number(preSlot.item.id) || 0,
      unitPrice,
      side: 'sell'
    });
    if (sellTaxInfo.blocked) {
      const anchor = Math.max(0, Number(sellTaxInfo.anchor_price) || 0);
      return json({ ok: false, error: `${sellTaxInfo.reason}${anchor > 0 ? `（锚点价${anchor}）` : ''}` });
    }
  }

  const preItemId = Number(preSlot?.item?.id) || 0;
  if (preItemId <= 0) {
    return json({ ok: false, error: '该槽位无物品' });
  }
  if (!_isEquipmentLike(preSlot.item, preItemId)) {
    const invTradableCount = countItemInInventoryById(player, preItemId, { onlyMarketTradable: true });
    const reservedByOpenListings = (Array.isArray(myOpenListings) ? myOpenListings : [])
      .filter((r) => String(r?.side || 'sell') === 'sell')
      .filter((r) => {
        const st = String(r?.status || '');
        return st === 'open' || st === 'partial';
      })
      .filter((r) => (Number(r?.item_id) || 0) === preItemId)
      .reduce((sum, r) => sum + Math.max(0, Math.floor(Number(r?.quantity_left) || 0)), 0);
    const availableTradable = Math.max(0, invTradableCount - reservedByOpenListings);
    if (availableTradable <= 0) {
      return json({ ok: false, error: '该物品已被现有挂单占用，请先取消挂单后再上架' });
    }
    if (quantity > availableTradable) {
      return json({ ok: false, error: `可上架数量不足（可用${availableTradable}，已挂单占用${reservedByOpenListings}）` });
    }
  }

  const preSlotBackup = deepClone(preSlot);

  const consume = consumeFromInventorySlot(player, page, slotIndex, quantity);
  if (!consume.ok) return json(consume);

  const item = consume.itemSnapshot || {};
  const finalSellTaxInfo = sellTaxInfo || await _calcDynamicTaxPerUnit({
    db,
    itemLike: item,
    itemId: Number(item.id) || 0,
    unitPrice,
    side: 'sell'
  });
  const taxPerUnit = Math.max(0, Math.floor(Number(finalSellTaxInfo.tax_per_unit) || 0));

  let listingId = 0;
  let playerSaved = false;
  try {
    {
      const persist = await savePlayerImmediateStrict(db, accountId, player, 'listings:deduct');
      if (!persist.ok) return json(persist);
    }
    playerSaved = true;
    listingId = await db.createExchangeListing(accountId, {
      item_id: Number(item.id) || 0,
      item_name: String(item.name || '未知物品'),
      item_snapshot: item,
      unit_price: unitPrice,
      quantity_total: quantity,
      quantity_left: quantity,
      side: 'sell',
      tax_per_unit: taxPerUnit
    });
  } catch (e) {
    if (playerSaved) {
      try {
        if (Array.isArray(player.inventory) && Array.isArray(player.inventory[page])) {
          player.inventory[page][slotIndex] = deepClone(preSlotBackup);
        }
        await savePlayerImmediateStrict(db, accountId, player, 'listings:rollback');
      } catch (_rollbackErr) {
        // 回滚失败：邮件补偿由 settle/对账兜底
      }
    }
    return json({ ok: false, error: '上架失败，请稍后重试' });
  }

  return json({
    ok: true,
    listing_id: listingId,
    item_name: String(item.name || '未知物品'),
    unit_price: unitPrice,
    quantity,
    tax_per_unit: taxPerUnit,
    estimated_income_per_unit: Math.max(0, unitPrice - taxPerUnit),
    anchor_price: Math.max(0, Number(finalSellTaxInfo.anchor_price) || 0),
    price_ratio: Number(finalSellTaxInfo.price_ratio || 1),
    tax_policy: getExchangeTaxPolicy()
  });
}

/* =============== POST /buy_orders（发布求购单） =============== */

const MAX_BUY_ORDERS = 8;

async function handleBuyOrders(db, accountId, body) {
  await db.settleExpiredExchangeListings();
  const equipCriteria = body?.equipment_criteria;
  const isEquipOrder = equipCriteria && typeof equipCriteria === 'object';
  const barterPayItemId = parsePositiveInt(body?.barter_pay_item_id) || 0;
  const barterPayUnitCount = parsePositiveInt(body?.barter_pay_unit_count) || 0;
  const wantsBarter = !isEquipOrder && (barterPayItemId > 0 || barterPayUnitCount > 0);
  const isBarterOrder = !isEquipOrder && barterPayItemId > 0 && barterPayUnitCount > 0;
  let rawItemId = isEquipOrder ? 0 : parsePositiveInt(body?.item_id);
  let itemName = String(body?.item_name || '').trim();
  const quantity = parsePositiveInt(body?.quantity);
  const unitPrice = isBarterOrder ? barterPayUnitCount : parsePositiveInt(body?.unit_price);
  if (wantsBarter && !isBarterOrder) {
    return json({ ok: false, error: '以物易物参数不完整，请选择支付物并填写兑换单价' });
  }
  if (!isEquipOrder && (rawItemId == null || rawItemId <= 0) && itemName.length > 0) {
    const resolved = _resolveItemByName(itemName);
    if (resolved.ambiguous) {
      return json({ ok: false, error: '物品名不够精确，请从候选列表选择' });
    }
    if (resolved.item) rawItemId = Number(resolved.item.id);
  }
  if (!isEquipOrder && (rawItemId == null || rawItemId <= 0)) return json({ ok: false, error: '未找到该物品，请检查名称' });
  const itemId = rawItemId ?? 0;
  if (isBarterOrder && _isEquipmentLike(itemId, itemId)) {
    return json({ ok: false, error: '以物易物仅支持非装备求购单' });
  }
  if (!isEquipOrder && itemId > 0) {
    if (_isNoMarketItem(itemId)) {
      return json({ ok: false, error: '该物品不可在坊市交易' });
    }
  }
  if (itemName.length <= 0 && !isEquipOrder) {
    const tpl = getItemById(itemId);
    if (tpl?.name) itemName = String(tpl.name);
  }
  if (itemName.length <= 0) return json({ ok: false, error: '求购物品名称不能为空' });
  if (quantity == null) return json({ ok: false, error: '求购数量必须为正整数' });
  if (unitPrice == null) return json({ ok: false, error: '出价必须为正整数' });

  let payItemTemplate = null;
  let payItemSnapshot = null;
  if (isBarterOrder) {
    payItemTemplate = getItemById(barterPayItemId);
    if (!payItemTemplate || !payItemTemplate.id) {
      return json({ ok: false, error: '未找到支付物品' });
    }
    if (_isEquipmentLike(payItemTemplate, barterPayItemId)) {
      return json({ ok: false, error: '支付物品不能是装备' });
    }
    if (_isNoMarketItem(payItemTemplate) || _isNoMarketItem(barterPayItemId)) {
      return json({ ok: false, error: '该支付物品不可用于坊市以物易物' });
    }
  }

  let snapshot;
  if (isEquipOrder) {
    snapshot = { id: 0, name: itemName, equipment_criteria: equipCriteria };
  } else {
    const fullItem = getItemById(itemId);
    snapshot = fullItem ? { ...fullItem, name: itemName } : { id: itemId, name: itemName };
    if (isBarterOrder && _isEquipmentLike(snapshot, itemId)) {
      return json({ ok: false, error: '以物易物仅支持非装备求购单' });
    }
  }

  let buyTaxInfo = null;
  let barterTaxInfo = null;
  let taxPerUnit = 0;
  let escrowPerUnit = 0;
  let escrowTotal = 0;
  let escrowPayTotal = 0;
  let escrowSpiritStones = 0;

  if (isBarterOrder) {
    barterTaxInfo = await _calcBarterGapTax({
      db,
      targetItemLike: snapshot,
      targetItemId: itemId,
      payItemLike: payItemTemplate,
      payItemId: barterPayItemId,
      payUnitCount: barterPayUnitCount,
      quantity
    });
    taxPerUnit = Math.max(0, Math.floor(Number(barterTaxInfo.supplement_tax_per_unit) || 0));
    escrowSpiritStones = taxPerUnit * quantity;
    escrowPayTotal = Math.max(1, Math.floor(Number(barterTaxInfo.escrow_pay_item_total) || 0));
  } else {
    buyTaxInfo = await _calcDynamicTaxPerUnit({
      db,
      itemLike: snapshot,
      itemId,
      unitPrice,
      side: 'buy'
    });
    if (buyTaxInfo.blocked) {
      const anchor = Math.max(0, Number(buyTaxInfo.anchor_price) || 0);
      return json({ ok: false, error: `${buyTaxInfo.reason}${anchor > 0 ? `（锚点价${anchor}）` : ''}` });
    }

    taxPerUnit = Math.max(0, Math.floor(Number(buyTaxInfo.tax_per_unit) || 0));
    escrowPerUnit = unitPrice + taxPerUnit;
    escrowTotal = escrowPerUnit * quantity;
  }

  const buyer = await db.getPlayerByAccountId(accountId);
  if (!buyer) return json({ ok: false, error: '角色不存在' });
  const myOpenListings = await db.listMyExchangeListings(accountId, { includeClosed: false });
  const activeBuyCount = (Array.isArray(myOpenListings) ? myOpenListings : [])
    .filter((r) => String(r?.side || 'sell') === 'buy').length;
  if (activeBuyCount >= MAX_BUY_ORDERS) {
    return json({ ok: false, error: `最多同时发布${MAX_BUY_ORDERS}条求购单` });
  }

  let finalSnapshot = snapshot;
  const stones = Number(buyer.spirit_stones) || 0;
  if (isBarterOrder) {
    if (stones < escrowSpiritStones) return json({ ok: false, error: `灵石不足，需补差额税 ${escrowSpiritStones}` });
    const havePayItems = countItemInInventoryById(buyer, barterPayItemId, { onlyMarketTradable: true });
    if (havePayItems < escrowPayTotal) {
      return json({ ok: false, error: `支付物品数量不足（需要${escrowPayTotal}，当前${havePayItems}）` });
    }
    const payTake = takeAndConsumeItemByIdFromInventory(buyer, barterPayItemId, escrowPayTotal, { onlyMarketTradable: true });
    if (!payTake.ok || !payTake.itemSnapshot) {
      return json({ ok: false, error: payTake.error || '扣除支付物品失败，请重试' });
    }
    payItemSnapshot = payTake.itemSnapshot;
    buyer.spirit_stones = stones - escrowSpiritStones;
    finalSnapshot = {
      ...(snapshot || {}),
      barter: {
        enabled: true,
        pay_item_id: Number(payItemTemplate?.id) || barterPayItemId,
        pay_item_name: String(payItemTemplate?.name || payItemSnapshot?.name || '未知物品'),
        pay_unit_count: barterPayUnitCount,
        pay_item_snapshot: payItemSnapshot,
        escrow_pay_item_total: escrowPayTotal,
        escrow_spirit_stones: escrowSpiritStones,
        target_anchor_price: Math.max(1, Math.floor(Number(barterTaxInfo?.target_anchor_price) || 1)),
        pay_anchor_price: Math.max(1, Math.floor(Number(barterTaxInfo?.pay_anchor_price) || 1))
      }
    };
  } else {
    if (stones < escrowTotal) return json({ ok: false, error: `灵石不足，需预存 ${escrowTotal}` });
    buyer.spirit_stones = stones - escrowTotal;
  }

  {
    const persist = await savePlayerImmediateStrict(db, accountId, buyer, 'buy_orders:escrow_deduct');
    if (!persist.ok) return json(persist);
  }
  let listingId = 0;
  try {
    listingId = await db.createExchangeListing(accountId, {
      item_id: itemId,
      item_name: itemName,
      item_snapshot: finalSnapshot,
      unit_price: unitPrice,
      quantity_total: quantity,
      quantity_left: quantity,
      side: 'buy',
      tax_per_unit: taxPerUnit
    });
  } catch (e) {
    try {
      buyer.spirit_stones = stones;
      if (isBarterOrder && payItemSnapshot && escrowPayTotal > 0) {
        ops.putItemInInventory(buyer.inventory, payItemSnapshot, escrowPayTotal);
      }
      await savePlayerImmediateStrict(db, accountId, buyer, 'buy_orders:rollback');
    } catch (_rollbackErr) {
      // 回滚失败：由对账/邮件兜底
    }
    return json({ ok: false, error: '创建求购单失败，请稍后重试' });
  }

  if (isBarterOrder) {
    return json({
      ok: true,
      listing_id: listingId,
      item_id: itemId,
      item_name: itemName,
      quantity,
      unit_price: barterPayUnitCount,
      tax_per_unit: taxPerUnit,
      barter_enabled: true,
      barter_pay_item_id: Number(payItemTemplate?.id) || barterPayItemId,
      barter_pay_item_name: String(payItemTemplate?.name || payItemSnapshot?.name || '未知物品'),
      barter_pay_unit_count: barterPayUnitCount,
      escrow_pay_item_total: escrowPayTotal,
      escrow_spirit_stones: escrowSpiritStones,
      anchor_price: Math.max(1, Math.floor(Number(barterTaxInfo?.target_anchor_price) || 1)),
      pay_anchor_price: Math.max(1, Math.floor(Number(barterTaxInfo?.pay_anchor_price) || 1)),
      tax_policy: getExchangeTaxPolicy(),
      player: buyer
    });
  }

  return json({
    ok: true,
    listing_id: listingId,
    item_id: itemId,
    item_name: itemName,
    quantity,
    unit_price: unitPrice,
    tax_per_unit: taxPerUnit,
    escrow_total: escrowTotal,
    anchor_price: Math.max(0, Number(buyTaxInfo.anchor_price) || 0),
    price_ratio: Number(buyTaxInfo.price_ratio || 1),
    tax_policy: getExchangeTaxPolicy(),
    player: buyer
  });
}

/* =============== POST /buy（购买） =============== */

async function handleBuy(db, accountId, body, headers, secret) {
  await db.settleExpiredExchangeListings();
  const listingId = parsePositiveInt(body?.listing_id);
  const quantity = parsePositiveInt(body?.quantity);
  if (listingId == null) return json({ ok: false, error: '缺少有效的 listing_id' });
  if (quantity == null) return json({ ok: false, error: '购买数量必须为正整数' });
  const tokenCheck = await consumeMarketToken(accountId, listingId, body, headers, secret);
  if (!tokenCheck.ok) return json(tokenCheck);

  const nowSec = Math.floor(Date.now() / 1000);
  const listing = await db.getExchangeListingById(listingId);
  if (!listing) return json({ ok: false, error: '挂单不存在' });
  if (String(listing.side || 'sell') !== 'sell') return json({ ok: false, error: '该单不是出售单' });
  if (!['open', 'partial'].includes(String(listing.status))) return json({ ok: false, error: '挂单不可购买' });
  if (Number(listing.expires_at) > 0 && Number(listing.expires_at) <= nowSec) {
    return json({ ok: false, error: '挂单已过期' });
  }
  if (Number(listing.quantity_left) < quantity) return json({ ok: false, error: '库存不足' });
  if (Number(listing.seller_account_id) === Number(accountId)) return json({ ok: false, error: '不能购买自己的挂单' });
  const listingSnapshot = parseItemSnapshotSafe(listing.item_snapshot_json);
  if (_isNoMarketItem(listingSnapshot) || _isNoMarketItem(Number(listing.item_id) || 0)) {
    return json({ ok: false, error: '该物品不可在坊市交易' });
  }

  const anchorInfo = await _getRobustPriceAnchor(db, Number(listing.item_id) || 0, nowSec);

  const buyer = await db.getPlayerByAccountId(accountId);
  if (!buyer) return json({ ok: false, error: '买家角色不存在' });

  const total = Number(listing.unit_price) * quantity;
  if (!Number.isFinite(total) || total <= 0) return json({ ok: false, error: '成交金额异常' });
  const buyerStone = Number(buyer.spirit_stones) || 0;
  if (buyerStone < total) return json({ ok: false, error: '灵石不足' });

  buyer.spirit_stones = buyerStone - total;
  {
    const persist = await savePlayerImmediateStrict(db, accountId, buyer, 'buy:deduct');
    if (!persist.ok) return json(persist);
  }

  const updated = await db.updateExchangeListingAfterTrade(listingId, quantity);
  if (!updated) {
    buyer.spirit_stones = buyerStone;
    try {
      await savePlayerImmediateStrict(db, accountId, buyer, 'buy:rollback');
    } catch (_e) {
      // 回滚失败：由对账兜底
    }
    return json({ ok: false, error: '库存不足或已被其他玩家购买' });
  }

  const fixedTaxPerUnit = Math.max(0, Math.floor(Number(listing.tax_per_unit) || 0));
  const tax = fixedTaxPerUnit * quantity;
  const sellerIncome = Math.max(0, total - tax);
  const quantityLeftAfterTrade = Math.max(0, Math.floor(Number(updated?.quantity_left) || 0));
  const saleProgressText = quantityLeftAfterTrade > 0
    ? `当前挂单剩余 ${quantityLeftAfterTrade} 件（未售部分会继续挂单，或到期后邮件退回）。`
    : '当前挂单已全部售出。';
  try {
    await db.createExchangeTrade({
      listing_id: listingId,
      seller_account_id: listing.seller_account_id,
      buyer_account_id: accountId,
      item_id: listing.item_id,
      item_name: listing.item_name,
      quantity,
      unit_price: listing.unit_price,
      total_price: total,
      tax_amount: tax,
      seller_income: sellerIncome,
      side: 'sell'
    });
  } catch (_e) {
    // 成交记录失败不阻断交易，由对账补齐
  }

  let item;
  try {
    item = JSON.parse(listing.item_snapshot_json || '{}');
  } catch (_) {
    item = {};
  }
  const buyerDelivery = await deliverMailboxOrDirect(db, accountId, {
    type: 'trade_buy',
    title: `交易所到货：${listing.item_name}`,
    content: `你购买了 ${listing.item_name} x${quantity}，总价 ${total} 灵石。`,
    attachments: [{ kind: 'item', item, count: quantity }]
  }, 'buy:buyer_delivery');
  const sellerDelivery = await deliverMailboxOrDirect(db, listing.seller_account_id, {
    type: 'trade_sale',
    title: `交易所售出：${listing.item_name}`,
    content: `你的挂单售出 ${quantity} 件，成交额 ${total}，手续费 ${tax}（单件税${fixedTaxPerUnit}，以上架时锁定税率结算），到账 ${sellerIncome} 灵石。${saleProgressText}`,
    attachments: [{ kind: 'currency', currency: 'spirit_stones', amount: sellerIncome }]
  }, 'buy:seller_delivery');
  const anchorPrice = Math.max(0, Number(anchorInfo?.anchor_price) || 0);
  const priceRatio = anchorPrice > 0
    ? (Math.max(1, Number(listing.unit_price) || 0) / anchorPrice)
    : 1;
  return json({
    ok: true,
    listing_id: listingId,
    quantity,
    total_price: total,
    tax_amount: tax,
    tax_per_unit: fixedTaxPerUnit,
    tax_locked: true,
    seller_income: sellerIncome,
    anchor_price: anchorPrice,
    anchor_confidence: _clamp(Number(anchorInfo?.anchor_confidence) || 0, 0, 1),
    price_ratio: priceRatio,
    delivery_warning: !(buyerDelivery.ok && sellerDelivery.ok)
  });
}

/* =============== POST /fulfill_buy（成交求购单） =============== */

const EQUIP_SLOT_TYPES = ['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back'];

function validateEquipmentAgainstCriteria(item, criteria) {
  if (!item || typeof item !== 'object' || !criteria || typeof criteria !== 'object') return false;
  const itemType = String(item.type || '');
  const slot = String(criteria.slot || '');
  if (slot === 'weapon') {
    if (itemType !== 'weapon') return false;
    const reqSubtype = String(criteria.subtype || '');
    if (reqSubtype && String(item.subtype || '') !== reqSubtype) return false;
  } else if (slot) {
    if (itemType !== slot) return false;
  }
  const reqMaterial = String(criteria.material || '');
  if (reqMaterial && String(item.material || '') !== reqMaterial) return false;
  const minQuality = Number(criteria.min_quality) || 0;
  if (minQuality > 0 && (Number(item.quality) || 0) < minQuality) return false;
  const reqAffixes = Array.isArray(criteria.affixes) ? criteria.affixes : [];
  if (reqAffixes.length > 0) {
    const itemExtraStats = item.randomExtraStats && typeof item.randomExtraStats === 'object' ? item.randomExtraStats : {};
    for (const af of reqAffixes) {
      if (!af) continue;
      if (!(String(af) in itemExtraStats)) return false;
    }
  }
  return true;
}

async function handleFulfillBuy(db, accountId, body, headers, secret) {
  await db.settleExpiredExchangeListings();
  const listingId = parsePositiveInt(body?.listing_id);
  const expectItemId = parsePositiveInt(body?.expect_item_id) || 0;
  if (listingId == null) return json({ ok: false, error: '缺少有效的 listing_id' });
  const tokenCheck = await consumeMarketToken(accountId, listingId, body, headers, secret);
  if (!tokenCheck.ok) return json(tokenCheck);

  const nowSec = Math.floor(Date.now() / 1000);
  const listing = await db.getExchangeListingById(listingId);
  if (!listing) return json({ ok: false, error: '求购单不存在' });
  if (String(listing.side || 'sell') !== 'buy') return json({ ok: false, error: '该单不是求购单' });
  if (!['open', 'partial'].includes(String(listing.status))) return json({ ok: false, error: '求购单不可成交' });
  if (Number(listing.expires_at) > 0 && Number(listing.expires_at) <= nowSec) {
    return json({ ok: false, error: '求购单已过期' });
  }
  if (Number(listing.quantity_left) < 1) return json({ ok: false, error: '求购剩余数量不足' });
  if (Number(listing.seller_account_id) === Number(accountId)) return json({ ok: false, error: '不能自己成交自己的求购单' });

  const seller = await db.getPlayerByAccountId(accountId);
  if (!seller) return json({ ok: false, error: '角色不存在' });

  let snapshot;
  try { snapshot = JSON.parse(listing.item_snapshot_json || '{}'); } catch (_) { snapshot = {}; }

  const criteria = snapshot?.equipment_criteria;
  const barter = snapshot?.barter && snapshot.barter.enabled ? snapshot.barter : null;
  const isBarterOrder = Boolean(barter);
  const isEquipOrder = criteria && typeof criteria === 'object' && (Number(listing.item_id) || 0) === 0;

  if (isEquipOrder) {
    const quantity = 1;
    const page = parseNonNegativeInt(body?.page, -1);
    const slotIndex = parseNonNegativeInt(body?.slot_index, -1);
    if (page < 0 || slotIndex < 0) return json({ ok: false, error: '请选择要交付的装备' });
    if (expectItemId > 0) {
      const slotItemId = Number(seller?.inventory?.[page]?.[slotIndex]?.item?.id) || 0;
      if (slotItemId !== expectItemId) {
        return json({ ok: false, error: '背包物品已变动，请刷新后重试', code: 'SLOT_MISMATCH' });
      }
    }
    const inv = seller?.inventory;
    const selectedSlot = Array.isArray(inv) && Array.isArray(inv[page]) ? inv[page][slotIndex] : null;
    if (!selectedSlot || !selectedSlot.item) {
      return json({ ok: false, error: '背包中无该装备' });
    }
    if (!validateEquipmentAgainstCriteria(selectedSlot.item, criteria)) {
      return json({ ok: false, error: '该装备不符合求购条件' });
    }
    const takeResult = consumeFromInventorySlot(seller, page, slotIndex, quantity);
    if (!takeResult.ok) return json({ ok: false, error: takeResult.error || '背包中无该装备' });
    const equip = takeResult.itemSnapshot;
    {
      const persist = await savePlayerImmediateStrict(db, accountId, seller, 'fulfill_buy:equip:deduct');
      if (!persist.ok) return json(persist);
    }
    const updated = await db.updateExchangeListingAfterTrade(listingId, quantity);
    if (!updated) {
      ops.putItemInInventory(seller.inventory, equip, 1);
      try {
        await savePlayerImmediateStrict(db, accountId, seller, 'fulfill_buy:equip:rollback');
      } catch (_e) {
        // 回滚失败：由对账兜底
      }
      return json({ ok: false, error: '求购单已被其他玩家成交' });
    }
    const total = Number(listing.unit_price) * quantity;
    const taxAmount = Number(listing.tax_per_unit || 0) * quantity;
    await db.createExchangeTrade({
      listing_id: listingId,
      seller_account_id: accountId,
      buyer_account_id: listing.seller_account_id,
      item_id: 0,
      item_name: String(equip.name || listing.item_name),
      quantity,
      unit_price: listing.unit_price,
      total_price: total,
      tax_amount: taxAmount,
      seller_income: total,
      side: 'buy'
    });
    const sellerDelivery = await deliverMailboxOrDirect(db, accountId, {
      type: 'trade_sale',
      title: `交易所求购成交：${equip.name || listing.item_name}`,
      content: `你交付了装备 ${equip.name || '未知装备'}，到账 ${total} 灵石。`,
      attachments: [{ kind: 'currency', currency: 'spirit_stones', amount: total }]
    }, 'fulfill_buy:equip:seller_delivery');
    const buyerDelivery = await deliverMailboxOrDirect(db, listing.seller_account_id, {
      type: 'trade_buy',
      title: `交易所求购到货：${listing.item_name}`,
      content: `你的装备求购单已成交，请在邮件领取装备。`,
      attachments: [{ kind: 'item', item: equip, count: 1 }]
    }, 'fulfill_buy:equip:buyer_delivery');
    return json({
      ok: true,
      listing_id: listingId,
      quantity,
      total_price: total,
      tax_amount: taxAmount,
      delivery_warning: !(sellerDelivery.ok && buyerDelivery.ok),
      player: seller
    });
  }

  const quantity = parsePositiveInt(body?.quantity);
  if (quantity == null) return json({ ok: false, error: '交付数量必须为正整数' });
  if (Number(listing.quantity_left) < quantity) return json({ ok: false, error: '求购剩余数量不足' });
  const listingItemId = Number(listing.item_id) || 0;
  if (listingItemId <= 0) return json({ ok: false, error: '求购单物品异常' });
  const payItemId = Number(barter?.pay_item_id) || 0;
  const payUnitCount = Math.max(1, Math.floor(Number(barter?.pay_unit_count) || Number(listing.unit_price) || 1));
  if (isBarterOrder && payItemId <= 0) {
    return json({ ok: false, error: '求购单支付物品异常' });
  }
  if (_isNoMarketItem(listingItemId)) {
    return json({ ok: false, error: '该物品不可在坊市交易' });
  }
  const have = countItemInInventoryById(seller, listingItemId, { onlyMarketTradable: true });
  if (have < quantity) {
    return json({ ok: false, error: `背包物品数量不足（需要${quantity}，当前${have}）` });
  }
  const takeResult = takeAndConsumeItemByIdFromInventory(seller, listingItemId, quantity, { onlyMarketTradable: true });
  if (!takeResult.ok) {
    return json({ ok: false, error: takeResult.error || '扣除背包物品失败' });
  }
  const deliveredItemSnapshot = takeResult.itemSnapshot;

  {
    const persist = await savePlayerImmediateStrict(db, accountId, seller, 'fulfill_buy:item:deduct');
    if (!persist.ok) return json(persist);
  }

  const updated = await db.updateExchangeListingAfterTrade(listingId, quantity);
  if (!updated) {
    ops.putItemInInventory(seller.inventory, deliveredItemSnapshot, quantity);
    try {
      await savePlayerImmediateStrict(db, accountId, seller, 'fulfill_buy:item:rollback');
    } catch (_e) {
      // 回滚失败：由对账兜底
    }
    return json({ ok: false, error: '求购单已被其他玩家成交' });
  }

  if (isBarterOrder) {
    const payItemTotal = payUnitCount * quantity;
    const payItemSnapshot = barter?.pay_item_snapshot && typeof barter.pay_item_snapshot === 'object'
      ? barter.pay_item_snapshot
      : (getItemById(payItemId) || { id: payItemId, name: String(barter?.pay_item_name || '未知物品') });
    const payItemName = String(barter?.pay_item_name || payItemSnapshot?.name || '未知物品');
    const supplementTax = Math.max(0, Math.floor(Number(listing.tax_per_unit || 0) * quantity));

    await db.createExchangeTrade({
      listing_id: listingId,
      seller_account_id: accountId,
      buyer_account_id: listing.seller_account_id,
      item_id: listing.item_id,
      item_name: listing.item_name,
      quantity,
      unit_price: payUnitCount,
      total_price: payItemTotal,
      tax_amount: supplementTax,
      seller_income: 0,
      side: 'buy'
    });

    const sellerDelivery = await deliverMailboxOrDirect(db, accountId, {
      type: 'trade_sale',
      title: `交易所求购成交：${listing.item_name}`,
      content: `你向求购单交付了 ${listing.item_name} x${quantity}，获得 ${payItemName} x${payItemTotal}。`,
      attachments: [{ kind: 'item', item: payItemSnapshot, count: payItemTotal }]
    }, 'fulfill_buy:barter:seller_delivery');
    const buyerDelivery = await deliverMailboxOrDirect(db, listing.seller_account_id, {
      type: 'trade_buy',
      title: `交易所求购到货：${listing.item_name}`,
      content: `你的以物易物求购单已成交 ${quantity} 件，系统已扣除差额税 ${supplementTax} 灵石。`,
      attachments: [{ kind: 'item', item: deliveredItemSnapshot, count: quantity }]
    }, 'fulfill_buy:barter:buyer_delivery');

    return json({
      ok: true,
      listing_id: listingId,
      quantity,
      barter_enabled: true,
      barter_pay_item_id: payItemId,
      barter_pay_item_name: payItemName,
      barter_pay_unit_count: payUnitCount,
      barter_pay_total: payItemTotal,
      tax_amount: supplementTax,
      delivery_warning: !(sellerDelivery.ok && buyerDelivery.ok),
      player: seller
    });
  }

  const total = Number(listing.unit_price) * quantity;
  const taxAmount = Number(listing.tax_per_unit || 0) * quantity;
  await db.createExchangeTrade({
    listing_id: listingId,
    seller_account_id: accountId,
    buyer_account_id: listing.seller_account_id,
    item_id: listing.item_id,
    item_name: listing.item_name,
    quantity,
    unit_price: listing.unit_price,
    total_price: total,
    tax_amount: taxAmount,
    seller_income: total,
    side: 'buy'
  });
  const sellerDelivery = await deliverMailboxOrDirect(db, accountId, {
    type: 'trade_sale',
    title: `交易所求购成交：${listing.item_name}`,
    content: `你向求购单交付了 ${listing.item_name} x${quantity}，到账 ${total} 灵石。`,
    attachments: [{ kind: 'currency', currency: 'spirit_stones', amount: total }]
  }, 'fulfill_buy:stone:seller_delivery');
  const buyerDelivery = await deliverMailboxOrDirect(db, listing.seller_account_id, {
    type: 'trade_buy',
    title: `交易所求购到货：${listing.item_name}`,
    content: `你的求购单已成交 ${quantity} 件，请在邮件领取物品。`,
    attachments: [{ kind: 'item', item: deliveredItemSnapshot, count: quantity }]
  }, 'fulfill_buy:stone:buyer_delivery');
  return json({
    ok: true,
    listing_id: listingId,
    quantity,
    total_price: total,
    tax_amount: taxAmount,
    delivery_warning: !(sellerDelivery.ok && buyerDelivery.ok),
    player: seller
  });
}

/* =============== POST /listings/:id/cancel（撤单） =============== */

async function handleCancelListing(db, accountId, listingId, body, headers, secret) {
  await db.settleExpiredExchangeListings();
  if (listingId == null || listingId <= 0) return json({ ok: false, error: '无效挂单ID' });
  const tokenCheck = await consumeMarketToken(accountId, listingId, body, headers, secret);
  if (!tokenCheck.ok) return json(tokenCheck);
  const listing = await db.getExchangeListingById(listingId);
  if (!listing) return json({ ok: false, error: '挂单不存在' });
  if (Number(listing.seller_account_id) !== Number(accountId)) return json({ ok: false, error: '只能撤销自己的挂单' });
  if (!['open', 'partial'].includes(String(listing.status))) return json({ ok: false, error: '当前状态不可撤销' });
  const left = Number(listing.quantity_left) || 0;
  await db.cancelExchangeListing(listingId);
  let deliveryWarning = false;
  if (left > 0) {
    const side = String(listing.side || 'sell');
    if (side === 'buy') {
      const snapshot = parseItemSnapshotSafe(listing.item_snapshot_json);
      const barter = snapshot?.barter && snapshot.barter.enabled ? snapshot.barter : null;
      if (barter) {
        const payItemId = Number(barter?.pay_item_id) || 0;
        const payItemCount = Math.max(0, (Math.floor(Number(barter?.pay_unit_count) || 0) * left));
        const payItemSnapshot = barter?.pay_item_snapshot && typeof barter.pay_item_snapshot === 'object'
          ? barter.pay_item_snapshot
          : (getItemById(payItemId) || { id: payItemId, name: String(barter?.pay_item_name || '未知物品') });
        const supplementTaxRefund = Math.max(0, (Number(listing.tax_per_unit || 0) * left));
        const attachments = [];
        if (payItemId > 0 && payItemCount > 0) attachments.push({ kind: 'item', item: payItemSnapshot, count: payItemCount });
        if (supplementTaxRefund > 0) attachments.push({ kind: 'currency', currency: 'spirit_stones', amount: supplementTaxRefund });
        const refundDelivery = await deliverMailboxOrDirect(db, accountId, {
          type: 'trade_refund',
          title: `交易所撤销求购退回：${listing.item_name}`,
          content: `你撤销了以物易物求购单，系统退回支付物品 x${payItemCount} 与差额税 ${supplementTaxRefund} 灵石。`,
          attachments
        }, 'cancel:buy:barter_refund');
        if (!refundDelivery.ok) deliveryWarning = true;
      } else {
        const refund = (Number(listing.unit_price) + Number(listing.tax_per_unit || 0)) * left;
        const refundDelivery = await deliverMailboxOrDirect(db, accountId, {
          type: 'trade_refund',
          title: `交易所撤销求购退回：${listing.item_name}`,
          content: `你撤销了求购单，系统退回预存灵石 ${refund}。`,
          attachments: [{ kind: 'currency', currency: 'spirit_stones', amount: refund }]
        }, 'cancel:buy:stone_refund');
        if (!refundDelivery.ok) deliveryWarning = true;
      }
    } else {
      let item;
      try {
        item = JSON.parse(listing.item_snapshot_json || '{}');
      } catch (_) {
        item = {};
      }
      const refundDelivery = await deliverMailboxOrDirect(db, accountId, {
        type: 'trade_refund',
        title: `交易所撤单退回：${listing.item_name}`,
        content: `你撤销了挂单，系统退回 ${listing.item_name} x${left}。`,
        attachments: [{ kind: 'item', item, count: left }]
      }, 'cancel:sell:item_refund');
      if (!refundDelivery.ok) deliveryWarning = true;
    }
  }
  return json({ ok: true, listing_id: listingId, refunded_quantity: left, delivery_warning: deliveryWarning });
}

/* =============== 测试钩子 =============== */

export function __exchangeTestReset() {
  _rateLimitState.clear();
  _quoteIpRateState.clear();
  _recentMarketTokens.clear();
  _quoteResultCache.clear();
  _priceAnchorCache.clear();
}