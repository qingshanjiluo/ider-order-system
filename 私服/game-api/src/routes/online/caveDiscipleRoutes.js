/**
 * 洞府 API（Worker 版）
 * 迁移自 server/routes/online/caveDiscipleRoutes.js（mountCaveDiscipleRoutes）。
 * 依赖：createDb 的 getPlayerByAccountId / savePlayer。
 * 说明：传人系统已删除，本文件仅保留洞府（采集/阵形）相关接口。
 */
import { createDb } from '../../db.js';
import { verifyToken } from '../../auth.js';
import { intVal } from '../../game/onlineUtils.js';
import * as cave from '../../game/cave.js';
import * as combatUtils from '../../game/combatUtils.js';
import { settleBackgroundJobsForPlayer } from '../../game/backgroundJobs.js';
import { createBattleCache } from '../../game/battleSessionCache.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// 结算百艺后台任务，若状态有变化则写回（原版 settleBaiyiIfNeeded）
async function settleBaiyiIfNeeded(db, accountId, player, nowSec) {
  const settled = await settleBackgroundJobsForPlayer(db, accountId, player, nowSec);
  if (settled && settled.changed) await db.savePlayer(accountId, 1, player);
}

export async function handleCaveDiscipleRoute(request, env, route) {
  const method = request.method;

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = intVal(auth.accountId || auth.sub || 0, 0);

  const db = createDb(env);
  const battleCache = createBattleCache(env);

  const handlers = [
    ['GET', '/cave/status', () => handleCaveStatus(db, accountId)],
    ['POST', '/cave/start', () => handleCaveStart(db, accountId, request)],
    ['POST', '/cave/stop', () => handleCaveStop(db, accountId)],
    ['POST', '/cave/upgrade', () => handleCaveUpgrade(db, accountId)],
    ['POST', '/cave/formation/place', () => handleCaveFormationPlace(db, accountId, request)],
    ['POST', '/cave/formation/pick', () => handleCaveFormationPick(db, accountId, request)],
    ['POST', '/cave/formation/move', () => handleCaveFormationMove(db, accountId, request)],
    ['POST', '/cave/formation/rotate', () => handleCaveFormationRotate(db, accountId, request)],
    ['POST', '/cave/formation/clear', () => handleCaveFormationClear(db, accountId)],
    ['POST', '/cave/formation/decompose_rune', () => handleCaveFormationDecomposeRune(db, accountId, request)],
    ['POST', '/cave/formation/decompose_plate', () => handleCaveFormationDecomposePlate(db, accountId, request)],
    ['POST', '/cave/formation/service/set', () => handleCaveFormationServiceSet(db, accountId, request, battleCache)]
  ];
  for (const [m, p, fn] of handlers) {
    if (route === p && method === m) return fn();
  }
  return null;
}

// ─── 洞府系统 ───

async function handleCaveStatus(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const now = Math.floor(Date.now() / 1000);
  await settleBaiyiIfNeeded(db, accountId, player, now);
  cave.settleMainFormationServices(player, now);
  const report = cave.settleCaveGathering(player, now);
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, ...cave.getCaveStatus(player), settle_report: report });
}

async function handleCaveStart(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const now = Math.floor(Date.now() / 1000);
  await settleBaiyiIfNeeded(db, accountId, player, now);
  const body = await request.json().catch(() => ({}));
  const type = String(body.type || '').trim();
  const r = cave.startGathering(player, type);
  if (!r.ok) return json(r);
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, ...cave.getCaveStatus(player) });
}

async function handleCaveStop(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const r = cave.stopGathering(player);
  if (!r.ok) return json(r);
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, ...cave.getCaveStatus(player), report: r.report, player });
}

async function handleCaveUpgrade(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const r = cave.upgradeCave(player);
  if (!r.ok) return json(r);
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, ...cave.getCaveStatus(player), cost: r.cost, player });
}

// 阵形操作公共流程：放置/拾取/移动/旋转/清空/分解后重算主阵状态与战斗属性
async function withFormationSettle(db, accountId, doOp) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const now = Math.floor(Date.now() / 1000);
  await settleBaiyiIfNeeded(db, accountId, player, now);
  const r = await doOp(player);
  if (!r.ok) return json(r);
  cave.settleMainFormationServices(player, now, { allowAutoActivate: false });
  combatUtils.recalcAndAssignCombatStats(player, true);
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, ...cave.getCaveStatus(player) });
}

