/**
 * 宗门宝库 API（Worker 版）
 * 迁移自 server/routes/online/sectTreasuryRoutes.js（mountSectTreasuryRoutes）
 * 说明：原 route 依赖 settlementLock（进程内写锁），本版本省略（D1 单请求串行）；
 *       门派基础武器/防具、宝库刷新秒数等常量对齐 server/routes/online.js。
 */
import { verifyToken } from '../../auth.js';
import { createDb } from '../../db.js';
import { getItems, getItemById, getTechniques } from '../../game/dataLoader.js';
import { generateWeapon, generateArmor, getPlayerAffixQualityCap } from '../../game/equipmentGen.js';
import {
  intVal, clampi, nowSec, calculateItemValue, hasEmptyInventorySlot,
  inventoryHasItem, deepClone
} from '../../game/onlineUtils.js';
import * as ops from '../../game/playerOps.js';

const SECT_TREASURY_MANUAL_REFRESH_DAILY_LIMIT = 15;
const SECT_TREASURY_MANUAL_REFRESH_BASE_COST = 100;
const SECT_BASIC_ARMOR_COST = 400;
const VALID_ARMOR_TYPES = ['head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back'];
const SECT_TREASURY_REFRESH_SECONDS = 40 * 60;
const SECT_TREASURY_GOODS_COUNT = 20;
const SECT_BASIC_WEAPON_BY_SECT = {
  1: 11, // 太虚剑派 -> 铁剑（剑修）
  2: 12, // 青云丹宗 -> 精钢刀（丹火系）
  3: 16, // 天音阁 -> 玉笛（音律）
  4: 13, // 血煞魔宗 -> 长枪（血祭）
  5: 14, // 万蛊门 -> 铁爪（拳爪/蛊术）
  6: 181, // 尸傀宗 -> 竹杖（长兵/傀儡）
  7: 12, // 黑天魔教 -> 精钢刀（暗杀）
  8: 12, // 焚天魔宫 -> 精钢刀（火系）
  9: 181, // 四海散修盟 -> 竹杖（杂学）
  10: 14 // 万界商会 -> 铁爪（机关）
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// 宗门主属性（决定宝库材料元素）
function getSectMainElement(sectId) {
  const s = intVal(sectId, 0);
  if (s === 1) return '金';   // 太虚剑派（剑修）
  if (s === 2) return '火';   // 青云丹宗（丹道）
  if (s === 3) return '无';   // 天音阁（音修）
  if (s === 4) return '水';   // 血煞魔宗（血祭）
  if (s === 5) return '木';   // 万蛊门（炼蛊）
  if (s === 6) return '无';   // 尸傀宗（炼尸）
  if (s === 7) return '暗';   // 黑天魔教（暗杀）
  if (s === 8) return '火';   // 焚天魔宫（火系）
  if (s === 9) return '无';   // 四海散修盟（散修）
  if (s === 10) return '土';  // 万界商会（商业）
  return '';
}

// 宗门专属物品（兑换价 5 倍价值）
function getSectTreasurySpecialIds(sectId) {
  const s = intVal(sectId, 0);
  if (s === 1) return [129]; // 太虚剑派 -> 脱凡丹
  if (s === 2) return [130]; // 青云丹宗 -> 圣战丹
  if (s === 3) return [128]; // 天音阁 -> 雅韵丹
  if (s === 4) return [131]; // 血煞魔宗 -> 坤元丹
  if (s === 5) return [132]; // 万蛊门 -> 神木丸
  if (s === 6) return [129]; // 尸傀宗 -> 脱凡丹
  if (s === 7) return [128]; // 黑天魔教 -> 雅韵丹
  if (s === 8) return [130]; // 焚天魔宫 -> 圣战丹
  if (s === 9) return [131]; // 四海散修盟 -> 坤元丹
  if (s === 10) return [132]; // 万界商会 -> 神木丸
  return [];
}

// 宗门宝库可兑换的本宗元素材料（1-4 阶，禁市除外）
function getSectTreasuryMaterialIds(sectId) {
  const mainEl = getSectMainElement(sectId);
  if (!mainEl) return [];
  const allow = mainEl === '混元' ? ['无', '混元'] : [mainEl];
  const out = [];
  for (const item of getItems() || []) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (tags.includes('no_market')) continue;
    const t = String(item.type || '');
    if (!['herb', 'material', 'medicine'].includes(t)) continue;
    const q = intVal(item.quality, 1);
    if (q < 1 || q > 4) continue;
    if (!allow.includes(String(item.element || ''))) continue;
    const idv = intVal(item.id, 0);
    if (idv > 0) out.push(idv);
  }
  return out;
}

