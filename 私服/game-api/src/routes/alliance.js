/**
 * 仙盟（玩家公会）API（Worker 版）
 * 迁移自 server/routes/alliance.js。
 * 依赖：createDb 的 alliance_* 方法、allianceBuildings 建筑逻辑、dataLoader/playerOps/equipmentGen。
 * 说明：原 route 依赖 settlementLock（进程内写锁）与 wsManager/getLastActivityAt（在线判定），
 *       本版本省略写锁（D1 单请求串行），在线判定仅依据存档 time_state.last_activity_at。
 *       内存缓存改为模块级 Map（TTL 取 env.ALLIANCE_DETAIL_CACHE_MS，上限 env.ALLIANCE_DETAIL_CACHE_MAX）。
 */
import { verifyToken } from '../auth.js';
import { createDb } from '../db.js';
import { getSectById, getItemById } from '../game/dataLoader.js';
import { isValidEquipType } from '../game/equipmentGen.js';
import * as ops from '../game/playerOps.js';
import { hasEmptyInventorySlot, inventoryHasItem, deepClone } from '../game/onlineUtils.js';
import * as allianceBuildings from '../game/allianceBuildings.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

const ONLINE_THRESHOLD_SEC = 300; // 5 分钟内活动视为在线

export async function handleAllianceRoute(request, env, route) {
  const method = request.method;
  const url = new URL(request.url);
  const subPath = route.replace(/^\/alliance/, '') || '/';

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = intVal(auth.accountId || auth.sub || 0, 0);

  const db = createDb(env);

  if (subPath === '/list' && method === 'GET') return handleAllianceList(db);
  if (subPath === '/create' && method === 'POST') return handleAllianceCreate(db, accountId, request);
  if (subPath === '/apply' && method === 'POST') return handleAllianceApply(db, accountId, request);
  let m = subPath.match(/^\/detail\/(\d+)$/);
  if (m && method === 'GET') return handleAllianceDetail(db, accountId, intVal(m[1], 0), env);
  if (subPath === '/update' && method === 'POST') return handleAllianceUpdate(db, accountId, request);
  if (subPath === '/grant_rank' && method === 'POST') return handleGrantRank(db, accountId, request);
  if (subPath === '/transfer_leader' && method === 'POST') return handleTransferLeader(db, accountId, request);
  if (subPath === '/leave' && method === 'POST') return handleAllianceLeave(db, accountId);
  if (subPath === '/kick' && method === 'POST') return handleAllianceKick(db, accountId, request);
  m = subPath.match(/^\/applications\/(\d+)$/);
  if (m && method === 'GET') return handleApplications(db, accountId, intVal(m[1], 0));
  if (subPath === '/approve_application' && method === 'POST') return handleApproveApplication(db, accountId, request);
  if (subPath === '/reject_application' && method === 'POST') return handleRejectApplication(db, accountId, request);
  m = subPath.match(/^\/warehouse\/(\d+)$/);
  if (m && method === 'GET') return handleWarehouse(db, accountId, intVal(m[1], 0));
  if (subPath === '/warehouse/deposit' && method === 'POST') return handleWarehouseDeposit(db, accountId, request);
  if (subPath === '/warehouse/withdraw' && method === 'POST') return handleWarehouseWithdraw(db, accountId, request);
  if (subPath === '/warehouse/upgrade' && method === 'POST') return handleWarehouseUpgrade(db, accountId, request);
  if (subPath === '/warehouse/authorize' && method === 'POST') return handleWarehouseAuthorize(db, accountId, request);
  m = subPath.match(/^\/buildings\/(\d+)$/);
  if (m && method === 'GET') return handleBuildings(db, accountId, intVal(m[1], 0));
  if (subPath === '/buildings/upgrade' && method === 'POST') return handleBuildingsUpgrade(db, accountId, request);
  if (subPath === '/donate' && method === 'POST') return handleDonate(db, accountId, request);
  if (subPath === '/statue/bless' && method === 'POST') return handleStatueBless(db, accountId, request);
  if (subPath === '/spirit_pool/bathe' && method === 'POST') return handleSpiritPoolBathe(db, accountId, request);
  if (subPath === '/garden/pick' && method === 'POST') return handleGardenPick(db, accountId, request);
  if (subPath === '/enlightenment_tree/meditate' && method === 'POST') return handleEnlightenmentMeditate(db, accountId, request);
  m = subPath.match(/^\/treasury\/list\/(\d+)$/);
  if (m && method === 'GET') return handleTreasuryList(db, accountId, intVal(m[1], 0));
  if (subPath === '/treasury/buy' && method === 'POST') return handleTreasuryBuy(db, accountId, request);

  return null;
}

// ══════════ 缓存 ══════════

let _allianceListCache = null;
let _allianceListCacheAt = 0;
const ALLIANCE_LIST_TTL = 30;
const _allianceDetailCache = new Map();

function _getDetailCacheMs(env) {
  const v = Math.floor(Number(env && env.ALLIANCE_DETAIL_CACHE_MS) || 8000);
  return Math.max(1000, v);
}
function _getDetailCacheMax(env) {
  const v = Math.floor(Number(env && env.ALLIANCE_DETAIL_CACHE_MAX) || 1000);
  return Math.max(100, v);
}

function _normalizeExtractedName(raw, fallback = '?') {
  let text = (raw != null && raw !== '') ? String(raw).trim() : '';
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1).replace(/\\"/g, '"');
  }
  return text || String(fallback || '?');
}

