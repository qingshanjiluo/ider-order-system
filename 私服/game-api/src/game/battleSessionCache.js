/**
 * 战斗会话缓存（D1 持久化版，替代原 server 的 redis 快照 + 内存 Map）
 *
 * 原实现：内存 Map 为主，redis 仅用于服务重启恢复。
 * Worker 无长驻内存 → 全部状态落 D1 表（battle_sessions / battle_commands / battle_events）。
 * 导出 API 与原版保持同名，但所有函数为 async。
 */

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

function numVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// 战斗事件/指令历史上限（与原版默认一致）
const BATTLE_EVENT_HISTORY_LIMIT = 240;
const BATTLE_COMMAND_HISTORY_LIMIT = 40;

/**
 * @param {object} env - Cloudflare env（含 DB 绑定）
 */
export function createBattleCache(env) {
  const DB = env.DB;

  async function q(sql, ...args) {
    try {
      return await DB.prepare(sql).bind(...args);
    } catch (e) {
      console.error('[battleCache] db error:', e?.message);
      return null;
    }
  }

  function rowToSession(row) {
    if (!row) return null;
    let state = {};
    let result = {};
    try { state = typeof row.state_json === 'string' ? JSON.parse(row.state_json) : (row.state_json || {}); } catch (e) { state = {}; }
    try { result = typeof row.result_json === 'string' ? JSON.parse(row.result_json) : (row.result_json || {}); } catch (e) { result = {}; }
    return {
      id: String(row.id),
      account_id: intVal(row.account_id, 0),
      map_id: row.map_id != null ? intVal(row.map_id, 0) : 0,
      enemy_id: row.enemy_id != null ? intVal(row.enemy_id, 0) : 0,
      started_at: intVal(row.started_at, 0),
      expires_at: intVal(row.expires_at, 0),
      status: String(row.status || 'active'),
      state,
      last_seq: intVal(row.last_seq, 0),
      result,
      ended_at: intVal(row.ended_at, 0),
      last_cmd_at: intVal(row.last_cmd_at, 0),
      rng_seed: intVal(row.rng_seed, 0),
      rng_cursor: intVal(row.rng_cursor, 0)
    };
  }

  async function getSession(id) {
    const row = await DB.prepare('SELECT * FROM battle_sessions WHERE id = ? LIMIT 1').bind(String(id || '')).first().catch(() => null);
    const s = rowToSession(row);
    if (!s) return null;
    if (s.expires_at <= nowSec()) {
      await deleteSession(id);
      return null;
    }
    return s;
  }

  async function getActiveSessionByAccount(accountId) {
    const aid = intVal(accountId, 0);
    const row = await DB.prepare(
      "SELECT * FROM battle_sessions WHERE account_id = ? AND status = 'active' ORDER BY started_at DESC, id DESC LIMIT 1"
    ).bind(aid).first().catch(() => null);
    const s = rowToSession(row);
    if (!s) return null;
    if (s.expires_at <= nowSec()) {
      await deleteSession(s.id);
      return null;
    }
    return s;
  }

  async function getAnySessionByAccount(accountId) {
    const aid = intVal(accountId, 0);
    // 优先返回最新 active 会话；无 active 则回退最新任意会话（供战报轮询）
    const row = await DB.prepare(
      "SELECT * FROM battle_sessions WHERE account_id = ? AND status = 'active' ORDER BY started_at DESC, id DESC LIMIT 1"
    ).bind(aid).first().catch(() => null);
    let s = rowToSession(row);
    if (s) {
      if (s.expires_at <= nowSec()) {
        await deleteSession(s.id);
        return null;
      }
      return s;
    }
    const anyRow = await DB.prepare(
      'SELECT * FROM battle_sessions WHERE account_id = ? ORDER BY started_at DESC, id DESC LIMIT 1'
    ).bind(aid).first().catch(() => null);
    s = rowToSession(anyRow);
    if (!s) return null;
    if (s.expires_at <= nowSec()) {
      await deleteSession(s.id);
      return null;
    }
    return s;
  }

  async function getAllActiveSessions() {
    const rows = await DB.prepare("SELECT * FROM battle_sessions WHERE status = 'active' AND expires_at > ?")
      .bind(nowSec()).all().catch(() => ({ results: [] }));
    return (rows.results || []).map(rowToSession).filter(Boolean);
  }

  async function getAllSessions() {
    const rows = await DB.prepare('SELECT * FROM battle_sessions').all().catch(() => ({ results: [] }));
    return (rows.results || []).map(rowToSession).filter(Boolean);
  }

  async function createSession(id, accountId, mapId, enemyId, ttlSeconds = 900, state = {}) {
    const now = nowSec();
    // 同账号旧活跃会话先删除（与原 createSession 语义一致）
    const oldSid = await getActiveSessionByAccount(accountId);
    if (oldSid && String(oldSid.id) !== String(id)) {
      await deleteSession(oldSid.id);
    }
    await DB.prepare(
      `INSERT INTO battle_sessions
        (id, account_id, map_id, enemy_id, started_at, expires_at, status, state_json, last_seq, result_json, ended_at, last_cmd_at, rng_seed, rng_cursor)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 0, '{}', 0, ?, ?, 0)`
    ).bind(
      String(id),
      intVal(accountId, 0),
      intVal(mapId, 0),
      intVal(enemyId, 0),
      now,
      now + intVal(ttlSeconds, 900),
      JSON.stringify(state || {}),
      now,
      Math.floor(Math.random() * 2147483647)
    ).run().catch((e) => {
      console.error('[battleCache] createSession error:', e?.message);
    });
    return String(id);
  }

  async function updateSessionState(id, { state, lastSeq, status, result, endedAt, lastCmdAt, expiresAt, rngCursor } = {}) {
    const cur = await getSession(id);
    if (!cur) return;
    const next = {
      state: state !== undefined && state !== null ? state : cur.state,
      last_seq: lastSeq !== undefined && lastSeq !== null ? Math.max(0, intVal(lastSeq, 0)) : cur.last_seq,
      status: status !== undefined && status !== null ? String(status) : cur.status,
      result: result !== undefined && result !== null ? result : cur.result,
      ended_at: endedAt !== undefined && endedAt !== null ? intVal(endedAt, 0) : cur.ended_at,
      last_cmd_at: lastCmdAt !== undefined && lastCmdAt !== null ? intVal(lastCmdAt, 0) : cur.last_cmd_at,
      expires_at: expiresAt !== undefined && expiresAt !== null ? intVal(expiresAt, 0) : cur.expires_at,
      rng_cursor: rngCursor !== undefined && rngCursor !== null ? intVal(rngCursor, 0) : cur.rng_cursor
    };
    await DB.prepare(
      `UPDATE battle_sessions SET state_json = ?, last_seq = ?, status = ?, result_json = ?,
         ended_at = ?, last_cmd_at = ?, expires_at = ?, rng_cursor = ? WHERE id = ?`
    ).bind(
      JSON.stringify(next.state),
      next.last_seq,
      next.status,
      JSON.stringify(next.result),
      next.ended_at,
      next.last_cmd_at,
      next.expires_at,
      next.rng_cursor,
      String(id)
    ).run().catch((e) => {
      console.error('[battleCache] updateSessionState error:', e?.message);
    });
  }

  async function finishSession(id, result = {}) {
    const s = await getSession(id);
    if (!s) return null;
    if (s.status === 'finished') return s;
    const now = nowSec();
    await DB.prepare(
      'UPDATE battle_sessions SET status = ?, result_json = ?, ended_at = ?, last_cmd_at = ?, expires_at = ? WHERE id = ?'
    ).bind('finished', JSON.stringify(result || {}), now, now, now + 120, String(id)).run().catch((e) => {
      console.error('[battleCache] finishSession error:', e?.message);
    });
    s.status = 'finished';
    s.result = result || {};
    s.ended_at = now;
    return s;
  }

  async function deleteSession(id) {
    const sid = String(id || '');
    if (!sid) return;
    await DB.prepare('DELETE FROM battle_sessions WHERE id = ?').bind(sid).run().catch(() => {});
    await DB.prepare('DELETE FROM battle_commands WHERE battle_id = ?').bind(sid).run().catch(() => {});
    await DB.prepare('DELETE FROM battle_events WHERE battle_id = ?').bind(sid).run().catch(() => {});
  }

  async function appendCommand(battleId, seq, command, applyResult = {}) {
    const sid = String(battleId || '');
    const seqN = intVal(seq, 0);
    if (!sid) return;
    await DB.prepare(
      `INSERT INTO battle_commands (battle_id, seq, command_json, apply_result_json, recv_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(battle_id, seq) DO UPDATE SET command_json = excluded.command_json, apply_result_json = excluded.apply_result_json`
    ).bind(sid, seqN, JSON.stringify(command || {}), JSON.stringify(applyResult || {}), nowSec()).run().catch((e) => {
      console.error('[battleCache] appendCommand error:', e?.message);
    });
    // 修剪超出上限的旧指令
    await trimCommands(sid, BATTLE_COMMAND_HISTORY_LIMIT);
  }

  async function trimCommands(battleId, limit) {
    const sid = String(battleId || '');
    const rows = await DB.prepare(
      'SELECT seq FROM battle_commands WHERE battle_id = ? ORDER BY seq DESC LIMIT ? OFFSET ?'
    ).bind(sid, intVal(limit, 40), 0).all().catch(() => ({ results: [] }));
    const kept = (rows.results || []).map((r) => intVal(r.seq, 0));
    if (kept.length < intVal(limit, 40)) return;
    const keepStr = kept.join(',');
    if (keepStr) {
      await DB.prepare(`DELETE FROM battle_commands WHERE battle_id = ? AND seq NOT IN (${keepStr})`).bind(sid).run().catch(() => {});
    }
  }

  async function getCommand(battleId, seq) {
    const row = await DB.prepare('SELECT * FROM battle_commands WHERE battle_id = ? AND seq = ? LIMIT 1')
      .bind(String(battleId || ''), intVal(seq, 0)).first().catch(() => null);
    if (!row) return null;
    let command = {};
    let applyResult = {};
    try { command = typeof row.command_json === 'string' ? JSON.parse(row.command_json) : (row.command_json || {}); } catch (e) { command = {}; }
    try { applyResult = typeof row.apply_result_json === 'string' ? JSON.parse(row.apply_result_json) : (row.apply_result_json || {}); } catch (e) { applyResult = {}; }
    return {
      battle_id: String(row.battle_id),
      seq: intVal(row.seq, 0),
      command,
      apply_result: applyResult,
      recv_at: intVal(row.recv_at, 0)
    };
  }

  async function appendEvents(battleId, startIndex, events) {
    const list = Array.isArray(events) ? events : [];
    if (list.length <= 0) return 0;
    const sid = String(battleId || '');
    const now = nowSec();
    const start = Math.max(1, intVal(startIndex, 1));
    const stmt = DB.prepare(
      `INSERT OR REPLACE INTO battle_events (battle_id, event_index, event_json, created_at) VALUES (?, ?, ?, ?)`
    );
    try {
      await DB.batch(
        list.map((ev, i) => stmt.bind(sid, start + i, JSON.stringify(ev || {}), now))
      );
    } catch (e) {
      console.error('[battleCache] appendEvents error:', e?.message);
    }
    // 修剪旧事件
    await trimEvents(sid, BATTLE_EVENT_HISTORY_LIMIT);
    return list.length;
  }

  async function listEventsSince(battleId, afterIndex = 0, limit = 200) {
    const sid = String(battleId || '');
    const after = Math.max(0, intVal(afterIndex, 0));
    const maxN = Math.max(1, Math.min(500, intVal(limit, 200)));
    const rows = await DB.prepare(
      'SELECT event_index, event_json, created_at FROM battle_events WHERE battle_id = ? AND event_index > ? ORDER BY event_index ASC LIMIT ?'
    ).bind(sid, after, maxN).all().catch(() => ({ results: [] }));
    return (rows.results || []).map((row) => {
      let ev = {};
      try { ev = typeof row.event_json === 'string' ? JSON.parse(row.event_json) : (row.event_json || {}); } catch (e) { ev = {}; }
      return {
        event_index: intVal(row.event_index, 0),
        event: ev,
        created_at: intVal(row.created_at, 0)
      };
    });
  }

  async function getEventWindowInfo(battleId) {
    const sid = String(battleId || '');
    const rows = await DB.prepare(
      'SELECT event_index FROM battle_events WHERE battle_id = ? ORDER BY event_index ASC LIMIT 1'
    ).bind(sid).all().catch(() => ({ results: [] }));
    if (!rows.results || rows.results.length <= 0) return { firstIndex: 0, count: 0 };
    return { firstIndex: intVal(rows.results[0].event_index, 0), count: rows.results.length };
  }

  async function trimEvents(battleId, limit = BATTLE_EVENT_HISTORY_LIMIT) {
    const sid = String(battleId || '');
    const maxN = intVal(limit, BATTLE_EVENT_HISTORY_LIMIT);
    // 找出要保留的最小 event_index（保留最近 maxN 条）
    const rows = await DB.prepare(
      'SELECT event_index FROM battle_events WHERE battle_id = ? ORDER BY event_index DESC LIMIT ? OFFSET ?'
    ).bind(sid, 1, Math.max(0, maxN)).all().catch(() => ({ results: [] }));
    if (!rows.results || rows.results.length <= 0) return;
    const keepAfter = intVal(rows.results[0].event_index, 0);
    if (keepAfter > 0) {
      await DB.prepare('DELETE FROM battle_events WHERE battle_id = ? AND event_index < ?').bind(sid, keepAfter).run().catch(() => {});
    }
  }

  // ── 离线战报（原版存内存，Worker 简化为 D1 单行表，未实现时返回空） ──
  async function getOfflineReport() { return null; }
  async function accumulateOfflineReport() { return null; }
  async function activateOfflineStatMode() { return false; }
  async function isOfflineStatModeActive() { return false; }
  async function deactivateOfflineStatMode() { return null; }
  async function settleOfflineStatProjection() { return null; }
  async function getAndClearOfflineReport() { return null; }
  async function ackOfflineReport() { return null; }
  async function initPersistence() { return true; }
  async function flushPersistence() { return null; }
  async function getStats() {
    const count = await DB.prepare('SELECT COUNT(*) AS c FROM battle_sessions').first().catch(() => ({ c: 0 }));
    return { sessions: intVal(count?.c, 0) };
  }

  return {
    createSession,
    getSession,
    getActiveSessionByAccount,
    getAnySessionByAccount,
    getAllActiveSessions,
    getAllSessions,
    initPersistence,
    flushPersistence,
    updateSessionState,
    finishSession,
    deleteSession,
    appendCommand,
    getCommand,
    appendEvents,
    listEventsSince,
    getEventWindowInfo,
    trimEvents,
    getOfflineReport,
    accumulateOfflineReport,
    activateOfflineStatMode,
    isOfflineStatModeActive,
    deactivateOfflineStatMode,
    settleOfflineStatProjection,
    getAndClearOfflineReport,
    ackOfflineReport,
    getStats
  };
}