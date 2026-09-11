// 洞府系统集成测试（Worker 版）
// 运行：
//   npx esbuild test-cave.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\cave-bundle.mjs
//   node D:\Temp\opencode\cave-bundle.mjs
import { handleCaveDiscipleRoute } from './src/routes/online/caveDiscipleRoutes.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';

const store = new Map();
let seq = 1000;
function setRow(k, v) { store.set(k, v); return { meta: { last_row_id: seq++ } }; }

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const results = [];
    if (this.sql.includes('SELECT data FROM players')) {
      const p = store.get('p:' + Number(this.args[0]));
      if (p) results.push({ data: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) });
    }
    // 未知 SELECT 返回空集（battle_sessions 等缓存查询安全降级）
    return { results };
  }
  async run() {
    if (this.sql.includes('INSERT INTO players')) {
      return setRow('p:' + Number(this.args[0]), { account_id: Number(this.args[0]), slot: Number(this.args[1]), data: this.args[2] });
    }
    return { meta: { changes: 0, last_row_id: seq++ } };
  }
}

const env = {
  DB: { prepare(sql) { return new Stmt(sql); }, async batch(stmts) { for (const s of stmts) await s.run(); return []; } },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper'
};

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label, JSON.stringify(detail)); }
}

function makeReq(method, path, body, token) {
  const headers = token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  return { method, url: 'http://test/api' + path, headers: { get: (name) => headers[name] || null }, json: async () => body || {} };
}

async function call(method, path, body, token) {
  const res = await handleCaveDiscipleRoute(makeReq(method, path, body, token), env, path.split('?')[0]);
  const data = res ? await res.json().catch(() => null) : null;
  return { status: res ? res.status : 0, data };
}

const db = createDb(env);
const token = await signToken(31, 'playerCave', env);

console.log('== 1. 鉴权 ==');
let r = await call('GET', '/cave/status', null, null);
assert('未登录 401', r.status === 401, { status: r.status });
r = await call('GET', '/disciple/status', null, token);
assert('传人接口已删除(未匹配)', r.data === null, r.data);

console.log('== 2. 洞府状态 ==');
const p = await createInitialPlayerData('洞府修士', [1, 2, 3], env);
p.level = 50;
p.spirit_stones = 500000;
await db.savePlayer(31, 1, p);
r = await call('GET', '/cave/status', null, token);
assert('洞府状态返回', r.data && r.data.ok === true && Number(r.data.level) >= 1, r.data);

console.log('== 3. 采集 ==');
r = await call('POST', '/cave/start', { type: 'field' }, token);
assert('开始灵田采集', r.data && r.data.ok === true && r.data.gathering && r.data.gathering.type === 'field', r.data);
r = await call('POST', '/cave/start', { type: 'mine' }, token);
assert('采集中不可切换', r.data && r.data.ok === false, r.data);
r = await call('POST', '/cave/stop', {}, token);
assert('停止采集', r.data && r.data.ok === true, r.data);

console.log('== 4. 洞府升级 ==');
r = await call('POST', '/cave/upgrade', {}, token);
assert('升级洞府', r.data && r.data.ok === true && r.data.level >= 2, r.data);

console.log('== 5. 阵形操作 ==');
r = await call('POST', '/cave/formation/clear', {}, token);
assert('清空阵盘', r.data && r.data.ok === true, r.data);
r = await call('POST', '/cave/formation/place', { piece_uid: 'none', target_index: 0 }, token);
assert('放置无效阵纹被拒', r.data && r.data.ok === false, r.data);
r = await call('POST', '/cave/formation/pick', { source_index: 0 }, token);
assert('拾取空位被拒', r.data && r.data.ok === false, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);