function _getAllianceDetailCache(allianceId) {
  const aid = intVal(allianceId, 0);
  if (aid <= 0) return null;
  const hit = _allianceDetailCache.get(aid);
  if (!hit) return null;
  if (Number(hit.expireAt || 0) <= Date.now()) {
    _allianceDetailCache.delete(aid);
    return null;
  }
  return hit.payload || null;
}

function _setAllianceDetailCache(allianceId, payload, env) {
  const aid = intVal(allianceId, 0);
  if (aid <= 0 || !payload) return;
  const max = _getDetailCacheMax(env);
  _allianceDetailCache.set(aid, { expireAt: Date.now() + _getDetailCacheMs(env), payload });
  if (_allianceDetailCache.size <= max) return;
  for (const [k, v] of _allianceDetailCache.entries()) {
    if (Number(v?.expireAt || 0) <= Date.now()) _allianceDetailCache.delete(k);
  }
  while (_allianceDetailCache.size > max) {
    const first = _allianceDetailCache.keys().next().value;
    if (first === undefined) break;
    _allianceDetailCache.delete(first);
  }
}

function _invalidateAllianceCaches(allianceId = 0) {
  _allianceListCache = null;
  _allianceListCacheAt = 0;
  const aid = intVal(allianceId, 0);
  if (aid > 0) {
    _allianceDetailCache.delete(aid);
    return;
  }
  _allianceDetailCache.clear();
}

// ══════════ 在线/快照 ══════════

function isOnline(accountId, lastActivityAt) {
  const now = Math.floor(Date.now() / 1000);
  return lastActivityAt > 0 && (now - lastActivityAt) < ONLINE_THRESHOLD_SEC;
}

async function _loadAlliancePlayerSnapshotMap(db, accountIds) {
  const ids = [...new Set((Array.isArray(accountIds) ? accountIds : [])
    .map((x) => intVal(x, 0))
    .filter((x) => x > 0))];
  const out = new Map();
  if (ids.length <= 0) return out;
  const rows = await Promise.all(ids.map(async (aid) => {
    const player = await db.getPlayerByAccountId(aid);
    const acc = await db.getAccountById(aid);
    return { aid, player, acc };
  }));
  for (const row of rows) {
    const aid = intVal(row?.aid, 0);
    if (aid <= 0) continue;
    const parsed = (row?.player && typeof row.player === 'object') ? row.player : {};
    out.set(aid, {
      name: String(parsed?.name || row?.acc?.username || ''),
      level: intVal(parsed?.level, 1),
      sect_id: intVal(parsed?.sect_id, 0),
      last_activity_at: intVal(parsed?.time_state?.last_activity_at, 0)
    });
  }
  return out;
}

async function _listAllianceLeaderNameMap(db) {
  const alliances = await db.listAlliances();
  const out = new Map();
  for (const alliance of alliances || []) {
    const id = intVal(alliance?.id, 0);
    if (id <= 0) continue;
    const members = await db.listAllianceMembers(id);
    const leader = (members || []).find((m) => intVal(m?.rank, 0) === 5);
    if (!leader) {
      out.set(id, '?');
      continue;
    }
    const leaderAid = intVal(leader?.account_id, 0);
    const leaderPlayer = leaderAid > 0 ? await db.getPlayerByAccountId(leaderAid) : null;
    out.set(id, _normalizeExtractedName(leaderPlayer?.name, leader?.username || '?'));
  }
  return out;
}

async function _buildAllianceDetailPayload(db, allianceId) {
  const id = intVal(allianceId, 0);
  if (id <= 0) return null;
  const alliance = await db.getAllianceById(id);
  if (!alliance) return null;

  const membersRaw = await db.listAllianceMembers(id);
  const playerSnapshots = await _loadAlliancePlayerSnapshotMap(db, membersRaw.map((m) => intVal(m?.account_id, 0)));
  const sectNameById = new Map();
  const now = Math.floor(Date.now() / 1000);
  const members = membersRaw.map((m) => {
    const aid = intVal(m?.account_id, 0);
    const ps = playerSnapshots.get(aid) || null;
    const lastAct = intVal(ps?.last_activity_at, 0);
    const sectId = intVal(ps?.sect_id, 0);
    let sectName = '散修';
    if (sectId > 0) {
      if (!sectNameById.has(sectId)) {
        const sect = getSectById(sectId) || {};
        sectNameById.set(sectId, String(sect?.name || '散修'));
      }
      sectName = sectNameById.get(sectId) || '散修';
    }
    const isBanned = Number(m.is_banned || 0) > 0;
    const expiresAt = Number(m.ban_expires_at || 0);
    const effectiveBanned = isBanned && (expiresAt <= 0 || expiresAt > now);
    return {
      account_id: aid,
      username: String(m?.username || '?'),
      player_name: String(ps?.name || m?.player_name || m?.username || '?'),
      rank: intVal(m?.rank, 0),
      level: intVal(ps?.level, 1),
      sect_name: sectName,
      online: isOnline(aid, lastAct),
      last_activity_at: lastAct || 0,
      is_banned: effectiveBanned
    };
  });

  const withdrawAuth = (await db.listAllianceWithdrawAuth(id)).map((r) => Number(r.account_id) || 0);
  const leader = members.find((x) => x.rank === 5);
  return {
    ...alliance,
    members,
    materials: alliance.materials ?? 0,
    warehouse_pages: alliance.warehouse_pages ?? 10,
    withdraw_auth_ids: withdrawAuth,
    leader_name: leader?.player_name || leader?.username || '?'
  };
}

// ══════════ 列表/创建/申请/详情 ══════════

