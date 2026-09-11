// 副本路由集成测试（Worker 版）
// 运行：
//   npx esbuild test-dungeon.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\dungeon-bundle.mjs
//   node D:\Temp\opencode\dungeon-bundle.mjs
import { handleDungeonRoute } from './src/routes/dungeon.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';

const store = new Map();
let seq = 1000;
function rows(keyPrefix) {
  const out = [];
  for (const [k, v] of store) if (k.startsWith(keyPrefix)) out.push(v);
  return out;
}
function setRow(k, v) { store.set(k, v); return { meta: { last_row_id: seq++ } }; }

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const sql = this.sql, args = this.args;
    const results = [];
    if (sql.includes('FROM dungeon_completions')) {
      const arr = rows('dc:').filter(v => Number(v.account_id) === Number(args[0]) && Number(v.dungeon_id) === Number(args[1]) && v.date === args[2]);
      for (const v of arr) results.push(v);
    } else if (sql.includes('FROM dungeon_teams')) {
      const arr = rows('dt:').filter(v => v.team_code === args[0] && (v.expires_at > Math.floor(Date.now() / 1000)));
      if (arr[0]) results.push(arr[0]);
    } else if (sql.includes('FROM dungeon_team_members')) {
      const arr = rows('dtm:').filter(v => {
        // 支持两种查询：按 team_code 或按 account_id
        if (args[0] !== undefined && sql.includes('team_code = ?')) return String(v.team_code) === String(args[0]);
        if (args[0] !== undefined && sql.includes('account_id = ?')) return Number(v.account_id) === Number(args[0]);
        return true;
      });
      results.push(...arr);
    } else if (sql.includes('FROM players')) {
      const arr = rows('p:').filter(v => v.account_id === Number(args[0]));
      for (const v of arr) results.push({ data: typeof v.data === 'string' ? v.data : JSON.stringify(v.data) });
    } else if (sql.includes('FROM accounts')) {
      const arr = rows('a:').filter(v => v.id === Number(args[0]));
      for (const v of arr) results.push(v);
    }
    return { results };
  }
  async run() {
    const sql = this.sql, args = this.args;
    if (sql.startsWith('INSERT INTO players') || sql.includes('ON CONFLICT(account_id)')) {
      return setRow('p:' + Number(args[0]), { account_id: Number(args[0]), data: args[2] });
    }
    if (sql.includes('INSERT INTO dungeon_completions')) {
      const key = 'dc:' + args[0] + ':' + args[1] + ':' + args[2];
      const ex = store.get(key);
      if (ex) { ex.completions = (Number(ex.completions) || 0) + 1; }
      else setRow(key, { account_id: Number(args[0]), dungeon_id: Number(args[1]), date: args[2], completions: Number(args[3]) || 1 });
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.includes('UPDATE dungeon_completions')) {
      const key = 'dc:' + args[0] + ':' + args[1] + ':' + args[2];
      const ex = store.get(key);
      if (ex) ex.completions = (Number(ex.completions) || 0) + 1;
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.startsWith('INSERT INTO dungeon_teams')) {
      return setRow('dt:' + args[0], { team_code: args[0], leader_account_id: Number(args[1]), dungeon_id: Number(args[2]), expires_at: Number(args[3]) });
    }
    if (sql.includes('UPDATE dungeon_teams')) {
      const rec = store.get('dt:' + args[1]);
      if (rec) rec.expires_at = Number(args[0]);
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.includes('INSERT OR REPLACE INTO dungeon_team_members')) {
      return setRow('dtm:' + args[0] + ':' + args[1], { team_code: args[0], account_id: Number(args[1]), joined_at: Math.floor(Date.now() / 1000) });
    }
    if (sql.startsWith('DELETE FROM dungeon_team_members')) {
      const code = String(args[0] || '').toUpperCase();
      const aid = Number(args[1] || 0);
      for (const k of [...store.keys()]) if (k.startsWith('dtm:' + code + ':') && (aid <= 0 || store.get(k).account_id === aid)) store.delete(k);
      return { meta: { last_row_id: seq++ } };
    }
    return { meta: { last_row_id: seq++ } };
  }
}

const env = {
  DB: {
    prepare(sql) { return new Stmt(sql); },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; }
  },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper'
};

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label, JSON.stringify(detail)); }
}

function makeReq(method, path, body, token) {
  const headers = token
    ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
  return {
    method,
    url: path,
    headers: {
      get: (name) => headers[name] || null
    },
    json: async () => body || {}
  };
}

