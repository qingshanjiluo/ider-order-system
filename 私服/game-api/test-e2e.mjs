// 端到端 HTTP 测试：模拟 Cloudflare Workers fetch 入口
// 运行：
//   npx esbuild test-e2e.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\e2e.mjs
//   node D:\Temp\opencode\e2e.mjs
import worker from './src/index.js';

// ── 模拟 D1 ──
const store = new Map();
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async first() {
    const r = await this.all();
    return r.results[0] || null;
  }
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
    } else if (sql.includes('FROM chat_messages')) {
      let list = [];
      for (const [k, v] of store) if (k.startsWith('chat:')) list.push(v);
      const accountId = args.length > 0 ? Number(args[0]) : 0;
      if (sql.includes('COUNT(*)')) {
        const since = args[1] || 0;
        const filtered = list.filter(m => m.account_id === accountId && m.ts > since);
        const cnt = filtered.length;
        const lastTs = filtered.length ? Math.max(...filtered.map(m => m.ts)) : 0;
        results.push({ cnt, last_ts: lastTs });
      } else {
        const since = args.find(a => typeof a === 'number' && a > 0);
        if (since) list = list.filter(m => m.id > since);
        list.sort((a, b) => a.id - b.id);
        results.push(...list);
      }
    } else if (sql.includes('FROM ip_bans') || sql.includes('FROM machine_login_log')) {
      // 空
    }
    return { results };
  }
  async run() {
    const sql = this.sql;
    if (sql.includes('INSERT INTO accounts')) {
      const [username, hash, ts] = this.args;
      const id = 1;
      store.set('a:' + username, { id, username, password_hash: hash, created_at: ts, is_banned: 0 });
      return { meta: { last_row_id: id } };
    }
    if (sql.includes('ON CONFLICT(account_id)')) {
      // upsert: VALUES (?, ?, ?, ?) ON CONFLICT ... → args=[accountId, slot, data, ts]
      const accountId = Number(this.args[0]);
      const data = this.args[2];
      store.set('p:' + accountId, { id: 100, account_id: accountId, slot: 1, data });
      return { meta: { last_row_id: 100 } };
    }
    if (sql.includes('INSERT INTO players')) {
      // create: VALUES (?, 1, ?, ?) → args=[accountId, data, ts]
      const accountId = Number(this.args[0]);
      const data = this.args[1];
      const ts = this.args[2];
      store.set('p:' + accountId, { id: 100, account_id: accountId, slot: 1, data, created_at: ts });
      return { meta: { last_row_id: 100 } };
    }
    if (sql.includes('INSERT INTO chat_messages')) {
      const [channel, allianceId, accountId, username, text, ts] = this.args;
      const msg = { id: store.size + 1, channel, alliance_id: allianceId, account_id: accountId, username, text, ts };
      store.set('chat:' + msg.id, msg);
      return { meta: { last_row_id: msg.id } };
    }
    return { meta: { last_row_id: store.size + 1 } };
  }
}
const env = {
  DB: { prepare(sql) { return new Stmt(sql); } },
  JWT_SECRET: 'e2e-secret',
  PASSWORD_PEPPER: 'e2e-pepper',
  BOOT_ID: 'ideer-e2e'
};

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const req = new Request('https://ideer.example.com/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const res = await worker.fetch(req, env, {});
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

console.log('== 1. 注册 ==');
let r = await call('POST', '/auth/register', { username: 'e2e_user', password: '123456' });
assert('注册成功', r.data && r.data.ok === true, r.data);
assert('返回token', r.data && !!r.data.token);
const token = r.data.token;

console.log('== 2. 登录 ==');
r = await call('POST', '/auth/login', { username: 'e2e_user', password: '123456' });
assert('登录成功', r.data && r.data.ok === true && !!r.data.token, r.data);

console.log('== 3. 未建角色 sync ==');
r = await call('GET', '/player/sync', null, token);
assert('hasCharacter=false', r.data && r.data.hasCharacter === false, r.data);

console.log('== 4. 创建角色 ==');
r = await call('POST', '/player/create', { name: '端到端修士', spirit_roots: [1, 2, 3] }, token);
assert('创建成功', r.data && r.data.ok === true, r.data);
assert('返回player', r.data && r.data.player && r.data.player.name === '端到端修士', r.data && r.data.player && r.data.player.name);

console.log('== 5. 升级 ==');
r = await call('POST', '/player/level_up', {}, token);
assert('经验不足被拒', r.data && r.data.ok === false);
// 注入经验（模拟离线收益等来源）
const playerRow = store.get('p:1');
if (playerRow) {
  const pd = JSON.parse(playerRow.data);
  pd.exp = 500000;
  playerRow.data = JSON.stringify(pd);
}
r = await call('POST', '/player/level_up', {}, token);
assert('有经验后升级', r.data && r.data.ok === true && r.data.player && r.data.player.level >= 2, r.data);

console.log('== 6. 装备铁剑 ==');
r = await call('POST', '/player/equip', { page: 0, slot_index: 0, expect_item_id: 11 }, token);
assert('装备铁剑', r.data && r.data.ok === true && r.data.player && r.data.player.equipment && Number(r.data.player.equipment.weapon?.id) === 11, r.data);

console.log('== 7. sync 含角色 ==');
r = await call('GET', '/player/sync', null, token);
assert('hasCharacter=true', r.data && r.data.hasCharacter === true, r.data);
assert('player完整', r.data && r.data.player && r.data.player.inventory && r.data.player.inventory.length === 10);

console.log('== 8. 聊天 ==');
r = await call('GET', '/chat/messages?channel=global', null, token);
assert('拉消息空', r.data && r.data.ok === true && Array.isArray(r.data.messages));
r = await call('POST', '/chat/send', { channel: 'global', text: '各位道友，别来无恙！' }, token);
assert('发消息成功', r.data && r.data.ok === true && r.data.msg && r.data.msg.username === '端到端修士', r.data);
r = await call('GET', '/chat/messages?channel=global', null, token);
assert('拉消息有1条', r.data && r.data.ok === true && r.data.messages.length === 1 && r.data.messages[0].text.includes('道友'), r.data);

console.log('== 9. 限流 ==');
r = await call('POST', '/chat/send', { channel: 'global', text: '第二条' }, token);
assert('2秒内再发被限', r.data && r.data.ok === false && /稍后|过快/.test(r.data.error || ''), r.data);

console.log('== 10. 未登录被拒 ==');
r = await call('GET', '/player/sync', null, null);
assert('未登录 401', r.status === 401, { status: r.status });

console.log('== 11. 静态数据 ==');
r = await call('GET', '/game-data', null, null);
assert('game-data 成功', r.data && r.data.ok === true, r.data && r.data.ok);
assert('items 存在', r.data && Array.isArray(r.data.data.items) && r.data.data.items.length > 0);
assert('skills 存在', r.data && Array.isArray(r.data.data.skills) && r.data.data.skills.length > 0);
assert('maps 含魇化图', r.data && r.data.data.maps.some(m => m.is_nightmare), '魇化地图');
assert('enemies 存在', r.data && Array.isArray(r.data.data.enemies) && r.data.data.enemies.length > 0);

console.log('== 12. 新增路由挂载冒烟（经真实 worker.fetch 分发） ==');
const smokeCases = [
  ['GET', '/mail/list', null],
  ['GET', '/trial/contracts', null],
  ['GET', '/league/status', null],
  ['GET', '/alliance/list', null],
  ['GET', '/sect/member_counts', null],
  ['POST', '/online/alchemy/start', { recipe_id: 1 }],
  ['GET', '/cave/status', null],
  ['GET', '/invite/info', null],
  ['GET', '/email/status', null],
  ['GET', '/apprentice/status', null],
  ['GET', '/dungeon-battle/city_duel/list', null],
  ['POST', '/city/buy', { item_id: 1, count: 1 }],
  ['GET', '/gm/status?username=e2e_user', null]
];
for (const [method, path, body] of smokeCases) {
  r = await call(method, path, body, token);
  const notFound = r.data && r.data.error === 'Not Found';
  assert(`挂载 ${path}（非404）`, !notFound && r.status !== 404, { status: r.status, data: r.data });
}

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);