function getSectTreasuryItemIds(sectId) {
  return [
    ...getSectTreasurySpecialIds(sectId),
    ...getSectTreasuryMaterialIds(sectId)
  ];
}

// 单件兑换价：专属 5 倍价值，其余 10 倍价值
function getSectTreasuryItemCost(itemId, sectId) {
  const item = getItemById(itemId);
  if (!item || Object.keys(item).length <= 0) return 0;
  const value = calculateItemValue(item);
  if (getSectTreasurySpecialIds(sectId).includes(intVal(itemId))) return value * 5;
  return value * 10;
}

// 保证玩家 sect_treasury 状态结构完整（跨天重置手动刷新次数）
function ensureSectTreasuryState(player, db) {
  player.sect_treasury = player.sect_treasury && typeof player.sect_treasury === 'object' ? player.sect_treasury : {};
  player.sect_treasury.goods = Array.isArray(player.sect_treasury.goods) ? player.sect_treasury.goods : [];
  player.sect_treasury.refresh_at = intVal(player.sect_treasury.refresh_at, 0);
  player.sect_treasury.sect_id = intVal(player.sect_treasury.sect_id, 0);
  player.sect_treasury.free_basic_weapon_bought_once = Boolean(player.sect_treasury.free_basic_weapon_bought_once);
  const today = db.getDateKey();
  if (String(player.sect_treasury.manual_refresh_date || '') !== today) {
    player.sect_treasury.manual_refresh_date = today;
    player.sect_treasury.manual_refresh_count = 0;
  }
  player.sect_treasury.manual_refresh_count = intVal(player.sect_treasury.manual_refresh_count, 0);
}

// 全局 1-4 阶草药/材料/丹药（用于每日刷新商品池）
function getTreasuryMaterialIdsGlobal() {
  const out = [];
  for (const item of getItems() || []) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (tags.includes('no_market')) continue;
    const t = String(item.type || '');
    if (!['herb', 'material', 'medicine'].includes(t)) continue;
    const q = intVal(item.quality, 1);
    if (q < 1 || q > 4) continue;
    const idv = intVal(item.id, 0);
    if (idv > 0) out.push(idv);
  }
  return out;
}

// 重建宝库商品（20 格随机材料，单价 10 倍价值）
function rebuildSectTreasuryGoods(player, sectId, db) {
  ensureSectTreasuryState(player, db);
  const sid = intVal(sectId, 0);
  const ids = getTreasuryMaterialIdsGlobal();
  const goods = [];
  if (ids.length > 0) {
    for (let i = 0; i < SECT_TREASURY_GOODS_COUNT; i += 1) {
      const itemId = ids[Math.floor(Math.random() * ids.length)];
      const item = getItemById(itemId);
      if (!item || Object.keys(item).length <= 0) continue;
      const costEach = Math.max(1, calculateItemValue(item) * 10);
      goods.push({
        idx: goods.length,
        item_id: intVal(item.id, 0),
        item_name: String(item.name || '材料'),
        quality: intVal(item.quality, 1),
        cost_each: costEach,
        count: 1
      });
    }
  }
  player.sect_treasury.goods = goods;
  player.sect_treasury.sect_id = sid;
  player.sect_treasury.refresh_at = nowSec() + SECT_TREASURY_REFRESH_SECONDS;
}