async function handleAllianceList(db) {
  const now = Math.floor(Date.now() / 1000);
  let enriched = null;
  if (_allianceListCache && (now - _allianceListCacheAt) < ALLIANCE_LIST_TTL) {
    enriched = _allianceListCache;
  } else {
    const leaderNameByAllianceId = await _listAllianceLeaderNameMap(db);
    const list = await db.listAlliances();
    enriched = list.map((a) => {
      const gateLv = intVal(a.gate_level, 1);
      const memberLimit = allianceBuildings.getMemberLimit(gateLv);
      const leaderName = leaderNameByAllianceId.get(intVal(a.id, 0)) || '?';
      return { ...a, leader_name: leaderName, member_limit: memberLimit };
    });
    _allianceListCache = enriched;
    _allianceListCacheAt = now;
  }
  return json({ ok: true, alliances: enriched });
}

// 创建仙盟（扣除 10 万灵石）
const CREATE_COST = 100000;

async function handleAllianceCreate(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  if (intVal(player.alliance_id, 0) > 0) return json({ ok: false, error: '已在仙盟中，请先退出' });
  const stones = intVal(player.spirit_stones, 0);
  if (stones < CREATE_COST) return json({ ok: false, error: `灵石不足，创建仙盟需要 ${CREATE_COST} 灵石` });
  const body = await request.json().catch(() => ({}));
  const { name, description } = body || {};
  const trimName = String(name || '').trim();
  if (!trimName) return json({ ok: false, error: '请输入仙盟名称' });
  if (trimName.length < 2 || trimName.length > 20) return json({ ok: false, error: '仙盟名称 2-20 字符' });
  const existing = await db.getAllianceByName(trimName);
  if (existing) return json({ ok: false, error: '该仙盟名称已存在' });
  const desc = String(description || '').trim().slice(0, 200);
  const id = await db.createAlliance(trimName, desc, accountId);
  if (id <= 0) return json({ ok: false, error: '该仙盟名称已存在' });
  player.spirit_stones = stones - CREATE_COST;
  player.alliance_id = id;
  await db.savePlayerImmediate(accountId, 1, player);
  const alliance = await db.getAllianceById(id);
  _invalidateAllianceCaches(id);
  return json({ ok: true, alliance_id: id, alliance, player });
}

async function handleAllianceApply(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  if (intVal(player.alliance_id, 0) > 0) return json({ ok: false, error: '已在仙盟中' });
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const members = await db.listAllianceMembers(allianceId);
  if (members.some((m) => intVal(m.account_id, 0) === accountId)) return json({ ok: false, error: '你已是该仙盟成员' });
  const existingApp = await db.getApplicationByAllianceAndAccount(allianceId, accountId);
  if (existingApp) return json({ ok: false, error: '已申请过，请等待审核' });
  const anyApp = await db.getApplicationByAllianceAndAccountAnyStatus(allianceId, accountId);
  if (anyApp) {
    await db.renewAllianceApplication(allianceId, accountId);
  } else {
    await db.createAllianceApplication(allianceId, accountId);
  }
  return json({ ok: true, msg: '申请已提交' });
}

async function handleAllianceDetail(db, accountId, id, env) {
  if (id <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  let alliancePayload = _getAllianceDetailCache(id);
  if (!alliancePayload) {
    alliancePayload = await _buildAllianceDetailPayload(db, id);
    if (alliancePayload) _setAllianceDetailCache(id, alliancePayload, env);
  }
  if (!alliancePayload) return json({ ok: false, error: '仙盟不存在' });
  const myRank = await db.getAllianceMemberRank(id, accountId);
  const canWithdraw = myRank === 5 || await db.hasAllianceWithdrawAuth(id, accountId);
  return json({
    ok: true,
    alliance: alliancePayload,
    my_rank: myRank,
    can_withdraw: canWithdraw
  });
}

// ══════════ 信息/职务 ══════════

async function handleAllianceUpdate(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank !== 5) return json({ ok: false, error: '仅盟主可修改仙盟信息' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const updates = {};
  if (body?.name != null) {
    const trimName = String(body.name).trim();
    if (!trimName) return json({ ok: false, error: '仙盟名称不能为空' });
    if (trimName.length < 2 || trimName.length > 20) return json({ ok: false, error: '仙盟名称 2-20 字符' });
    const existing = await db.getAllianceByName(trimName);
    if (existing && intVal(existing.id, 0) !== allianceId) return json({ ok: false, error: '该仙盟名称已存在' });
    updates.name = trimName;
  }
  if (body?.description != null) updates.description = String(body.description || '').trim().slice(0, 200);
  if (body?.rank_names != null) {
    const rn = Array.isArray(body.rank_names) ? body.rank_names : [];
    if (rn.length !== 6) return json({ ok: false, error: '职务名称必须为 6 个' });
    updates.rank_names_json = JSON.stringify(rn.map((s) => String(s || '').trim().slice(0, 10) || '职务'));
  }
  if (Object.keys(updates).length === 0) return json({ ok: false, error: '无修改内容' });
  await db.updateAlliance(allianceId, updates);
  _invalidateAllianceCaches(allianceId);
  const updated = await db.getAllianceById(allianceId);
  return json({ ok: true, alliance: updated });
}

// 职务上限：盟主1 副盟主2 长老6
const RANK_LIMITS = { 5: 1, 4: 2, 3: 6 };

async function checkMemberLimit(db, allianceId) {
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return { ok: false, limit: 0, count: 0 };
  const gateLevel = intVal(alliance.gate_level, 1);
  const limit = allianceBuildings.getMemberLimit(gateLevel);
  const members = await db.listAllianceMembers(allianceId);
  return { ok: members.length < limit, limit, count: members.length };
}

async function checkRankLimits(db, allianceId, newRank, excludeAccountId) {
  const limit = RANK_LIMITS[newRank];
  if (limit == null) return true;
  const current = await db.countAllianceMembersByRank(allianceId, newRank);
  if (excludeAccountId > 0) {
    const targetRank = await db.getAllianceMemberRank(allianceId, excludeAccountId);
    if (targetRank === newRank) return current <= limit; // 同职调动不占新名额
  }
  return current < limit;
}

async function handleGrantRank(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const targetAccountId = intVal(body?.account_id, 0);
  const newRank = intVal(body?.rank, 0);
  if (allianceId <= 0 || targetAccountId <= 0) return json({ ok: false, error: '参数无效' });
  if (newRank < 0 || newRank > 5) return json({ ok: false, error: '职务等级 0-5' });
  const myRank = await db.getAllianceMemberRank(allianceId, accountId);
  if (myRank === 5) {
    if (newRank === 5) return json({ ok: false, error: '盟主不能任命盟主' });
  } else if (myRank === 4) {
    if (newRank >= 4) return json({ ok: false, error: '副盟主只能任命副盟主以下的职务' });
  } else {
    return json({ ok: false, error: '仅盟主、副盟主可授予职务' });
  }
  const targetRank = await db.getAllianceMemberRank(allianceId, targetAccountId);
  if (targetRank < 0) return json({ ok: false, error: '目标不是本仙盟成员' });
  if (newRank >= myRank) return json({ ok: false, error: '无法授予不低于自己等级的职务' });
  if (!await checkRankLimits(db, allianceId, newRank, targetAccountId)) {
    const names = ['', '', '', '长老', '副盟主', '盟主'];
    return json({ ok: false, error: `${names[newRank] || '该职务'}人数已达上限` });
  }
  await db.updateAllianceMemberRank(allianceId, targetAccountId, newRank);
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, msg: '职务已更新' });
}

