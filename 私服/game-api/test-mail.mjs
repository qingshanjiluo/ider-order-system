// 邮箱路由集成测试（Worker 版）
// 运行：
//   npx esbuild test-mail.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\mail-bundle.mjs
//   node D:\Temp\opencode\mail-bundle.mjs
import { handleMailRoute } from './src/routes/mail.js';
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
function nowSec() { return Math.floor(Date.now() / 1000); }

function countItemId(player, id) {
  let total = 0;
  for (const page of player.inventory || []) for (const slot of page) if (slot && slot.item && Number(slot.item.id) === Number(id)) total += Math.max(1, Number(slot.count) || 1);
  return total;
}

function countGeneratedEquipment(player) {
  let total = 0;
  for (const page of player.inventory || []) for (const slot of page) if (slot && slot.item && (slot.item.isGenerated === true || (Array.isArray(slot.item.affixes) && slot.item.affixes.length > 0))) total += Math.max(1, Number(slot.count) || 1);
  return total;
}

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const sql = this.sql, args = this.args;
    const results = [];
    if (sql.includes('SELECT data FROM players')) {
      const p = store.get('p:' + Number(args[0]));
      if (p) results.push({ data: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) });
    } else if (sql.includes('FROM mailbox_messages') && sql.includes('WHERE id=')) {
      const rec = rows('mm:').find(v => Number(v.id) === Number(args[0]) && Number(v.account_id) === Number(args[1]));
      if (rec) results.push(rec);
    } else if (sql.includes('FROM mailbox_messages') && sql.includes('WHERE account_id = ?')) {
      const arr = rows('mm:').filter(v => Number(v.account_id) === Number(args[0])).sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
      results.push(...arr);
    }
    return { results };
  }
  async run() {
    const sql = this.sql, args = this.args;
    if (sql.includes('INSERT INTO players') || sql.includes('ON CONFLICT(account_id)')) {
      return setRow('p:' + Number(args[0]), { account_id: Number(args[0]), slot: Number(args[1]), data: args[2] });
    }
    if (sql.includes('INSERT INTO mailbox_messages')) {
      const id = seq++;
      if (sql.includes('dedupe_key')) {
        store.set('mm:' + id, { id, account_id: Number(args[0]), type: String(args[1]), title: String(args[2]), content: String(args[3]), attachments_json: String(args[4]), status: 'unread', created_at: Number(args[5]), claimed_at: 0, expires_at: Number(args[6]), dedupe_key: String(args[7]) });
      } else {
        store.set('mm:' + id, { id, account_id: Number(args[0]), type: String(args[1]), title: String(args[2]), content: String(args[3]), attachments_json: String(args[4]), status: 'unread', created_at: Number(args[5]), claimed_at: 0, expires_at: Number(args[6]), dedupe_key: '' });
      }
      return { meta: { last_row_id: id } };
    }
    if (sql.includes('UPDATE mailbox_messages') && sql.includes("status='claimed'")) {
      const rec = rows('mm:').find(v => Number(v.id) === Number(args[0]) && Number(v.account_id) === Number(args[1]) && v.status === 'unread');
      if (!rec) return { meta: { changes: 0 } };
      rec.status = 'claimed';
      rec.claimed_at = nowSec();
      return { meta: { changes: 1 } };
    }
    if (sql.includes('DELETE FROM mailbox_messages')) {
      let n = 0;
      for (const k of [...store.keys()]) {
        if (k.startsWith('mm:') && Number(store.get(k).account_id) === Number(args[0]) && store.get(k).status === 'claimed') { store.delete(k); n++; }
      }
      return { meta: { changes: n } };
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
  return { method, url: path, headers: { get: (name) => headers[name] || null }, json: async () => body || {} };
}

async function call(method, path, body, token) {
  const res = await handleMailRoute(makeReq(method, 'http://test/api' + path, body, token), env, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const db = createDb(env);
const token = await signToken(31, 'playerMail', env);
const pa = await createInitialPlayerData('邮修士', [1, 2, 3], env);
pa.spirit_stones = 500;
await db.savePlayer(31, 1, pa);
store.set('a:31', { id: 31, username: 'playerMail' });

// 预置邮件
await db.createMailboxMessage(31, { type: 'trade_refund', title: '灵石退回', content: '测试', attachments: [{ kind: 'currency', currency: 'spirit_stones', amount: 100 }] });
await db.createMailboxMessage(31, { type: 'trade_buy', title: '寒潭沙到货', content: '测试', attachments: [{ kind: 'item', item: { id: 27, name: '寒潭沙', type: 'material', quality: 2 }, count: 5 }] });
await db.createMailboxMessage(31, { type: 'reward', title: '装备奖励', content: '动态生成', attachments: [{ kind: 'item', item_id: 11, dynamic_roll: true, count: 1 }] });
// 一条已领取邮件（用于 delete_claimed）
await db.createMailboxMessage(31, { type: 'system', title: '已领系统邮件', content: '测试', attachments: [{ kind: 'currency', currency: 'spirit_stones', amount: 50 }] });
const claimedMail = (await db.listMailbox(31)).find(m => m.type === 'system');
if (claimedMail) {
  await env.DB.prepare("UPDATE mailbox_messages SET status='claimed', claimed_at=strftime('%s','now') WHERE id=? AND account_id=? AND status='unread'").bind(claimedMail.id, 31).run();
}

console.log('== 1. 鉴权与列表 ==');
let r = await call('GET', '/mail/list', null, null);
assert('未登录 401', r.status === 401, { status: r.status });
r = await call('GET', '/mail/list', null, token);
assert('列表含4条 + 附件解析', r.data && r.data.ok === true && r.data.mails.length === 4 && r.data.mails.every(m => Array.isArray(m.attachments)), r.data);
assert('已领取标记正确', r.data && r.data.mails.filter(m => m.claimed).length === 1, r.data.mails.map(m => m.claimed));

console.log('== 2. 领取单封（灵石）==');
const currencyMail = r.data.mails.find(m => m.type === 'trade_refund');
const itemMail = r.data.mails.find(m => m.type === 'trade_buy');
r = await call('POST', '/mail/claim/' + currencyMail.id, {}, token);
assert('领取灵石', r.data && r.data.ok === true && r.data.player && r.data.player.spirit_stones === 600, r.data);
r = await call('POST', '/mail/claim/' + currencyMail.id, {}, token);
assert('重复领取被拒', r.data && r.data.ok === false && /已领取/.test(r.data.error || ''), r.data);

console.log('== 3. 领取物品邮件 ==');
r = await call('POST', '/mail/claim/' + itemMail.id, {}, token);
const pAfterItem = r.data && r.data.player;
assert('领取寒潭沙x5（叠加至7）', r.data && r.data.ok === true && pAfterItem && countItemId(pAfterItem, 27) === 7, r.data);

console.log('== 4. 一键领取（装备动态生成）==');
r = await call('POST', '/mail/claim_all', {}, token);
assert('一键领取成功', r.data && r.data.ok === true && r.data.claimed_count === 1 && r.data.skipped === 0, r.data);
const pAll = r.data && r.data.player;
assert('背包新增动态装备', pAll && countGeneratedEquipment(pAll) >= 1, pAll && countGeneratedEquipment(pAll));
r = await call('POST', '/mail/claim_all', {}, token);
assert('无未读可领(ok 且 claimed=0)', r.data && r.data.ok === true && r.data.claimed_count === 0, r.data);

console.log('== 5. 清理已领取 ==');
r = await call('POST', '/mail/delete_claimed', {}, token);
assert('删除4封已领邮件', r.data && r.data.ok === true && r.data.deleted_count === 4, r.data);
r = await call('GET', '/mail/list', null, token);
assert('列表已清空', r.data && r.data.ok === true && r.data.mails.length === 0, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);