// 确保宝库数据是最新的（到期/换宗/长度不符时重建）
function ensureSectTreasuryUpToDate(player, sectId, force, db) {
  ensureSectTreasuryState(player, db);
  const sid = intVal(sectId, 0);
  const now = nowSec();
  const needRefresh = force
    || sid <= 0
    || intVal(player.sect_treasury.sect_id, 0) !== sid
    || intVal(player.sect_treasury.refresh_at, 0) <= now
    || !Array.isArray(player.sect_treasury.goods)
    || player.sect_treasury.goods.length !== SECT_TREASURY_GOODS_COUNT;
  if (needRefresh) rebuildSectTreasuryGoods(player, sid, db);
}

// 宗门基础武器 id
function getSectTreasuryBasicWeaponItemId(sectId) {
  return intVal(SECT_BASIC_WEAPON_BY_SECT[intVal(sectId, 0)], 0);
}

// 城中百宝阁商品池（全部 1-4 阶草药/材料/丹药）
function getCityTreasurePavilionItemIds() {
  const out = [];
  for (const item of getItems() || []) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (tags.includes('no_market')) continue;
    const t = String(item.type || '');
    if (!['herb', 'material', 'medicine'].includes(t)) continue;
    const q = intVal(item.quality, 1);
    if (q < 1 || q > 4) continue;
    const idv = intVal(item.id, 0);
    if (idv > 0) out.push(idv);
  }
  return out;
}

// 百宝阁单价：30 倍价值
function getCityTreasurePavilionPrice(itemId) {
  const item = getItemById(itemId);
  if (!item || Object.keys(item).length <= 0) return 0;
  return calculateItemValue(item) * 30;
}

export async function handleSectTreasuryRoute(request, env, route) {
  const method = request.method;
  const url = new URL(request.url);
  const subPath = route.replace(/^\/sect/, '') || '/';

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = intVal(auth.accountId || auth.sub || 0, 0);

  const db = createDb(env);

  if (subPath === '/exchange_equipment' && method === 'POST') return handleExchangeEquipment(db, accountId, request);
  if (subPath === '/exchange_treasury' && method === 'POST') return handleExchangeTreasury(db, accountId, request);
  if (subPath === '/treasury/refresh' && method === 'POST') return handleTreasuryRefresh(db, accountId);
  if (subPath === '/treasury/list' && method === 'GET') return handleTreasuryList(db, accountId);
  if (subPath === '/treasury/buy' && method === 'POST') return handleTreasuryBuy(db, accountId, request);
  if (subPath === '/treasury/buy_basic_weapon' && method === 'POST') return handleBuyBasicWeapon(db, accountId);
  if (subPath === '/treasury/buy_basic_armor' && method === 'POST') return handleBuyBasicArmor(db, accountId, request);

  // 城中百宝阁（挂在宗门宝库路由文件内，蓝本同源）
  if (route === '/city/buy' && method === 'POST') return handleCityBuy(db, accountId, request);

  return null;
}

