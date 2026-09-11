// 邀请/邮箱/GM/传人 系统集成测试（Worker 版）
// 运行：
//   npx esbuild test-small.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\small-bundle.mjs
//   node D:\Temp\opencode\small-bundle.mjs
import { handleInviteRoute } from './src/routes/invite.js';
import { handleEmailRoute } from './src/routes/email.js';
import { handleGmRoute } from './src/routes/gm.js';
import { handleApprenticeRoute } from './src/routes/apprentice.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';

const store = new Map();
let seq = 1000;
const setRow = (k, v) => { store.set(k, v); return { meta: { last_row_id: seq++ } }; };

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const results = [];
    const sql = this.sql;
    const a = this.args;
    const acc = (id) => store.get('acc:' + Number(id));
    if (sql.includes('SELECT data FROM players')) {
      const p = store.get('p:' + Number(a[0]));
      if (p) results.push({ data: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) });
    } else if (sql.includes('FROM invite_inviters WHERE account_id')) {
      const r = store.get('inv:' + Number(a[0]));
      if (r) results.push(r);
    } else if (sql.includes('FROM invite_inviters WHERE invite_code')) {
      for (const v of store.values()) {
        if (v && v.invite_code === String(a[0] || '')) { results.push(v); break; }
      }
    } else if (sql.includes('FROM invite_bindings WHERE invitee_account_id')) {
      const r = store.get('bind:' + Number(a[0]));
      if (r) results.push(r);
    } else if (sql.includes('SELECT stored_stones, per_person_stones, invite_points')) {
      const r = store.get('inv:' + Number(a[0]));
      if (r) results.push({ stored_stones: r.stored_stones, per_person_stones: r.per_person_stones, invite_points: r.invite_points });
    } else if (sql.includes('FROM invite_point_claims WHERE inviter_account_id')) {
      const r = store.get(`claim:${Number(a[0])}:${Number(a[1])}`);
      if (r) results.push({ x: 1 });
    } else if (sql.includes('FROM invite_bindings b') || sql.includes('LEFT JOIN accounts a')) {
      for (const v of store.values()) {
        if (v && v.kind === 'binding' && Number(v.inviter_account_id) === Number(a[0])) {
          const inv = store.get('acc:' + Number(v.invitee_account_id));
          results.push({ ...v, username: inv ? inv.username : '', created_at: inv ? inv.created_at : 0 });
        }
      }
    } else if (sql.includes('SELECT * FROM accounts WHERE username')) {
      for (const v of store.values()) {
        if (v && v.kind === 'account' && v.username === String(a[0])) { results.push(v); break; }
      }
    } else if (sql.includes('SELECT * FROM accounts WHERE id')) {
      const r = store.get('acc:' + Number(a[0]));
      if (r) results.push(r);
    } else if (sql.includes('SELECT email, email_verified FROM accounts')) {
      const r = store.get('acc:' + Number(a[0]));
      if (r) results.push({ email: r.email, email_verified: r.email_verified });
    } else if (sql.includes('FROM accounts WHERE email = ? AND email_verified = 1')) {
      for (const v of store.values()) {
        if (v && v.kind === 'account' && v.email === String(a[0] || '') && Number(v.email_verified) === 1) { results.push(v); break; }
      }
    } else if (sql.includes('SELECT 1') && sql.includes('FROM accounts WHERE email')) {
      for (const v of store.values()) {
        if (v && v.kind === 'account' && v.email === String(a[0] || '') && Number(v.email_verified) === 1) { results.push({ x: 1 }); break; }
      }
    } else if (sql.includes('FROM email_verification_codes')) {
      if (sql.includes('WHERE account_id = ? AND email = ? AND code = ?')) {
        const key = `ec:${Number(a[0])}:${String(a[1] || '')}:${String(a[2] || '')}`;
        const c = store.get(key);
        if (c && Number(c.used) === 0 && Number(c.expires_at) > Math.floor(Date.now() / 1000)) {
          results.push({ id: c.id, ...c });
        }
      } else if (sql.includes('ORDER BY created_at DESC')) {
        const candidates = [];
        for (const v of store.values()) {
          if (v && v.kind === 'emailcode' && Number(v.account_id) === Number(a[0]) && Number(v.used) === 0) candidates.push(v);
        }
        if (candidates.length) {
          candidates.sort((x, y) => Number(y.created_at) - Number(x.created_at));
          results.push({ created_at: candidates[0].created_at });
        }
      }
    }
    return { results };
  }
  async run() {
    const sql = this.sql;
    const a = this.args;
    if (sql.includes('INSERT INTO players')) {
      return setRow('p:' + Number(a[0]), { account_id: Number(a[0]), slot: Number(a[1]), data: a[2] });
    }
    if (sql.includes('INSERT INTO invite_inviters')) {
      const aid = Number(a[0]);
      const row = { account_id: aid, invite_code: String(a[1]), stored_stones: 0, per_person_stones: 0, invite_points: 0, updated_at: 0 };
      store.set('inv:' + aid, row);
      return { meta: { changes: 1, last_row_id: seq++ } };
    }
    if (sql.includes('INSERT INTO invite_bindings')) {
      const row = { invitee_account_id: Number(a[0]), inviter_account_id: Number(a[1]), bound_at: a[2], stones_granted: a[3], kind: 'binding' };
      store.set('bind:' + Number(a[0]), row);
      return { meta: { changes: 1, last_row_id: seq++ } };
    }
    if (sql.includes('INSERT INTO invite_point_claims')) {
      store.set(`claim:${Number(a[0])}:${Number(a[1])}`, { x: 1 });
      return { meta: { changes: 1, last_row_id: seq++ } };
    }
    if (sql.includes('INSERT INTO email_verification_codes')) {
      const id = seq++;
      store.set(`ec:${Number(a[0])}:${String(a[1])}:${String(a[2])}`, { kind: 'emailcode', id, account_id: Number(a[0]), email: String(a[1]), code: String(a[2]), created_at: Number(a[3]), expires_at: Number(a[4]), used: 0 });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.includes('UPDATE email_verification_codes SET used = 1 WHERE account_id')) {
      for (const v of store.values()) if (v && v.kind === 'emailcode' && Number(v.account_id) === Number(a[0]) && Number(v.used) === 0) v.used = 1;
      return { meta: { changes: 0 } };
    }
    if (sql.includes('UPDATE email_verification_codes SET used = 1 WHERE id')) {
      for (const v of store.values()) if (v && v.kind === 'emailcode' && Number(v.id) === Number(a[0])) v.used = 1;
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE invite_inviters SET invite_points = invite_points +')) {
      const r = store.get('inv:' + Number(a[2]));
      if (r) { r.invite_points = Number(r.invite_points) + Number(a[0]); r.updated_at = a[1]; }
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE invite_inviters SET invite_points = invite_points -')) {
      const r = store.get('inv:' + Number(a[2]));
      if (r && Number(r.invite_points) >= Number(a[0])) {
        r.invite_points = Number(r.invite_points) - Number(a[0]);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (sql.includes('UPDATE invite_inviters SET stored_stones = stored_stones -')) {
      const r = store.get('inv:' + Number(a[2]));
      if (r && Number(r.stored_stones) >= Number(a[0])) {
        r.stored_stones = Number(r.stored_stones) - Number(a[0]);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (sql.includes('UPDATE invite_inviters SET stored_stones = ?, per_person_stones')) {
      const r = store.get('inv:' + Number(a[3]));
      if (r) { r.stored_stones = Number(a[0]); r.per_person_stones = Number(a[1]); }
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE invite_bindings SET stones_granted')) {
      const r = store.get('bind:' + Number(a[1]));
      if (r) r.stones_granted = Number(a[0]);
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE accounts SET email = ?, email_verified')) {
      const r = store.get('acc:' + Number(a[1]));
      if (r) { r.email = String(a[0]); r.email_verified = 1; }
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE accounts SET email = \'\'')) {
      const r = store.get('acc:' + Number(a[0]));
      if (r) { r.email = ''; r.email_verified = 0; }
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE accounts SET is_banned = 0')) {
      const r = store.get('acc:' + Number(a[0]));
      if (r) { r.is_banned = 0; r.ban_reason = ''; r.banned_at = 0; r.ban_expires_at = 0; }
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE accounts SET is_banned')) {
      const r = store.get('acc:' + Number(a[2]));
      if (r) { r.is_banned = 1; r.ban_expires_at = Number(a[0]); r.ban_reason = String(a[1]); }
      return { meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE accounts SET password_hash')) {
      const r = store.get('acc:' + Number(a[1]));
      if (r) r.password_hash = String(a[0]);
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0, last_row_id: seq++ } };
  }
}

const env = {
  DB: {
    prepare(sql) { return new Stmt(sql); },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; }
  },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper',
  GM_TOOL_TOKEN: 'gm-test-token'
};

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label, JSON.stringify(detail)); }
}

