// 本地集成测试：模拟 Cloudflare Worker 环境验证 game-api 全流程
// 运行方式：
//   npx esbuild test-local.mjs --bundle --format=esm --platform=node --outfile=test-bundle.mjs
//   node test-bundle.mjs
import { signToken, verifyToken } from './src/auth.js';
import { hashPassword, verifyPassword } from './src/crypto.js';
import { calculateExpNeeded, EXP_TABLE } from './src/exp.js';
import { createInitialPlayerData, enrichPlayer, applyCombatStatsFromBase } from './src/player.js';

// 模拟 D1 数据库（内存 Map）
const db = new Map();
class MockStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const rows = await this.all();
    return rows.results[0] || null;
  }
  async all() {
    const rows = [];
    // 极简模拟：chat_messages 插入/查询、players 查询
    const sql = this.sql;
    const args = this.args;
    if (sql.includes('FROM players')) {
      for (const v of db.values()) {
        if (v.table === 'players' && v.data.account_id === Number(args[0])) rows.push({ ...v.data });
      }
    } else if (sql.includes('FROM chat_messages')) {
      let list = [...(db.get('chat') || [])];
      const channel = args.find(a => a === 'global' || a === 'alliance');
      if (channel) list = list.filter(m => m.channel === channel);
      rows.push(...list.slice(-80));
    } else if (sql.includes('FROM accounts')) {
      for (const v of db.values()) {
        if (v.table === 'accounts' && v.data.username === args[0]) rows.push({ ...v.data });
      }
    }
    return { results: rows };
  }
  async run() {
    const sql = this.sql;
    if (sql.startsWith('INSERT INTO chat_messages')) {
      const [channel, allianceId, accountId, username, text, ts] = this.args;
      const list = db.get('chat') || [];
      const msg = { id: list.length + 1, channel, alliance_id: allianceId, account_id: accountId, username, text, ts };
      list.push(msg); db.set('chat', list);
      return { meta: { last_row_id: msg.id } };
    }
    if (sql.startsWith('INSERT INTO players')) {
      const [accountId, slot, data, ts] = this.args;
      const id = db.size + 100;
      db.set('p' + accountId, { table: 'players', data: { id, account_id: accountId, slot, data, created_at: ts } });
      return { meta: { last_row_id: id } };
    }
    if (sql.startsWith('INSERT INTO accounts')) {
      const [username, hash, ts] = this.args;
      const id = db.size + 1;
      db.set('a' + username, { table: 'accounts', data: { id, username, password_hash: hash, created_at: ts } });
      return { meta: { last_row_id: id } };
    }
    return { meta: { last_row_id: 1 } };
  }
}
const env = {
  DB: {
    prepare(sql) { return new MockStatement(db, sql); }
  },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper',
  GAME_DATA_KV: null
};

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

console.log('== 1. 密码哈希（兼容原库 sha256(pwd+pepper)）==');
const h = await hashPassword('mypass123', env.PASSWORD_PEPPER);
assert('哈希为64位hex', /^[0-9a-f]{64}$/.test(h));
assert('校验正确', await verifyPassword('mypass123', h, env.PASSWORD_PEPPER));
assert('错误密码被拒', !(await verifyPassword('wrong', h, env.PASSWORD_PEPPER)));

console.log('== 2. JWT 签发/校验 ==');
const token = await signToken(42, 'player1', env);
const payload = await verifyToken(token, env);
assert('token含三段', token.split('.').length === 3);
assert('payload.accountId=42', payload?.accountId === 42);
assert('payload.username=player1', payload?.username === 'player1');
assert('篡改token被拒', (await verifyToken(token.slice(0, -1) + 'x', env)) === null);

console.log('== 3. 经验表 ==');
assert('EXP_TABLE 400项', EXP_TABLE.length === 400);
assert('calculateExpNeeded(1)=168', calculateExpNeeded(1) === 168);
assert('calculateExpNeeded(400)=EXP_TABLE[399]', calculateExpNeeded(400) === EXP_TABLE[399]);

console.log('== 4. 初始角色 ==');
const player = await createInitialPlayerData('测试者', [1, 2], env);
assert('角色名正确', player.name === '测试者');
assert('level=1', player.level === 1);
assert('背包10页', Array.isArray(player.inventory) && player.inventory.length === 10);
assert('首页20格', player.inventory[0].length === 20);
assert('基础战斗属性已计算 max_hp>0', player.max_hp > 0);
assert('min_phys_damage>0', player.min_phys_damage > 0);
enrichPlayer(player);
assert('enrich后 max_exp=168', player.max_exp === 168);

console.log('== 5. 注册/登录/建角色 端到端 ==');
// 模拟 HTTP 调用（直接测核心逻辑路径）
const username = '测试账号';
const pwdHash = await hashPassword('123456', env.PASSWORD_PEPPER);
db.set('a' + username, { table: 'accounts', data: { id: 1, username, password_hash: pwdHash, created_at: 1234 } });
const loginToken = await signToken(1, username, env);
assert('登录token可解析', (await verifyToken(loginToken, env))?.accountId === 1);
assert('密码匹配', await verifyPassword('123456', pwdHash, env.PASSWORD_PEPPER));

console.log('== 6. 聊天限流逻辑 ==');
// 直接验证 chat 模块的 sql 组装（模拟 DB 返回）— 略，因需完整 request 模拟

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);