async function handleTransferLeader(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const targetAccountId = intVal(body?.account_id, 0);
  if (allianceId <= 0 || targetAccountId <= 0) return json({ ok: false, error: '参数无效' });
  const myRank = await db.getAllianceMemberRank(allianceId, accountId);
  if (myRank !== 5) return json({ ok: false, error: '仅盟主可退位让贤' });
  const targetRank = await db.getAllianceMemberRank(allianceId, targetAccountId);
  if (targetRank < 0) return json({ ok: false, error: '目标不是本仙盟成员' });
  await db.updateAllianceMemberRank(allianceId, targetAccountId, 5);
  await db.updateAllianceMemberRank(allianceId, accountId, 0);
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, msg: '已退位让贤' });
}

async function handleAllianceLeave(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  const allianceId = intVal(player.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '未加入仙盟' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank === 5) return json({ ok: false, error: '盟主无法直接退出，请先转让盟主或解散仙盟' });
  await db.removeAllianceMember(allianceId, accountId);
  player.alliance_id = 0;
  await db.savePlayerImmediate(accountId, 1, player);
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, player, msg: '已退出仙盟' });
}

async function handleAllianceKick(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const targetAccountId = intVal(body?.account_id, 0);
  if (allianceId <= 0 || targetAccountId <= 0) return json({ ok: false, error: '参数无效' });
  const myRank = await db.getAllianceMemberRank(allianceId, accountId);
  const targetRank = await db.getAllianceMemberRank(allianceId, targetAccountId);
  if (targetRank < 0) return json({ ok: false, error: '目标不是本仙盟成员' });
  if (myRank <= targetRank) return json({ ok: false, error: '无权踢出该成员' });
  await db.removeAllianceMember(allianceId, targetAccountId);
  const targetPlayer = await db.getPlayerByAccountId(targetAccountId);
  if (targetPlayer) {
    targetPlayer.alliance_id = 0;
    await db.savePlayerImmediate(targetAccountId, 1, targetPlayer);
  }
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, msg: '已踢出' });
}

// ══════════ 申请审核 ══════════

async function handleApplications(db, accountId, allianceId) {
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 4) return json({ ok: false, error: '无权查看申请' });
  const apps = await db.listAlliancePendingApplications(allianceId);
  const enriched = [];
  for (const a of apps) {
    const acc = await db.getAccountById(a.account_id);
    const p = await db.getPlayerByAccountId(a.account_id);
    const sectId = intVal(p?.sect_id, 0);
    const sect = sectId > 0 ? (getSectById(sectId) || {}) : {};
    enriched.push({
      id: a.id,
      account_id: a.account_id,
      username: acc?.username || '?',
      player_name: p?.name || acc?.username || '?',
      level: intVal(p?.level, 1),
      sect_name: sect?.name || '散修',
      created_at: a.created_at
    });
  }
  return json({ ok: true, applications: enriched });
}

async function handleApproveApplication(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const appId = intVal(body?.application_id, 0);
  if (appId <= 0) return json({ ok: false, error: '申请 ID 无效' });
  const row = await db.getApplicationById(appId);
  if (!row || row.status !== 'pending') return json({ ok: false, error: '申请不存在或已处理' });
  const allianceId = intVal(row.alliance_id, 0);
  const applicantId = intVal(row.account_id, 0);
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 4) return json({ ok: false, error: '无权审核' });
  const applicant = await db.getPlayerByAccountId(applicantId);
  if (applicant && intVal(applicant.alliance_id, 0) > 0) {
    await db.updateAllianceApplicationStatus(appId, 'rejected');
    return json({ ok: false, error: '该玩家已加入其他仙盟' });
  }
  const memberCheck = await checkMemberLimit(db, allianceId);
  if (!memberCheck.ok) return json({ ok: false, error: `仙盟成员已满（${memberCheck.count}/${memberCheck.limit}）` });
  await db.updateAllianceApplicationStatus(appId, 'approved');
  await db.addAllianceMember(allianceId, applicantId, 0);
  if (applicant) {
    applicant.alliance_id = allianceId;
    await db.savePlayerImmediate(applicantId, 1, applicant);
  }
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, msg: '已批准' });
}