async function handleCaveFormationPlace(db, accountId, request) {
  return withFormationSettle(db, accountId, async (player) => {
    const body = await request.json().catch(() => ({}));
    const pieceUid = String(body.piece_uid || '').trim();
    const targetIndex = intVal(body.target_index, -1);
    return cave.placeFormationPiece(player, pieceUid, targetIndex);
  });
}

async function handleCaveFormationPick(db, accountId, request) {
  return withFormationSettle(db, accountId, async (player) => {
    const body = await request.json().catch(() => ({}));
    const sourceIndex = intVal(body.source_index, -1);
    return cave.pickFormationPiece(player, sourceIndex);
  });
}

async function handleCaveFormationMove(db, accountId, request) {
  return withFormationSettle(db, accountId, async (player) => {
    const body = await request.json().catch(() => ({}));
    const fromIndex = intVal(body.from_index, -1);
    const toIndex = intVal(body.to_index, -1);
    return cave.moveFormationPiece(player, fromIndex, toIndex);
  });
}

async function handleCaveFormationRotate(db, accountId, request) {
  return withFormationSettle(db, accountId, async (player) => {
    const body = await request.json().catch(() => ({}));
    const sourceIndex = intVal(body.source_index, -1);
    const turns = intVal(body.turns, 1);
    const r = cave.rotateFormationPiece(player, sourceIndex, turns);
    if (!r.ok) return r;
    return { ok: true, rotation: Number(r.rotation || 0), ...cave.getCaveStatus(player) };
  });
}

async function handleCaveFormationClear(db, accountId) {
  return withFormationSettle(db, accountId, async (player) => {
    const r = cave.clearFormationBoard(player);
    if (!r.ok) return r;
    return { ok: true, moved_count: Number(r.moved_count || 0), ...cave.getCaveStatus(player) };
  });
}

async function handleCaveFormationDecomposeRune(db, accountId, request) {
  return withFormationSettle(db, accountId, async (player) => {
    const body = await request.json().catch(() => ({}));
    const pieceUid = String(body.piece_uid || '').trim();
    const r = cave.decomposeFormationRune(player, pieceUid);
    if (!r.ok) return r;
    return { ok: true, reward: r.reward, player, ...cave.getCaveStatus(player) };
  });
}

async function handleCaveFormationDecomposePlate(db, accountId, request) {
  return withFormationSettle(db, accountId, async (player) => {
    const body = await request.json().catch(() => ({}));
    const pieceUid = String(body.piece_uid || '').trim();
    const r = cave.decomposeFormationPlate(player, pieceUid);
    if (!r.ok) return r;
    return { ok: true, reward: r.reward, player, ...cave.getCaveStatus(player) };
  });
}

async function handleCaveFormationServiceSet(db, accountId, request, battleCache) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  const now = Math.floor(Date.now() / 1000);
  await settleBaiyiIfNeeded(db, accountId, player, now);

  const body = await request.json().catch(() => ({}));
  const skillId = String(body.skill_id || '').trim();
  const instanceKey = String(body.instance_key || '').trim();
  const active = !!body.active;
  const r = cave.setMainFormationServiceActive(player, skillId, active, now, instanceKey);
  if (!r.ok) return json(r);

  combatUtils.recalcAndAssignCombatStats(player, true);
  await db.savePlayer(accountId, 1, player);

  // 激活/停用主阵技能会使战斗属性变化，作废进行中的战斗会话
  let invalidated = false;
  try {
    const activeBattle = await battleCache.getActiveSessionByAccount(accountId);
    if (activeBattle && activeBattle.id) {
      await battleCache.deleteSession(String(activeBattle.id));
      invalidated = true;
    }
  } catch (e) {
    console.error('[cave] battle session invalidate error', e?.message);
  }

  return json({
    ok: true,
    service: { skill_id: skillId, instance_key: String(r.instance_key || instanceKey || ''), active },
    battle_session_invalidated: invalidated,
    player,
    ...cave.getCaveStatus(player)
  });
}