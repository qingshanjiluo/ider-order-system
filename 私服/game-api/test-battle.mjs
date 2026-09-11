// 战斗路由集成测试（Worker 版）：poll 惰性推进 + command 逐指令
// 运行：
//   npx esbuild test-battle.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\battle-bundle.mjs
//   node D:\Temp\opencode\battle-bundle.mjs
import { handleBattleRoute } from './src/routes/battle.js';
import { handlePlayerRoute } from './src/routes/player.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';

// ── 模拟 D1（支持 players/accounts/battle_sessions/battle_commands/battle_events）──
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
    if (sql.includes('FROM players') && sql.includes('account_id = ?')) {
      for (const v of rows('p:')) if (v.account_id === Number(args[0])) results.push({ data: typeof v.data === 'string' ? v.data : JSON.stringify(v.data) });
    } else if (sql.includes('FROM battle_sessions') && sql.includes('account_id = ?') && sql.includes("status = 'active'")) {
      const arr1 = rows('b:').filter(v => v.account_id === Number(args[0]) && v.status === 'active').sort((a, b) => (b.started_at - a.started_at) || (b.id > a.id ? 1 : -1));
      if (arr1[0]) results.push(arr1[0]);
    } else if (sql.includes('FROM battle_sessions') && sql.includes('account_id = ?')) {
      const arr2 = rows('b:').filter(v => v.account_id === Number(args[0])).sort((a, b) => (b.started_at - a.started_at) || (b.id > a.id ? 1 : -1));
      if (arr2[0]) results.push(arr2[0]);
    } else if (sql.includes('FROM battle_sessions') && sql.includes('id = ?')) {
      const arr3 = rows('b:').filter(v => v.id === String(args[0]));
      if (arr3[0]) results.push(arr3[0]);
    } else if (sql.includes('FROM battle_events') && sql.includes('event_index > ?')) {
      const arr4 = rows('e:' + args[0] + ':').filter(v => v.event_index > Number(args[1])).sort((a, b) => a.event_index - b.event_index);
      for (const v of arr4.slice(0, Number(args[2]) || 200)) results.push(v);
    } else if (sql.includes('FROM battle_events') && sql.includes('battle_id = ?')) {
      const arr5 = rows('e:' + args[0] + ':').sort((a, b) => a.event_index - b.event_index);
      if (arr5[0]) results.push(arr5[0]);
    } else if (sql.includes('FROM battle_commands') && sql.includes('seq = ?')) {
      const arr6 = rows('c:' + args[0] + ':').filter(v => v.seq === Number(args[1]));
      if (arr6[0]) results.push(arr6[0]);
    }
    return { results };
  }
  async run() {
    const sql = this.sql, args = this.args;
    if (sql.startsWith('INSERT INTO players')) {
      return setRow('p:' + Number(args[0]), { account_id: Number(args[0]), data: args[2] });
    }
    if (sql.includes('ON CONFLICT(account_id)')) {
      return setRow('p:' + Number(args[0]), { account_id: Number(args[0]), data: args[2] });
    }
    if (sql.startsWith('INSERT INTO battle_sessions')) {
      const rec = {
        id: String(args[0]), account_id: Number(args[1]), map_id: Number(args[2]), enemy_id: Number(args[3]),
        started_at: Number(args[4]), expires_at: Number(args[5]), status: 'active',
        state_json: args[6], last_seq: 0, result_json: '{}', ended_at: 0, last_cmd_at: Number(args[7]),
        rng_seed: Number(args[8]), rng_cursor: 0
      };
      return setRow('b:' + rec.id, rec);
    }
    if (sql.includes('UPDATE battle_sessions')) {
      const id = String(args[args.length - 1]);
      const rec = store.get('b:' + id);
      if (rec) {
        if (sql.includes('state_json = ?')) { rec.state_json = args[0]; rec.last_seq = Number(args[1]); rec.status = args[2]; rec.result_json = args[3]; rec.ended_at = Number(args[4]); rec.last_cmd_at = Number(args[5]); rec.expires_at = Number(args[6]); }
        else if (sql.includes('status = ?')) { rec.status = args[0]; rec.result_json = args[1]; rec.ended_at = Number(args[2]); rec.last_cmd_at = Number(args[3]); rec.expires_at = Number(args[4]); }
        else if (sql.includes('state_json')) { rec.state_json = args[0]; rec.last_seq = Number(args[1]); rec.status = args[2]; rec.result_json = args[3]; rec.ended_at = Number(args[4]); rec.last_cmd_at = Number(args[5]); rec.expires_at = Number(args[6]); rec.rng_cursor = Number(args[7]); }
        else { rec.expires_at = Number(args[0]); }
      }
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.startsWith('DELETE FROM battle_sessions')) {
      const id = String(args[0]);
      store.delete('b:' + id);
      for (const k of [...store.keys()]) if (k.startsWith('e:' + id + ':') || k.startsWith('c:' + id + ':')) store.delete(k);
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.startsWith('DELETE FROM battle_commands')) { for (const k of [...store.keys()]) if (k.startsWith('c:' + String(args[0]) + ':')) store.delete(k); return { meta: { last_row_id: seq++ } }; }
    if (sql.startsWith('DELETE FROM battle_events')) {
      if (sql.includes('event_index < ?')) {
        const keepIdx = Number(args[1]);
        for (const k of [...store.keys()]) if (k.startsWith('e:' + String(args[0]) + ':')) { const idx = Number(k.slice(k.lastIndexOf(':') + 1)); if (idx < keepIdx) store.delete(k); }
      } else {
        for (const k of [...store.keys()]) if (k.startsWith('e:' + String(args[0]) + ':')) store.delete(k);
      }
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.startsWith('INSERT INTO battle_events') || sql.includes('INSERT OR REPLACE INTO battle_events')) {
      const rowsA = Array.isArray(args[0]) ? args : [args];
      if (Array.isArray(args[0])) {
        for (const a of args) {
          store.set('e:' + String(a[0]) + ':' + Number(a[1]), { battle_id: String(a[0]), event_index: Number(a[1]), event_json: a[2], created_at: Number(a[3]) });
        }
      } else {
        store.set('e:' + String(args[0]) + ':' + Number(args[1]), { battle_id: String(args[0]), event_index: Number(args[1]), event_json: args[2], created_at: Number(args[3]) });
      }
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.startsWith('INSERT INTO battle_commands')) {
      store.set('c:' + String(args[0]) + ':' + Number(args[1]), { battle_id: String(args[0]), seq: Number(args[1]), command_json: args[2], apply_result_json: args[3], recv_at: Number(args[4]) });
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
  PASSWORD_PEPPER: 'test-pepper',
  COMMAND_DELAY_DISABLED: '1'
};

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// 工具：构造请求并调用路由（poll 需带 query，route 匹配用 pathname）
function makeReq(method, urlStr, body, token) {
  const u = new URL(urlStr, 'http://test');
  return {
    method,
    url: u,
    headers: new Headers(token ? { Authorization: 'Bearer ' + token } : {}),
    async json() { return body; }
  };
}
async function call(routeFn, method, path, body, token) {
  const route = path.split('?')[0];
  const res = await routeFn(makeReq(method, 'http://test/api' + path, body, token), env, route);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// 预置账号+角色
const db = createDb(env);
const token = await signToken(1, 'battler', env);
const p = await createInitialPlayerData('斗战修士', [1, 2, 3], env);
p.exp = 500000;
p.current_map_id = 1;
await db.savePlayer(1, 1, p);

console.log('== 1. 逐指令模式（command）==');
// start 战斗（无 poll_mode → command 模式）
let r = await call(handleBattleRoute, 'POST', '/battle/start', { mapId: 1 }, token);;
assert('start 成功', r && r.data && r.data.ok === true, r && r.data);
const battleId = r.data.battleId;
assert('返回 battleId', !!battleId);
assert('非 server_driven', r.data.server_driven === false);

// 第一次 command 后验证幂等：进行中发重复 seq
let firstCmd = await call(handleBattleRoute, 'POST', '/battle/command', { battleId, seq: 1, action: 'attack' }, token);
assert('首次指令成功', firstCmd.data && firstCmd.data.ok === true, firstCmd.data);
const idem = await call(handleBattleRoute, 'POST', '/battle/command', { battleId, seq: 1, action: 'attack' }, token);
assert('重复 seq 幂等', idem.data && idem.data.idempotent === true, idem.data);

// 连续 command 推进直到结束（最多 200 次）
let cmds = 1;
let finalResp = null;
while (cmds < 200) {
  const seqN = cmds + 1;
  r = await call(handleBattleRoute, 'POST', '/battle/command', { battleId, seq: seqN, action: 'attack' }, token);;
  cmds += 1;
  if (!r.data || r.data.ok === false) { finalResp = r.data; break; }
  if (r.data.ended) { finalResp = r.data; break; }
}
assert('指令推进到结束', finalResp && finalResp.ended === true, finalResp);
assert('战斗结果字段完整', finalResp && 'victory' in finalResp && 'rewards' in finalResp, finalResp && finalResp.rewards);
if (finalResp) {
  assert('结算有经验', Number(finalResp.rewards.exp) >= 0);
  assert('返回玩家', finalResp.player && finalResp.player.level > 0);
}

console.log('== 2. poll 模式（server_driven 惰性推进 + 结算奖励）==');
// command 战斗可能战败进入调息 → 清掉 rest_until 再测 poll
const pClear = await db.getPlayerByAccountId(1);
pClear.rest_until = 0;
await db.savePlayer(1, 1, pClear);
r = await call(handleBattleRoute, 'POST', '/battle/start', { mapId: 1, poll_mode: true, auto_restart: false }, token);;
assert('poll start 成功', r.data && r.data.ok === true, r.data);
assert('server_driven 标记', r.data.server_driven === true, r.data);
const pollBattleId = r.data.battleId;

// poll 推进直到结束（server_driven 惰性推进，不受 speedhack 限制）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pollRes = null;
let eventsSeen = 0;
for (let i = 0; i < 60; i++) {
  r = await call(handleBattleRoute, 'GET', '/battle/poll?after=0&auto_restart=false', null, token);;
  pollRes = r.data;
  eventsSeen += (pollRes && pollRes.events) ? pollRes.events.length : 0;
  if (!pollRes || pollRes.active === false) break;
  await sleep(600);
}
assert('poll 战斗事件已推送', eventsSeen > 0, { eventsSeen });
assert('poll 返回有效', pollRes && pollRes.ok === true, pollRes);
assert('poll 战斗结束并带奖励', pollRes && pollRes.active === false && pollRes.finished === true, pollRes && { active: pollRes.active, finished: pollRes.finished });
if (pollRes && pollRes.finished) {
  assert('poll 有奖励对象', typeof pollRes.rewards === 'object', pollRes.rewards);
}
const pAfter = await db.getPlayerByAccountId(1);
const beforeExp = 500000;
// 战斗结算机制验证：胜利→经验增加；战败→进入调息
const settledOk = Number(pAfter.exp) > beforeExp || Number(pAfter.rest_until || 0) > Math.floor(Date.now() / 1000);
assert('poll 结算已生效（胜加经验/败调息）', settledOk, { exp: pAfter.exp, rest_until: pAfter.rest_until, pollRes: pollRes && { victory: pollRes.victory } });

console.log('== 3. auto_restart 接口 ==');
r = await call(handleBattleRoute, 'POST', '/battle/auto_restart', { enabled: true, map_id: 1 }, token);;
assert('auto_restart 成功', r.data && r.data.ok === true, r.data);
const pA = await db.getPlayerByAccountId(1);
assert('auto_battle_enabled 已存', pA.auto_battle_enabled === true, { ab: pA.auto_battle_enabled });

console.log('== 4. 未登录被拒 ==');
r = await call(handleBattleRoute, 'POST', '/battle/start', { mapId: 1 }, null);;
assert('未登录 401', r.status === 401, { status: r.status });

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);