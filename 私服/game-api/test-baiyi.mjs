// 百艺系统集成测试（Worker 版）
// 覆盖：炼丹 /alchemy/start、炼器 /forging/*、刻阵 /baiyi/array/start、制物 /baiyi/craft/start、兑换码 /redeem
// 运行：
//   npx esbuild test-baiyi.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\baiyi-bundle.mjs
//   node D:\Temp\opencode\baiyi-bundle.mjs
import { handleBaiyiRoute } from './src/routes/online/baiyiRoutes.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';
import { getItemById } from './src/game/dataLoader.js';

const ACCOUNT = 42;
const store = new Map();
const mails = new Map();
const redemptions = new Map();
let seq = 5000;

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const results = [];
    if (this.sql.includes('SELECT data FROM players')) {
      const p = store.get('p:' + Number(this.args[0]));
      if (p) results.push({ data: p.data });
    } else if (this.sql.includes('SELECT id FROM mailbox_messages')) {
      const m = mails.get('m:' + Number(this.args[0]) + ':' + String(this.args[1]));
      if (m) results.push({ id: m.id });
    } else if (this.sql.includes('SELECT 1 AS ok FROM account_redemptions')) {
      if (redemptions.has('r:' + Number(this.args[0]) + ':' + String(this.args[1]))) results.push({ ok: 1 });
    }
    return { results };
  }
  async run() {
    if (this.sql.includes('INSERT INTO players')) {
      store.set('p:' + Number(this.args[0]), { account_id: Number(this.args[0]), slot: Number(this.args[1]), data: this.args[2] });
      return { meta: { last_row_id: seq++ } };
    }
    if (this.sql.includes('INSERT OR IGNORE INTO account_redemptions')) {
      const key = 'r:' + Number(this.args[0]) + ':' + String(this.args[1]);
      if (!redemptions.has(key)) { redemptions.set(key, seq++); return { meta: { changes: 1, last_row_id: seq++ } }; }
      return { meta: { changes: 0, last_row_id: 0 } };
    }
    if (this.sql.includes('INSERT INTO mailbox_messages')) {
      const key = 'm:' + Number(this.args[0]) + ':' + String(this.args[7] || '');
      if (mails.has(key)) return { meta: { last_row_id: 0 } };
      const id = seq++;
      mails.set(key, { id, type: this.args[1], title: this.args[2], content: this.args[3], attachments: JSON.parse(this.args[4] || '[]'), created_at: this.args[5] });
      return { meta: { last_row_id: id } };
    }
    return { meta: { last_row_id: seq++ } };
  }
}

const env = {
  DB: { prepare(sql) { return new Stmt(sql); }, async batch(stmts) { for (const s of stmts) await s.run(); return []; } },
  JWT_SECRET: 'test-secret'
};

