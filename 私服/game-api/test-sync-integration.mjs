// 集成测试：A5 无过期 token + 封禁心跳 + B5 离线收益（真实 worker.fetch 分发）
import worker from './src/index.js';
import { verifyToken } from './src/auth.js';

const store = new Map();
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const results = [];
    const sql = this.sql;
    const args = this.args;
    if (sql.includes('FROM players')) {
      for (const [k, v] of store) {
        if (k.startsWith('p:') && v.account_id === Number(args[0])) {
          results.push({ id: v.id, account_id: v.account_id, slot: 1, data: typeof v.data === 'string' ? v.data : JSON.stringify(v.data) });
        }
      }
    } else if (sql.includes('FROM accounts')) {
      for (const [k, v] of store) {
        if (k.startsWith('a:') && (args[0] === undefined || v.username === args[0] || v.id === Number(args[0]))) results.push({ ...v });
      }
    }
    return { results };
  }
  async run() {
    const sql = this.sql;
    if (sql.includes('INSERT INTO accounts')) {
      const [username, hash, ts] = this.args;
      const id = store.size + 1;
      store.set('a:' + username, { id, username, password_hash: hash, created_at: ts, is_banned: 0 });
      return { meta: { last_row_id: id } };
    }
    if (sql.includes('INSERT INTO players')) {
      const accountId = Number(this.args[0]);
      const data = this.args[1];
      store.set('p:' + accountId, { id: 100, account_id: accountId, slot: 1, data });
      return { meta: { last_row_id: 100 } };
    }
    if (sql.includes('UPDATE players SET data')) {
      const data = this.args[0];
      const id = Number(this.args[1]);
      for (const v of store.values()) if (v.id === id) v.data = data;
      return { meta: { rows_changed: 1 } };
    }
    return { meta: { last_row_id: store.size + 1 } };
  }
}
const env = {
  DB: { prepare(sql) { return new Stmt(sql); } },
  JWT_SECRET: 'it-secret',
  PASSWORD_PEPPER: 'it-pepper',
  BOOT_ID: 'ideer-it'
};

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const req = new Request('https://ideer.example.com/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, env, {});
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS', name, extra); }
  else { fail++; console.log('FAIL', name, extra); }
}

let r = await call('POST', '/auth/register', { username: 'tester', password: '123456' });
ok('注册成功', r.status === 200 && r.data?.ok);
const token = r.data.token;
const payload = await verifyToken(token, env);
ok('token 可验证', !!payload && payload.accountId > 0);
ok('A5 token 无 exp', payload && !('exp' in payload), JSON.stringify(payload));

r = await call('POST', '/player/create', { name: '测试道人', spirit_roots: {} }, token);
ok('创建角色', r.status === 200 && r.data?.ok);
const player = r.data.player;
ok('创建成功返回角色', !!player && player.name === '测试道人');
ok('创建时无离线报告', r.data.offline == null);

r = await call('GET', '/player/sync', null, token);
ok('首次 sync 初始化 last_sync_at', r.data.player.last_sync_at > 0);

// 模拟离线 1 小时 + 在线基准
const accId = payload.accountId;
const row = store.get('p:' + accId);
const pd = JSON.parse(row.data);
const now = Math.floor(Date.now() / 1000);
pd.last_sync_at = now - 3600;
pd.earn_stats = { exp_total: 5000, spirit_total: 500, battle_count: 50, ts: now };
pd.exp = 1000; pd.spirit_stones = 500; pd.max_hp = 1000; pd.max_mp = 500; pd.hp = 100; pd.mp = 50; pd.level = 50;
row.data = JSON.stringify(pd);

r = await call('GET', '/player/sync', null, token);
ok('sync 返回离线报告', r.status === 200 && r.data?.offline != null);
const off = r.data.offline;
ok('离线模式 benchmark', off.mode === 'benchmark');
ok('离线经验>0', off.exp_gained > 0, `exp=${off.exp_gained}`);
ok('离线灵石>0', off.spirit_gained > 0, `spirit=${off.spirit_gained}`);
ok('离线场次≈450', Math.abs(off.battles - Math.floor(3600/8)) <= 1, `battles=${off.battles}`);
ok('玩家经验已加', r.data.player.exp > 1000);
ok('离线满血', r.data.player.hp === 1000 && r.data.player.mp === 500);
ok('last_sync_at 已推进', Math.abs(r.data.player.last_sync_at - now) <= 5);
const pd2 = JSON.parse(store.get('p:' + accId).data);
ok('DB 已持久化离线收益', pd2.exp > 1000 && pd2.spirit_stones > 500, `dbExp=${pd2.exp}`);

const beforeExp = r.data.player.exp;
r = await call('GET', '/player/sync', null, token);
ok('短间隔不重复结算', r.data.offline == null);
ok('经验不再增加', r.data.player.exp === beforeExp);

const acc = store.get('a:tester');
acc.is_banned = 1; acc.ban_reason = '测试封禁';
r = await call('GET', '/player/sync', null, token);
ok('封禁后 sync 401', r.status === 401, `status=${r.status}`);
ok('封禁原因返回', String(r.data.error || '').includes('封禁'), r.data.error);

acc.is_banned = 0;
r = await call('GET', '/auth/renew', null, token);
ok('renew 成功', r.status === 200 && r.data?.ok && r.data.token);
const np = await verifyToken(r.data.token, env);
ok('新 token 无过期', np && !('exp' in np));

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);