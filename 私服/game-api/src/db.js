/**
 * D1 数据库封装层（game-api）
 * 提供与原 server/dbAsync.js 兼容的方法名，使迁移的战斗/玩法逻辑可复用。
 *
 * 存储约定：玩家完整数据（含 inventory/equipment/cave/talents 等）
 * 统一存 players.data 列的单一 JSON（原 server 分列存储的优化在 D1 不需要）。
 *
 * 用法：每个请求先 loadPlayer(accountId)，修改后 savePlayer(accountId, player)。
 */

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/**
 * 创建 D1 封装实例。
 * @param {*} env Cloudflare env（含 DB 绑定）
 */
export function createDb(env) {
  const DB = env.DB;

  async function getPlayerByAccountId(accountId) {
    const row = await DB.prepare('SELECT data FROM players WHERE account_id = ? LIMIT 1')
      .bind(intVal(accountId, 0)).first().catch(() => null);
    if (!row) return null;
    try {
      const p = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
      if (p && typeof p === 'object') {
        // 补齐基础字段
        if (!p.time_state) p.time_state = { last_activity_at: nowSec(), last_tick_at: nowSec(), universal_time_seconds: 0, oct_seconds: 0, oct_paused: false };
        return p;
      }
      return null;
    } catch (e) {
      console.error('[db] getPlayerByAccountId parse error', e?.message);
      return null;
    }
  }

  async function savePlayer(accountId, slot, data) {
    return _savePlayerRaw(accountId, slot, data);
  }

  async function savePlayerImmediate(accountId, slot, data, options = {}) {
    return _savePlayerRaw(accountId, slot, data, options);
  }

  async function _savePlayerRaw(accountId, slot, data, options = {}) {
    const finalData = data && typeof data === 'object' ? JSON.stringify(data) : String(data || '{}');
    const ts = nowSec();
    try {
      await DB.prepare(
        'INSERT INTO players (account_id, slot, data, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, slot = excluded.slot, updated_at = excluded.updated_at'
      ).bind(intVal(accountId, 0), intVal(slot, 1), finalData, ts).run();
    } catch (e) {
      // 如实上报失败，避免上层误以为保存成功而清除任务/标记邮件已领取（物品丢失根因）
      console.error('[db] savePlayer error', e?.message);
      return { conflict: true, skipped: true };
    }
    return { queued: true };
  }

  // 账号查询
  async function getAccountById(accountId) {
    return DB.prepare('SELECT * FROM accounts WHERE id = ? LIMIT 1').bind(intVal(accountId, 0)).first().catch(() => null);
  }
  async function getAccountByUsername(username) {
    return DB.prepare('SELECT * FROM accounts WHERE username = ? LIMIT 1').bind(String(username || '')).first().catch(() => null);
  }
  async function getAccountEmail(accountId) {
    const r = await DB.prepare('SELECT email, email_verified FROM accounts WHERE id = ? LIMIT 1').bind(intVal(accountId, 0)).first().catch(() => null);
    if (!r) return null;
    return { email: r.email || '', verified: !!r.email_verified };
  }

  // 名称查重
  async function isPlayerNameTaken(name) {
    const row = await DB.prepare('SELECT id FROM players WHERE json_extract(data, \'$.name\') = ? LIMIT 1').bind(String(name || '')).first().catch(() => null);
    return !!row;
  }

  // 玩家状态
  async function updatePlayerLastActivity(accountId) {
    await DB.prepare('UPDATE players SET last_activity_at = ? WHERE account_id = ?').bind(nowSec(), intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  // 自动战斗意图（persistAutoBattleIntent）
  async function updatePlayerAutoBattleIntent(accountId, enabled, mapId) {
    const p = await getPlayerByAccountId(accountId);
    if (!p) return null;
    p.auto_battle_enabled = !!enabled;
    if (mapId && Number(mapId) > 0) p.auto_battle_map_id = Math.max(1, Math.floor(Number(mapId) || 1));
    await _savePlayerRaw(accountId, 1, p);
    return p;
  }

  // 调息截止（clampRestUntil）
  async function updatePlayerRestUntil(accountId, restUntil) {
    const p = await getPlayerByAccountId(accountId);
    if (!p) return null;
    p.rest_until = Math.max(0, intVal(restUntil, 0));
    await _savePlayerRaw(accountId, 1, p);
    return p;
  }

  // 玩家状态查询（战斗循环等用）
  async function getPlayerRuntimeState(accountId) {
    const p = await getPlayerByAccountId(accountId);
    if (!p) return null;
    return {
      account_id: intVal(accountId, 0),
      auto_battle_enabled: p.auto_battle_enabled === true || p.auto_battle_enabled === 1,
      auto_battle_map_id: Math.max(1, Number(p.auto_battle_map_id) || Number(p.current_map_id) || 1),
      current_map_id: Math.max(1, Number(p.current_map_id) || 1),
      rest_until: Math.max(0, Number(p.rest_until) || 0),
      last_activity_at: Math.max(0, Number(p.time_state?.last_activity_at) || 0)
    };
  }

  // 封禁相关（简化：直接查 accounts）
  async function isCheatScanExempt() { return false; }
  async function setAccountBanned(accountId, until, reason) {
    await DB.prepare('UPDATE accounts SET is_banned = 1, ban_expires_at = ?, ban_reason = ? WHERE id = ?')
      .bind(intVal(until, 0), String(reason || ''), intVal(accountId, 0)).run().catch(() => {});
    return null;
  }
  async function invalidatePlayerReadCache() { return null; }

  // ── 副本 ──────────────────────────────────────────────
  function getDateKey() {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 480); // 粗略东八区
    return d.toISOString().slice(0, 10);
  }

  async function getDungeonCompletionsToday(accountId, dungeonId) {
    const row = await DB.prepare('SELECT completions FROM dungeon_completions WHERE account_id = ? AND dungeon_id = ? AND date = ?')
      .bind(intVal(accountId, 0), intVal(dungeonId, 0), getDateKey()).first().catch(() => null);
    return row ? Number(row.completions) || 0 : 0;
  }

  async function incrementDungeonCompletions(accountId, dungeonId) {
    const key = getDateKey();
    const row = await DB.prepare('SELECT completions FROM dungeon_completions WHERE account_id = ? AND dungeon_id = ? AND date = ?')
      .bind(intVal(accountId, 0), intVal(dungeonId, 0), key).first().catch(() => null);
    if (row) {
      await DB.prepare('UPDATE dungeon_completions SET completions = completions + 1 WHERE account_id = ? AND dungeon_id = ? AND date = ?')
        .bind(intVal(accountId, 0), intVal(dungeonId, 0), key).run().catch(() => {});
      return Number(row.completions) + 1;
    }
    await DB.prepare('INSERT INTO dungeon_completions (account_id, dungeon_id, date, completions) VALUES (?, ?, ?, 1)')
      .bind(intVal(accountId, 0), intVal(dungeonId, 0), key).run().catch(() => {});
    return 1;
  }

  // 副本队伍（D1 单次请求内串行，天然避免并发越过上限）
  function generateTeamCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
  const DUNGEON_TEAM_MAX = 3;

  function _pickDungeonTeamMemberRows(rows, leaderAccountId) {
    const all = Array.isArray(rows) ? rows : [];
    if (all.length <= DUNGEON_TEAM_MAX) return all;
    const leaderId = Number(leaderAccountId) || 0;
    const picked = [];
    const used = new Set();
    if (leaderId > 0) {
      const leaderRow = all.find((r) => Number(r?.account_id) === leaderId);
      if (leaderRow) { picked.push(leaderRow); used.add(leaderId); }
    }
    for (const row of all) {
      const aid = Number(row?.account_id) || 0;
      if (aid <= 0 || used.has(aid)) continue;
      picked.push(row);
      used.add(aid);
      if (picked.length >= DUNGEON_TEAM_MAX) break;
    }
    return picked;
  }

  async function _trimDungeonTeamMembersToMax(teamCode, leaderAccountId) {
    const code = String(teamCode || '').toUpperCase().trim();
    if (!code) return;
    const rows = await DB.prepare('SELECT account_id, joined_at FROM dungeon_team_members WHERE team_code = ? ORDER BY joined_at ASC, account_id ASC')
      .bind(code).all().catch(() => ({ results: [] }));
    const list = rows.results || [];
    if (list.length <= DUNGEON_TEAM_MAX) return;
    const keepRows = _pickDungeonTeamMemberRows(list, leaderAccountId);
    const keepSet = new Set(keepRows.map((r) => Number(r?.account_id) || 0).filter((v) => v > 0));
    for (const row of list) {
      const aid = Number(row?.account_id) || 0;
      if (aid <= 0 || keepSet.has(aid)) continue;
      await DB.prepare('DELETE FROM dungeon_team_members WHERE team_code = ? AND account_id = ?').bind(code, aid).run().catch(() => {});
    }
  }

  async function createDungeonTeam(leaderAccountId, dungeonId, ttlSeconds = 1800) {
    const code = generateTeamCode();
    const now = nowSec();
    const ttl = Math.max(60, Math.floor(Number(ttlSeconds) || 1800));
    await DB.prepare('INSERT INTO dungeon_teams (team_code, leader_account_id, dungeon_id, expires_at) VALUES (?, ?, ?, ?)')
      .bind(code, intVal(leaderAccountId, 0), intVal(dungeonId, 0), now + ttl).run().catch(() => {});
    await DB.prepare('INSERT OR REPLACE INTO dungeon_team_members (team_code, account_id) VALUES (?, ?)')
      .bind(code, intVal(leaderAccountId, 0)).run().catch(() => {});
    return code;
  }

  async function touchDungeonTeam(teamCode) {
    await DB.prepare('UPDATE dungeon_teams SET expires_at = ? WHERE team_code = ?')
      .bind(nowSec() + 1800, String(teamCode || '').toUpperCase().trim()).run().catch(() => {});
  }

  async function joinDungeonTeam(teamCode, accountId) {
    const code = String(teamCode || '').toUpperCase().trim();
    const aid = intVal(accountId, 0);
    if (!code || aid <= 0) return { ok: false, error: '参数错误' };
    const team = await DB.prepare("SELECT * FROM dungeon_teams WHERE team_code = ? AND expires_at > strftime('%s', 'now')")
      .bind(code).first().catch(() => null);
    if (!team) return { ok: false, error: '队伍不存在或已过期' };
    await _trimDungeonTeamMembersToMax(code, team.leader_account_id);
    const members = await DB.prepare('SELECT account_id FROM dungeon_team_members WHERE team_code = ? ORDER BY joined_at ASC, account_id ASC')
      .bind(code).all().catch(() => ({ results: [] }));
    const list = members.results || [];
    const alreadyIn = list.some((m) => Number(m.account_id) === aid);
    if (!alreadyIn && list.length >= DUNGEON_TEAM_MAX) {
      return { ok: false, error: '队伍已满（最多3人）' };
    }
    await DB.prepare('INSERT OR REPLACE INTO dungeon_team_members (team_code, account_id) VALUES (?, ?)').bind(code, aid).run().catch(() => {});
    await touchDungeonTeam(code);
    return { ok: true, dungeonId: Number(team.dungeon_id) || 0 };
  }

  async function getDungeonTeam(teamCode) {
    const code = String(teamCode || '').toUpperCase().trim();
    const team = await DB.prepare("SELECT * FROM dungeon_teams WHERE team_code = ? AND expires_at > strftime('%s', 'now')")
      .bind(code).first().catch(() => null);
    if (!team) return null;
    await _trimDungeonTeamMembersToMax(code, team.leader_account_id);
    const members = await DB.prepare('SELECT account_id, joined_at FROM dungeon_team_members WHERE team_code = ? ORDER BY joined_at ASC, account_id ASC')
      .bind(code).all().catch(() => ({ results: [] }));
    const limitedMembers = _pickDungeonTeamMemberRows(members.results || [], team.leader_account_id);
    return { ...team, members: limitedMembers.map((m) => Number(m.account_id) || 0).filter((v) => v > 0) };
  }

  async function leaveDungeonTeam(teamCode, accountId) {
    await DB.prepare('DELETE FROM dungeon_team_members WHERE team_code = ? AND account_id = ?')
      .bind(String(teamCode || '').toUpperCase().trim(), intVal(accountId, 0)).run().catch(() => {});
    await touchDungeonTeam(String(teamCode || ''));
  }

  async function getMyDungeonTeam(accountId) {
    const row = await DB.prepare('SELECT team_code FROM dungeon_team_members WHERE account_id = ?')
      .bind(intVal(accountId, 0)).first().catch(() => null);
    if (!row) return null;
    return getDungeonTeam(row.team_code);
  }

  // ── 副本战斗会话（dungeon_battle_sessions） ─────────────
  async function saveDungeonBattle(battleId, accountId, dungeonId, state) {
    const now = nowSec();
    await DB.prepare(`
      INSERT OR REPLACE INTO dungeon_battle_sessions (id, account_id, dungeon_id, state_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(String(battleId || ''), intVal(accountId, 0), intVal(dungeonId, 0), JSON.stringify(state || {}), now).run().catch((e) => {
      console.error('[db] saveDungeonBattle error', e?.message);
    });
    return null;
  }

  async function getDungeonBattle(battleId) {
    const row = await DB.prepare('SELECT * FROM dungeon_battle_sessions WHERE id = ? LIMIT 1')
      .bind(String(battleId || '')).first().catch(() => null);
    if (!row) return null;
    let state = {};
    try { state = JSON.parse(row.state_json || '{}'); } catch (_) {}
    return {
      id: row.id,
      account_id: row.account_id,
      dungeon_id: row.dungeon_id,
      state,
      created_at: row.created_at
    };
  }

  async function deleteDungeonBattle(battleId) {
    await DB.prepare('DELETE FROM dungeon_battle_sessions WHERE id = ?')
      .bind(String(battleId || '')).run().catch(() => {});
    return null;
  }

  async function deleteAllDungeonBattlesForAccount(accountId) {
    await DB.prepare('DELETE FROM dungeon_battle_sessions WHERE account_id = ?')
      .bind(intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  async function cleanupExpiredDungeonBattles() {
    const cutoff = nowSec() - 30 * 60; // 30 分钟前的会话视为过期
    await DB.prepare('DELETE FROM dungeon_battle_sessions WHERE created_at < ?')
      .bind(cutoff).run().catch(() => {});
    return null;
  }

  // ── 城池斗法（city_duel / duel_rank） ──────────────────
  // 全部玩家简况（列表/排名用；name 为 JSON 文本，去掉引号）
  async function listPlayerBriefAll() {
    const rows = await DB.prepare(`
      SELECT account_id,
             json_extract(data, '$.name') AS name,
             json_extract(data, '$.level') AS level,
             json_extract(data, '$.sect_id') AS sect_id,
             json_extract(data, '$.duel_rank_score') AS duel_rank_score
      FROM players
    `).all().catch(() => ({ results: [] }));
    return (rows.results || []).map((r) => {
      let raw = (r.name != null && r.name !== '') ? String(r.name).trim() : '';
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).replace(/\\"/g, '"');
      return { ...r, name: raw };
    });
  }

  function _getUtc8DayRangeSec(nowSecV = Math.floor(Date.now() / 1000)) {
    const shift = 8 * 3600;
    const dayStart = Math.floor((Math.max(0, Number(nowSecV) || 0) + shift) / 86400) * 86400 - shift;
    return { dayStart, dayEnd: dayStart + 86400 };
  }

  // 今日挑战次数（UTC+8 日；targetAccountId 可选，不传则只查 total）
  async function countCityDuelChallengesToday(challengerAccountId, targetAccountId = null) {
    const aid = intVal(challengerAccountId, 0);
    if (aid <= 0) return { total: 0, perTarget: 0 };
    const { dayStart, dayEnd } = _getUtc8DayRangeSec();
    const totalRow = await DB.prepare(`
      SELECT COUNT(1) AS c FROM city_duel_challenges
      WHERE challenger_account_id = ? AND created_at >= ? AND created_at < ?
    `).bind(aid, dayStart, dayEnd).first().catch(() => null);
    const total = Math.max(0, intVal(totalRow?.c, 0));
    if (targetAccountId == null) return { total, perTarget: 0 };
    const tid = intVal(targetAccountId, 0);
    const targetRow = await DB.prepare(`
      SELECT COUNT(1) AS c FROM city_duel_challenges
      WHERE challenger_account_id = ? AND target_account_id = ? AND created_at >= ? AND created_at < ?
    `).bind(aid, tid, dayStart, dayEnd).first().catch(() => null);
    return { total, perTarget: Math.max(0, intVal(targetRow?.c, 0)) };
  }

  async function insertCityDuelChallenge(challengerAccountId, targetAccountId) {
    await DB.prepare('INSERT INTO city_duel_challenges (challenger_account_id, target_account_id, created_at) VALUES (?, ?, ?)')
      .bind(intVal(challengerAccountId, 0), intVal(targetAccountId, 0), nowSec()).run().catch(() => {});
    return null;
  }

  async function createCityDuelLog(payload) {
    const res = await DB.prepare(`
      INSERT INTO city_duel_logs
        (challenger_account_id, target_account_id, winner_account_id,
         challenger_name, target_name,
         challenger_level, target_level,
         challenger_sect_name, target_sect_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      intVal(payload?.challenger_account_id, 0),
      intVal(payload?.target_account_id, 0),
      intVal(payload?.winner_account_id, 0),
      String(payload?.challenger_name || ''),
      String(payload?.target_name || ''),
      Math.max(1, intVal(payload?.challenger_level, 1)),
      Math.max(1, intVal(payload?.target_level, 1)),
      String(payload?.challenger_sect_name || '散修'),
      String(payload?.target_sect_name || '散修'),
      nowSec()
    ).run().catch((e) => {
      console.error('[db] createCityDuelLog error', e?.message);
      return null;
    });
    return Number(res?.meta?.last_row_id || 0);
  }

  async function listCityDuelLogsByAccount(accountId, { page = 1, pageSize = 20, role = 'all' } = {}) {
    const aid = intVal(accountId, 0);
    const p = Math.max(1, intVal(page, 1));
    const ps = Math.max(1, Math.min(100, intVal(pageSize, 20)));
    const offset = (p - 1) * ps;
    let where = 'WHERE (challenger_account_id = ? OR target_account_id = ?)';
    const args = [aid, aid];
    if (role === 'challenger') {
      where += ' AND challenger_account_id = ?';
      args.push(aid);
    } else if (role === 'target') {
      where += ' AND target_account_id = ?';
      args.push(aid);
    }
    const list = await DB.prepare(`
      SELECT *
      FROM city_duel_logs
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).bind(...args, ps, offset).all().catch(() => ({ results: [] }));
    const totalRow = await DB.prepare(`
      SELECT COUNT(1) AS c
      FROM city_duel_logs
      ${where}
    `).bind(...args).first().catch(() => null);
    return {
      list: list.results || [],
      total: Math.max(0, intVal(totalRow?.c, 0)),
      page: p,
      pageSize: ps
    };
  }

  async function getDuelRankLastSettledPeriod() {
    const r = await DB.prepare("SELECT value FROM duel_rank_state WHERE key = 'last_settled_period' LIMIT 1")
      .first().catch(() => null);
    return Number(r?.value ?? -1);
  }

  async function setDuelRankLastSettledPeriod(periodIndex) {
    await DB.prepare("INSERT OR REPLACE INTO duel_rank_state (key, value) VALUES ('last_settled_period', ?)")
      .bind(Math.floor(Number(periodIndex) || -1)).run().catch(() => {});
    return null;
  }

  async function getTopDuelRankAccount() {
    const row = await DB.prepare(`
      SELECT account_id,
             COALESCE(CAST(json_extract(data, '$.duel_rank_score') AS INTEGER), 1000) AS duel_rank_score
      FROM players
      ORDER BY duel_rank_score DESC, account_id ASC
      LIMIT 1
    `).first().catch(() => null);
    if (!row) return null;
    return {
      account_id: Number(row.account_id || 0),
      duel_rank_score: Number(row.duel_rank_score || 1000)
    };
  }

  async function resetAllDuelRankScores(score = 1000) {
    const target = Math.max(0, Math.floor(Number(score) || 1000));
    await DB.prepare(`
      UPDATE players
      SET data = json_set(COALESCE(data, '{}'), '$.duel_rank_score', ?),
          updated_at = strftime('%s','now')
    `).bind(target).run().catch(() => {});
    return null;
  }

  // ── 擂台赛状态 ──────────────────────────────────────────────
  async function getArenaTournamentState() {
    const row = await DB.prepare("SELECT value FROM duel_rank_state WHERE key = 'arena_tournament_state' LIMIT 1").first().catch(() => null);
    if (!row || !row.value) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  }

  async function setArenaTournamentState(state) {
    await DB.prepare("INSERT OR REPLACE INTO duel_rank_state (key, value) VALUES ('arena_tournament_state', ?)")
      .bind(JSON.stringify(state)).run().catch(e => console.error('[db] setArenaTournamentState', e?.message));
  }

  async function getArenaTournamentHistory(limit = 10) {
    const row = await DB.prepare("SELECT value FROM duel_rank_state WHERE key = 'arena_tournament_history' LIMIT 1").first().catch(() => null);
    if (!row || !row.value) return [];
    try {
      const arr = JSON.parse(row.value);
      return Array.isArray(arr) ? arr.slice(0, limit) : [];
    } catch { return []; }
  }

  // ── 交易所 ──────────────────────────────────────────────
  async function createExchangeListing(sellerAccountId, payload) {
    const now = nowSec();
    const expireHours = Math.max(1, Number(env.EXCHANGE_LISTING_EXPIRE_HOURS) || 72);
    const expiresAt = now + Math.floor(expireHours * 3600);
    const res = await DB.prepare(
      `INSERT INTO exchange_listings
        (seller_account_id, item_id, item_name, item_snapshot_json, unit_price, quantity_total, quantity_left, status, side, tax_per_unit, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`
    ).bind(
      intVal(sellerAccountId, 0),
      Math.floor(Number(payload.item_id) || 0),
      String(payload.item_name || '未知物品'),
      JSON.stringify(payload.item_snapshot || {}),
      Math.floor(Number(payload.unit_price) || 0),
      Math.floor(Number(payload.quantity_total) || 1),
      Math.floor(Number(payload.quantity_left) || Number(payload.quantity_total) || 1),
      String(payload.side || 'sell'),
      Math.floor(Number(payload.tax_per_unit) || 0),
      now, now, expiresAt
    ).run().catch((e) => {
      console.error('[db] createExchangeListing error', e?.message);
      return null;
    });
    return Number(res?.meta?.last_row_id || 0);
  }

  async function getExchangeListingById(id) {
    return DB.prepare('SELECT * FROM exchange_listings WHERE id=?').bind(intVal(id, 0)).first().catch(() => null);
  }

  async function listExchangeListings({
    page = 1,
    pageSize = 20,
    sellerAccountId = 0,
    myOnly = false,
    side = 'all',
    itemId = 0,
    keyword = '',
    minPrice = 0,
    maxPrice = 0,
    quality = 0,
    category = '',
    subtype = '',
    sortBy = 'price_asc'
  } = {}) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
    const offset = (p - 1) * ps;
    const qualityInt = Math.max(0, Math.trunc(Number(quality) || 0));
    const categoryStr = String(category || '').trim().toLowerCase();
    const subtypeStr = String(subtype || '').trim();
    const weaponSubtypes = new Set(['剑', '刀', '长兵', '弓', '拳爪', '音律', '节杖']);
    const armorSlots = new Set(['head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back']);
    let where = "WHERE l.status IN ('open','partial') AND l.quantity_left > 0 AND l.expires_at > strftime('%s', 'now')";
    const args = [];
    if (myOnly && Number(sellerAccountId) > 0) {
      where += ' AND l.seller_account_id = ?';
      args.push(Number(sellerAccountId));
    }
    if (side === 'sell' || side === 'buy') {
      where += ' AND l.side = ?';
      args.push(side);
    }
    if (Number(itemId) > 0) {
      where += ' AND l.item_id = ?';
      args.push(Number(itemId));
    }
    if (String(keyword || '').trim().length > 0) {
      where += ' AND l.item_name LIKE ?';
      args.push(`%${String(keyword).trim()}%`);
    }
    if (Number(minPrice) > 0) {
      where += ' AND l.unit_price >= ?';
      args.push(Number(minPrice));
    }
    if (Number(maxPrice) > 0) {
      where += ' AND l.unit_price <= ?';
      args.push(Number(maxPrice));
    }
    if (qualityInt > 0) {
      where += ` AND CAST(COALESCE(
        json_extract(l.item_snapshot_json, '$.quality'),
        json_extract(l.item_snapshot_json, '$.equipment_criteria.min_quality'),
        json_extract(l.item_snapshot_json, '$.equipment_criteria.minQuality'),
        0
      ) AS INTEGER) = ?`;
      args.push(qualityInt);
    }

    if (categoryStr === 'equip') {
      const equipTypes = ['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back'];
      where += ` AND (
        json_type(json_extract(l.item_snapshot_json, '$.equipment_criteria')) = 'object'
        OR json_extract(l.item_snapshot_json, '$.type') IN (${equipTypes.map(() => '?').join(',')})
      )`;
      args.push(...equipTypes);
    } else if (categoryStr === 'material') {
      where += ` AND json_extract(l.item_snapshot_json, '$.type') = 'material'`;
    } else if (categoryStr === 'herb') {
      where += ` AND json_extract(l.item_snapshot_json, '$.type') IN ('herb', 'medicine')`;
    } else if (categoryStr === 'consumable') {
      where += ` AND json_extract(l.item_snapshot_json, '$.type') = 'consumable'`;
    } else if (categoryStr === 'book') {
      where += ` AND json_extract(l.item_snapshot_json, '$.type') = 'book'`;
    } else if (categoryStr === 'talisman') {
      where += ` AND json_extract(l.item_snapshot_json, '$.type') = 'talisman'`;
    }

    if (subtypeStr.length > 0) {
      if (categoryStr === 'equip') {
        if (weaponSubtypes.has(subtypeStr)) {
          where += ` AND (
            (
              COALESCE(json_extract(l.item_snapshot_json, '$.type'), '') = 'weapon'
              AND COALESCE(json_extract(l.item_snapshot_json, '$.subtype'), '') = ?
            )
            OR (
              COALESCE(json_extract(l.item_snapshot_json, '$.equipment_criteria.slot'), '') = 'weapon'
              AND COALESCE(json_extract(l.item_snapshot_json, '$.equipment_criteria.subtype'), '') = ?
            )
          )`;
          args.push(subtypeStr, subtypeStr);
        } else if (armorSlots.has(subtypeStr)) {
          where += ` AND (
            COALESCE(json_extract(l.item_snapshot_json, '$.type'), '') = ?
            OR COALESCE(json_extract(l.item_snapshot_json, '$.equipment_criteria.slot'), '') = ?
          )`;
          args.push(subtypeStr, subtypeStr);
        } else {
          where += ` AND COALESCE(
            json_extract(l.item_snapshot_json, '$.subtype'),
            json_extract(l.item_snapshot_json, '$.equipment_criteria.subtype'),
            ''
          ) = ?`;
          args.push(subtypeStr);
        }
      } else if (categoryStr === 'material') {
        where += ` AND COALESCE(json_extract(l.item_snapshot_json, '$.material'), json_extract(l.item_snapshot_json, '$.equipment_criteria.material'), '') = ?`;
        args.push(subtypeStr);
      }
    }
    let orderBy = 'ORDER BY l.unit_price ASC, l.created_at ASC';
    if (side === 'buy') orderBy = 'ORDER BY l.item_name ASC, l.unit_price DESC, l.created_at DESC';
    if (sortBy === 'price_desc') orderBy = 'ORDER BY l.unit_price DESC, l.created_at DESC';
    if (sortBy === 'newest') orderBy = 'ORDER BY l.created_at DESC, l.id DESC';
    if (sortBy === 'oldest') orderBy = 'ORDER BY l.created_at ASC, l.id ASC';
    const rows = await DB.prepare(`
      SELECT l.*, a.username AS seller_username, json_extract(p.data, '$.name') AS seller_player_name
      FROM exchange_listings l
      LEFT JOIN accounts a ON a.id = l.seller_account_id
      LEFT JOIN players p ON p.account_id = l.seller_account_id
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(...args, ps, offset).all().catch(() => ({ results: [] }));
    const totalRow = await DB.prepare(`
      SELECT COUNT(1) AS c
      FROM exchange_listings l
      ${where}
    `).bind(...args).first().catch(() => null);
    return {
      list: rows.results || [],
      total: Number(totalRow?.c || 0),
      page: p,
      pageSize: ps
    };
  }

  async function listMyExchangeListings(accountId, { includeClosed = false } = {}) {
    const where = includeClosed ? '' : "AND l.status IN ('open','partial')";
    const rows = await DB.prepare(`
      SELECT l.*, a.username AS seller_username, json_extract(p.data, '$.name') AS seller_player_name
      FROM exchange_listings l
      LEFT JOIN accounts a ON a.id = l.seller_account_id
      LEFT JOIN players p ON p.account_id = l.seller_account_id
      WHERE l.seller_account_id = ?
      ${where}
      ORDER BY l.created_at DESC
    `).bind(intVal(accountId, 0)).all().catch(() => ({ results: [] }));
    return (rows.results || []).map((r) => {
      let raw = (r.seller_player_name != null && r.seller_player_name !== '') ? String(r.seller_player_name).trim() : '';
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
        raw = raw.slice(1, -1).replace(/\\"/g, '"');
      }
      return { ...r, seller_player_name: raw || r.seller_username || '?' };
    });
  }

  // 原子扣减库存，避免超卖。返回更新后的行或 null（库存不足/不存在）
  async function updateExchangeListingAfterTrade(listingId, quantityBought) {
    const qty = Math.max(1, Math.floor(Number(quantityBought) || 0));
    const r = await DB.prepare(`
      UPDATE exchange_listings
      SET status = CASE WHEN quantity_left <= ? THEN 'filled' ELSE 'partial' END,
          quantity_left = quantity_left - ?,
          updated_at = strftime('%s','now')
      WHERE id = ? AND quantity_left >= ? AND status IN ('open','partial')
    `).bind(qty, qty, intVal(listingId, 0), qty).run().catch(() => null);
    if (!r || Number(r?.meta?.changes) === 0) return null;
    return getExchangeListingById(listingId);
  }

  async function cancelExchangeListing(listingId) {
    const row = await getExchangeListingById(listingId);
    if (!row) return null;
    await DB.prepare(`
      UPDATE exchange_listings
      SET status='cancelled', updated_at=strftime('%s','now')
      WHERE id=?
    `).bind(intVal(listingId, 0)).run().catch(() => null);
    return row;
  }

  async function repairExchangeListingStatuses() {
    await DB.prepare(`
      UPDATE exchange_listings
      SET status='partial', updated_at=strftime('%s','now')
      WHERE status='filled' AND quantity_left > 0
    `).run().catch(() => null);
    await DB.prepare(`
      UPDATE exchange_listings
      SET status='filled', updated_at=strftime('%s','now')
      WHERE status IN ('open','partial') AND quantity_left <= 0
    `).run().catch(() => null);
  }

  async function settleExpiredExchangeListings() {
    await repairExchangeListingStatuses();
    const rows = await DB.prepare(`
      SELECT *
      FROM exchange_listings
      WHERE status IN ('open','partial')
        AND quantity_left > 0
        AND expires_at > 0
        AND expires_at <= strftime('%s','now')
    `).all().catch(() => ({ results: [] }));
    const list = rows.results || [];
    for (const row of list) {
      const qty = Number(row.quantity_left) || 0;
      const side = String(row.side || 'sell');
      if (side === 'buy') {
        let snapshot;
        try { snapshot = JSON.parse(row.item_snapshot_json || '{}'); } catch (_) { snapshot = {}; }
        const barter = snapshot?.barter && snapshot.barter.enabled ? snapshot.barter : null;
        if (barter) {
          const payItemId = Number(barter?.pay_item_id) || 0;
          const payItemCount = Math.max(0, Math.floor(Number(barter?.pay_unit_count) || 0) * qty);
          const payItemSnapshot = barter?.pay_item_snapshot && typeof barter.pay_item_snapshot === 'object'
            ? barter.pay_item_snapshot
            : { id: payItemId, name: String(barter?.pay_item_name || '未知物品') };
          const supplementTaxRefund = Math.max(0, Number(row.tax_per_unit || 0) * qty);
          const attachments = [];
          if (payItemId > 0 && payItemCount > 0) attachments.push({ kind: 'item', item: payItemSnapshot, count: payItemCount });
          if (supplementTaxRefund > 0) attachments.push({ kind: 'currency', currency: 'spirit_stones', amount: supplementTaxRefund });
          await createMailboxMessage(row.seller_account_id, {
            type: 'trade_refund',
            title: `交易所求购已过期：${row.item_name}`,
            content: `以物易物求购已过期，系统退回支付物品 x${payItemCount} 与差额税 ${supplementTaxRefund} 灵石。`,
            attachments
          });
        } else {
          const refund = (Number(row.unit_price) + Number(row.tax_per_unit || 0)) * qty;
          await createMailboxMessage(row.seller_account_id, {
            type: 'trade_refund',
            title: `交易所求购已过期：${row.item_name}`,
            content: `求购已过期，系统退回剩余预存灵石 ${refund}。`,
            attachments: [{ kind: 'currency', currency: 'spirit_stones', amount: refund }]
          });
        }
      } else {
        let item;
        try { item = JSON.parse(row.item_snapshot_json || '{}'); } catch (_) { item = {}; }
        if (item && typeof item === 'object' && Object.keys(item).length > 0) {
          await createMailboxMessage(row.seller_account_id, {
            type: 'trade_refund',
            title: `交易所挂单已过期：${row.item_name}`,
            content: `挂单已过期，系统已退回剩余物品 x${qty}。`,
            attachments: [{ kind: 'item', item, count: qty }]
          });
        }
      }
      await DB.prepare(`
        UPDATE exchange_listings
        SET status='expired', updated_at=strftime('%s','now')
        WHERE id=?
      `).bind(row.id).run().catch(() => null);
    }
    return list.length;
  }

  async function createExchangeTrade(payload) {
    const res = await DB.prepare(
      `INSERT INTO exchange_trades
        (listing_id, seller_account_id, buyer_account_id, item_id, item_name, quantity, unit_price, total_price, tax_amount, seller_income, side)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      intVal(payload.listing_id, 0),
      intVal(payload.seller_account_id, 0),
      intVal(payload.buyer_account_id, 0),
      Math.floor(Number(payload.item_id) || 0),
      String(payload.item_name || '未知物品'),
      Math.floor(Number(payload.quantity) || 1),
      Math.floor(Number(payload.unit_price) || 0),
      Math.floor(Number(payload.total_price) || 0),
      Math.floor(Number(payload.tax_amount) || 0),
      Math.floor(Number(payload.seller_income) || 0),
      String(payload.side || 'sell')
    ).run().catch((e) => {
      console.error('[db] createExchangeTrade error', e?.message);
      return null;
    });
    return Number(res?.meta?.last_row_id || 0);
  }

  async function listExchangeTradePrices(itemId, minCreatedAt, limit = 300) {
    const iid = Math.floor(Number(itemId) || 0);
    if (iid <= 0) return [];
    const minTs = Math.max(0, Math.floor(Number(minCreatedAt) || 0));
    const lim = Math.max(20, Math.min(1500, Math.floor(Number(limit) || 300)));
    const rows = await DB.prepare(`
      SELECT unit_price
      FROM exchange_trades
      WHERE item_id = ? AND created_at >= ? AND side = 'sell'
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(iid, minTs, lim).all().catch(() => ({ results: [] }));
    return (rows.results || []).map((r) => Math.floor(Number(r?.unit_price) || 0)).filter((v) => v > 0);
  }

  // ── 邮箱（交易所/系统发放） ──────────────────────────────
  async function createMailboxMessage(accountId, payload) {
    const now = nowSec();
    const dedupeKeyRaw = String(payload?.dedupe_key || '').trim();
    const dedupeKey = dedupeKeyRaw ? dedupeKeyRaw.slice(0, 191) : '';
    if (dedupeKey) {
      const existed = await DB.prepare('SELECT id FROM mailbox_messages WHERE account_id=? AND dedupe_key=? LIMIT 1')
        .bind(intVal(accountId, 0), dedupeKey).first().catch(() => null);
      // 去重命中：返回 -1 表示"邮件已存在、视为已投递"（与插入失败 0 区分开）
      if (existed && Number(existed.id) > 0) return -1;
      const res = await DB.prepare(
        `INSERT INTO mailbox_messages
          (account_id, type, title, content, attachments_json, status, created_at, claimed_at, expires_at, dedupe_key)
         VALUES (?, ?, ?, ?, ?, 'unread', ?, 0, ?, ?)`
      ).bind(
        intVal(accountId, 0),
        String(payload.type || 'system'),
        String(payload.title || '系统邮件'),
        String(payload.content || ''),
        JSON.stringify(payload.attachments || []),
        now,
        Number(payload.expires_at) || 0,
        dedupeKey
      ).run().catch((e) => {
        if (String(e?.message || '').includes('UNIQUE')) return { meta: { last_row_id: -1 } };
        console.error('[db] createMailboxMessage error', e?.message);
        return null;
      });
      return Number(res?.meta?.last_row_id || 0);
    }
    const res = await DB.prepare(
      `INSERT INTO mailbox_messages
        (account_id, type, title, content, attachments_json, status, created_at, claimed_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'unread', ?, 0, ?)`
    ).bind(
      intVal(accountId, 0),
      String(payload.type || 'system'),
      String(payload.title || '系统邮件'),
      String(payload.content || ''),
      JSON.stringify(payload.attachments || []),
      now,
      Number(payload.expires_at) || 0
    ).run().catch((e) => {
      console.error('[db] createMailboxMessage error', e?.message);
      return null;
    });
    return Number(res?.meta?.last_row_id || 0);
  }

  // ── 仙盟（迁移自 server/db.js 的 alliance_* 函数） ────────────────
  const ALLOWED_ALLIANCE_KEYS = ['name', 'description', 'level', 'rank_names_json', 'materials',
    'warehouse_pages', 'warehouse_json', 'statue_level', 'spirit_pool_level', 'garden_level',
    'enlightenment_tree_level', 'treasury_level', 'gate_level', 'treasury_refresh_date', 'treasury_goods_json'];
  const DEFAULT_RANK_NAMES = ['仙友', '仙长', '尊者', '长老', '副盟主', '盟主'];

  async function listAlliances() {
    const rows = await DB.prepare(`
      SELECT a.*, COUNT(m.account_id) AS member_count
      FROM alliances a
      LEFT JOIN alliance_members m ON a.id = m.alliance_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  async function getAllianceById(id) {
    const r = await DB.prepare('SELECT * FROM alliances WHERE id = ? LIMIT 1').bind(intVal(id, 0)).first().catch(() => null);
    if (!r) return null;
    let warehouse = [];
    try { warehouse = JSON.parse(r.warehouse_json || '[]'); } catch (_) { warehouse = []; }
    if (!Array.isArray(warehouse)) warehouse = [];
    const pages = Math.max(10, Math.floor(Number(r.warehouse_pages) || 10));
    while (warehouse.length < pages) warehouse.push(Array(20).fill(null));
    let rankNames = DEFAULT_RANK_NAMES;
    try {
      const parsed = JSON.parse(r.rank_names_json || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) rankNames = parsed;
    } catch (_) {}
    return {
      ...r,
      rank_names: rankNames,
      warehouse,
      materials: Math.max(0, Math.floor(Number(r.materials) || 0)),
      warehouse_pages: pages
    };
  }

  async function getAllianceByName(name) {
    return DB.prepare('SELECT * FROM alliances WHERE name = ? LIMIT 1').bind(String(name || '').trim()).first().catch(() => null);
  }

  async function createAlliance(name, description, creatorAccountId, rankNamesJson) {
    const rn = String(rankNamesJson || JSON.stringify(DEFAULT_RANK_NAMES));
    const res = await DB.prepare(`
      INSERT INTO alliances (name, description, level, creator_account_id, rank_names_json, created_at)
      VALUES (?, ?, 1, ?, ?, strftime('%s','now'))
    `).bind(String(name || '').trim(), String(description || '').trim(), intVal(creatorAccountId, 0), rn).run().catch((e) => {
      console.error('[db] createAlliance error', e?.message);
      return null;
    });
    const id = Number(res?.meta?.last_row_id || 0);
    if (id > 0) {
      // 创建者即盟主（rank=5）
      await DB.prepare(`INSERT OR REPLACE INTO alliance_members (alliance_id, account_id, rank, contribution, joined_at)
        VALUES (?, ?, 5, 0, strftime('%s','now'))`).bind(id, intVal(creatorAccountId, 0)).run().catch(() => {});
    }
    return id;
  }

  async function updateAlliance(id, updates) {
    const keys = Object.keys(updates || {}).filter((k) => ALLOWED_ALLIANCE_KEYS.includes(k));
    if (keys.length === 0) return null;
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const args = keys.map((k) => {
      if (k === 'rank_names_json') return typeof updates[k] === 'string' ? updates[k] : JSON.stringify(updates[k] || []);
      return updates[k];
    });
    args.push(intVal(id, 0));
    await DB.prepare(`UPDATE alliances SET ${setClause} WHERE id = ?`).bind(...args).run().catch((e) => {
      console.error('[db] updateAlliance error', e?.message);
    });
    return null;
  }

  async function listAllianceMembers(allianceId) {
    const rows = await DB.prepare(`
      SELECT m.*, a.username, a.is_banned, a.ban_expires_at, json_extract(p.data, '$.name') AS player_name
      FROM alliance_members m
      LEFT JOIN accounts a ON m.account_id = a.id
      LEFT JOIN players p ON p.account_id = m.account_id
      WHERE m.alliance_id = ?
      ORDER BY m.rank DESC, m.joined_at ASC
    `).bind(intVal(allianceId, 0)).all().catch(() => ({ results: [] }));
    return (rows.results || []).map((r) => {
      let raw = (r.player_name != null && r.player_name !== '') ? String(r.player_name).trim() : '';
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).replace(/\\"/g, '"');
      return { ...r, player_name: raw || r.username || '?' };
    });
  }

  async function addAllianceMember(allianceId, accountId, rank = 0) {
    return DB.prepare(`INSERT OR REPLACE INTO alliance_members (alliance_id, account_id, rank, contribution, joined_at)
      VALUES (?, ?, ?, 0, strftime('%s','now'))`)
      .bind(intVal(allianceId, 0), intVal(accountId, 0), Math.max(0, Math.min(5, intVal(rank, 0)))).run().catch(() => null);
  }

  async function removeAllianceMember(allianceId, accountId) {
    return DB.prepare('DELETE FROM alliance_members WHERE alliance_id = ? AND account_id = ?')
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).run().catch(() => null);
  }

  async function updateAllianceMemberRank(allianceId, accountId, rank) {
    return DB.prepare('UPDATE alliance_members SET rank = ? WHERE alliance_id = ? AND account_id = ?')
      .bind(Math.max(0, Math.min(5, intVal(rank, 0))), intVal(allianceId, 0), intVal(accountId, 0)).run().catch(() => null);
  }

  async function getAllianceMemberRank(allianceId, accountId) {
    const r = await DB.prepare('SELECT rank FROM alliance_members WHERE alliance_id = ? AND account_id = ?')
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).first().catch(() => null);
    return r ? Number(r.rank) : -1;
  }

  async function countAllianceMembersByRank(allianceId, rank) {
    const r = await DB.prepare('SELECT COUNT(1) AS c FROM alliance_members WHERE alliance_id = ? AND rank = ?')
      .bind(intVal(allianceId, 0), Math.max(0, Math.min(5, intVal(rank, 0)))).first().catch(() => null);
    return Number(r?.c || 0);
  }

  // 原子增减贡献（MAX 兜底不为负）
  async function addAllianceMemberContribution(allianceId, accountId, delta) {
    return DB.prepare('UPDATE alliance_members SET contribution = MAX(0, contribution + ?) WHERE alliance_id = ? AND account_id = ?')
      .bind(Math.floor(Number(delta) || 0), intVal(allianceId, 0), intVal(accountId, 0)).run().catch(() => null);
  }

  async function getAllianceMemberContribution(allianceId, accountId) {
    const r = await DB.prepare('SELECT contribution FROM alliance_members WHERE alliance_id = ? AND account_id = ?')
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).first().catch(() => null);
    return r ? Math.max(0, Math.floor(Number(r.contribution) || 0)) : 0;
  }

  async function getApplicationById(id) {
    return DB.prepare('SELECT * FROM alliance_applications WHERE id = ? LIMIT 1').bind(intVal(id, 0)).first().catch(() => null);
  }

  async function getApplicationByAllianceAndAccount(allianceId, accountId) {
    return DB.prepare("SELECT * FROM alliance_applications WHERE alliance_id = ? AND account_id = ? AND status = 'pending' LIMIT 1")
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).first().catch(() => null);
  }

  async function getApplicationByAllianceAndAccountAnyStatus(allianceId, accountId) {
    return DB.prepare('SELECT * FROM alliance_applications WHERE alliance_id = ? AND account_id = ? LIMIT 1')
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).first().catch(() => null);
  }

  async function createAllianceApplication(allianceId, accountId) {
    const res = await DB.prepare(`INSERT INTO alliance_applications (alliance_id, account_id, status, created_at)
      VALUES (?, ?, 'pending', strftime('%s','now'))`)
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).run().catch((e) => {
        console.error('[db] createAllianceApplication error', e?.message);
        return null;
      });
    return Number(res?.meta?.last_row_id || 0);
  }

  async function renewAllianceApplication(allianceId, accountId) {
    return DB.prepare(`UPDATE alliance_applications SET status = 'pending', created_at = strftime('%s','now')
      WHERE alliance_id = ? AND account_id = ? AND status != 'pending'`)
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).run().catch(() => null);
  }

  async function listAlliancePendingApplications(allianceId) {
    const rows = await DB.prepare(`SELECT * FROM alliance_applications
      WHERE alliance_id = ? AND status = 'pending'
      ORDER BY created_at ASC`).bind(intVal(allianceId, 0)).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  async function updateAllianceApplicationStatus(id, status) {
    return DB.prepare("UPDATE alliance_applications SET status = ? WHERE id = ? AND status = 'pending'")
      .bind(String(status || 'pending'), intVal(id, 0)).run().catch(() => null);
  }

  async function addAllianceWithdrawAuth(allianceId, accountId) {
    return DB.prepare('INSERT OR IGNORE INTO alliance_withdraw_auth (alliance_id, account_id) VALUES (?, ?)')
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).run().catch(() => null);
  }

  async function removeAllianceWithdrawAuth(allianceId, accountId) {
    return DB.prepare('DELETE FROM alliance_withdraw_auth WHERE alliance_id = ? AND account_id = ?')
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).run().catch(() => null);
  }

  async function hasAllianceWithdrawAuth(allianceId, accountId) {
    const r = await DB.prepare('SELECT 1 FROM alliance_withdraw_auth WHERE alliance_id = ? AND account_id = ?')
      .bind(intVal(allianceId, 0), intVal(accountId, 0)).first().catch(() => null);
    return !!r;
  }

  async function listAllianceWithdrawAuth(allianceId) {
    const rows = await DB.prepare(`SELECT w.account_id, a.username FROM alliance_withdraw_auth w
      LEFT JOIN accounts a ON w.account_id = a.id
      WHERE w.alliance_id = ?`).bind(intVal(allianceId, 0)).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  // ── 邮箱查询/领取/删除 ────────────────────────────────
  async function listMailbox(accountId) {
    const rows = await DB.prepare(`
      SELECT *
      FROM mailbox_messages
      WHERE account_id = ?
      ORDER BY created_at DESC, id DESC
    `).bind(intVal(accountId, 0)).all().catch(() => ({ results: [] }));
    return (rows.results || []).map((r) => ({
      ...r,
      attachments: (() => { try { return JSON.parse(r.attachments_json || '[]'); } catch (_) { return []; } })()
    }));
  }

  async function getMailboxById(mailId, accountId) {
    const r = await DB.prepare('SELECT * FROM mailbox_messages WHERE id=? AND account_id=?')
      .bind(intVal(mailId, 0), intVal(accountId, 0)).first().catch(() => null);
    if (!r) return null;
    return {
      ...r,
      attachments: (() => { try { return JSON.parse(r.attachments_json || '[]'); } catch (_) { return []; } })()
    };
  }

  /**
   * 领取邮件（D1 简化原子版）：
   * 1) 先以 UPDATE ... WHERE status='unread' 抢占该邮件（重复领取返回 0 changes）
   * 2) 应用附件到角色并保存
   * 3) 应用失败则回滚邮件为 unread（附件不丢失）
   */
  async function claimMailboxAtomic(accountId, mailId, applyPlayerAttachments) {
    const aid = intVal(accountId, 0);
    const mid = intVal(mailId, 0);
    const applyFn = typeof applyPlayerAttachments === 'function' ? applyPlayerAttachments : null;
    if (aid <= 0 || mid <= 0 || !applyFn) return { ok: false, error: '无效参数' };

    try {
      const mail = await getMailboxById(mid, aid);
      if (!mail) return { ok: false, error: '邮件不存在' };
      if (String(mail.status) !== 'unread') return { ok: false, error: '该邮件已领取' };

      const player = await getPlayerByAccountId(aid);
      if (!player) return { ok: false, error: '无角色' };

      const attachments = Array.isArray(mail.attachments) ? mail.attachments : [];
      const applyRet = applyFn(player, attachments);
      if (applyRet && typeof applyRet === 'object' && applyRet.ok === false) {
        return applyRet;
      }

      // 先保存玩家；保存失败（如 D1 写失败）时不要标记邮件已领取，避免"物品丢失且无找回路径"
      const saveRet = await savePlayerImmediate(aid, 1, player);
      if (saveRet && saveRet.conflict) return { ok: false, error: '数据繁忙，请稍后重试' };
      const mr = await DB.prepare(`
        UPDATE mailbox_messages
        SET status='claimed', claimed_at=strftime('%s','now')
        WHERE id=? AND account_id=? AND status='unread'
      `).bind(mid, aid).run().catch(() => ({ meta: { changes: 0 } }));
      if (Number(mr?.meta?.changes || 0) <= 0) {
        return { ok: false, error: '该邮件已领取' };
      }
      return { ok: true, player };
    } catch (e) {
      console.error('[db] claimMailboxAtomic error accountId=%s mailId=%s:', aid, mid, e?.message);
      return { ok: false, error: '领取失败，请稍后重试' };
    }
  }

  async function deleteClaimedMailbox(accountId) {
    const r = await DB.prepare(`
      DELETE FROM mailbox_messages
      WHERE account_id=? AND status='claimed'
    `).bind(intVal(accountId, 0)).run().catch(() => null);
    return { changes: Number(r?.meta?.changes || 0) };
  }

  // ── 联赛（迁移自 server/db.js 的 league_* 函数） ────────────────
  // 原始 db.js 在 SQLite 分支为同步 better-sqlite3，这里统一为 D1 异步方法，
  // 返回原始行数据，由 src/game/leagueSystem.js 负责 hydrate。

  async function getLeagueSeason(seasonId) {
    return DB.prepare('SELECT * FROM league_seasons WHERE season_id=?').bind(intVal(seasonId, 0)).first().catch(() => null);
  }

  async function saveLeagueSeason(season) {
    await DB.prepare(`
      UPDATE league_seasons
      SET status=?, total_rounds=?, rounds_completed=?, initialized=?, meta_json=?, updated_at=?
      WHERE season_id=?
    `).bind(
      String(season?.status || 'registration'),
      intVal(season?.total_rounds, 0),
      intVal(season?.rounds_completed, 0),
      season?.initialized ? 1 : 0,
      JSON.stringify(season?.meta && typeof season.meta === 'object' ? season.meta : {}),
      intVal(season?.updated_at, nowSec()),
      intVal(season?.season_id, 0)
    ).run().catch((e) => {
      console.error('[db] saveLeagueSeason error', e?.message);
      return null;
    });
    return null;
  }

  // INSERT OR IGNORE：已存在则静默跳过（含唯一冲突），返回是否新插入
  async function insertLeagueSeasonIfAbsent(seasonId, regStart, regEnd, startAt, endAt, ts = nowSec()) {
    const r = await DB.prepare(`
      INSERT OR IGNORE INTO league_seasons
      (season_id, reg_start, reg_end, start_at, end_at, status, total_rounds, rounds_completed, initialized, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'registration', 0, 0, 0, '{}', ?, ?)
    `).bind(intVal(seasonId, 0), intVal(regStart, 0), intVal(regEnd, 0), intVal(startAt, 0), intVal(endAt, 0), intVal(ts, nowSec()), intVal(ts, nowSec())).run().catch((e) => {
      if (String(e?.message || '').includes('UNIQUE')) return null;
      console.error('[db] insertLeagueSeasonIfAbsent error', e?.message);
      return null;
    });
    return Number(r?.meta?.changes || 0) > 0;
  }

  async function listLeagueSeasonTeams(seasonId) {
    const rows = await DB.prepare('SELECT * FROM league_teams WHERE season_id=? ORDER BY id ASC')
      .bind(intVal(seasonId, 0)).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  async function getLeagueTeamById(teamId) {
    return DB.prepare('SELECT * FROM league_teams WHERE id=?').bind(intVal(teamId, 0)).first().catch(() => null);
  }

  async function saveLeagueTeam(team) {
    await DB.prepare(`
      UPDATE league_teams
      SET name=?, captain_account_id=?, mode=?, registered=?, status=?, rating_seed=?, season_points=?, wins=?, draws=?, losses=?,
          members_json=?, frozen_json=?, skill_json=?, updated_at=?
      WHERE id=?
    `).bind(
      String(team?.name || ''),
      intVal(team?.captain_account_id, 0),
      String(team?.mode || 'manual'),
      team?.registered ? 1 : 0,
      String(team?.status || 'forming'),
      intVal(team?.rating_seed, 1000),
      intVal(team?.season_points, 0),
      intVal(team?.wins, 0),
      intVal(team?.draws, 0),
      intVal(team?.losses, 0),
      JSON.stringify(Array.isArray(team?.members) ? team.members : []),
      JSON.stringify(Array.isArray(team?.frozen) ? team.frozen : []),
      JSON.stringify(team?.skill_map && typeof team.skill_map === 'object' ? team.skill_map : {}),
      intVal(team?.updated_at, nowSec()),
      intVal(team?.id, 0)
    ).run().catch((e) => {
      console.error('[db] saveLeagueTeam error', e?.message);
      return null;
    });
    return null;
  }

  async function deleteLeagueTeam(teamId) {
    await DB.prepare('DELETE FROM league_teams WHERE id=?').bind(intVal(teamId, 0)).run().catch(() => {});
    return null;
  }

  async function findLeagueTeamByCode(seasonId, teamCode) {
    return DB.prepare('SELECT * FROM league_teams WHERE season_id=? AND team_code=?')
      .bind(intVal(seasonId, 0), String(teamCode || '').trim().toUpperCase()).first().catch(() => null);
  }

  async function createLeagueTeam(payload) {
    const now = intVal(payload?.created_at, nowSec());
    const res = await DB.prepare(`
      INSERT INTO league_teams
      (season_id, team_code, name, captain_account_id, mode, registered, status, rating_seed, season_points, wins, draws, losses,
       members_json, frozen_json, skill_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, '[]', '{}', ?, ?)
    `).bind(
      intVal(payload?.season_id, 0),
      String(payload?.team_code || '').toUpperCase(),
      String(payload?.name || ''),
      intVal(payload?.captain_account_id, 0),
      String(payload?.mode || 'manual'),
      payload?.registered ? 1 : 0,
      String(payload?.status || 'forming'),
      intVal(payload?.rating_seed, 1000),
      JSON.stringify(Array.isArray(payload?.members) ? payload.members : []),
      now,
      now
    ).run().catch((e) => {
      console.error('[db] createLeagueTeam error', e?.message);
      return null;
    });
    return Number(res?.meta?.last_row_id || 0);
  }

  async function createLeagueMatch(payload) {
    const now = intVal(payload?.created_at, nowSec());
    const res = await DB.prepare(`
      INSERT INTO league_matches
      (season_id, round_no, match_no, team_a_id, team_b_id, result, winner_team_id, points_a, points_b, summary_json, battle_log_json, created_at, settled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      intVal(payload?.season_id, 0),
      intVal(payload?.round_no, 0),
      intVal(payload?.match_no, 0),
      intVal(payload?.team_a_id, 0),
      intVal(payload?.team_b_id, 0),
      String(payload?.result || 'draw'),
      intVal(payload?.winner_team_id, 0),
      intVal(payload?.points_a, 0),
      intVal(payload?.points_b, 0),
      JSON.stringify(payload?.summary || {}),
      JSON.stringify(Array.isArray(payload?.logs) ? payload.logs : []),
      now,
      intVal(payload?.settled_at, now)
    ).run().catch((e) => {
      console.error('[db] createLeagueMatch error', e?.message);
      return null;
    });
    return Number(res?.meta?.last_row_id || 0);
  }

  // settleRoundMatchOnce 异常回滚用：结算函数失败时删除已写入的对战记录以便重试
  async function deleteLeagueMatchById(matchId) {
    await DB.prepare('DELETE FROM league_matches WHERE id=?').bind(intVal(matchId, 0)).run().catch(() => {});
    return null;
  }

  async function countLeagueRoundMatches(seasonId, roundNo) {
    const row = await DB.prepare('SELECT COUNT(1) AS c FROM league_matches WHERE season_id=? AND round_no=?')
      .bind(intVal(seasonId, 0), intVal(roundNo, 0)).first().catch(() => null);
    return Math.max(0, intVal(row?.c, 0));
  }

  async function getLeagueRoundMaxMatchNo(seasonId, roundNo) {
    const row = await DB.prepare('SELECT MAX(match_no) AS m FROM league_matches WHERE season_id=? AND round_no=?')
      .bind(intVal(seasonId, 0), intVal(roundNo, 0)).first().catch(() => null);
    return Math.max(0, intVal(row?.m, 0));
  }

  async function hasLeagueRoundMatchNo(seasonId, roundNo, matchNo) {
    const row = await DB.prepare('SELECT 1 AS ok FROM league_matches WHERE season_id=? AND round_no=? AND match_no=? LIMIT 1')
      .bind(intVal(seasonId, 0), intVal(roundNo, 0), intVal(matchNo, 0)).first().catch(() => null);
    return !!row;
  }

  async function listLeagueTeamsByMemberAccount(seasonId, accountId, limit = 5) {
    const sid = intVal(seasonId, 0);
    const aid = intVal(accountId, 0);
    const lim = Math.max(1, Math.min(20, intVal(limit, 5)));
    if (sid <= 0 || aid <= 0) return [];
    const rows = await DB.prepare(`
      SELECT t.*
      FROM league_teams t
      WHERE t.season_id=?
        AND (
          EXISTS (
            SELECT 1 FROM json_each(t.members_json) je
            WHERE CAST(json_extract(je.value, '$.account_id') AS INTEGER) = ?
          )
          OR EXISTS (
            SELECT 1 FROM json_each(t.frozen_json) jf
            WHERE CAST(json_extract(jf.value, '$.account_id') AS INTEGER) = ?
          )
        )
      ORDER BY
        CASE t.status
          WHEN 'active' THEN 500
          WHEN 'registered' THEN 400
          WHEN 'forming' THEN 300
          WHEN 'finished' THEN 200
          WHEN 'disbanded' THEN 100
          ELSE 0
        END DESC,
        t.registered DESC,
        t.id DESC
      LIMIT ?
    `).bind(sid, aid, aid, lim).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  async function listLeagueLeaderboardRows(limit = 500) {
    const lim = Math.max(1, Math.min(2000, intVal(limit, 500)));
    const rows = await DB.prepare(`
      SELECT account_id,
             json_extract(data, '$.name') AS name,
             CAST(json_extract(data, '$.level') AS INTEGER) AS level,
             COALESCE(CAST(json_extract(data, '$.league_points') AS INTEGER), 0) AS league_points,
             COALESCE(CAST(json_extract(data, '$.league_rating') AS INTEGER), 1000) AS league_rating
      FROM players
      ORDER BY league_points DESC, level DESC, account_id ASC
      LIMIT ?
    `).bind(lim).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  async function listLeagueTeamRankRows(seasonId = 0, limit = 100, initializedOnly = 0) {
    const sid = intVal(seasonId, 0);
    const lim = Math.max(1, Math.min(500, intVal(limit, 100)));
    const onlyInit = intVal(initializedOnly, 0) > 0;
    const whereStatus = onlyInit
      ? "status IN ('active','finished')"
      : "(registered=1 OR status IN ('active','finished'))";
    const rows = await DB.prepare(`
      SELECT id, season_id, team_code, name, captain_account_id, status,
             season_points, wins, draws, losses, rating_seed,
             members_json,
             CASE WHEN json_valid(members_json) THEN COALESCE(json_array_length(members_json), 0) ELSE 0 END AS members_count
      FROM league_teams
      WHERE season_id=? AND ${whereStatus}
      ORDER BY season_points DESC, wins DESC, draws DESC, rating_seed DESC, id ASC
      LIMIT ?
    `).bind(sid, lim).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  async function countLeagueTeamRankRows(seasonId = 0, initializedOnly = 0) {
    const sid = intVal(seasonId, 0);
    const onlyInit = intVal(initializedOnly, 0) > 0;
    const whereStatus = onlyInit
      ? "status IN ('active','finished')"
      : "(registered=1 OR status IN ('active','finished'))";
    const row = await DB.prepare(`
      SELECT COUNT(1) AS c FROM league_teams WHERE season_id=? AND ${whereStatus}
    `).bind(sid).first().catch(() => null);
    return Math.max(0, intVal(row?.c, 0));
  }

  async function listLeagueMatchesByTeam(seasonId = 0, teamId = 0, limit = 50) {
    const sid = intVal(seasonId, 0);
    const tid = intVal(teamId, 0);
    const lim = Math.max(1, Math.min(200, intVal(limit, 50)));
    const rows = await DB.prepare(`
      SELECT * FROM league_matches
      WHERE (team_a_id=? OR team_b_id=?) AND season_id=?
      ORDER BY round_no DESC, match_no DESC
      LIMIT ?
    `).bind(tid, tid, sid, lim).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  async function listLeagueTeamNamesByIds(seasonId = 0, teamIds = []) {
    const sid = intVal(seasonId, 0);
    const ids = Array.isArray(teamIds)
      ? [...new Set(teamIds.map((x) => intVal(x, 0)).filter((x) => x > 0))].slice(0, 200)
      : [];
    if (sid <= 0 || ids.length <= 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await DB.prepare(`
      SELECT id, name FROM league_teams
      WHERE season_id=? AND id IN (${placeholders})
    `).bind(sid, ...ids).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  // ── 宗门/百艺（online 系统） ──────────────────────────────
  async function getSectTaskCompletionsToday(accountId) {
    const row = await DB.prepare('SELECT completions FROM sect_task_completions WHERE account_id = ? AND date = ?')
      .bind(intVal(accountId, 0), getDateKey()).first().catch(() => null);
    return row ? Math.max(0, intVal(row.completions, 0)) : 0;
  }

  async function incrementSectTaskCompletions(accountId) {
    const key = getDateKey();
    const row = await DB.prepare('SELECT completions FROM sect_task_completions WHERE account_id = ? AND date = ?')
      .bind(intVal(accountId, 0), key).first().catch(() => null);
    if (row) {
      await DB.prepare('UPDATE sect_task_completions SET completions = completions + 1 WHERE account_id = ? AND date = ?')
        .bind(intVal(accountId, 0), key).run().catch(() => {});
      return Math.max(0, intVal(row.completions, 0)) + 1;
    }
    await DB.prepare('INSERT INTO sect_task_completions (account_id, date, completions) VALUES (?, ?, 1)')
      .bind(intVal(accountId, 0), key).run().catch(() => {});
    return 1;
  }

  async function hasAccountRedeemed(accountId, code) {
    const row = await DB.prepare('SELECT 1 AS ok FROM account_redemptions WHERE account_id = ? AND code = ? LIMIT 1')
      .bind(intVal(accountId, 0), String(code || '')).first().catch(() => null);
    return !!row;
  }

  async function recordAccountRedemption(accountId, code) {
    await DB.prepare('INSERT OR IGNORE INTO account_redemptions (account_id, code, redeemed_at) VALUES (?, ?, ?)')
      .bind(intVal(accountId, 0), String(code || ''), nowSec()).run().catch(() => {});
    return null;
  }

  async function countPlayersBySect() {
    const rows = await DB.prepare(`
      SELECT json_extract(data, '$.sect_id') AS sect_id, COUNT(1) AS cnt
      FROM players
      WHERE CAST(json_extract(data, '$.sect_id') AS INTEGER) > 0
      GROUP BY sect_id
    `).all().catch(() => ({ results: [] }));
    return rows.results || [];
  }

  // 宗门人数映射 { sectId: count }（对齐 server/game/onlineUtils.js getSectMemberCounts 的返回结构）
  async function getSectMemberCountsMap() {
    const rows = await countPlayersBySect();
    const map = {};
    for (const r of rows || []) {
      const sid = intVal(r?.sect_id, 0);
      if (sid > 0) map[String(sid)] = Math.max(0, intVal(r?.cnt, 0));
    }
    return map;
  }

  // 删档
  async function wipeAccountData(accountId) {
    await DB.prepare('DELETE FROM players WHERE account_id = ?').bind(intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  // ─── 邀请系统 ───
  const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function generateInviteCode() {
    const buf = crypto.getRandomValues(new Uint8Array(8));
    let s = '';
    for (let i = 0; i < 8; i++) s += INVITE_CODE_CHARS[buf[i] % INVITE_CODE_CHARS.length];
    return s;
  }

  async function getOrCreateInviter(accountId) {
    const aid = intVal(accountId, 0);
    let r = await DB.prepare('SELECT * FROM invite_inviters WHERE account_id = ? LIMIT 1').bind(aid).first().catch(() => null);
    if (!r) {
      let code = generateInviteCode();
      while (await DB.prepare('SELECT 1 FROM invite_inviters WHERE invite_code = ? LIMIT 1').bind(code).first().catch(() => null)) {
        code = generateInviteCode();
      }
      await DB.prepare(`
        INSERT INTO invite_inviters (account_id, invite_code, stored_stones, per_person_stones, invite_points, updated_at)
        VALUES (?, ?, 0, 0, 0, ?)
      `).bind(aid, code, nowSec()).run().catch(() => {});
      r = await DB.prepare('SELECT * FROM invite_inviters WHERE account_id = ? LIMIT 1').bind(aid).first().catch(() => null);
    }
    return r || null;
  }

  async function getInviterByCode(code) {
    return DB.prepare('SELECT * FROM invite_inviters WHERE invite_code = ? LIMIT 1').bind(String(code || '').trim().toUpperCase()).first().catch(() => null);
  }

  async function getInviteBinding(inviteeAccountId) {
    return DB.prepare('SELECT * FROM invite_bindings WHERE invitee_account_id = ? LIMIT 1').bind(intVal(inviteeAccountId, 0)).first().catch(() => null);
  }

  async function createInviteBinding(inviteeAccountId, inviterAccountId, stonesGranted = 0) {
    const sg = stonesGranted > 0 ? Math.floor(Number(stonesGranted)) : null;
    await DB.prepare(`
      INSERT INTO invite_bindings (invitee_account_id, inviter_account_id, bound_at, stones_granted)
      VALUES (?, ?, ?, ?)
    `).bind(intVal(inviteeAccountId, 0), intVal(inviterAccountId, 0), nowSec(), sg).run().catch(() => {});
    return null;
  }

  async function updateInviteBindingStones(inviteeAccountId, stonesGranted) {
    await DB.prepare('UPDATE invite_bindings SET stones_granted = ? WHERE invitee_account_id = ?')
      .bind(Math.max(0, Math.floor(Number(stonesGranted) || 0)), intVal(inviteeAccountId, 0)).run().catch(() => {});
    return null;
  }

  async function updateInviterStorage(accountId, storedStones, perPersonStones) {
    await getOrCreateInviter(accountId);
    await DB.prepare('UPDATE invite_inviters SET stored_stones = ?, per_person_stones = ?, updated_at = ? WHERE account_id = ?')
      .bind(Math.max(0, Math.floor(Number(storedStones) || 0)), Math.max(0, Math.floor(Number(perPersonStones) || 0)), nowSec(), intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  async function getInviterStorage(accountId) {
    const r = await DB.prepare('SELECT stored_stones, per_person_stones, invite_points FROM invite_inviters WHERE account_id = ? LIMIT 1').bind(intVal(accountId, 0)).first().catch(() => null);
    return r || { stored_stones: 0, per_person_stones: 0, invite_points: 0 };
  }

  async function addInviterPoints(accountId, amount) {
    await getOrCreateInviter(accountId);
    await DB.prepare('UPDATE invite_inviters SET invite_points = invite_points + ?, updated_at = ? WHERE account_id = ?')
      .bind(Math.max(0, Math.floor(Number(amount) || 0)), nowSec(), intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  /** 原子扣减邀请人存储灵石，防止并发导致超发。返回是否扣减成功 */
  async function deductInviterStones(accountId, amount) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return true;
    const r = await DB.prepare('UPDATE invite_inviters SET stored_stones = stored_stones - ?, updated_at = ? WHERE account_id = ? AND stored_stones >= ?')
      .bind(amt, nowSec(), intVal(accountId, 0), amt).run().catch(() => ({ meta: { changes: 0 } }));
    return Number(r?.meta?.changes || 0) > 0;
  }

  async function listInvitees(inviterAccountId) {
    const r = await DB.prepare(`
      SELECT b.invitee_account_id, b.bound_at, b.stones_granted, a.username, a.created_at
      FROM invite_bindings b
      LEFT JOIN accounts a ON a.id = b.invitee_account_id
      WHERE b.inviter_account_id = ?
    `).bind(intVal(inviterAccountId, 0)).all().catch(() => ({ results: [] }));
    return r.results || [];
  }

  async function hasClaimedInvitePoints(inviterAccountId, inviteeAccountId) {
    const r = await DB.prepare('SELECT 1 AS x FROM invite_point_claims WHERE inviter_account_id = ? AND invitee_account_id = ? LIMIT 1')
      .bind(intVal(inviterAccountId, 0), intVal(inviteeAccountId, 0)).first().catch(() => null);
    return !!r;
  }

  async function claimInvitePoints(inviterAccountId, inviteeAccountId) {
    await DB.prepare('INSERT INTO invite_point_claims (inviter_account_id, invitee_account_id, claimed_at) VALUES (?, ?, ?)')
      .bind(intVal(inviterAccountId, 0), intVal(inviteeAccountId, 0), nowSec()).run().catch(() => {});
    return null;
  }

  /** 原子扣减邀请积分，防止并发导致超扣/超发 */
  async function deductInvitePoints(accountId, amount) {
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return true;
    const r = await DB.prepare('UPDATE invite_inviters SET invite_points = invite_points - ?, updated_at = ? WHERE account_id = ? AND invite_points >= ?')
      .bind(amt, nowSec(), intVal(accountId, 0), amt).run().catch(() => ({ meta: { changes: 0 } }));
    return Number(r?.meta?.changes || 0) > 0;
  }

  // ─── 邮箱绑定/密码重置 ───
  async function createEmailVerificationCode(accountId, email) {
    const buf = crypto.getRandomValues(new Uint8Array(6));
    let code = '';
    for (const b of buf) code += String(b % 10);
    while (code.length < 6) code += '0';
    const now = nowSec();
    await DB.prepare('UPDATE email_verification_codes SET used = 1 WHERE account_id = ? AND used = 0').bind(intVal(accountId, 0)).run().catch(() => {});
    await DB.prepare(`
      INSERT INTO email_verification_codes (account_id, email, code, created_at, expires_at, used)
      VALUES (?, ?, ?, ?, ?, 0)
    `).bind(intVal(accountId, 0), String(email).trim().toLowerCase(), code, now, now + 300).run().catch(() => {});
    return code;
  }

  async function verifyEmailCode(accountId, email, code) {
    const row = await DB.prepare(`
      SELECT * FROM email_verification_codes
      WHERE account_id = ? AND email = ? AND code = ? AND used = 0 AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(intVal(accountId, 0), String(email).trim().toLowerCase(), String(code).trim(), nowSec()).first().catch(() => null);
    if (!row) return false;
    await DB.prepare('UPDATE email_verification_codes SET used = 1 WHERE id = ?').bind(intVal(row.id, 0)).run().catch(() => {});
    return true;
  }

  async function bindAccountEmail(accountId, email) {
    await DB.prepare('UPDATE accounts SET email = ?, email_verified = 1 WHERE id = ?')
      .bind(String(email).trim().toLowerCase(), intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  async function unbindAccountEmail(accountId) {
    await DB.prepare('UPDATE accounts SET email = \'\', email_verified = 0 WHERE id = ?').bind(intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  async function isEmailTaken(email) {
    const r = await DB.prepare('SELECT 1 AS x FROM accounts WHERE email = ? AND email_verified = 1 LIMIT 1').bind(String(email).trim().toLowerCase()).first().catch(() => null);
    return !!r;
  }

  async function getRecentEmailCodeTime(accountId) {
    const r = await DB.prepare('SELECT created_at FROM email_verification_codes WHERE account_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 1').bind(intVal(accountId, 0)).first().catch(() => null);
    return r ? Number(r.created_at) : 0;
  }

  async function getAccountByEmail(email) {
    return DB.prepare('SELECT * FROM accounts WHERE email = ? AND email_verified = 1 LIMIT 1').bind(String(email).trim().toLowerCase()).first().catch(() => null);
  }

  async function updateAccountPassword(accountId, newPassword) {
    const { hashPassword } = await import('./crypto.js');
    const hash = await hashPassword(newPassword, env.PASSWORD_PEPPER || env.JWT_SECRET);
    await DB.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').bind(hash, intVal(accountId, 0)).run().catch(() => {});
    return null;
  }

  return {
    getPlayerByAccountId,
    savePlayer,
    savePlayerImmediate,
    getAccountById,
    getAccountByUsername,
    getAccountEmail,
    isPlayerNameTaken,
    updatePlayerLastActivity,
    updatePlayerAutoBattleIntent,
    updatePlayerRestUntil,
    getPlayerRuntimeState,
    isCheatScanExempt,
    setAccountBanned,
    invalidatePlayerReadCache,
    getDungeonCompletionsToday,
    incrementDungeonCompletions,
    createDungeonTeam,
    joinDungeonTeam,
    getDungeonTeam,
    leaveDungeonTeam,
    getMyDungeonTeam,
    saveDungeonBattle,
    getDungeonBattle,
    deleteDungeonBattle,
    deleteAllDungeonBattlesForAccount,
    cleanupExpiredDungeonBattles,
    listPlayerBriefAll,
    countCityDuelChallengesToday,
    insertCityDuelChallenge,
    createCityDuelLog,
    listCityDuelLogsByAccount,
    getDuelRankLastSettledPeriod,
    setDuelRankLastSettledPeriod,
    getTopDuelRankAccount,
    resetAllDuelRankScores,
    createExchangeListing,
    getExchangeListingById,
    listExchangeListings,
    listMyExchangeListings,
    updateExchangeListingAfterTrade,
    cancelExchangeListing,
    repairExchangeListingStatuses,
    settleExpiredExchangeListings,
    createExchangeTrade,
    listExchangeTradePrices,
    createMailboxMessage,
    listMailbox,
    getMailboxById,
    claimMailboxAtomic,
    deleteClaimedMailbox,
    getLeagueSeason,
    saveLeagueSeason,
    insertLeagueSeasonIfAbsent,
    listLeagueSeasonTeams,
    getLeagueTeamById,
    saveLeagueTeam,
    deleteLeagueTeam,
    findLeagueTeamByCode,
    createLeagueTeam,
    createLeagueMatch,
    deleteLeagueMatchById,
    countLeagueRoundMatches,
    getLeagueRoundMaxMatchNo,
    hasLeagueRoundMatchNo,
    listLeagueTeamsByMemberAccount,
    listLeagueLeaderboardRows,
    listLeagueTeamRankRows,
    countLeagueTeamRankRows,
    listLeagueMatchesByTeam,
    listLeagueTeamNamesByIds,
    getSectTaskCompletionsToday,
    incrementSectTaskCompletions,
    hasAccountRedeemed,
    recordAccountRedemption,
    countPlayersBySect,
    getSectMemberCountsMap,
    getDateKey,
    listAlliances,
    getAllianceById,
    getAllianceByName,
    createAlliance,
    updateAlliance,
    listAllianceMembers,
    addAllianceMember,
    removeAllianceMember,
    updateAllianceMemberRank,
    getAllianceMemberRank,
    countAllianceMembersByRank,
    addAllianceMemberContribution,
    getAllianceMemberContribution,
    getApplicationById,
    getApplicationByAllianceAndAccount,
    getApplicationByAllianceAndAccountAnyStatus,
    createAllianceApplication,
    renewAllianceApplication,
    listAlliancePendingApplications,
    updateAllianceApplicationStatus,
    addAllianceWithdrawAuth,
    removeAllianceWithdrawAuth,
    hasAllianceWithdrawAuth,
    listAllianceWithdrawAuth,
    wipeAccountData,
    getOrCreateInviter,
    getInviterByCode,
    getInviteBinding,
    createInviteBinding,
    updateInviteBindingStones,
    updateInviterStorage,
    getInviterStorage,
    addInviterPoints,
    deductInviterStones,
    listInvitees,
    hasClaimedInvitePoints,
    claimInvitePoints,
    deductInvitePoints,
    createEmailVerificationCode,
    verifyEmailCode,
    bindAccountEmail,
    unbindAccountEmail,
    isEmailTaken,
    getRecentEmailCodeTime,
    getAccountByEmail,
    updateAccountPassword,
    // ── 擂台赛 ──
    getArenaTournamentState,
    setArenaTournamentState,
    getArenaTournamentHistory,
    nowSec
  };
}