// 兑换兵器库装备（需本宗基础功法达到 3 重）
async function handleExchangeEquipment(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const body = await request.json().catch(() => ({}));
  const equipType = String(body?.equip_type || '');
  const subtype = String(body?.subtype || '');
  const quality = clampi(intVal(body?.quality, 1), 1, 8);
  const sid = intVal(player.sect_id, 0);
  if (sid <= 0) return json({ ok: false, error: '未加入宗门' });
  let hasBasicGe3 = false;
  const techniques = getTechniques() || [];
  const levels = player.technique_levels && typeof player.technique_levels === 'object' ? player.technique_levels : {};
  for (const t of techniques) {
    if (intVal(t.sectId, 0) !== sid || String(t.sectTier || '') !== 'basic') continue;
    const tid = intVal(t.id, 0);
    const lvData = levels[tid] || levels[String(tid)] || null;
    if (lvData && intVal(lvData.level, 0) >= 3) {
      hasBasicGe3 = true;
      break;
    }
  }
  if (!hasBasicGe3) return json({ ok: false, error: '至少一门宗门基础功法达到3级方可兑换兵器库装备' });
  let equipment = {};
  const affixCap = getPlayerAffixQualityCap(intVal(player.level, 1));
  if (equipType === 'weapon') equipment = generateWeapon(subtype, quality, affixCap);
  else if (equipType === 'armor') equipment = generateArmor(subtype, quality, affixCap);
  else return json({ ok: false, error: '无效的装备类型' });
  if (!equipment || Object.keys(equipment).length <= 0) return json({ ok: false, error: '生成装备失败' });
  const actualValue = calculateItemValue(equipment);
  const actualCost = actualValue * (equipType === 'weapon' ? 5 : 3);
  if (intVal(player.sect_contribution, 0) < actualCost) return json({ ok: false, error: `贡献点不足（需要${actualCost}点）` });
  if (!hasEmptyInventorySlot(player)) return json({ ok: false, error: '背包已满，无法兑换装备，请先整理背包' });
  player.sect_contribution = intVal(player.sect_contribution, 0) - actualCost;
  const added = ops.putItemInInventory(player.inventory, equipment, 1);
  if (!added) {
    player.sect_contribution += actualCost;
    return json({ ok: false, error: '背包已满，已退回贡献点' });
  }
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, equipment, cost: actualCost });
}

// 兑换宗门宝库指定物品（按 count 逐件购买）
async function handleExchangeTreasury(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const body = await request.json().catch(() => ({}));
  const itemId = intVal(body?.item_id, 0);
  const count = Math.max(1, intVal(body?.count, 1));
  const sid = intVal(player.sect_id, 0);
  if (sid <= 0) return json({ ok: false, error: '未加入宗门' });
  const allowed = getSectTreasuryItemIds(sid);
  if (!allowed.includes(itemId)) return json({ ok: false, error: '本宗门宝库无此物品' });
  const item = getItemById(itemId);
  if (!item || Object.keys(item).length <= 0) return json({ ok: false, error: '物品不存在' });
  const costEach = getSectTreasuryItemCost(itemId, sid);
  let exchanged = 0;
  for (let i = 0; i < count; i += 1) {
    if (intVal(player.sect_contribution, 0) < costEach) break;
    if (!hasEmptyInventorySlot(player) && !inventoryHasItem(player, itemId)) break;
    player.sect_contribution = intVal(player.sect_contribution, 0) - costEach;
    const added = ops.putItemInInventory(player.inventory, deepClone(item), 1);
    if (added) exchanged += 1;
    else {
      player.sect_contribution += costEach;
      break;
    }
  }
  if (exchanged <= 0) return json({ ok: false, error: `贡献点不足或背包已满（单价${costEach}）` });
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, exchanged, total_cost: exchanged * costEach });
}

// 手动刷新宗门宝库：每日上限 15 次，第 n 次消耗 100*n 灵石
async function handleTreasuryRefresh(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const sid = intVal(player.sect_id, 0);
  if (sid <= 0) return json({ ok: false, error: '未加入宗门' });
  ensureSectTreasuryState(player, db);
  const count = intVal(player.sect_treasury.manual_refresh_count, 0);
  if (count >= SECT_TREASURY_MANUAL_REFRESH_DAILY_LIMIT) {
    return json({ ok: false, error: `今日手动刷新已达上限（${SECT_TREASURY_MANUAL_REFRESH_DAILY_LIMIT}次）` });
  }
  const cost = SECT_TREASURY_MANUAL_REFRESH_BASE_COST * (count + 1);
  const stones = intVal(player.spirit_stones, 0);
  if (stones < cost) return json({ ok: false, error: `灵石不足（需要${cost}）` });
  player.spirit_stones = stones - cost;
  rebuildSectTreasuryGoods(player, sid, db);
  player.sect_treasury.manual_refresh_count = count + 1;
  await db.savePlayer(accountId, 1, player);
  return json({
    ok: true,
    goods: player.sect_treasury.goods,
    refresh_at: intVal(player.sect_treasury.refresh_at, 0),
    manual_refresh_count: player.sect_treasury.manual_refresh_count,
    manual_refresh_daily_limit: SECT_TREASURY_MANUAL_REFRESH_DAILY_LIMIT,
    next_cost: SECT_TREASURY_MANUAL_REFRESH_BASE_COST * (count + 2),
    cost,
    player
  });
}

