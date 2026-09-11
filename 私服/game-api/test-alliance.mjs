// 仙盟路由集成测试（Worker 版）
// 运行：
//   npx esbuild test-alliance.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\alliance-bundle.mjs
//   node D:\Temp\opencode\alliance-bundle.mjs
import { handleAllianceRoute } from './src/routes/alliance.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';

Date.now = () => new Date('2026-08-22T04:00:00Z').getTime();

const store = new Map();
let seq = 1000;

function safeParse(raw, def) {
  try { const v = JSON.parse(raw); return v == null ? def : v; } catch (_) { return def; }
}

function defaultRankNames() { return ['仙友', '仙长', '尊者', '长老', '副盟主', '盟主']; }

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
    // getAccountById
    else if (sql.includes('SELECT * FROM accounts WHERE id = ?')) {
      const acc = store.get('acc:' + Number(a[0]));
      if (acc) results.push(acc);
    }
    // listAlliances
    else if (sql.includes('LEFT JOIN alliance_members m ON a.id = m.alliance_id')) {
      for (const [k, al] of store) {
        if (!String(k).startsWith('alliance:')) continue;
        let count = 0;
        for (const [mk, m] of store) {
          if (String(mk).startsWith('am:') && Number(m.alliance_id) === Number(al.id)) count += 1;
        }
        results.push({ ...al, member_count: count });
      }
      results.sort((x, y) => Number(y.created_at) - Number(x.created_at));
    }
    // getAllianceById
    else if (sql.includes('SELECT * FROM alliances WHERE id = ?')) {
      const al = store.get('alliance:' + Number(a[0]));
      if (al) results.push(al);
    }
    // getAllianceByName
    else if (sql.includes('SELECT * FROM alliances WHERE name = ?')) {
      const name = String(a[0] || '').trim();
      for (const [k, al] of store) {
        if (String(k).startsWith('alliance:') && String(al.name).trim() === name) { results.push(al); break; }
      }
    }
    // listAllianceMembers
    else if (sql.includes('FROM alliance_members m')) {
      const aid = Number(a[0]);
      const rows = [];
      for (const [k, m] of store) {
        if (!String(k).startsWith('am:') || Number(m.alliance_id) !== aid) continue;
        const acc = store.get('acc:' + Number(m.account_id)) || {};
        const p = store.get('p:' + Number(m.account_id));
        let playerName = '';
        if (p) {
          const pd = typeof p.data === 'string' ? safeParse(p.data, {}) : (p.data || {});
          playerName = pd.name || '';
        }
        rows.push({
          ...m,
          username: acc.username || '?',
          is_banned: acc.is_banned || 0,
          ban_expires_at: acc.ban_expires_at || 0,
          player_name: playerName
        });
      }
      rows.sort((x, y) => (Number(y.rank) - Number(x.rank)) || (Number(x.joined_at) - Number(y.joined_at)));
      results.push(...rows);
    }
    // getAllianceMemberRank
    else if (sql.includes('SELECT rank FROM alliance_members')) {
      const m = store.get('am:' + Number(a[0]) + ':' + Number(a[1]));
      if (m) results.push({ rank: m.rank });
    }
    // getAllianceMemberContribution
    else if (sql.includes('SELECT contribution FROM alliance_members')) {
      const m = store.get('am:' + Number(a[0]) + ':' + Number(a[1]));
      if (m) results.push({ contribution: m.contribution });
    }
    // countAllianceMembersByRank
    else if (sql.includes('SELECT COUNT(1) AS c FROM alliance_members')) {
      const aid = Number(a[0]); const rank = Number(a[1]);
      let c = 0;
      for (const [k, m] of store) {
        if (String(k).startsWith('am:') && Number(m.alliance_id) === aid && Number(m.rank) === rank) c += 1;
      }
      results.push({ c });
    }
    // getApplicationByAllianceAndAccount（pending 限定）
    else if (sql.includes('FROM alliance_applications') && sql.includes("status = 'pending'") && sql.includes('account_id = ?') && sql.includes('LIMIT 1')) {
      const aid = Number(a[0]); const acct = Number(a[1]);
      for (const [k, ap] of store) {
        if (String(k).startsWith('app:') && Number(ap.alliance_id) === aid && Number(ap.account_id) === acct && String(ap.status) === 'pending') { results.push(ap); break; }
      }
    }
    // getApplicationByAllianceAndAccountAnyStatus
    else if (sql.includes('FROM alliance_applications') && sql.includes('account_id = ?') && sql.includes('LIMIT 1')) {
      const aid = Number(a[0]); const acct = Number(a[1]);
      for (const [k, ap] of store) {
        if (String(k).startsWith('app:') && Number(ap.alliance_id) === aid && Number(ap.account_id) === acct) { results.push(ap); break; }
      }
    }
    // getApplicationById
    else if (sql.includes('FROM alliance_applications WHERE id = ?')) {
      const ap = store.get('app:' + Number(a[0]));
      if (ap) results.push(ap);
    }
    // listAlliancePendingApplications
    else if (sql.includes('FROM alliance_applications') && sql.includes("status = 'pending'") && sql.includes('ORDER BY created_at ASC')) {
      const aid = Number(a[0]);
      for (const [k, ap] of store) {
        if (String(k).startsWith('app:') && Number(ap.alliance_id) === aid && String(ap.status) === 'pending') results.push(ap);
      }
      results.sort((x, y) => Number(x.created_at) - Number(y.created_at));
    }
    // listAllianceWithdrawAuth
    else if (sql.includes('FROM alliance_withdraw_auth w')) {
      const aid = Number(a[0]);
      for (const [k, w] of store) {
        if (!String(k).startsWith('auth:') || Number(w.alliance_id) !== aid) continue;
        const acc = store.get('acc:' + Number(w.account_id)) || {};
        results.push({ account_id: Number(w.account_id), username: acc.username || '?' });
      }
    }
    // hasAllianceWithdrawAuth
    else if (sql.includes('SELECT 1 FROM alliance_withdraw_auth')) {
      const w = store.get('auth:' + Number(a[0]) + ':' + Number(a[1]));
      if (w) results.push({ ok: 1 });
    }

    return { results };
  }
  async run() {
    const sql = this.sql;
    const a = this.args;

    // savePlayer / savePlayerImmediate
    if (sql.includes('INSERT INTO players')) {
      const accountId = Number(a[0]);
      store.set('p:' + accountId, { account_id: accountId, slot: Number(a[1]), data: a[2] });
      return { meta: { last_row_id: seq++, changes: 1 } };
    }
    // createAlliance（同时写入盟主成员 rank=5）
    if (sql.includes('INSERT INTO alliances')) {
      const id = seq++;
      const al = {
        id,
        name: String(a[0]).trim(),
        description: String(a[1] || '').trim(),
        level: 1,
        creator_account_id: Number(a[2]),
        rank_names_json: String(a[3]),
        materials: 0,
        warehouse_pages: 10,
        warehouse_json: '[]',
        created_at: 0,
        statue_level: 1,
        spirit_pool_level: 1,
        garden_level: 1,
        enlightenment_tree_level: 1,
        treasury_level: 1,
        gate_level: 1,
        treasury_refresh_date: '',
        treasury_goods_json: '[]'
      };
      store.set('alliance:' + id, al);
      store.set('am:' + id + ':' + Number(a[2]), { alliance_id: id, account_id: Number(a[2]), rank: 5, contribution: 0, joined_at: 0 });
      return { meta: { last_row_id: id, changes: 1 } };
    }
    // updateAlliance（动态 SET 列）
    if (sql.includes('UPDATE alliances SET')) {
      const setm = sql.match(/UPDATE alliances SET (.+) WHERE id = \?/);
      const id = Number(a[a.length - 1]);
      const al = store.get('alliance:' + id);
      if (al && setm) {
        const keys = setm[1].split(',').map((s) => s.trim().split('=')[0].trim());
        keys.forEach((key, i) => { al[key] = a[i]; });
      }
      return { meta: { changes: 1 } };
    }
    // addAllianceMember（createAlliance 内部插入盟主时仅 2 参，rank 默认 5）
    if (sql.includes('INSERT OR REPLACE INTO alliance_members')) {
      const aid = Number(a[0]); const acct = Number(a[1]); const rank = a[2] !== undefined ? Number(a[2]) : 5;
      store.set('am:' + aid + ':' + acct, { alliance_id: aid, account_id: acct, rank, contribution: 0, joined_at: 0 });
      return { meta: { last_row_id: seq++, changes: 1 } };
    }
    // removeAllianceMember
    if (sql.includes('DELETE FROM alliance_members')) {
      store.delete('am:' + Number(a[0]) + ':' + Number(a[1]));
      return { meta: { changes: 1 } };
    }
    // updateAllianceMemberRank
    if (sql.includes('UPDATE alliance_members SET rank = ?')) {
      const m = store.get('am:' + Number(a[1]) + ':' + Number(a[2]));
      if (m) m.rank = Number(a[0]);
      return { meta: { changes: 1 } };
    }
    // addAllianceMemberContribution
    if (sql.includes('UPDATE alliance_members SET contribution = MAX(0, contribution + ?)')) {
      const m = store.get('am:' + Number(a[1]) + ':' + Number(a[2]));
      if (m) m.contribution = Math.max(0, (Number(m.contribution) || 0) + Number(a[0]));
      return { meta: { changes: 1 } };
    }
    // createAllianceApplication
    if (sql.includes('INSERT INTO alliance_applications')) {
      const id = seq++;
      const ap = { id, alliance_id: Number(a[0]), account_id: Number(a[1]), status: 'pending', created_at: 0 };
      store.set('app:' + id, ap);
      return { meta: { last_row_id: id, changes: 1 } };
    }
    // renewAllianceApplication
    if (sql.includes('UPDATE alliance_applications SET status = \'pending\'')) {
      const aid = Number(a[0]); const acct = Number(a[1]);
      for (const [k, ap] of store) {
        if (String(k).startsWith('app:') && Number(ap.alliance_id) === aid && Number(ap.account_id) === acct && String(ap.status) !== 'pending') {
          ap.status = 'pending';
          ap.created_at = 0;
        }
      }
      return { meta: { changes: 1 } };
    }
    // updateAllianceApplicationStatus
    if (sql.includes('UPDATE alliance_applications SET status = ?')) {
      const ap = store.get('app:' + Number(a[1]));
      if (ap && String(ap.status) === 'pending') ap.status = String(a[0]);
      return { meta: { changes: 1 } };
    }
    // addAllianceWithdrawAuth
    if (sql.includes('INSERT OR IGNORE INTO alliance_withdraw_auth')) {
      const key = 'auth:' + Number(a[0]) + ':' + Number(a[1]);
      if (!store.has(key)) store.set(key, { alliance_id: Number(a[0]), account_id: Number(a[1]) });
      return { meta: { changes: 1 } };
    }
    // removeAllianceWithdrawAuth
    if (sql.includes('DELETE FROM alliance_withdraw_auth')) {
      store.delete('auth:' + Number(a[0]) + ':' + Number(a[1]));
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

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label, JSON.stringify(detail)); }
}

