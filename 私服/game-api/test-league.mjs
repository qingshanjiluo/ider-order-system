// 联赛路由集成测试（Worker 版）
// 运行：
//   npx esbuild test-league.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\league-bundle.mjs
//   node D:\Temp\opencode\league-bundle.mjs
import { handleLeagueRoute } from './src/routes/league.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';

// 固定测试时间：2026-08-22T04:00:00Z（周六 12:00 UTC+8），处于 2026-08-24 那期报名窗口内
Date.now = () => new Date('2026-08-22T04:00:00Z').getTime();

const store = new Map();
let seq = 1000;

function safeParse(raw, def) {
  try {
    const v = JSON.parse(raw);
    return v == null ? def : v;
  } catch (_) {
    return def;
  }
}

function statusPriority(status) {
  const s = String(status || '');
  if (s === 'active') return 500;
  if (s === 'registered') return 400;
  if (s === 'forming') return 300;
  if (s === 'finished') return 200;
  if (s === 'disbanded') return 100;
  return 0;
}

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return (r.results && r.results[0]) || null; }
  async all() {
    const sql = this.sql;
    const a = this.args;
    const results = [];

    // getPlayerByAccountId
    if (sql.includes('SELECT data FROM players')) {
      const p = store.get('p:' + Number(a[0]));
      if (p) results.push({ data: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) });
    }
    // listLeagueLeaderboardRows
    else if (sql.includes('FROM players') && sql.includes('league_points')) {
      for (const [k, p] of store) {
        if (!String(k).startsWith('p:')) continue;
        const d = typeof p.data === 'string' ? JSON.parse(p.data) : (p.data || {});
        results.push({
          account_id: Number(p.account_id),
          name: String(d.name || '道友#' + p.account_id),
          level: Number(d.level) || 1,
          league_points: Number(d.league_points) || 0,
          league_rating: Number(d.league_rating) || 1000
        });
      }
      results.sort((x, y) =>
        (y.league_points - x.league_points) || (y.level - x.level) || (x.account_id - y.account_id));
    }
    // getLeagueSeason
    else if (sql.includes('FROM league_seasons') && sql.includes('season_id=?')) {
      const s = store.get('season:' + Number(a[0]));
      if (s) results.push(s);
    }
    // listLeagueTeamsByMemberAccount（json_each 成员查找）
    else if (sql.includes('json_each(t.members_json)')) {
      const sid = Number(a[0]);
      const aid = Number(a[1]);
      const lim = Math.max(1, Math.min(20, Number(a[2]) || 5));
      const rows = [];
      for (const [k, t] of store) {
        if (!String(k).startsWith('team:') || Number(t.season_id) !== sid) continue;
        const members = safeParse(t.members_json, []);
        const frozen = safeParse(t.frozen_json, []);
        const inMembers = (Array.isArray(members) ? members : []).some(m => Number(m?.account_id) === aid);
        const inFrozen = (Array.isArray(frozen) ? frozen : []).some(m => Number(m?.account_id) === aid);
        if (!inMembers && !inFrozen) continue;
        rows.push(t);
      }
      rows.sort((x, y) =>
        (statusPriority(y.status) - statusPriority(x.status)) ||
        (Number(y.registered) - Number(x.registered)) ||
        (y.id - x.id));
      results.push(...rows.slice(0, lim));
    }
    // listLeagueSeasonTeams
    else if (sql.includes('FROM league_teams') && sql.includes('ORDER BY id ASC')) {
      const sid = Number(a[0]);
      const rows = [];
      for (const [k, t] of store) {
        if (String(k).startsWith('team:') && Number(t.season_id) === sid) rows.push(t);
      }
      rows.sort((x, y) => x.id - y.id);
      results.push(...rows);
    }
    // getLeagueTeamById
    else if (sql.includes('FROM league_teams') && sql.includes('WHERE id=?')) {
      const t = store.get('team:' + Number(a[0]));
      if (t) results.push(t);
    }
    // findLeagueTeamByCode
    else if (sql.includes('FROM league_teams') && sql.includes('team_code=?')) {
      const sid = Number(a[0]);
      const code = String(a[1] || '').trim().toUpperCase();
      for (const [k, t] of store) {
        if (String(k).startsWith('team:') && Number(t.season_id) === sid && String(t.team_code).toUpperCase() === code) {
          results.push(t);
          break;
        }
      }
    }
    // listLeagueTeamRankRows
    else if (sql.includes('CASE WHEN json_valid(members_json)')) {
      const sid = Number(a[0]);
      const lim = Math.max(1, Math.min(500, Number(a[1]) || 100));
      const onlyInit = sql.includes("status IN ('active','finished')");
      const rows = [];
      for (const [k, t] of store) {
        if (!String(k).startsWith('team:') || Number(t.season_id) !== sid) continue;
        const registered = Number(t.registered) === 1;
        const status = String(t.status || '');
        if (onlyInit) {
          if (status !== 'active' && status !== 'finished') continue;
        } else if (!(registered || status === 'active' || status === 'finished')) continue;
        const members = safeParse(t.members_json, []);
        rows.push({ ...t, members_count: Array.isArray(members) ? members.length : 0 });
      }
      rows.sort((x, y) =>
        (Number(y.season_points) - Number(x.season_points)) ||
        (Number(y.wins) - Number(x.wins)) ||
        (Number(y.draws) - Number(x.draws)) ||
        (Number(y.rating_seed) - Number(x.rating_seed)) ||
        (x.id - y.id));
      results.push(...rows.slice(0, lim));
    }
    // listLeagueTeamNamesByIds
    else if (sql.includes('SELECT id, name FROM league_teams')) {
      const sid = Number(a[0]);
      const ids = new Set(a.slice(1).map(Number));
      for (const [k, t] of store) {
        if (!String(k).startsWith('team:') || Number(t.season_id) !== sid) continue;
        if (ids.has(Number(t.id))) results.push({ id: Number(t.id), name: String(t.name || '') });
      }
    }
    // listLeagueMatchesByTeam
    else if (sql.includes('FROM league_matches') && sql.includes('team_a_id=?')) {
      const tid = Number(a[0]);
      const sid = Number(a[2]);
      const lim = Number(a[3]) || 50;
      const rows = [];
      for (const [k, m] of store) {
        if (!String(k).startsWith('match:') || Number(m.season_id) !== sid) continue;
        if (Number(m.team_a_id) === tid || Number(m.team_b_id) === tid) rows.push(m);
      }
      rows.sort((x, y) => (y.round_no - x.round_no) || (y.match_no - x.match_no));
      results.push(...rows.slice(0, lim));
    }
    // hasLeagueRoundMatchNo
    else if (sql.includes('FROM league_matches') && sql.includes('match_no=? LIMIT 1')) {
      const sid = Number(a[0]);
      const rn = Number(a[1]);
      const mn = Number(a[2]);
      for (const [k, m] of store) {
        if (!String(k).startsWith('match:')) continue;
        if (Number(m.season_id) === sid && Number(m.round_no) === rn && Number(m.match_no) === mn) {
          results.push({ ok: 1 });
          break;
        }
      }
    }
    // getLeagueRoundMaxMatchNo
    else if (sql.includes('SELECT MAX(match_no) AS m')) {
      const sid = Number(a[0]);
      const rn = Number(a[1]);
      let max = 0;
      for (const [k, m] of store) {
        if (!String(k).startsWith('match:')) continue;
        if (Number(m.season_id) === sid && Number(m.round_no) === rn) max = Math.max(max, Number(m.match_no));
      }
      results.push({ m: max });
    }
    // countLeagueRoundMatches
    else if (sql.includes('SELECT COUNT(1) AS c') && sql.includes('FROM league_matches')) {
      const sid = Number(a[0]);
      const rn = Number(a[1]);
      let c = 0;
      for (const [k, m] of store) {
        if (!String(k).startsWith('match:')) continue;
        if (Number(m.season_id) === sid && Number(m.round_no) === rn) c += 1;
      }
      results.push({ c });
    }
    // countLeagueTeamRankRows
    else if (sql.includes('SELECT COUNT(1) AS c') && sql.includes('FROM league_teams')) {
      const sid = Number(a[0]);
      const onlyInit = sql.includes("status IN ('active','finished')");
      let c = 0;
      for (const [k, t] of store) {
        if (!String(k).startsWith('team:') || Number(t.season_id) !== sid) continue;
        const registered = Number(t.registered) === 1;
        const status = String(t.status || '');
        if (onlyInit) {
          if (status === 'active' || status === 'finished') c += 1;
        } else if (registered || status === 'active' || status === 'finished') c += 1;
      }
      results.push({ c });
    }

    return { results };
  }
  async run() {
    const sql = this.sql;
    const a = this.args;

    // savePlayer
    if (sql.includes('INSERT INTO players')) {
      const accountId = Number(a[0]);
      store.set('p:' + accountId, { account_id: accountId, slot: Number(a[1]), data: a[2] });
      return { meta: { last_row_id: seq++, changes: 1 } };
    }
    // insertLeagueSeasonIfAbsent
    if (sql.includes('INSERT OR IGNORE INTO league_seasons')) {
      const sid = Number(a[0]);
      if (!store.has('season:' + sid)) {
        store.set('season:' + sid, {
          season_id: sid,
          reg_start: Number(a[1]),
          reg_end: Number(a[2]),
          start_at: Number(a[3]),
          end_at: Number(a[4]),
          status: 'registration',
          total_rounds: 0,
          rounds_completed: 0,
          initialized: 0,
          meta_json: '{}',
          created_at: Number(a[5]),
          updated_at: Number(a[6])
        });
        return { meta: { changes: 1, last_row_id: seq++ } };
      }
      return { meta: { changes: 0, last_row_id: 0 } };
    }
    // saveLeagueSeason
    if (sql.includes('UPDATE league_seasons')) {
      const sid = Number(a[6]);
      const s = store.get('season:' + sid);
      if (s) {
        s.status = String(a[0]);
        s.total_rounds = Number(a[1]);
        s.rounds_completed = Number(a[2]);
        s.initialized = Number(a[3]);
        s.meta_json = a[4];
        s.updated_at = Number(a[5]);
      }
      return { meta: { changes: 1 } };
    }
    // createLeagueTeam
    if (sql.includes('INSERT INTO league_teams')) {
      const id = seq++;
      const row = {
        id,
        season_id: Number(a[0]),
        team_code: String(a[1]),
        name: String(a[2]),
        captain_account_id: Number(a[3]),
        mode: String(a[4]),
        registered: Number(a[5]),
        status: String(a[6]),
        rating_seed: Number(a[7]),
        season_points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        members_json: a[8],
        frozen_json: '[]',
        skill_json: '{}',
        created_at: Number(a[9]),
        updated_at: Number(a[10])
      };
      store.set('team:' + id, row);
      return { meta: { last_row_id: id, changes: 1 } };
    }
    // saveLeagueTeam
    if (sql.includes('UPDATE league_teams')) {
      const id = Number(a[14]);
      const t = store.get('team:' + id);
      if (t) {
        t.name = String(a[0]);
        t.captain_account_id = Number(a[1]);
        t.mode = String(a[2]);
        t.registered = Number(a[3]);
        t.status = String(a[4]);
        t.rating_seed = Number(a[5]);
        t.season_points = Number(a[6]);
        t.wins = Number(a[7]);
        t.draws = Number(a[8]);
        t.losses = Number(a[9]);
        t.members_json = a[10];
        t.frozen_json = a[11];
        t.skill_json = a[12];
        t.updated_at = Number(a[13]);
      }
      return { meta: { changes: 1 } };
    }
    // deleteLeagueTeam
    if (sql.includes('DELETE FROM league_teams')) {
      store.delete('team:' + Number(a[0]));
      return { meta: { changes: 1 } };
    }
    // createLeagueMatch
    if (sql.includes('INSERT INTO league_matches')) {
      const id = seq++;
      store.set('match:' + id, {
        id,
        season_id: Number(a[0]),
        round_no: Number(a[1]),
        match_no: Number(a[2]),
        team_a_id: Number(a[3]),
        team_b_id: Number(a[4]),
        result: String(a[5]),
        winner_team_id: Number(a[6]),
        points_a: Number(a[7]),
        points_b: Number(a[8]),
        summary_json: a[9],
        battle_log_json: a[10],
        created_at: Number(a[11]),
        settled_at: Number(a[12])
      });
      return { meta: { last_row_id: id, changes: 1 } };
    }
    // deleteLeagueMatchById
    if (sql.includes('DELETE FROM league_matches')) {
      store.delete('match:' + Number(a[0]));
      return { meta: { changes: 1 } };
    }
    return { meta: { last_row_id: seq++, changes: 1 } };
  }
}

