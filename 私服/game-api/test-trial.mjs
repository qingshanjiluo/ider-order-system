// 试炼路由集成测试（Worker 版）
// 运行：
//   npx esbuild test-trial.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\trial-bundle.mjs
//   node D:\Temp\opencode\trial-bundle.mjs
import { handleTrialRoute } from './src/routes/trial.js';
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
    return { results };
  }
  async run() {
    if (this.sql.includes('INSERT INTO players') || this.sql.includes('ON CONFLICT(account_id)')) {
      return setRow('p:' + Number(this.args[0]), { account_id: Number(this.args[0]), slot: Number(this.args[1]), data: this.args[2] });
    }
    return { meta: { last_row_id: seq++ } };
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
  const res = await handleTrialRoute(makeReq(method, path, body, token), env, path.split('?')[0]);
  const data = res ? await res.json().catch(() => null) : null;
  return { status: res ? res.status : 0, data };
}

const db = createDb(env);
const token = await signToken(31, 'playerTrial', env);

console.log('== 1. 鉴权 ==');
let r = await call('GET', '/trial/contracts', null, null);
assert('未登录 401', r.status === 401, { status: r.status });

console.log('== 2. 契约与商店 ==');
r = await call('GET', '/trial/contracts', null, token);
assert('契约定义+最大积分+副本倍率', r.data && r.data.ok === true && Array.isArray(r.data.modifiers) && r.data.modifiers.length === 18 && r.data.max_score > 0 && Array.isArray(r.data.dungeon_reward_multipliers), { n: r.data && r.data.modifiers && r.data.modifiers.length });
r = await call('GET', '/trial/shop', null, token);
assert('商店商品(带效果文本)', r.data && r.data.ok === true && Array.isArray(r.data.goods) && r.data.goods.length === 18 && r.data.goods.every(g => typeof g.effect_text === 'string'), { n: r.data && r.data.goods && r.data.goods.length });

console.log('== 3. 删除问心试炼后 /trial/start 不再处理 ==');
r = await call('POST', '/trial/start', {}, token);
assert('/trial/start 已被移除', r.data === null, r.data);
r = await call('POST', '/trial/advance', { battle_id: 'x' }, token);
assert('/trial/advance 已被移除', r.data === null, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);