function makeReq(method, path, body, token, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = 'Bearer ' + token;
  return { method, url: 'http://test/api' + path, headers: { get: (name) => headers[name] || null }, json: async () => body || {} };
}

async function call(handler, method, path, body, token, extraHeaders) {
  const res = await handler(makeReq(method, path, body, token, extraHeaders), env, path.split('?')[0]);
  if (!res) return { status: 0, data: null };
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const db = createDb(env);

// ── 准备账号数据 ──
store.set('acc:1', { id: 1, username: '邀请人', password_hash: 'x', email: '', email_verified: 0, created_at: Math.floor(Date.now() / 1000), kind: 'account', is_banned: 0, ban_reason: '', banned_at: 0, ban_expires_at: 0, machine_share_ban_count: 0 });
store.set('acc:2', { id: 2, username: '被邀请人', password_hash: 'x', email: 'user@test.com', email_verified: 1, created_at: Math.floor(Date.now() / 1000), kind: 'account', is_banned: 0, ban_reason: '', banned_at: 0, ban_expires_at: 0, machine_share_ban_count: 0 });
const token1 = await signToken(1, '邀请人', env);
const token2 = await signToken(2, '被邀请人', env);

// ── 准备角色数据 ──
const p1 = await createInitialPlayerData('邀请人角色', [1, 2, 3], env);
p1.level = 150;
p1.spirit_stones = 100000;
await db.savePlayer(1, 1, p1);
const p2 = await createInitialPlayerData('被邀请人角色', [1, 2, 3], env);
p2.level = 120;
p2.spirit_stones = 100000;
await db.savePlayer(2, 1, p2);

console.log('== 1. GM 鉴权 ==');
let r = await call(handleGmRoute, 'GET', '/gm/status?username=邀请人', null, null);
assert('错误token 403', r.status === 403, r);
const envNoGm = { ...env, GM_TOOL_TOKEN: '' };
const r503 = await handleGmRoute(makeReq('GET', '/gm/status?username=邀请人', null, null), envNoGm, '/gm/status');
assert('未配置token时 503', r503 && r503.status === 503, r503 && r503.status);
r = await call(handleGmRoute, 'GET', '/gm/status?username=邀请人', null, null, { 'x-gm-token': 'wrong' });
assert('错误token 403', r.status === 403, r);
r = await call(handleGmRoute, 'GET', '/gm/status?username=邀请人', null, null, { 'x-gm-token': 'gm-test-token' });
assert('GM 查询账号状态', r.data && r.data.ok === true && r.data.data.username === '邀请人', r.data);
r = await call(handleGmRoute, 'POST', '/gm/ban', { username: '被邀请人', reason: '测试' }, null, { 'x-gm-token': 'gm-test-token' });
assert('GM 封禁', r.data && r.data.ok === true, r.data);
assert('封禁落库', Number(store.get('acc:2').is_banned) === 1, store.get('acc:2'));
r = await call(handleGmRoute, 'POST', '/gm/unban', { username: '被邀请人' }, null, { 'x-gm-token': 'gm-test-token' });
assert('GM 解封', r.data && r.data.ok === true, r.data);
assert('解封落库', Number(store.get('acc:2').is_banned) === 0, store.get('acc:2'));

console.log('== 2. 邀请：信息/生成 ==');
r = await call(handleInviteRoute, 'GET', '/invite/info', null, token1);
assert('邀请信息', r.data && r.data.ok === true && r.data.invite_code && r.data.invite_points === 0, r.data);
const code = r.data.invite_code;
r = await call(handleInviteRoute, 'POST', '/invite/generate', {}, token1);
assert('生成幂等返回同码', r.data && r.data.ok === true && r.data.invite_code === code, r.data);
r = await call(handleInviteRoute, 'GET', '/invite/info', null, null);
assert('未登录 401', r.status === 401, r);

console.log('== 3. 邀请：绑定 ==');
r = await call(handleInviteRoute, 'POST', '/invite/bind', { invite_code: 'BADCODE' }, token2);
assert('无效邀请码', r.data && r.data.ok === false && /无效/.test(r.data.error || ''), r.data);
r = await call(handleInviteRoute, 'POST', '/invite/bind', { invite_code: code }, token1);
assert('不能绑定自己的邀请码', r.data && r.data.ok === false && /自己/.test(r.data.error || ''), r.data);
r = await call(handleInviteRoute, 'POST', '/invite/bind', { invite_code: code }, token2);
assert('绑定成功', r.data && r.data.ok === true && r.data.inviter_name === '邀请人', r.data);
r = await call(handleInviteRoute, 'POST', '/invite/bind', { invite_code: code }, token2);
assert('重复绑定被拒', r.data && r.data.ok === false && /已绑定/.test(r.data.error || ''), r.data);

console.log('== 4. 邀请：存储/被邀请人/积分 ==');
r = await call(handleInviteRoute, 'POST', '/invite/storage', { stored_stones: 1000, per_person_stones: 100 }, token1);
assert('设置存储', r.data && r.data.ok === true && r.data.stored_stones === 1000, r.data);
r = await call(handleInviteRoute, 'POST', '/invite/storage', { stored_stones: 999999999, per_person_stones: 10 }, token1);
assert('灵石不足被拒', r.data && r.data.ok === false && /灵石不足/.test(r.data.error || ''), r.data);
r = await call(handleInviteRoute, 'GET', '/invite/invitees', null, token1);
assert('被邀请人列表', r.data && r.data.ok === true && Array.isArray(r.data.invitees) && r.data.invitees.length === 1, r.data);
r = await call(handleInviteRoute, 'POST', '/invite/claim_points', { invitee_account_id: 2 }, token1);
assert('等级不足不可领积分', r.data && r.data.ok === false, r.data);
const unmatched = await handleInviteRoute(makeReq('GET', '/unknown/path', null, token1), env, '/unknown/path');
assert('未匹配路由返回 null', unmatched === null, unmatched);

console.log('== 5. 邀请商店购买 ==');
r = await call(handleInviteRoute, 'GET', '/invite/shop', null, token1);
assert('邀请商店列表', r.data && r.data.ok === true && Array.isArray(r.data.items) && r.data.items.length > 0, r.data);
r = await call(handleInviteRoute, 'POST', '/invite/shop/buy', { item_id: 128, count: 2 }, token1);
assert('积分不足购买被拒', r.data && r.data.ok === false && /积分不足/.test(r.data.error || ''), r.data);

console.log('== 6. 邮箱绑定 ==');
r = await call(handleEmailRoute, 'POST', '/email/send-code', { email: 'bad-email' }, token1);
assert('邮箱格式不正确', r.data && r.data.ok === false && /格式/.test(r.data.error || ''), r.data);
r = await call(handleEmailRoute, 'POST', '/email/send-code', { email: 'user@test.com' }, token1);
assert('已绑定邮箱不可再绑', r.data && r.data.ok === false && /已被/.test(r.data.error || ''), r.data);
r = await call(handleEmailRoute, 'POST', '/email/send-code', { email: 'me@example.com' }, token1);
assert('发送验证码', r.data && r.data.ok === true, r.data);
r = await call(handleEmailRoute, 'POST', '/email/bind', { email: 'me@example.com' }, token1);
assert('直接绑定（无需验证码）', r.data && r.data.ok === true, r.data);
r = await call(handleEmailRoute, 'GET', '/email/status', null, token1);
assert('邮箱状态已绑定', r.data && r.data.ok === true && r.data.bound === true, r.data);
r = await call(handleEmailRoute, 'POST', '/email/unbind', {}, token1);
assert('解绑邮箱', r.data && r.data.ok === true, r.data);
r = await call(handleEmailRoute, 'GET', '/email/status', null, token2);
assert('已绑定邮箱 masked', r.data && r.data.ok === true && r.data.bound === true && /@test.com/.test(r.data.email), r.data);
r = await call(handleEmailRoute, 'POST', '/email/forgot-password/reset', { email: 'user@test.com', new_password: 'newpass123' }, null);
assert('直接重置密码（无需验证码）', r.data && r.data.ok === true, r.data);

console.log('== 7. 传人（弟子派遣） ==');
r = await call(handleApprenticeRoute, 'GET', '/apprentice/status', null, null);
assert('未登录 401', r.status === 401, r);
r = await call(handleApprenticeRoute, 'GET', '/apprentice/status', null, token2);
assert('传人状态', r.data && r.data.ok === true && r.data.apprentice && r.data.apprentice.name, r.data);
r = await call(handleApprenticeRoute, 'POST', '/apprentice/rename', { name: '云中君' }, token2);
assert('传人改名', r.data && r.data.ok === true && r.data.apprentice.name === '云中君', r.data);
r = await call(handleApprenticeRoute, 'POST', '/apprentice/dispatch/start', { map_id: 99999, target_mode: 'material', target_value: '灵木' }, token2);
assert('无效地图被拒', r.data && r.data.ok === false && /地图/.test(r.data.error || ''), r.data);
r = await call(handleApprenticeRoute, 'POST', '/apprentice/dispatch/stop', {}, token2);
assert('未派遣不可停止', r.data && r.data.ok === false, r.data);
r = await call(handleApprenticeRoute, 'POST', '/apprentice/unequip', { slot: 'weapon' }, token2);
assert('未装备不可卸', r.data && r.data.ok === false, r.data);
r = await call(handleApprenticeRoute, 'POST', '/apprentice/equip', { page: 999, slot_index: 0 }, token2);
assert('无效背包页被拒', r.data && r.data.ok === false, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);