async function handleRejectApplication(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const appId = intVal(body?.application_id, 0);
  if (appId <= 0) return json({ ok: false, error: '申请 ID 无效' });
  const row = await db.getApplicationById(appId);
  if (!row || row.status !== 'pending') return json({ ok: false, error: '申请不存在或已处理' });
  const rank = await db.getAllianceMemberRank(row.alliance_id, accountId);
  if (rank < 4) return json({ ok: false, error: '无权审核' });
  await db.updateAllianceApplicationStatus(appId, 'rejected');
  return json({ ok: true, msg: '已拒绝' });
}

// ══════════ 仙盟仓库 ══════════

const WAREHOUSE_UPGRADE_COST = 50000;
const SLOTS_PER_PAGE = 20;

function ensureWarehouse(wh, pages) {
  if (!Array.isArray(wh)) wh = [];
  const p = Math.max(10, Math.floor(Number(pages) || 10));
  while (wh.length < p) wh.push(Array(SLOTS_PER_PAGE).fill(null));
  for (let i = 0; i < wh.length; i++) {
    if (!Array.isArray(wh[i])) wh[i] = Array(SLOTS_PER_PAGE).fill(null);
    while (wh[i].length < SLOTS_PER_PAGE) wh[i].push(null);
  }
  return wh;
}

async function handleWarehouse(db, accountId, id) {
  if (id <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(id, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const alliance = await db.getAllianceById(id);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const canWithdraw = rank === 5 || await db.hasAllianceWithdrawAuth(id, accountId);
  return json({
    ok: true,
    warehouse: alliance.warehouse || [],
    warehouse_pages: alliance.warehouse_pages || 10,
    materials: alliance.materials || 0,
    can_withdraw: canWithdraw
  });
}

async function handleWarehouseDeposit(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const page = intVal(body?.page, 0);
  const slotIndex = intVal(body?.slot_index, 0);
  const count = Math.max(1, intVal(body?.count, 1));
  const expectItemId = intVal(body?.expect_item_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);
  const inv = player.inventory;
  if (page < 0 || page >= inv.length || slotIndex < 0 || slotIndex >= 20) return json({ ok: false, error: '背包格子无效' });
  const slot = inv[page]?.[slotIndex];
  if (!slot || !slot.item) return json({ ok: false, error: '该格子无物品' });
  if (expectItemId > 0 && intVal(slot.item?.id, 0) !== expectItemId) {
    return json({ ok: false, error: '背包物品已变动，请刷新后重试', code: 'SLOT_MISMATCH' });
  }
  const available = Math.min(count, Math.max(1, intVal(slot.count, 1)));
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  let wh = ensureWarehouse(alliance.warehouse || [], alliance.warehouse_pages || 10);
  const item = slot.item;
  const itemId = intVal(item?.id, 0);
  const itemType = String(item?.type || '');
  if (!isValidEquipType(itemType)) {
    return json({ ok: false, error: '仙盟仓库仅可存入装备' });
  }
  const toDeposit = 1; // 装备不堆叠，单次 1 件
  const putSlot = { item: structuredClone(item), count: toDeposit };
  let placed = false;
  for (let p = 0; p < wh.length && !placed; p++) {
    for (let s = 0; s < wh[p].length && !placed; s++) {
      if (wh[p][s] == null) {
        wh[p][s] = putSlot;
        placed = true;
      }
    }
  }
  if (!placed) return json({ ok: false, error: '仙盟仓库已满' });
  const slotRef = inv[page][slotIndex];
  if (toDeposit >= (intVal(slotRef.count, 1) || 1)) {
    inv[page][slotIndex] = null;
  } else {
    slotRef.count = (intVal(slotRef.count, 1) || 1) - toDeposit;
  }
  try {
    await db.updateAlliance(allianceId, { warehouse_json: JSON.stringify(wh) });
    await db.savePlayer(accountId, 1, player);
  } catch (e) {
    return json({ ok: false, error: '仓库存入失败' });
  }
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, player, msg: `已放入 ${toDeposit} 个` });
}

async function handleWarehouseWithdraw(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const whPage = intVal(body?.warehouse_page, 0);
  const whSlotIndex = intVal(body?.warehouse_slot_index, 0);
  const count = Math.max(1, intVal(body?.count, 1));
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const canWithdraw = rank === 5 || await db.hasAllianceWithdrawAuth(allianceId, accountId);
  if (!canWithdraw) return json({ ok: false, error: '需盟主授权才可提取' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  let wh = ensureWarehouse(alliance.warehouse || [], alliance.warehouse_pages || 10);
  if (whPage < 0 || whPage >= wh.length || whSlotIndex < 0 || whSlotIndex >= SLOTS_PER_PAGE) return json({ ok: false, error: '仓库格子无效' });
  const slot = wh[whPage]?.[whSlotIndex];
  if (!slot || !slot.item) return json({ ok: false, error: '该格子无物品' });
  const available = Math.max(1, intVal(slot.count, 1));
  const toWithdraw = Math.min(available, count);
  const item = slot.item;
  const putResult = ops.putItemInInventory(player.inventory, item, toWithdraw);
  if (!putResult) return json({ ok: false, error: '背包已满' });
  if (toWithdraw >= available) {
    wh[whPage][whSlotIndex] = null;
  } else {
    slot.count = available - toWithdraw;
  }
  try {
    await db.updateAlliance(allianceId, { warehouse_json: JSON.stringify(wh) });
    await db.savePlayer(accountId, 1, player);
  } catch (e) {
    return json({ ok: false, error: '仓库提取失败' });
  }
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, player, msg: `已提取 ${toWithdraw} 个` });
}

