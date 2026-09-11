// 宗门系统集成测试（Worker 版）
// 运行：
//   npx esbuild test-sect.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\sect-bundle.mjs
//   node D:\Temp\opencode\sect-bundle.mjs
import { handleSectCoreRoute } from './src/routes/online/sectCoreRoutes.js';
import { handleSectTaskRoute } from './src/routes/online/sectTaskRoutes.js';
import { handleSectTreasuryRoute } from './src/routes/online/sectTreasuryRoutes.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';
import { getTechniques, getSectById, getEnemies } from './src/game/dataLoader.js';

const store = new Map();
let seq = 1000;
function setRow(k, v) { store.set(k, v); return { meta: { last_row_id: seq++ } }; }

function getAllPlayers() {
  return [...store.entries()].filter(([k]) => k.startsWith('p:')).map(([, v]) => v);
}

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const results = [];
    if (this.sql.includes('SELECT data FROM players')) {
      const p = store.get('p:' + Number(this.args[0]));
      if (p) results.push({ data: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) });
    } else if (this.sql.includes('SELECT completions FROM sect_task_completions')) {
      const rec = store.get('stc:' + Number(this.args[0]) + ':' + this.args[1]);
      if (rec) results.push({ completions: rec.completions });
    } else if (this.sql.includes('GROUP BY sect_id')) {
      const map = {};
      for (const p of getAllPlayers()) {
        const d = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
        const sid = d && Number(d.sect_id);
        if (sid > 0) map[sid] = (map[sid] || 0) + 1;
      }
      for (const [sid, cnt] of Object.entries(map)) results.push({ sect_id: sid, cnt });
    }
    return { results };
  }
  async run() {
    if (this.sql.includes('INSERT INTO players')) {
      const obj = { account_id: Number(this.args[0]), slot: Number(this.args[1]), data: this.args[2] };
      return setRow('p:' + Number(this.args[0]), obj);
    }
    if (this.sql.includes('UPDATE sect_task_completions SET completions = completions + 1')) {
      const key = 'stc:' + Number(this.args[0]) + ':' + this.args[1];
      const rec = store.get(key) || { completions: 0 };
      rec.completions += 1;
      store.set(key, rec);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO sect_task_completions')) {
      const key = 'stc:' + Number(this.args[0]) + ':' + this.args[1];
      store.set(key, { account_id: Number(this.args[0]), date: this.args[1], completions: Number(this.args[2]) });
      return { meta: { last_row_id: seq++ } };
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

async function call(handler, method, path, body, token) {
  const res = await handler(makeReq(method, path, body, token), env, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const db = createDb(env);
const token = await signToken(31, 'playerSect', env);

function putItem(player, item, count) {
  player.inventory = player.inventory || [[], [], [], []];
  let ok = false;
  for (const page of player.inventory) {
    for (let i = 0; i < page.length; i += 1) {
      const slot = page[i];
      if (!slot) { page[i] = { item: JSON.parse(JSON.stringify(item)), count }; ok = true; break; }
    }
    if (ok) break;
  }
  return ok;
}

const SECT_ID = 1;
const sect = getSectById(SECT_ID);

console.log('== 1. 鉴权 ==');
let r = await call(handleSectCoreRoute, 'GET', '/sect/member_counts', null, null);
assert('未登录 401', r.status === 401, { status: r.status });

console.log('== 2. 拜入宗门 ==');
const p = await createInitialPlayerData('宗门弟子', [1, 2, 3], env);
p.level = 400;
p.exp = 1000000000;
p.spirit_stones = 50000;
p.sect_id = 0;
p.sect_tasks = [];
putItem(p, { id: 27, name: '寒潭沙', type: 'material', quality: 2 }, 10);
await db.savePlayer(31, 1, p);
r = await call(handleSectCoreRoute, 'POST', '/sect/join', { sect_id: SECT_ID }, token);
assert('拜入宗门成功', r.data && r.data.ok === true && r.data.player && Number(r.data.player.sect_id) === SECT_ID, r.data);
r = await call(handleSectCoreRoute, 'POST', '/sect/join', { sect_id: SECT_ID }, token);
assert('重复拜入被拒', r.data && r.data.ok === false && /已加入/.test(r.data.error || ''), r.data);

console.log('== 3. 捐献换贡献 ==');
r = await call(handleSectCoreRoute, 'POST', '/sect/contribute', { item_id: 27, count: 2 }, token);
assert('捐献成功+贡献增加', r.data && r.data.ok === true && r.data.contribution > 0 && r.data.player && r.data.player.sect_contribution > 0, r.data);
const contributed = r.data.player.sect_contribution;

console.log('== 4. 学习宗门功法 ==');
const basicTech = (getTechniques() || []).find(t => Number(t.sectId) === SECT_ID && String(t.sectTier || '') === 'basic');
const p4 = await db.getPlayerByAccountId(31);
p4.sect_contribution = 100000000;
p4.skill_levels = p4.skill_levels || {};
p4.technique_levels = p4.technique_levels || {};
await db.savePlayer(31, 1, p4);
if (basicTech) {
  r = await call(handleSectCoreRoute, 'POST', '/sect/learn', { type: 'technique', id: basicTech.id }, token);
  assert('学习基础功法', r.data && r.data.ok === true && r.data.learned_id === basicTech.id, r.data);
} else {
  assert('学习基础功法（无基础功法跳过）', true, null);
}

console.log('== 5. 人数统计 ==');
r = await call(handleSectCoreRoute, 'GET', '/sect/member_counts', null, token);
assert('member_counts 返回', r.data && r.data.ok === true && typeof r.data.counts === 'object', r.data);

console.log('== 6. 宗门任务 ==');
r = await call(handleSectTaskRoute, 'GET', '/sect/tasks', null, token);
assert('任务列表7槽', r.data && r.data.ok === true && Array.isArray(r.data.tasks) && r.data.tasks.length === 7, { n: r.data && r.data.tasks && r.data.tasks.length });
r = await call(handleSectTaskRoute, 'POST', '/sect/tasks/refresh', {}, token);
assert('手动刷新(扣100灵石)', r.data && r.data.ok === true && Array.isArray(r.data.tasks) && r.data.tasks.length === 7, r.data);
r = await call(handleSectTaskRoute, 'POST', '/sect/tasks/accept', { slot_index: 0 }, token);
assert('接取任务', r.data && r.data.ok === true && r.data.tasks && r.data.tasks[0] && r.data.tasks[0].accepted === true, r.data);
r = await call(handleSectTaskRoute, 'POST', '/sect/tasks/complete', { slot_index: 0 }, token);
assert('未完成时提交被拒', r.data && r.data.ok === false && /数量不足/.test(r.data.error || ''), r.data);

console.log('== 7. 击杀足够后提交任务 ==');
const enemy = (getEnemies() || []).find(e => Number(e.level) >= 10 && Number(e.level) <= 120);
const p7 = await db.getPlayerByAccountId(31);
const beforeContribution = Number(p7.sect_contribution) || 0;
const task = { type: 'kill_enemy', target_id: Number(enemy.id), count: 20, reward: 1000, accepted: true, progress: 20, display_name: String(enemy.name), target_level: Number(enemy.level) };
p7.sect_tasks = [task, {}, {}, {}, {}, {}, {}];
await db.savePlayer(31, 1, p7);
r = await call(handleSectTaskRoute, 'POST', '/sect/tasks/complete', { slot_index: 0 }, token);
assert('提交成功+贡献+完成数1', r.data && r.data.ok === true && r.data.sect_task_completions_today === 1 && Number(r.data.player.sect_contribution) === beforeContribution + 1000, r.data);

console.log('== 8. 宗门宝库 ==');
r = await call(handleSectTreasuryRoute, 'GET', '/sect/treasury/list', null, token);
assert('宝库列表', r.data && r.data.ok === true && Array.isArray(r.data.goods) && r.data.goods.length > 0, { n: r.data && r.data.goods && r.data.goods.length });
r = await call(handleSectTreasuryRoute, 'POST', '/sect/treasury/buy', { index: 0, count: 1 }, token);
assert('购买宝库商品', r.data && r.data.ok === true && r.data.bought_count === 1, r.data);
r = await call(handleSectTreasuryRoute, 'POST', '/sect/treasury/refresh', {}, token);
assert('手动刷新宝库', r.data && r.data.ok === true && r.data.manual_refresh_count === 1, r.data);
r = await call(handleSectTreasuryRoute, 'POST', '/sect/treasury/buy_basic_weapon', {}, token);
assert('领取基础武器', r.data && r.data.ok === true, r.data);
r = await call(handleSectTreasuryRoute, 'POST', '/sect/treasury/buy_basic_weapon', {}, token);
assert('基础武器仅一次', r.data && r.data.ok === false && /已领取/.test(r.data.error || ''), r.data);

console.log('== 9. 论道殿 ==');
const ldMatId = Number(sect?.lundaodianMaterialId) || 0;
if (ldMatId > 0) {
  const p9 = await db.getPlayerByAccountId(31);
  putItem(p9, { id: ldMatId, name: '六阶材料', type: 'material', quality: 7 }, 50);
  await db.savePlayer(31, 1, p9);
  r = await call(handleSectCoreRoute, 'POST', '/sect/lundaodian/select', { sect_id: SECT_ID }, token);
  assert('论道殿选择宗门', r.data && r.data.ok === true && Number(r.data.player.lundaodian_sect_id) === SECT_ID, r.data);
  const ldTech = (getTechniques() || []).find(t => Number(t.sectId) === SECT_ID && !p9.technique_levels[String(t.id)]);
  if (ldTech) {
    r = await call(handleSectCoreRoute, 'POST', '/sect/lundaodian/learn', { type: 'technique', id: ldTech.id }, token);
    assert('论道殿学功法(扣经验)', r.data && r.data.ok === true && r.data.learned_id === ldTech.id, r.data);
  } else {
    assert('论道殿学功法(无未学功法跳过)', true, null);
  }
} else {
  assert('论道殿材料未配置跳过', true, null);
}

console.log('== 10. 低等级免费退宗 ==');
const token2 = await signToken(32, 'playerSect2', env);
const pLow = await createInitialPlayerData('低阶弟子', [1, 2, 3], env);
pLow.level = 6;
pLow.sect_id = 0;
await db.savePlayer(32, 1, pLow);
r = await call(handleSectCoreRoute, 'POST', '/sect/join', { sect_id: SECT_ID }, token2);
assert('低等级拜入', r.data && r.data.ok === true, r.data);
r = await call(handleSectCoreRoute, 'POST', '/sect/leave', {}, token2);
assert('低等级免费退宗', r.data && r.data.ok === true && Number(r.data.player.sect_id) === 0, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);