async function call(fn, method, path, body, token) {
  const res = await fn(makeReq(method, 'http://test/api' + path, body, token), env, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// 预置两个账号+角色（同境界：level 30）
const db = createDb(env);
const tokenA = await signToken(11, 'playerA', env);
const tokenB = await signToken(12, 'playerB', env);
const tokenC = await signToken(13, 'playerC', env);
const pa = await createInitialPlayerData('甲修士', [1, 2, 3], env);
pa.level = 30;
const pb = await createInitialPlayerData('乙修士', [1, 2, 3], env);
pb.level = 30;
const pc = await createInitialPlayerData('丙修士', [1, 2, 3], env);
pc.level = 150; // 不同境界（结丹 → 与练气甲/乙不同）
await db.savePlayer(11, 1, pa);
await db.savePlayer(12, 1, pb);
await db.savePlayer(13, 1, pc);
store.set('a:11', { id: 11, username: 'playerA' });
store.set('a:12', { id: 12, username: 'playerB' });
store.set('a:13', { id: 13, username: 'playerC' });

console.log('== 1. 列表接口（无需登录）==');
let r = await call(handleDungeonRoute, 'GET', '/dungeon/list', null, null);
assert('副本列表', r.data && r.data.ok === true && Array.isArray(r.data.dungeons) && r.data.dungeons.length > 0, r.data);
r = await call(handleDungeonRoute, 'GET', '/dungeon/monsters', null, null);
assert('怪物列表', r.data && r.data.ok === true && Array.isArray(r.data.monsters), r.data);
r = await call(handleDungeonRoute, 'GET', '/dungeon/monsters/1', null, null);
assert('指定副本怪物', r.data && r.data.ok === true, r.data);

console.log('== 2. 副本详情（需登录）==');
r = await call(handleDungeonRoute, 'GET', '/dungeon/1', null, tokenA);
assert('副本详情含剩余次数', r.data && r.data.ok === true && typeof r.data.remaining_today === 'number' && r.data.completions_today === 0, r.data);
r = await call(handleDungeonRoute, 'GET', '/dungeon/1', null, null);
assert('未登录 401', r.status === 401, { status: r.status });

console.log('== 3. 队伍生命周期 ==');
r = await call(handleDungeonRoute, 'POST', '/dungeon/team/create', {}, tokenA);
assert('创建队伍', r.data && r.data.ok === true && r.data.team_code, r.data);
const code = r.data.team_code;

r = await call(handleDungeonRoute, 'GET', '/dungeon/team/mine', null, tokenA);
assert('我的队伍', r.data && r.data.ok === true && r.data.team && r.data.team.team_code === code, r.data);

r = await call(handleDungeonRoute, 'POST', '/dungeon/team/join', { team_code: code }, tokenB);
assert('同境界加入成功', r.data && r.data.ok === true, r.data);

r = await call(handleDungeonRoute, 'POST', '/dungeon/team/join', { team_code: code }, tokenC);
assert('不同境界被拒', r.data && r.data.ok === false && /境界/.test(r.data.error || ''), r.data);

r = await call(handleDungeonRoute, 'GET', '/dungeon/team/' + code, null, tokenB);
assert('队伍信息含成员', r.data && r.data.ok === true && r.data.team && r.data.team.members.length === 2, r.data);
assert('自己非队长', r.data.team && r.data.team.self_account_id === 12 && r.data.team.is_leader === false, r.data.team);

r = await call(handleDungeonRoute, 'POST', '/dungeon/team/kick', { team_code: code, target_account_id: 12 }, tokenB);
assert('非队长不能踢人', r.data && r.data.ok === false, r.data);

r = await call(handleDungeonRoute, 'POST', '/dungeon/team/kick', { team_code: code, target_account_id: 12 }, tokenA);
assert('队长踢人成功', r.data && r.data.ok === true && r.data.team && r.data.team.members.length === 1, r.data);

r = await call(handleDungeonRoute, 'POST', '/dungeon/team/join', { team_code: code }, tokenB);
assert('被踢后可重新加入', r.data && r.data.ok === true, r.data);

r = await call(handleDungeonRoute, 'POST', '/dungeon/team/leave', { team_code: code }, tokenB);
assert('离开队伍', r.data && r.data.ok === true, r.data);
r = await call(handleDungeonRoute, 'GET', '/dungeon/team/mine', null, tokenB);
assert('离开后无队伍', r.data && r.data.ok === true && r.data.team === null, r.data);

console.log('== 4. 每日完成次数 ==');
r = await call(handleDungeonRoute, 'GET', '/dungeon/1', null, tokenA);
assert('剩余次数为默认值', r.data && r.data.remaining_today === (Number(r.data.dungeon.daily_limit) || 2) - 0, { remaining: r.data.remaining_today });
// 模拟通关一次（由 dungeonBattle 结算时调用 incrementDungeonCompletions）
await db.incrementDungeonCompletions(11, 1);
r = await call(handleDungeonRoute, 'GET', '/dungeon/1', null, tokenA);
assert('通关后次数+1', r.data && r.data.completions_today === 1 && r.data.remaining_today === (Number(r.data.dungeon.daily_limit) || 2) - 1, { completions: r.data.completions_today, remaining: r.data.remaining_today });

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');