async function handleWarehouseUpgrade(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 4) return json({ ok: false, error: '权限不足，需要副盟主及以上' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const materials = intVal(alliance.materials, 0);
  if (materials < WAREHOUSE_UPGRADE_COST) return json({ ok: false, error: `仙盟物资不足，升级需要 ${WAREHOUSE_UPGRADE_COST}` });
  let wh = ensureWarehouse(alliance.warehouse || [], alliance.warehouse_pages || 10);
  wh.push(Array(SLOTS_PER_PAGE).fill(null));
  await db.updateAlliance(allianceId, {
    materials: materials - WAREHOUSE_UPGRADE_COST,
    warehouse_pages: wh.length,
    warehouse_json: JSON.stringify(wh)
  });
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, warehouse_pages: wh.length, materials: materials - WAREHOUSE_UPGRADE_COST, msg: '仓库已升级' });
}

async function handleWarehouseAuthorize(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const targetAccountId = intVal(body?.account_id, 0);
  const add = body?.add !== false;
  if (allianceId <= 0 || targetAccountId <= 0) return json({ ok: false, error: '参数无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank !== 5) return json({ ok: false, error: '仅盟主可授权' });
  const targetRank = await db.getAllianceMemberRank(allianceId, targetAccountId);
  if (targetRank < 0) return json({ ok: false, error: '目标不是本仙盟成员' });
  if (add) {
    await db.addAllianceWithdrawAuth(allianceId, targetAccountId);
    _invalidateAllianceCaches(allianceId);
    return json({ ok: true, msg: '已授权提取' });
  }
  await db.removeAllianceWithdrawAuth(allianceId, targetAccountId);
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, msg: '已取消授权' });
}

// ══════════ 仙盟建筑 ══════════

const BASE_ATTRS = ['strength', 'constitution', 'bone', 'agility', 'zhenyuan', 'lingli'];
const SPIRIT_POOL_DURATION = 6 * 3600;
const ENLIGHTENMENT_DURATION = 3600;
const DONATE_CONTRIB_CAP = 1000;

function getDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function handleBuildings(db, accountId, id) {
  if (id <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(id, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const alliance = await db.getAllianceById(id);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const levels = {
    statue: intVal(alliance.statue_level, 1),
    spirit_pool: intVal(alliance.spirit_pool_level, 1),
    garden: intVal(alliance.garden_level, 1),
    enlightenment_tree: intVal(alliance.enlightenment_tree_level, 1),
    treasury: intVal(alliance.treasury_level, 1),
    gate: intVal(alliance.gate_level, 1)
  };
  const buildingsWithNames = {};
  for (const [k, lv] of Object.entries(levels)) {
    buildingsWithNames[k] = { name: allianceBuildings.BUILDING_NAMES[k] || k, level: lv };
  }
  const memberLimit = allianceBuildings.getMemberLimit(levels.gate);
  const memberCount = (await db.listAllianceMembers(id)).length;
  const canUpgrade = rank >= 4;
  const myContrib = await db.getAllianceMemberContribution(id, accountId);
  const player = await db.getPlayerByAccountId(accountId);
  const today = getDateKey();
  const lastDonateDate = String(player?.alliance_donate_date || '');
  const donateContribToday = (lastDonateDate === today) ? intVal(player?.alliance_donate_contrib_today, 0) : 0;
  return json({
    ok: true,
    buildings: buildingsWithNames,
    materials: alliance.materials || 0,
    member_limit: memberLimit,
    member_count: memberCount,
    can_upgrade: canUpgrade,
    my_contribution: myContrib,
    donate_contrib_today: donateContribToday,
    donate_contrib_max_today: DONATE_CONTRIB_CAP,
    spirit_pool_last_bathe: player?.spirit_pool_last_bathe_date || '',
    enlightenment_last: player?.enlightenment_last_date || '',
    garden_last_pick: player?.garden_last_pick_date || '',
    spirit_pool_buff: player?.spirit_pool_buff || null,
    enlightenment_expires_at: player?.enlightenment_buff_expires_at || 0
  });
}

async function handleBuildingsUpgrade(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const building = String(body?.building || '').trim();
  if (allianceId <= 0 || !allianceBuildings.BUILDING_KEYS.includes(building)) return json({ ok: false, error: '参数无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 4) return json({ ok: false, error: '仅盟主、副盟主可升级建筑' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const col = building + '_level';
  const curLevel = intVal(alliance[col], 1);
  if (curLevel >= 10) return json({ ok: false, error: '该建筑已满级' });
  const cost = allianceBuildings.getUpgradeCost(curLevel, building);
  const materials = intVal(alliance.materials, 0);
  if (materials < cost) return json({ ok: false, error: `仙盟物资不足，需要 ${cost}` });
  const updates = { materials: materials - cost };
  updates[col] = curLevel + 1;
  await db.updateAlliance(allianceId, updates);
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, level: curLevel + 1, materials: materials - cost, msg: '升级成功' });
}

async function handleDonate(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const page = intVal(body?.page, 0);
  const slotIndex = intVal(body?.slot_index, 0);
  const count = Math.max(1, intVal(body?.count, 1));
  const expectItemId = intVal(body?.expect_item_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);
  const inv = player.inventory;
  if (page < 0 || page >= inv.length || slotIndex < 0 || slotIndex >= 20) return json({ ok: false, error: '背包格子无效' });
  const slot = inv[page]?.[slotIndex];
  if (!slot || !slot.item) return json({ ok: false, error: '该格子无物品' });
  if (expectItemId > 0 && intVal(slot.item?.id, 0) !== expectItemId) {
    return json({ ok: false, error: '背包物品已变动，请刷新后重试', code: 'SLOT_MISMATCH' });
  }
  const item = slot.item;
  const tier = allianceBuildings.getMaterialTier(item);
  if (tier <= 0) return json({ ok: false, error: '仅可捐献1-5阶材料' });
  const available = Math.min(count, Math.max(1, intVal(slot.count, 1)));
  const matsValue = allianceBuildings.getDonateValue(item, available);
  if (matsValue <= 0) return json({ ok: false, error: '该物品无法捐献' });
  const today = getDateKey();
  const lastDate = String(player.alliance_donate_date || '');
  let contribToday = (lastDate === today) ? intVal(player.alliance_donate_contrib_today, 0) : 0;
  const contribGain = Math.floor(matsValue / 10);
  if (contribGain <= 0) {
    const perValue = allianceBuildings.DONATE_TIER_VALUE[tier] || 3;
    const minCount = Math.ceil(10 / perValue);
    return json({ ok: false, error: `该材料至少捐献${minCount}个才能产生贡献` });
  }
  const room = Math.max(0, DONATE_CONTRIB_CAP - contribToday);
  const actualContrib = Math.min(contribGain, room);
  if (actualContrib <= 0) return json({ ok: false, error: '今日捐献贡献已达上限(1000)' });
  const actualMats = actualContrib * 10;
  const actualCount = Math.min(available, Math.ceil(actualMats / (allianceBuildings.DONATE_TIER_VALUE[tier] || 3)));
  const finalMats = allianceBuildings.getDonateValue(item, actualCount);
  const finalContrib = Math.floor(finalMats / 10);
  const slotTotal = intVal(slot.count, 1);
  if (actualCount >= slotTotal) {
    inv[page][slotIndex] = null;
  } else {
    slot.count = slotTotal - actualCount;
  }
  const alliance = await db.getAllianceById(allianceId);
  const curMats = intVal(alliance.materials, 0);
  player.alliance_donate_date = today;
  player.alliance_donate_contrib_today = contribToday + finalContrib;
  try {
    await db.updateAlliance(allianceId, { materials: curMats + finalMats });
    await db.addAllianceMemberContribution(allianceId, accountId, finalContrib);
    await db.savePlayer(accountId, 1, player);
  } catch (e) {
    return json({ ok: false, error: '捐献失败' });
  }
  player.alliance_contribution = await db.getAllianceMemberContribution(allianceId, accountId);
  _invalidateAllianceCaches(allianceId);
  return json({ ok: true, player, materials_gained: finalMats, contribution_gained: finalContrib });
}

// ══════════ 雕像祈福/灵池/仙园/悟道树 ══════════

const BLESS_POOL = [
  { item_id: 173, weight: 3 },
  { item_id: 174, weight: 3 },
  { item_id: 175, weight: 3 },
  { item_id: 176, weight: 3 },
  { item_id: 177, weight: 3 },
  { item_id: 239, weight: 1 },
];
const BLESS_TOTAL_WEIGHT = BLESS_POOL.reduce((s, e) => s + e.weight, 0);

function _rollBless(player) {
  const rewards = [];
  const roll = Math.random() * 100;
  if (roll < BLESS_TOTAL_WEIGHT) {
    let acc = 0;
    for (const entry of BLESS_POOL) {
      acc += entry.weight;
      if (roll < acc) {
        const tpl = getItemById(entry.item_id);
        if (tpl && tpl.id) {
          const added = ops.putItemInInventory(player.inventory, tpl, 1);
          if (added) {
            rewards.push({ item_id: tpl.id, item_name: String(tpl.name || ''), count: 1 });
          }
        }
        break;
      }
    }
  }
  return rewards;
}

async function handleStatueBless(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  const costPer = 10000;
  const times = Math.max(1, Math.min(50, intVal(body?.times, 1)));
  const totalCost = costPer * times;
  const stones = intVal(player.spirit_stones, 0);
  if (stones < totalCost) return json({ ok: false, error: `灵石不足，需要 ${totalCost}（${costPer} × ${times}次）` });
  player.spirit_stones = stones - totalCost;
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);

  const allRewards = [];
  for (let i = 0; i < times; i++) {
    const r = _rollBless(player);
    allRewards.push(...r);
  }

  await db.savePlayer(accountId, 1, player);
  const msg = allRewards.length > 0
    ? `祈福${times}次，获得：${allRewards.map(r => r.item_name).join('、')}`
    : `祈福${times}次，未获得特殊物品`;
  return json({ ok: true, player, rewards: allRewards, msg, times });
}

async function handleSpiritPoolBathe(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  const today = getDateKey();
  if (String(player.spirit_pool_last_bathe_date || '') === today) return json({ ok: false, error: '今日已沐浴过' });
  const level = intVal(alliance.spirit_pool_level, 1);
  const bonusPct = allianceBuildings.getSpiritPoolBonusPct(level);
  const attr = BASE_ATTRS[Math.floor(Math.random() * BASE_ATTRS.length)];
  const now = Math.floor(Date.now() / 1000);
  player.spirit_pool_buff = { attribute: attr, bonus_pct: bonusPct, expires_at: now + SPIRIT_POOL_DURATION };
  player.spirit_pool_last_bathe_date = today;
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, buff: player.spirit_pool_buff, msg: `获得${attr} +${bonusPct}% 加成，持续6小时` });
}