function makeReq(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return {
    method,
    url: 'http://test/api' + path,
    headers: { get: (name) => headers[name] || null },
    json: async () => body || {}
  };
}

async function call(method, path, body, token) {
  const res = await handleAllianceRoute(makeReq(method, path, body, token), env, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const db = createDb(env);
const token1 = await signToken(31, 'leaderA', env);
const token2 = await signToken(32, 'memberB', env);
const token3 = await signToken(33, 'memberC', env);

const p1 = await createInitialPlayerData('盟主甲', [1, 2, 3], env);
p1.spirit_stones = 200000;
await db.savePlayer(31, 1, p1);

const p2 = await createInitialPlayerData('盟友乙', [1, 2, 3], env);
p2.spirit_stones = 200000;
p2.inventory = [Array(20).fill(null), Array(20).fill(null)];
p2.inventory[0][0] = { item: { id: 20, name: '沉泥', type: 'material', quality: 1 }, count: 10 };
p2.inventory[1][0] = { item: { id: 11, name: '铁剑', type: 'weapon', quality: 1 }, count: 1 };
await db.savePlayer(32, 1, p2);

const p3 = await createInitialPlayerData('闲散丙', [1, 2, 3], env);
p3.spirit_stones = 10000;
await db.savePlayer(33, 1, p3);

let allianceId = 1;

console.log('== 1. 鉴权 ==');
let r = await call('GET', '/alliance/list', null, null);
assert('未登录 401', r.status === 401, { status: r.status });

console.log('== 2. 创建仙盟 ==');
r = await call('POST', '/alliance/create', { name: '仙界阁' }, token3);
assert('灵石不足拒绝创建', r.data && r.data.ok === false && String(r.data.error).includes('灵石不足'), r.data);
r = await call('POST', '/alliance/create', { name: '仙界阁' }, token1);
assert('创建成功返回 alliance_id', r.data && r.data.ok === true && r.data.alliance_id > 0, r.data);
assert('扣除 10 万灵石并绑定仙盟', r.data && Number(r.data.player.spirit_stones) === 100000 && Number(r.data.player.alliance_id) === r.data.alliance_id, r.data && r.data.player && { stones: r.data.player.spirit_stones, aid: r.data.player.alliance_id });
allianceId = r.data.alliance_id;
r = await call('POST', '/alliance/create', { name: '仙界阁' }, token2);
assert('重名被拒', r.data && r.data.ok === false && String(r.data.error).includes('已存在'), r.data);

console.log('== 3. 列表 ==');
r = await call('GET', '/alliance/list', null, token1);
assert('列表含成员上限与盟主名', r.data && r.data.ok === true && Array.isArray(r.data.alliances) && r.data.alliances.length === 1 && r.data.alliances[0].member_limit === 50 && String(r.data.alliances[0].leader_name).length > 0, r.data);

console.log('== 4. 详情 ==');
r = await call('GET', '/alliance/detail/' + allianceId, null, token1);
assert('详情含盟主权限', r.data && r.data.ok === true && r.data.my_rank === 5 && r.data.can_withdraw === true && r.data.alliance.leader_name === '盟主甲', r.data);

console.log('== 5. 申请 ==');
r = await call('POST', '/alliance/apply', { alliance_id: allianceId }, token2);
assert('提交申请成功', r.data && r.data.ok === true, r.data);
r = await call('POST', '/alliance/apply', { alliance_id: allianceId }, token2);
assert('重复申请被拒', r.data && r.data.ok === false, r.data);
r = await call('GET', '/alliance/applications/' + allianceId, null, token2);
assert('普通成员无权查看申请', r.data && r.data.ok === false && String(r.data.error).includes('无权'), r.data);
r = await call('GET', '/alliance/applications/' + allianceId, null, token1);
assert('盟主看到 1 条待审核', r.data && r.data.ok === true && Array.isArray(r.data.applications) && r.data.applications.length === 1 && r.data.applications[0].player_name === '盟友乙', r.data);
const appId = r.data.applications[0].id;
r = await call('POST', '/alliance/approve_application', { application_id: appId }, token1);
assert('批准申请成功', r.data && r.data.ok === true, r.data);
r = await call('GET', '/alliance/detail/' + allianceId, null, token1);
assert('成员增至 2 人', r.data && r.data.ok === true && Array.isArray(r.data.alliance.members) && r.data.alliance.members.length === 2, r.data);

console.log('== 6. 职务 ==');
r = await call('POST', '/alliance/grant_rank', { alliance_id: allianceId, account_id: 32, rank: 4 }, token1);
assert('授予副盟主成功', r.data && r.data.ok === true, r.data);
r = await call('POST', '/alliance/grant_rank', { alliance_id: allianceId, account_id: 32, rank: 5 }, token1);
assert('盟主不能任命盟主', r.data && r.data.ok === false, r.data);

console.log('== 7. 修改信息 ==');
r = await call('POST', '/alliance/update', { alliance_id: allianceId, description: '修仙问道之所' }, token1);
assert('修改描述成功', r.data && r.data.ok === true && r.data.alliance.description === '修仙问道之所', r.data);

console.log('== 8. 捐献 ==');
r = await call('POST', '/alliance/donate', { alliance_id: allianceId, page: 0, slot_index: 0, count: 4 }, token2);
assert('捐献产生贡献与物资', r.data && r.data.ok === true && Number(r.data.contribution_gained) >= 1 && Number(r.data.materials_gained) >= 3, r.data);

console.log('== 9. 建筑升级 ==');
await db.updateAlliance(allianceId, { materials: 20000 });
r = await call('POST', '/alliance/buildings/upgrade', { alliance_id: allianceId, building: 'statue' }, token1);
assert('雕像升级至 2 级并扣物资', r.data && r.data.ok === true && r.data.level === 2 && r.data.materials === 15000, r.data);
r = await call('POST', '/alliance/buildings/upgrade', { alliance_id: allianceId, building: 'statue' }, token1);
assert('雕像升级至 3 级', r.data && r.data.ok === true && r.data.level === 3, r.data);

console.log('== 10. 灵池沐浴 ==');
r = await call('POST', '/alliance/spirit_pool/bathe', { alliance_id: allianceId }, token2);
assert('沐浴获得属性加成', r.data && r.data.ok === true && r.data.buff && r.data.buff.attribute && Number(r.data.buff.bonus_pct) > 0, r.data);
r = await call('POST', '/alliance/spirit_pool/bathe', { alliance_id: allianceId }, token2);
assert('今日不可重复沐浴', r.data && r.data.ok === false, r.data);

console.log('== 11. 顿悟 ==');
r = await call('POST', '/alliance/enlightenment_tree/meditate', { alliance_id: allianceId }, token2);
assert('顿悟获得经验加成', r.data && r.data.ok === true && Number(r.data.bonus_pct) > 0 && Number(r.data.expires_at) > 0, r.data);

console.log('== 12. 仙园采摘 ==');
r = await call('POST', '/alliance/garden/pick', { alliance_id: allianceId }, token2);
assert('采摘返回掉落列表', r.data && r.data.ok === true && Array.isArray(r.data.drops), r.data);

console.log('== 13. 祈福 ==');
r = await call('POST', '/alliance/statue/bless', { alliance_id: allianceId }, token2);
assert('祈福成功', r.data && r.data.ok === true && r.data.times === 1 && Array.isArray(r.data.rewards), r.data);

console.log('== 14. 宝阁 ==');
r = await call('GET', '/alliance/treasury/list/' + allianceId, null, token2);
assert('宝阁列出商品与贡献', r.data && r.data.ok === true && Array.isArray(r.data.goods) && r.data.goods.length >= 2 && 'my_contribution' in r.data, r.data);
await db.addAllianceMemberContribution(allianceId, 32, 500);
r = await call('POST', '/alliance/treasury/buy', { alliance_id: allianceId, item_id: 95, count: 1 }, token2);
assert('兑换扣贡献并入包', r.data && r.data.ok === true && r.data.item_id === 95 && r.data.my_contribution === 101, r.data);

console.log('== 15. 仓库 ==');
r = await call('POST', '/alliance/warehouse/deposit', { alliance_id: allianceId, page: 1, slot_index: 0, count: 1 }, token2);
assert('存入装备成功', r.data && r.data.ok === true, r.data);
r = await call('POST', '/alliance/warehouse/withdraw', { alliance_id: allianceId, warehouse_page: 0, warehouse_slot_index: 0, count: 1 }, token1);
assert('盟主提取成功', r.data && r.data.ok === true, r.data);

console.log('== 16. 授权提取 ==');
r = await call('POST', '/alliance/apply', { alliance_id: allianceId }, token3);
assert('丙申请加入', r.data && r.data.ok === true, r.data);
r = await call('GET', '/alliance/applications/' + allianceId, null, token1);
const appId2 = r.data && r.data.applications && r.data.applications[0] && r.data.applications[0].id;
r = await call('POST', '/alliance/approve_application', { application_id: appId2 }, token1);
assert('批准丙加入', r.data && r.data.ok === true, r.data);
r = await call('POST', '/alliance/warehouse/authorize', { alliance_id: allianceId, account_id: 33, add: true }, token1);
assert('授权丙提取', r.data && r.data.ok === true, r.data);
r = await call('GET', '/alliance/detail/' + allianceId, null, token1);
assert('详情可见授权名单', r.data && r.data.ok === true && Array.isArray(r.data.alliance.withdraw_auth_ids) && r.data.alliance.withdraw_auth_ids.includes(33), r.data);
r = await call('POST', '/alliance/warehouse/authorize', { alliance_id: allianceId, account_id: 33, add: false }, token1);
assert('取消授权成功', r.data && r.data.ok === true, r.data);
r = await call('POST', '/alliance/warehouse/withdraw', { alliance_id: allianceId, warehouse_page: 0, warehouse_slot_index: 0, count: 1 }, token3);
assert('未授权成员不可提取', r.data && r.data.ok === false && String(r.data.error).includes('授权'), r.data);

console.log('== 17. 转让/踢出/退出 ==');
r = await call('POST', '/alliance/transfer_leader', { alliance_id: allianceId, account_id: 32 }, token1);
assert('盟主转让成功', r.data && r.data.ok === true, r.data);
r = await call('GET', '/alliance/detail/' + allianceId, null, token1);
assert('转让后原盟主降为仙友', r.data && r.data.ok === true && r.data.my_rank === 0, r.data);
r = await call('POST', '/alliance/kick', { alliance_id: allianceId, account_id: 33 }, token2);
assert('新盟主踢出丙', r.data && r.data.ok === true, r.data);
r = await call('GET', '/alliance/detail/' + allianceId, null, token1);
assert('成员恢复 2 人', r.data && r.data.ok === true && r.data.alliance.members.length === 2, r.data);
r = await call('POST', '/alliance/leave', {}, token1);
assert('仙友退出成功', r.data && r.data.ok === true && Number(r.data.player.alliance_id) === 0, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