const env = {
  DB: { prepare(sql) { return new Stmt(sql); }, async batch(stmts) { for (const s of stmts) await s.run(); return []; } },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper'
};
const envGm = { ...env, GM_TOOL_TOKEN: 'gm-secret-123' };

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label, JSON.stringify(detail)); }
}

function makeReq(method, path, body, token, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return {
    method,
    url: 'http://test/api' + path,
    headers: { get: (name) => headers[name] || null },
    json: async () => body || {}
  };
}

async function call(method, path, body, token, extraHeaders, envRef = env) {
  const res = await handleLeagueRoute(makeReq(method, path, body, token, extraHeaders), envRef, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const db = createDb(env);
const token1 = await signToken(31, 'leagueP1', env);
const token2 = await signToken(32, 'leagueP2', env);

const p1 = await createInitialPlayerData('联赛甲', [1, 2, 3], env);
p1.level = 180;
await db.savePlayer(31, 1, p1);

const p2 = await createInitialPlayerData('联赛乙', [1, 2, 3], env);
p2.level = 180;
await db.savePlayer(32, 1, p2);

console.log('== 1. 鉴权 ==');
let r = await call('GET', '/league/status', null, null);
assert('未登录 401', r.status === 401, { status: r.status });

console.log('== 2. 状态 ==');
r = await call('GET', '/league/status', null, token1);
assert('状态含报名期与赛季', r.data && r.data.ok === true && r.data.timeline && r.data.timeline.registration_open === true && r.data.current_season && r.data.registration_season, { open: r.data && r.data.timeline && r.data.timeline.registration_open });
assert('me_* 字段存在', r.data && 'me_current_team' in r.data && 'me_registration_team' in r.data && 'my_league' in r.data, null);

console.log('== 3. 创建队伍 ==');
r = await call('POST', '/league/team/create', { name: '测试战队' }, token1);
assert('创建队伍成功', r.data && r.data.ok === true && r.data.team && r.data.team.team_code, r.data);
const teamCode = r.data && r.data.team && r.data.team.team_code;
assert('队长与成员正确', r.data && r.data.team.captain_account_id === 31 && Array.isArray(r.data.team.members) && r.data.team.members.length === 1, r.data && r.data.team);

console.log('== 4. 加入队伍 ==');
r = await call('POST', '/league/team/join', { team_code: teamCode }, token2);
assert('第二人加入成功', r.data && r.data.ok === true && r.data.team && Array.isArray(r.data.team.members) && r.data.team.members.length === 2, r.data);

console.log('== 5. 报名 ==');
r = await call('POST', '/league/register', { mode: 'team' }, token1);
assert('队伍报名成功', r.data && r.data.ok === true && r.data.team && r.data.team.registered === true, r.data);

console.log('== 6. 状态回查 ==');
r = await call('GET', '/league/status', null, token1);
assert('报名队伍可见', r.data && r.data.me_registration_team && r.data.me_registration_team.registered === true, r.data && r.data.me_registration_team);

console.log('== 7. 排行榜 ==');
r = await call('GET', '/league/leaderboard', null, token1);
assert('排行榜返回列表', r.data && r.data.ok === true && Array.isArray(r.data.list), r.data);

console.log('== 8. 队伍排行 ==');
r = await call('GET', '/league/team_rank', null, token1);
assert('队伍排行返回列表', r.data && r.data.ok === true && Array.isArray(r.data.list) && 'total' in r.data, r.data);

console.log('== 9. 战报 ==');
r = await call('GET', '/league/matches', null, token1);
assert('战报返回列表', r.data && r.data.ok === true && r.data.scope === 'self_team_only' && Array.isArray(r.data.list), r.data);

console.log('== 10. 商店 ==');
r = await call('GET', '/league/shop', null, token1);
assert('商店返回商品', r.data && r.data.ok === true && Array.isArray(r.data.goods) && r.data.goods.length > 0 && r.data.my_league_points === 0, { goods: r.data && r.data.goods && r.data.goods.length, pts: r.data && r.data.my_league_points });

console.log('== 11. 购买商品 ==');
const p1Rich = await db.getPlayerByAccountId(31);
p1Rich.league_points = 50;
await db.savePlayer(31, 1, p1Rich);
r = await call('POST', '/league/shop/buy', { item_id: 'mat_box_5', quantity: 1 }, token1);
assert('购买成功扣积分', r.data && r.data.ok === true && r.data.spent === 1 && r.data.my_league_points === 49 && Array.isArray(r.data.drops) && r.data.drops[0] && Number(r.data.drops[0].id) === 185, r.data);
const p1After = await db.getPlayerByAccountId(31);
const foundBox = (Array.isArray(p1After.inventory) ? p1After.inventory : []).some(page => (Array.isArray(page) ? page : []).some(slot => slot && slot.item && Number(slot.item.id) === 185));
assert('背包已入五阶材料箱', foundBox, { pts: p1After.league_points });

console.log('== 12. run_due 鉴权 ==');
r = await call('POST', '/league/run_due', {}, token1);
assert('未配置 GM token → 503', r.status === 503, { status: r.status });
r = await call('POST', '/league/run_due', {}, token1, { 'x-gm-token': 'wrong-token' }, envGm);
assert('GM token 错误 → 403', r.status === 403, { status: r.status });
r = await call('POST', '/league/run_due', {}, token1, { 'x-gm-token': 'gm-secret-123' }, envGm);
assert('GM token 正确 → 200', r.status === 200 && r.data && r.data.ok === true, { status: r.status, data: r.data });

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);