// 宝库列表（含基础武器/防具与手动刷新信息）
async function handleTreasuryList(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const sid = intVal(player.sect_id, 0);
  if (sid <= 0) return json({ ok: false, error: '未加入宗门' });
  const beforeGoods = JSON.stringify(player.sect_treasury?.goods || []);
  ensureSectTreasuryUpToDate(player, sid, false, db);
  const afterGoods = JSON.stringify(player.sect_treasury?.goods || []);
  const basicWeaponId = getSectTreasuryBasicWeaponItemId(sid);
  const basicWeapon = getItemById(basicWeaponId);
  const bought = Boolean(player.sect_treasury?.free_basic_weapon_bought_once);
  if (beforeGoods !== afterGoods) {
    await db.savePlayer(accountId, 1, player);
  }
  const ARMOR_SLOTS = [
    { type: 'head', name: '头盔' },
    { type: 'shoulder', name: '护肩' },
    { type: 'chest', name: '胸甲' },
    { type: 'legs', name: '腿甲' },
    { type: 'hands', name: '护手' },
    { type: 'ring', name: '戒指' },
    { type: 'amulet', name: '项链' },
    { type: 'back', name: '披风' }
  ];
  return json({
    ok: true,
    refresh_at: intVal(player.sect_treasury?.refresh_at, 0),
    goods: player.sect_treasury?.goods || [],
    manual_refresh_count: intVal(player.sect_treasury?.manual_refresh_count, 0),
    manual_refresh_daily_limit: SECT_TREASURY_MANUAL_REFRESH_DAILY_LIMIT,
    manual_refresh_next_cost: SECT_TREASURY_MANUAL_REFRESH_BASE_COST * (intVal(player.sect_treasury?.manual_refresh_count, 0) + 1),
    basic_weapon: {
      item_id: basicWeaponId,
      item_name: String(basicWeapon?.name || '基础武器'),
      bought,
      price: 0
    },
    basic_armor: { slots: ARMOR_SLOTS, cost: 400 },
    player
  });
}

// 购买宝库商品（按 index 定位，可一次多件）
async function handleTreasuryBuy(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const sid = intVal(player.sect_id, 0);
  if (sid <= 0) return json({ ok: false, error: '未加入宗门' });
  ensureSectTreasuryUpToDate(player, sid, false, db);
  const body = await request.json().catch(() => ({}));
  const idx = intVal(body?.index, -1);
  const count = Math.max(1, intVal(body?.count, 1));
  const goods = Array.isArray(player.sect_treasury?.goods) ? player.sect_treasury.goods : [];
  if (idx < 0 || idx >= goods.length) return json({ ok: false, error: '商品索引无效' });
  const g = goods[idx] || {};
  const stock = intVal(g.count, 0);
  if (stock <= 0) return json({ ok: false, error: '该商品已售罄' });
  const buyCount = Math.min(stock, count);
  const itemId = intVal(g.item_id, 0);
  const item = getItemById(itemId);
  if (!item || Object.keys(item).length <= 0) return json({ ok: false, error: '商品不存在' });
  const costEach = Math.max(1, intVal(g.cost_each, calculateItemValue(item) * 10));
  const totalCost = costEach * buyCount;
  if (intVal(player.sect_contribution, 0) < totalCost) return json({ ok: false, error: `贡献不足（需要${totalCost}）` });
  if (!hasEmptyInventorySlot(player) && !inventoryHasItem(player, itemId)) return json({ ok: false, error: '背包已满' });
  player.sect_contribution = intVal(player.sect_contribution, 0) - totalCost;
  const added = ops.putItemInInventory(player.inventory, deepClone(item), buyCount);
  if (!added) {
    player.sect_contribution += totalCost;
    return json({ ok: false, error: '背包已满，购买失败' });
  }
  g.count = stock - buyCount;
  goods[idx] = g;
  player.sect_treasury.goods = goods;
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, bought_count: buyCount, total_cost: totalCost, item_name: String(item.name || '材料') });
}