async function handleGardenPick(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  const today = getDateKey();
  if (String(player.garden_last_pick_date || '') === today) return json({ ok: false, error: '今日已采摘过' });
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);
  const level = intVal(alliance.garden_level, 1);
  const count = Math.random() < 0.5 ? 1 : 2;
  const drops = [];
  for (let i = 0; i < count; i++) {
    const it = allianceBuildings.pickGardenMaterial(level, Math.random());
    if (it) {
      const added = ops.putItemInInventory(player.inventory, it, 1);
      if (added) drops.push(it);
    }
  }
  player.garden_last_pick_date = today;
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, drops, msg: `获得 ${drops.length} 件材料` });
}

async function handleEnlightenmentMeditate(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  if (allianceId <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  const today = getDateKey();
  if (String(player.enlightenment_last_date || '') === today) return json({ ok: false, error: '今日已顿悟过' });
  const level = intVal(alliance.enlightenment_tree_level, 1);
  const bonusPct = allianceBuildings.getEnlightenmentBonusPct(level);
  const now = Math.floor(Date.now() / 1000);
  player.enlightenment_buff_expires_at = now + ENLIGHTENMENT_DURATION;
  player.enlightenment_buff_pct = bonusPct;
  player.enlightenment_last_date = today;
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, player, bonus_pct: bonusPct, expires_at: player.enlightenment_buff_expires_at, msg: `经验 +${bonusPct}% 1小时` });
}

// ══════════ 仙盟宝阁商店 ══════════

// item_id -> 贡献单价
const ALLIANCE_TREASURY_BASE = { 95: 400, 171: 800, 172: 800 };
const ALLIANCE_TREASURY_LV3 = { 96: 500, 97: 500, 98: 500, 99: 500, 100: 500 };
const ALLIANCE_TREASURY_LV7 = { 198: 800 };

function _getTreasuryGoods(alliance) {
  const merged = { ...ALLIANCE_TREASURY_BASE };
  const treasuryLv = intVal(alliance.treasury_level, 1);
  if (treasuryLv >= 3) Object.assign(merged, ALLIANCE_TREASURY_LV3);
  if (treasuryLv >= 7) Object.assign(merged, ALLIANCE_TREASURY_LV7);
  return merged;
}

async function handleTreasuryList(db, accountId, id) {
  if (id <= 0) return json({ ok: false, error: '仙盟 ID 无效' });
  const rank = await db.getAllianceMemberRank(id, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const alliance = await db.getAllianceById(id);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const treasuryMap = _getTreasuryGoods(alliance);
  const goods = [];
  for (const [itemIdStr, cost] of Object.entries(treasuryMap)) {
    const itemId = intVal(itemIdStr, 0);
    const item = getItemById(itemId);
    if (item && Object.keys(item).length > 0) goods.push({ ...item, cost_each: cost, item_id: itemId });
  }
  const myContrib = await db.getAllianceMemberContribution(id, accountId);
  return json({ ok: true, goods, my_contribution: myContrib });
}

async function handleTreasuryBuy(db, accountId, request) {
  const body = await request.json().catch(() => ({}));
  const allianceId = intVal(body?.alliance_id, 0);
  const itemId = intVal(body?.item_id, 0);
  const count = Math.max(1, Math.min(99, intVal(body?.count, 1)));
  if (allianceId <= 0 || itemId <= 0) return json({ ok: false, error: '参数无效' });
  const alliance = await db.getAllianceById(allianceId);
  if (!alliance) return json({ ok: false, error: '仙盟不存在' });
  const treasuryMap = _getTreasuryGoods(alliance);
  const costEach = treasuryMap[itemId];
  if (costEach == null) return json({ ok: false, error: '宝阁无此商品' });
  const totalCost = costEach * count;
  const rank = await db.getAllianceMemberRank(allianceId, accountId);
  if (rank < 0) return json({ ok: false, error: '非仙盟成员' });
  const myContrib = await db.getAllianceMemberContribution(allianceId, accountId);
  if (myContrib < totalCost) return json({ ok: false, error: `仙盟贡献不足（需要${totalCost}，当前${myContrib}）` });
  const item = getItemById(itemId);
  if (!item || Object.keys(item).length <= 0) return json({ ok: false, error: '物品不存在' });
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);
  if (!hasEmptyInventorySlot(player) && !inventoryHasItem(player, itemId)) {
    return json({ ok: false, error: '背包已满' });
  }
  const added = ops.putItemInInventory(player.inventory, deepClone(item), count);
  if (!added) return json({ ok: false, error: '背包已满' });
  await db.addAllianceMemberContribution(allianceId, accountId, -totalCost);
  await db.savePlayer(accountId, 1, player);
  return json({
    ok: true,
    player: { ...player, alliance_contribution: myContrib - totalCost },
    item_id: itemId,
    item_name: item.name,
    count,
    cost: totalCost,
    my_contribution: myContrib - totalCost,
    msg: `兑换成功：${item.name} x${count}`
  });
}