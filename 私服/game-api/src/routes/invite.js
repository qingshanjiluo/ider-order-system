/**
 * 邀请系统 API（Worker 版）
 * 迁移自 server/routes/invite.js，省略 settlementLock，改为 D1 原子扣减。
 */
import { getItemById } from '../game/dataLoader.js';
import * as ops from '../game/playerOps.js';
import { hasEmptyInventorySlot, inventoryHasItem, deepClone, intVal } from '../game/onlineUtils.js';
import { verifyToken } from '../auth.js';
import { createDb } from '../db.js';

const REGISTER_HOURS_LIMIT = 12;   // 注册时间≤12小时可绑定
const INVITEE_DAYS_REQUIRED = 3;   // 被邀请人注册满3天
const INVITEE_LEVEL_REQUIRED = 100; // 被邀请人等级>100
const POINTS_PER_INVITEE = 10;

// 邀请商店：item_id -> cost
const INVITE_SHOP = {
  128: 10,   // 雅韵丹
  129: 10,   // 脱凡丹
  130: 10,   // 圣战丹
  131: 10,   // 坤元丹
  132: 10,   // 神木丸
  179: 20,   // 改名卡
  101: 100,  // 万象森罗生灭法
  120: 100,  // 最终一战
  160: 100,  // 万物之形
  168: 100,  // 作者信物
  170: 20    // 作者小信物
};
const INVITE_SHOP_MARKET_LOCK_ITEM_IDS = new Set([128, 129, 130, 131, 132]);

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handleInviteRoute(request, env, route) {
  if (!route.startsWith('/invite')) return null;

  // 除公开端点外均需登录
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth || !auth.accountId) return json({ ok: false, error: '未登录' }, 401);
  const accountId = Number(auth.accountId);
  const db = createDb(env);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  // GET /invite/info
  if (route === '/invite/info' && request.method === 'GET') {
    const inviter = await db.getOrCreateInviter(accountId);
    const binding = await db.getInviteBinding(accountId);
    let inviterName = null;
    if (binding) {
      const acc = await db.getAccountById(binding.inviter_account_id);
      inviterName = acc ? acc.username : null;
    }
    const storage = await db.getInviterStorage(accountId);
    return json({
      ok: true,
      invite_code: inviter?.invite_code || '',
      inviter_name: inviterName,
      stored_stones: Number(storage.stored_stones || 0),
      per_person_stones: Number(storage.per_person_stones || 0),
      invite_points: Number(storage.invite_points || 0)
    });
  }

  // POST /invite/generate - 生成/刷新邀请码（幂等，返回当前码）
  if (route === '/invite/generate' && request.method === 'POST') {
    const inviter = await db.getOrCreateInviter(accountId);
    return json({ ok: true, invite_code: inviter?.invite_code || '' });
  }

  // POST /invite/bind - 绑定邀请码（被邀请人调用）
  if (route === '/invite/bind' && request.method === 'POST') {
    const code = String(body?.invite_code || '').trim().toUpperCase();
    if (!code) return json({ ok: false, error: '请输入邀请码' });

    const inviteeId = accountId;
    const inviterRow = await db.getInviterByCode(code);
    if (!inviterRow) return json({ ok: false, error: '邀请码无效' });
    const inviterId = Number(inviterRow.account_id);
    if (inviterId === inviteeId) return json({ ok: false, error: '不能绑定自己的邀请码' });

    const acc = await db.getAccountById(inviteeId);
    if (!acc) return json({ ok: false, error: '账号不存在' });
    const createdAt = intVal(acc.created_at, 0);
    if (createdAt < 1000000000) {
      return json({ ok: false, error: '账号注册时间异常，请联系客服' });
    }
    const hoursSinceReg = (nowSec() - createdAt) / 3600;
    if (hoursSinceReg > REGISTER_HOURS_LIMIT) {
      return json({ ok: false, error: '注册时间超过12小时，无法绑定邀请码' });
    }
    if (await db.getInviteBinding(inviteeId)) return json({ ok: false, error: '你已绑定过邀请人' });

    const inviteePlayer = await db.getPlayerByAccountId(inviteeId);
    if (!inviteePlayer) return json({ ok: false, error: '请先创建角色后再绑定邀请码' });

    const storage = await db.getInviterStorage(inviterId);
    const perPerson = intVal(storage.per_person_stones, 0);
    const stored = intVal(storage.stored_stones, 0);
    if (perPerson > 0 && stored < perPerson) {
      return json({ ok: false, error: '只恨邀请人财力不足' });
    }

    if (perPerson > 0 && !(await db.deductInviterStones(inviterId, perPerson))) {
      return json({ ok: false, error: '只恨邀请人财力不足' });
    }

    await db.createInviteBinding(inviteeId, inviterId, perPerson);
    if (perPerson > 0) {
      inviteePlayer.spirit_stones = intVal(inviteePlayer.spirit_stones, 0) + perPerson;
      await db.savePlayer(inviteeId, 1, inviteePlayer);
    }

    const inviterAcc = await db.getAccountById(inviterId);
    return json({
      ok: true,
      inviter_name: inviterAcc ? inviterAcc.username : '',
      stones_granted: perPerson,
      player: perPerson > 0 ? await db.getPlayerByAccountId(inviteeId) : null
    });
  }

  // POST /invite/storage - 邀请人设置存储灵石与每人数量
  if (route === '/invite/storage' && request.method === 'POST') {
    let stored = Math.max(0, intVal(body?.stored_stones, 0));
    const perPerson = Math.max(0, intVal(body?.per_person_stones, 0));

    const player = await db.getPlayerByAccountId(accountId);
    if (!player) return json({ ok: false, error: '无角色' });
    const current = intVal(player.spirit_stones, 0);
    const storage = await db.getInviterStorage(accountId);
    const currentStored = intVal(storage.stored_stones, 0);
    const diff = stored - currentStored;
    if (diff > current) return json({ ok: false, error: '灵石不足' });
    if (diff > 0) {
      player.spirit_stones = current - diff;
      await db.savePlayer(accountId, 1, player);
      await db.updateInviterStorage(accountId, stored, perPerson);
    } else if (diff < 0) {
      const toReturn = Math.min(-diff, currentStored);
      if (toReturn > 0) {
        player.spirit_stones = current + toReturn;
        await db.savePlayer(accountId, 1, player);
      }
      stored = currentStored - toReturn;
      await db.updateInviterStorage(accountId, stored, perPerson);
    } else {
      await db.updateInviterStorage(accountId, stored, perPerson);
    }
    return json({
      ok: true,
      stored_stones: stored,
      per_person_stones: perPerson,
      player: await db.getPlayerByAccountId(accountId)
    });
  }

  // GET /invite/invitees - 邀请人查看被邀请人列表
  if (route === '/invite/invitees' && request.method === 'GET') {
    const list = await db.listInvitees(accountId);
    const threeDaysSec = INVITEE_DAYS_REQUIRED * 24 * 3600;
    const rows = [];
    for (const r of list) {
      const acc = await db.getAccountById(r.invitee_account_id);
      const regAt = intVal(acc?.created_at ?? r.created_at ?? 0, 0);
      const p = await db.getPlayerByAccountId(r.invitee_account_id);
      const level = intVal(p?.level, 1);
      const daysSinceReg = (nowSec() - regAt) / 86400;
      const canClaim = daysSinceReg >= INVITEE_DAYS_REQUIRED && level > INVITEE_LEVEL_REQUIRED;
      const claimed = await db.hasClaimedInvitePoints(accountId, r.invitee_account_id);
      const sg = r.stones_granted;
      rows.push({
        invitee_account_id: Number(r.invitee_account_id),
        username: r.username,
        bound_at: r.bound_at,
        level,
        days_since_reg: Math.floor(daysSinceReg),
        can_claim: canClaim && !claimed,
        claimed,
        stones_granted: sg,
        can_reissue: sg === null
      });
    }
    return json({ ok: true, invitees: rows });
  }

  // POST /invite/claim_points - 邀请人领取某个被邀请人的积分
  if (route === '/invite/claim_points' && request.method === 'POST') {
    const inviteeId = intVal(body?.invitee_account_id, 0);
    if (inviteeId <= 0) return json({ ok: false, error: '参数无效' });

    const list = await db.listInvitees(accountId);
    const row = list.find((r) => Number(r.invitee_account_id) === inviteeId);
    if (!row) return json({ ok: false, error: '该玩家不是你的被邀请人' });
    if (await db.hasClaimedInvitePoints(accountId, inviteeId)) {
      return json({ ok: false, error: '已领取过该被邀请人的积分' });
    }
    const acc = await db.getAccountById(inviteeId);
    const regAt = intVal(acc?.created_at ?? 0, 0);
    const p = await db.getPlayerByAccountId(inviteeId);
    const level = intVal(p?.level, 1);
    const daysSinceReg = (nowSec() - regAt) / 86400;
    if (daysSinceReg < INVITEE_DAYS_REQUIRED) {
      return json({ ok: false, error: '被邀请人注册未满3天' });
    }
    if (level <= INVITEE_LEVEL_REQUIRED) {
      return json({ ok: false, error: '被邀请人等级需大于100' });
    }
    await db.claimInvitePoints(accountId, inviteeId);
    await db.addInviterPoints(accountId, POINTS_PER_INVITEE);
    const storage = await db.getInviterStorage(accountId);
    return json({ ok: true, points_added: POINTS_PER_INVITEE, invite_points: storage.invite_points });
  }

  // POST /invite/reissue - 邀请人对历史未发灵石的被邀请人手动补发
  if (route === '/invite/reissue' && request.method === 'POST') {
    const inviteeId = intVal(body?.invitee_account_id, 0);
    if (inviteeId <= 0) return json({ ok: false, error: '参数无效' });
    const inviterId = accountId;

    const list = await db.listInvitees(inviterId);
    const row = list.find((r) => Number(r.invitee_account_id) === inviteeId);
    if (!row) return json({ ok: false, error: '该玩家不是你的被邀请人' });
    if (row.stones_granted !== null) {
      return json({ ok: false, error: '该被邀请人已发放过灵石，无需补发' });
    }

    const storage = await db.getInviterStorage(inviterId);
    const perPerson = intVal(storage.per_person_stones, 0);
    if (perPerson <= 0) return json({ ok: false, error: '请先设置每人灵石数量' });
    const stored = intVal(storage.stored_stones, 0);
    if (stored < perPerson) return json({ ok: false, error: '存储灵石不足' });

    if (!(await db.deductInviterStones(inviterId, perPerson))) {
      return json({ ok: false, error: '存储灵石不足（并发冲突）' });
    }

    const inviteePlayer = await db.getPlayerByAccountId(inviteeId);
    if (!inviteePlayer) return json({ ok: false, error: '被邀请人角色不存在' });
    inviteePlayer.spirit_stones = intVal(inviteePlayer.spirit_stones, 0) + perPerson;
    await db.savePlayer(inviteeId, 1, inviteePlayer);
    await db.updateInviteBindingStones(inviteeId, perPerson);

    const newStorage = await db.getInviterStorage(inviterId);
    return json({
      ok: true,
      stones_granted: perPerson,
      stored_stones: newStorage.stored_stones,
      message: `已向 ${row.username || '该玩家'} 补发 ${perPerson} 灵石`
    });
  }

  // GET /invite/shop - 邀请商店列表
  if (route === '/invite/shop' && request.method === 'GET') {
    const items = [];
    for (const [itemIdStr, cost] of Object.entries(INVITE_SHOP)) {
      const id = intVal(itemIdStr, 0);
      const item = getItemById(id);
      if (item && Object.keys(item).length > 0) items.push({ ...item, invite_cost: cost });
    }
    const storage = await db.getInviterStorage(accountId);
    return json({ ok: true, items, invite_points: storage.invite_points });
  }

  // POST /invite/shop/buy - 购买
  if (route === '/invite/shop/buy' && request.method === 'POST') {
    const itemId = intVal(body?.item_id, 0);
    const count = Math.max(1, Math.min(99, intVal(body?.count, 1)));
    const costEach = INVITE_SHOP[itemId];
    if (costEach == null) return json({ ok: false, error: '邀请商店无此物品' });
    const totalCost = costEach * count;

    const storage = await db.getInviterStorage(accountId);
    if (intVal(storage.invite_points, 0) < totalCost) {
      return json({ ok: false, error: '邀请积分不足' });
    }
    const item = getItemById(itemId);
    if (!item || Object.keys(item).length <= 0) return json({ ok: false, error: '物品不存在' });
    const player = await db.getPlayerByAccountId(accountId);
    if (!player) return json({ ok: false, error: '无角色' });
    if (!hasEmptyInventorySlot(player) && !inventoryHasItem(player, itemId)) {
      return json({ ok: false, error: '背包已满' });
    }
    const itemToAdd = deepClone(item);
    if (INVITE_SHOP_MARKET_LOCK_ITEM_IDS.has(itemId)) {
      itemToAdd.invite_shop_no_market = true;
    }
    const added = ops.putItemInInventory(player.inventory, itemToAdd, count);
    if (!added) return json({ ok: false, error: '背包已满' });
    if (!(await db.deductInvitePoints(accountId, totalCost))) {
      return json({ ok: false, error: '邀请积分不足（并发冲突，请重试）' });
    }
    await db.savePlayer(accountId, 1, player);
    const newStorage = await db.getInviterStorage(accountId);
    return json({
      ok: true,
      player,
      invite_points: newStorage.invite_points,
      item_name: item.name,
      count,
      cost: totalCost
    });
  }

  return null;
}