// 领取宗门基础武器（账号仅一次）
async function handleBuyBasicWeapon(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const sid = intVal(player.sect_id, 0);
  if (sid <= 0) return json({ ok: false, error: '未加入宗门' });
  ensureSectTreasuryState(player, db);
  if (Boolean(player.sect_treasury.free_basic_weapon_bought_once)) return json({ ok: false, error: '账号已领取过基础武器' });
  const itemId = getSectTreasuryBasicWeaponItemId(sid);
  const item = getItemById(itemId);
  if (!item || Object.keys(item).length <= 0) return json({ ok: false, error: '基础武器未配置' });
  if (!hasEmptyInventorySlot(player) && !inventoryHasItem(player, itemId)) return json({ ok: false, error: '背包已满' });
  const added = ops.putItemInInventory(player.inventory, deepClone(item), 1);
  if (!added) return json({ ok: false, error: '背包已满' });
  player.sect_treasury.free_basic_weapon_bought_once = true;
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, item_name: String(item.name || '基础武器') });
}

// 购买基础防具（400 贡献，无词缀）
async function handleBuyBasicArmor(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const sid = intVal(player.sect_id, 0);
  if (sid <= 0) return json({ ok: false, error: '未加入宗门' });
  ensureSectTreasuryState(player, db);
  const body = await request.json().catch(() => ({}));
  const armorType = String(body?.armor_type || '').toLowerCase();
  if (!VALID_ARMOR_TYPES.includes(armorType)) return json({ ok: false, error: '无效的防具部位' });
  const cost = SECT_BASIC_ARMOR_COST;
  if (intVal(player.sect_contribution, 0) < cost) return json({ ok: false, error: `贡献不足（需要${cost}）` });
  if (!hasEmptyInventorySlot(player)) return json({ ok: false, error: '背包已满' });
  const equipment = generateArmor(armorType, 1, 8, true);
  if (!equipment || Object.keys(equipment).length <= 0) return json({ ok: false, error: '生成装备失败' });
  const added = ops.putItemInInventory(player.inventory, equipment, 1);
  if (!added) return json({ ok: false, error: '背包已满' });
  player.sect_contribution = intVal(player.sect_contribution, 0) - cost;
  await db.savePlayer(accountId, 1, player);
  const slotNames = { head: '头盔', shoulder: '护肩', chest: '胸甲', legs: '腿甲', hands: '护手', ring: '戒指', amulet: '项链', back: '披风' };
  return json({ ok: true, player, item_name: String(equipment.name || slotNames[armorType] || '防具'), total_cost: cost });
}

// 城中百宝阁购买（灵石支付，30 倍价值）
async function handleCityBuy(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const body = await request.json().catch(() => ({}));
  const itemId = intVal(body?.item_id, 0);
  const count = Math.max(1, intVal(body?.count, 1));
  const allowed = getCityTreasurePavilionItemIds();
  if (!allowed.includes(itemId)) return json({ ok: false, error: '百宝阁无此物品' });
  const item = getItemById(itemId);
  if (!item || Object.keys(item).length <= 0) return json({ ok: false, error: '物品不存在' });
  const priceEach = getCityTreasurePavilionPrice(itemId);
  const total = priceEach * count;
  if (intVal(player.spirit_stones, 0) < total) return json({ ok: false, error: `灵石不足（需要${total}）` });
  if (!hasEmptyInventorySlot(player) && !inventoryHasItem(player, itemId)) return json({ ok: false, error: '背包已满，无法购买' });
  player.spirit_stones = intVal(player.spirit_stones, 0) - total;
  const added = ops.putItemInInventory(player.inventory, deepClone(item), count);
  if (!added) {
    player.spirit_stones += total;
    return json({ ok: false, error: '背包已满，已退回灵石' });
  }
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, total_cost: total });
}
