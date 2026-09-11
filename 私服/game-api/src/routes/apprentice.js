/**
 * 传人（弟子派遣搜集）API（Worker 版）
 * 迁移自 server/routes/apprentice.js，省略 settlementLock。
 */
import { verifyToken } from '../auth.js';
import { createDb } from '../db.js';
import {
  ensureApprenticeState,
  settleApprentice,
  getApprenticeSummary,
  renameApprentice,
  apprenticeEquip,
  apprenticeUnequip,
  startApprenticeDispatch,
  stopApprenticeDispatch
} from '../game/apprentice.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handleApprenticeRoute(request, env, route) {
  if (!route.startsWith('/apprentice')) return null;

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth || !auth.accountId) return json({ ok: false, error: '未登录' }, 401);
  const accountId = Number(auth.accountId);
  const db = createDb(env);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  const now = () => Math.floor(Date.now() / 1000);

  const run = async (fn) => {
    try {
      const player = await db.getPlayerByAccountId(accountId);
      if (!player) return json({ ok: false, error: '无角色' });
      const result = await fn(player, now());
      return result;
    } catch (e) {
      console.error('[apprentice] 路由异常:', e?.message || e);
      return json({ ok: false, error: '服务器内部错误' }, 500);
    }
  };

  // GET /apprentice/status
  if (route === '/apprentice/status' && request.method === 'GET') {
    return run(async (player, n) => {
      const report = settleApprentice(player, n);
      ensureApprenticeState(player, n);
      await db.savePlayer(accountId, 1, player);
      return json({ ok: true, apprentice: getApprenticeSummary(player, n), settle_report: report, player });
    });
  }

  // POST /apprentice/rename
  if (route === '/apprentice/rename' && request.method === 'POST') {
    return run(async (player, n) => {
      settleApprentice(player, n);
      const result = renameApprentice(player, body?.name, n);
      if (!result.ok) return json(result);
      await db.savePlayer(accountId, 1, player);
      return json({ ok: true, apprentice: result.apprentice, player });
    });
  }

  // POST /apprentice/equip
  if (route === '/apprentice/equip' && request.method === 'POST') {
    return run(async (player, n) => {
      settleApprentice(player, n);
      const page = Math.floor(Number(body?.page ?? 0));
      const slotIndex = Math.floor(Number(body?.slot_index ?? 0));
      const result = apprenticeEquip(player, page, slotIndex, n);
      if (!result.ok) return json(result);
      await db.savePlayer(accountId, 1, player);
      return json({ ok: true, apprentice: result.apprentice, player });
    });
  }

  // POST /apprentice/unequip
  if (route === '/apprentice/unequip' && request.method === 'POST') {
    return run(async (player, n) => {
      settleApprentice(player, n);
      const result = apprenticeUnequip(player, body?.slot, n);
      if (!result.ok) return json(result);
      await db.savePlayer(accountId, 1, player);
      return json({ ok: true, apprentice: result.apprentice, player });
    });
  }

  // POST /apprentice/dispatch/start
  if (route === '/apprentice/dispatch/start' && request.method === 'POST') {
    return run(async (player, n) => {
      settleApprentice(player, n);
      const mapId = Math.floor(Number(body?.map_id || 0));
      const targetMode = String(body?.target_mode || '');
      const targetValue = String(body?.target_value || '');
      const result = startApprenticeDispatch(player, mapId, targetMode, targetValue, n);
      if (!result.ok) return json(result);
      await db.savePlayer(accountId, 1, player);
      return json({ ok: true, apprentice: result.apprentice, player });
    });
  }

  // POST /apprentice/dispatch/stop
  if (route === '/apprentice/dispatch/stop' && request.method === 'POST') {
    return run(async (player, n) => {
      const result = stopApprenticeDispatch(player, n);
      if (!result.ok) return json(result);
      await db.savePlayer(accountId, 1, player);
      return json({ ok: true, apprentice: result.apprentice, report: result.report, player });
    });
  }

  return null;
}