let T = 1700000000;
Date.now = () => T * 1000;

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
  const res = await handleBaiyiRoute(makeReq(method, path, body, token), env, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function getPlayer() { return JSON.parse(store.get('p:' + ACCOUNT).data); }
function savePlayer(p) { store.set('p:' + ACCOUNT, { account_id: ACCOUNT, slot: 1, data: JSON.stringify(p) }); }
function addToInv(p, item, count) {
  p.inventory = p.inventory || [];
  while (p.inventory.length < 10) p.inventory.push(Array(20).fill(null));
  for (const page of p.inventory) {
    for (const slot of page) {
      if (slot && slot.item && Number(slot.item.id) === Number(item.id)) {
        slot.count = (Number(slot.count) || 0) + count;
        return;
      }
    }
  }
  for (const page of p.inventory) {
    for (let i = 0; i < page.length; i += 1) {
      if (!page[i]) { page[i] = { item: JSON.parse(JSON.stringify(item)), count }; return; }
    }
  }
}
function countItem(p, id) {
  let total = 0;
  for (const page of p.inventory || []) {
    for (const slot of page) {
      if (slot && slot.item && Number(slot.item.id) === Number(id)) total += Number(slot.count) || 1;
    }
  }
  return total;
}

const db = createDb(env);
const token = await signToken(ACCOUNT, 'baiyiTester', env);

const p0 = await createInitialPlayerData('百艺测试', [1, 2, 3], env);
p0.level = 60;
p0.spirit_stones = 0;
await db.savePlayer(ACCOUNT, 1, p0);

console.log('== 1. 鉴权 ==');
let r = await call('POST', '/alchemy/start', {}, null);
assert('未登录 401', r.status === 401 && /未登录/.test((r.data || {}).error || ''), { status: r.status });

console.log('== 2. 炼丹 ==');
const ing = (id, count) => ({ item: { id }, count });
r = await call('POST', '/alchemy/start', {
  selected_ingredients: { main: ing(182, 1), sub: [ing(169, 1), ing(178, 1)], catalyst: ing(53, 1) }, batch_count: 1
}, token);
assert('未解锁配方被拒', r.data && r.data.ok === false && /尚未学习丹方：圣战丹/.test(r.data.error || ''), r.data);

r = await call('POST', '/alchemy/start', {
  selected_ingredients: { main: ing(10, 1), sub: [ing(23, 1)] }, batch_count: 1
}, token);
assert('炼丹材料不足', r.data && r.data.ok === false && /材料不足：血精/.test(r.data.error || ''), r.data);

let p = getPlayer();
addToInv(p, getItemById(10), 5);
addToInv(p, getItemById(23), 5);
savePlayer(p);
r = await call('POST', '/alchemy/start', {
  selected_ingredients: { main: ing(10, 1), sub: [ing(23, 1)] }, batch_count: 1
}, token);
assert('炼丹开始成功', r.data && r.data.ok === true && r.data.pending === true && r.data.remaining_sec === 10, r.data);
p = getPlayer();
assert('炼丹材料扣除', countItem(p, 10) === 4 && countItem(p, 23) === 4, { p10: countItem(p, 10), p23: countItem(p, 23) });

r = await call('POST', '/forging/start', { equip_type: '剑', main_item_id: 24, main_count: 10, ling_item_id: 22, catalyst_item_id: 27 }, token);
assert('百艺序列占用中(炼丹)', r.data && r.data.ok === false && r.data.pending === true && /占用中/.test(r.data.error || ''), r.data);

T += 11;
r = await call('POST', '/forging/start', { equip_type: '剑', main_item_id: 24, main_count: 10, ling_item_id: 22, catalyst_item_id: 27 }, token);
assert('炼丹到期结算→邮件', r.data && r.data.ok === true && r.data.pending === false && r.data.mailed === true && r.data.player && r.data.player.baiyi.pending_job === null, r.data);
assert('炼药邮件已生成', [...mails.values()].some(m => m.type === 'craft_alchemy'), null);

console.log('== 3. 炼器 ==');
r = await call('POST', '/forging/start', { equip_type: '', main_item_id: 0, ling_item_id: 0, catalyst_item_id: 0 }, token);
assert('炼器参数无效', r.data && r.data.ok === false && r.data.error === '参数无效', r.data);

r = await call('POST', '/forging/start', { equip_type: '剑', main_item_id: 24, main_count: 10, ling_item_id: 22, catalyst_item_id: 27 }, token);
assert('炼器材料不足', r.data && r.data.ok === false && r.data.error === '材料不足', r.data);

p = getPlayer();
addToInv(p, getItemById(24), 10);
addToInv(p, getItemById(22), 1);
savePlayer(p);
r = await call('POST', '/forging/start', { equip_type: '剑', main_item_id: 24, main_count: 10, ling_item_id: 22, catalyst_item_id: 27 }, token);
assert('炼器开始成功', r.data && r.data.ok === true && r.data.pending === true && r.data.player && r.data.player.baiyi.sub_type === 'forging' && r.data.remaining_sec === 30, r.data);

T += 31;
r = await call('POST', '/alchemy/start', {
  selected_ingredients: { main: ing(10, 1), sub: [ing(23, 1)] }, batch_count: 1
}, token);
assert('炼器到期结算→邮件', r.data && r.data.ok === true && r.data.pending === false && r.data.mailed === true && r.data.player && r.data.player.baiyi.pending_job === null, r.data);
assert('炼器邮件已生成(含装备)', [...mails.values()].some(m => m.type === 'craft_forging' && Array.isArray(m.attachments) && m.attachments[0] && m.attachments[0].kind === 'item'), null);

console.log('== 4. 制物/刻阵 ==');
r = await call('POST', '/baiyi/craft/start', { recipe_id: 20, batch_count: 1 }, token);
assert('阵纹已改为掉落获取', r.data && r.data.ok === false && /阵纹已改为掉落获取/.test(r.data.error || ''), r.data);

p = getPlayer();
addToInv(p, getItemById(21), 3);
savePlayer(p);
r = await call('POST', '/baiyi/craft/start', { recipe_id: 1, batch_count: 1 }, token);
assert('制物开始成功(造纸)', r.data && r.data.ok === true && r.data.pending === true && r.data.remaining_sec === 30 && r.data.player && r.data.player.baiyi.sub_type === 'craft_item', r.data);

r = await call('POST', '/baiyi/array/start', { array_type: 'plate' }, token);
assert('制物占位时刻阵被拒', r.data && r.data.ok === false && r.data.pending === true && /制作进行中/.test(r.data.error || ''), r.data);

T += 31;
r = await call('POST', '/baiyi/array/start', { array_type: 'plate' }, token);
assert('制物到期结算→邮件', r.data && r.data.ok === true && r.data.pending === false && r.data.mailed === true && r.data.player && r.data.player.baiyi.pending_job === null, r.data);
assert('制物邮件已生成', [...mails.values()].some(m => m.type === 'craft_baiyi'), null);

r = await call('POST', '/baiyi/array/start', { array_type: 'rune' }, token);
assert('刻阵-阵纹被拒', r.data && r.data.ok === false && /阵纹已改为掉落获取/.test(r.data.error || ''), r.data);

p = getPlayer();
p.spirit_stones = 100;
savePlayer(p);
r = await call('POST', '/baiyi/array/start', { array_type: 'plate' }, token);
assert('刻阵灵石不足', r.data && r.data.ok === false && /灵石不足/.test(r.data.error || ''), r.data);

p = getPlayer();
p.spirit_stones = 100000;
addToInv(p, getItemById(24), 2);
addToInv(p, getItemById(21), 2);
addToInv(p, getItemById(161), 1);
savePlayer(p);
r = await call('POST', '/baiyi/array/start', { array_type: 'plate' }, token);
assert('刻阵开始成功', r.data && r.data.ok === true && r.data.pending === true && r.data.spirit_stone_cost === 10000 && r.data.player && r.data.player.baiyi.sub_type === 'array_plate_random', r.data);

r = await call('POST', '/baiyi/craft/start', { recipe_id: 1, batch_count: 1 }, token);
assert('刻阵占位时制物被拒', r.data && r.data.ok === false && r.data.pending === true && /制作进行中/.test(r.data.error || ''), r.data);

T += 61;
r = await call('POST', '/baiyi/craft/start', { recipe_id: 1, batch_count: 1 }, token);
assert('刻阵到期结算→洞府阵库', r.data && r.data.ok === true && r.data.pending === false && r.data.mailed === false && /阵盘\/阵纹已收纳至洞府阵库/.test(r.data.msg || ''), r.data);
p = getPlayer();
assert('刻阵产物入洞府(非邮件)', p.cave && p.cave.formation && Array.isArray(p.cave.formation.plate_pool) && p.cave.formation.plate_pool.length > 0, { plate_pool: p.cave && p.cave.formation && p.cave.formation.plate_pool && p.cave.formation.plate_pool.length });

console.log('== 5. 装备升品/词缀/洗练/继承/造化 ==');
p = getPlayer();
addToInv(p, getItemById(24), 200);
addToInv(p, getItemById(23), 3);
addToInv(p, getItemById(22), 1);
p.inventory[0][1] = { item: { id: 11, name: '刀靶', type: 'weapon', subtype: '刀', quality: 1 }, count: 1 };
savePlayer(p);

r = await call('POST', '/forging/upgrade', { equip_page: 0, equip_slot: 0, expect_item_id: 11, material_item_id: 24, material_count: 100, mode: 'current' }, token);
assert('装备升品成功', r.data && r.data.ok === true && r.data.success === true && r.data.chance === 1, r.data);
p = getPlayer();
assert('升品后品质+1', p.inventory[0][0] && p.inventory[0][0].item && p.inventory[0][0].item.quality === 2, p.inventory[0][0]);

r = await call('POST', '/forging/upgrade', { equip_page: 0, equip_slot: 0, expect_item_id: 11, material_item_id: 24, material_count: 5, mode: 'current' }, token);
assert('升品条件不满足被拒', r.data && r.data.ok === false && /材料阶级或数量不满足升品条件/.test(r.data.error || ''), r.data);

r = await call('POST', '/forging/upgrade', { equip_page: 0, equip_slot: 0, expect_item_id: 999, material_item_id: 24, material_count: 5, mode: 'current' }, token);
assert('背包变动 SLOT_MISMATCH', r.data && r.data.ok === false && r.data.code === 'SLOT_MISMATCH', r.data);

r = await call('POST', '/forging/upgrade_affix', { equip_page: 0, equip_slot: 0, expect_item_id: 11, affix_index: 0, material_item_id: 24, material_count: 1, mode: 'current' }, token);
assert('无词缀装备不能升词缀', r.data && r.data.ok === false && r.data.error === '该装备没有可升品词缀', r.data);

r = await call('POST', '/forging/reroll_affix_tier', { equip_page: 0, equip_slot: 0, expect_item_id: 11, affix_index: 0, material_item_id: 23 }, token);
assert('无词缀装备不能洗练词缀', r.data && r.data.ok === false && r.data.error === '该装备没有可洗练词缀', r.data);

r = await call('POST', '/forging/reroll', { equip_page: 0, equip_slot: 0, expect_item_id: 11, ling_item_id: 22 }, token);
assert('装备洗练成功', r.data && r.data.ok === true && r.data.equipment, r.data);
p = getPlayer();
assert('洗练消耗引灵', countItem(p, 22) === 0, { ling: countItem(p, 22) });

r = await call('POST', '/forging/reroll', { equip_page: 0, equip_slot: 0, expect_item_id: 11, ling_item_id: 22 }, token);
assert('洗练引灵不足', r.data && r.data.ok === false && /引灵材料不足/.test(r.data.error || ''), r.data);

r = await call('POST', '/forging/inherit', { source_equip_page: 0, source_equip_slot: 0, target_equip_page: 0, target_equip_slot: 0 }, token);
assert('继承同槽被拒', r.data && r.data.ok === false && r.data.error === '主装备与被继承装备不能是同一件', r.data);

r = await call('POST', '/forging/inherit', { source_equip_page: 0, source_equip_slot: 0, target_equip_page: 0, target_equip_slot: 1, material_item_id: 24 }, token);
assert('继承子类型不符被拒', r.data && r.data.ok === false && /被继承装备必须与主装备同子类型/.test(r.data.error || ''), r.data);

r = await call('POST', '/forging/zaohua', { equip_page: 0, equip_slot: 0, expect_item_id: 11 }, token);
assert('造化宝珠不足', r.data && r.data.ok === false && /造化宝珠不足/.test(r.data.error || ''), r.data);

p = getPlayer();
addToInv(p, getItemById(239), 1);
savePlayer(p);
r = await call('POST', '/forging/zaohua', { equip_page: 0, equip_slot: 0, expect_item_id: 11 }, token);
assert('装备造化成功', r.data && r.data.ok === true && ['neutral', 'positive', 'negative'].includes(r.data.polarity), r.data);
p = getPlayer();
assert('造化后装备锁定', p.inventory[0][0] && p.inventory[0][0].item && p.inventory[0][0].item.zaohua_locked === true, p.inventory[0][0]);

r = await call('POST', '/forging/upgrade', { equip_page: 0, equip_slot: 0, expect_item_id: 11, material_item_id: 24, material_count: 100, mode: 'current' }, token);
assert('造化后禁止升品', r.data && r.data.ok === false && /已完成造化/.test(r.data.error || ''), r.data);

console.log('== 6. 兑换码 ==');
p = getPlayer();
const stonesBefore = Number(p.spirit_stones) || 0;
savePlayer(p);
r = await call('POST', '/redeem', { code: '我们妙音宗数值就是这么填的' }, token);
assert('兑换码成功(灵石+100/胡萝卜x10)', r.data && r.data.ok === true && (Number(r.data.player.spirit_stones) || 0) === stonesBefore + 100 && countItem(r.data.player, 17) === 10, { d: r.data && { ok: r.data.ok, stones: r.data.player && r.data.player.spirit_stones } });

r = await call('POST', '/redeem', { code: '我们妙音宗数值就是这么填的' }, token);
assert('兑换码重复使用被拒', r.data && r.data.ok === false && r.data.error === '该兑换码已使用', r.data);

r = await call('POST', '/redeem', { code: '不存在的码' }, token);
assert('无效兑换码被拒', r.data && r.data.ok === false && r.data.error === '无效兑换码', r.data);

r = await call('POST', '/redeem', {}, token);
assert('空兑换码被拒', r.data && r.data.ok === false && r.data.error === '请输入兑换码', r.data);

r = await call('POST', '/redeem', { code: '重生之我在艾德尔修仙669' }, token);
assert('套装兑换码成功', r.data && r.data.ok === true, r.data);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
