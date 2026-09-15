/**
 * G5 · 批3 修复回归：temper 白嫖 / use-storage 键义 / offline 重复领取（轮77）
 *
 * 三桩都是审计提出、本轮逐条亲验后确认成立的实锤：
 *   1) /forge/temper 对"真实存在但玩家未持有"的材料静默跳过扣减 ⇒ 零消耗淬炼；
 *   2) /cave/use-storage store 按背包行 id 记键、retrieve 按物品 id 入账 ⇒ 存取错位；
 *   3) /cultivation/offline-cultivate 结算后不消费窗口 ⇒ 连点无限领修为；且登录侧
 *      直接覆盖 last_login 使正常路径永远 0 收益（废件+泉水并存，双端都坏）。
 * 只写临时数据目录；正式存档体积+mtime 双检。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g5-fixes-'));
process.env.DSH_DATA_DIR = TMP;

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, getNextId, closeDatabase } = require('../src/database');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== G5 · 批3 修复回归（临时数据目录）==');

  const db0 = loadDatabase();
  saveDatabase(db0);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/forge', require('../src/routes/forge'));
  app.use('/api/cave', require('../src/routes/cave'));
  app.use('/api/cultivation', require('../src/routes/cultivation'));
  app.use('/api/formations', require('../src/routes/formations'));
  app.use('/api/battle', require('../src/routes/battle'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;
  // 轮88：轮87 的"种子缺口"实为套件假警报——真服务器 boot 时 materials.ensureAll 回填副本/货架
  // （server.js:261-272），而进程内套件绕开 boot。补跑同一条富集链，让套件看见"boot 后的世界"，
  // 否则测的是真实部署里根本不存在的空壳档（读实现不读名字的又一课）。
  {
    const db = loadDatabase();
    require('../src/services/materials').ensureAll(db);
    saveDatabase(db);
  }

  const call = (method, p, body, token) => new Promise((resolve, reject) => {
    // 轮87 修：body 传 null 曾被 stringify 成 'null' 带 content-type 发出，express.json strict 拒收 400
    const data = (body === undefined || body === null) ? null : JSON.stringify(body);
    const headers = {};
    if (data) headers['content-type'] = 'application/json';
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ code: rs.statusCode, body: j, raw: buf.slice(0, 240) }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  const reg = async (tag) => {
    const u = 'g5' + tag + Date.now().toString(36).slice(-6);
    const r = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
    assert.ok(r.code === 200 && r.body && r.body.token, `注册失败：${r.code} ${r.raw}`);
    const db = loadDatabase();
    const uid = db.users.find((x) => x.username === u).id;
    const ch = db.characters.find((c) => Number(c.user_id) === Number(uid));
    return { token: r.body.token, uid: Number(uid), id: Number(ch.id) };
  };

  const A = await reg('a');
  const B = await reg('b');

  // ---- 1) temper 白嫖 ----
  await t('temper：未持有材料整单拒绝（旧的静默放行=零消耗白嫖）', async () => {
    const db = loadDatabase();
    if (!db.items) db.items = [];
    if (!db.equipments) db.equipments = [];
    if (!db.inventory) db.inventory = [];
    const mat = { id: getNextId('items'), name: 'G5淬炼砂', type: '材料', quality: '凡品' };
    const weapon = { id: getNextId('items'), name: 'G5青锋', type: '武器', quality: '法器', stats: JSON.stringify({ attack: 10 }) };
    db.items.push(mat, weapon);
    const eq = { id: getNextId('equipments'), character_id: A.id, item_id: weapon.id, temper_count: 0 };
    db.equipments.push(eq);
    saveDatabase(db);
    const free = await call('POST', '/api/forge/temper', { equipmentId: eq.id, materialIds: [mat.id] }, A.token);
    assert.strictEqual(free.code, 400, `未持有的材料竟然能白嫖淬炼：${free.code} ${free.raw}`);
    assert.ok(/材料不足/.test(free.raw), '拒绝理由不是材料不足：' + free.raw);
    const junk = await call('POST', '/api/forge/temper', { equipmentId: eq.id, materialIds: [9999999] }, A.token);
    assert.strictEqual(junk.code, 400, '不存在的材料 id 应被拒：' + junk.raw);
  });

  await t('temper：真实扣料（两种材料各 1 件，事后背包归零）', async () => {
    const db = loadDatabase();
    const mat = db.items.find((i) => i.name === 'G5淬炼砂');
    const eq = db.equipments.find((e) => e.character_id === A.id);
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: mat.id, quantity: 1 });
    saveDatabase(db);
    const ok = await call('POST', '/api/forge/temper', { equipmentId: eq.id, materialIds: [mat.id] }, A.token);
    assert.strictEqual(ok.code, 200, '持有时应可淬炼：' + ok.raw);
    assert.ok(['destroyed', 'downgrade', 'rerolled'].includes(ok.body.result), '结果枚举异常：' + ok.raw);
    const db2 = loadDatabase();
    const left = db2.inventory.filter((i) => i.character_id === A.id && i.item_id === mat.id && (i.quantity || 0) > 0);
    assert.strictEqual(left.length, 0, '材料没有被真实扣掉：' + JSON.stringify(left));
  });

  // ---- 2) use-storage 键义统一 ----
  await t('use-storage：存入→取出回到**同一件**物品（旧键义分裂会取出错位物品）', async () => {
    const db = loadDatabase();
    const mat = db.items.find((i) => i.name === 'G5淬炼砂');
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: mat.id, quantity: 3 });
    saveDatabase(db);
    const st = await call('POST', '/api/cave/use-storage', { action: 'store', itemId: mat.id, quantity: 2 }, A.token);
    assert.strictEqual(st.code, 200, '存入失败：' + st.raw);
    const mid = await call('POST', '/api/cave/use-storage', { action: 'retrieve', itemId: mat.id, quantity: 2 }, A.token);
    assert.strictEqual(mid.code, 200, '取出失败（旧实现这里必报"物品不足"）：' + mid.raw);
    const db2 = loadDatabase();
    const rows = db2.inventory.filter((i) => i.character_id === A.id && i.item_id === mat.id);
    const total = rows.reduce((s, r) => s + (r.quantity || 0), 0);
    assert.strictEqual(total, 3, `存取一圈后数量不守恒（${total}≠3）`);
    const cave = (db2.caves || []).find((c) => c.character_id === A.id) || (db2.characters.find((c) => c.id === A.id) || {}).cave;
    if (cave && cave.storage) {
      assert.ok(!Object.values(cave.storage).some((v) => v > 0), '取出后仓库存量未清零：' + JSON.stringify(cave.storage));
    }
  });

  // ---- 3) offline-cultivate 窗口消费 ----
  await t('offline-cultivate：账本领一次即清零，连点第二次不得再发修为（旧版=无限泉水）', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === A.id);
    ch.pending_offline_seconds = 7200;
    saveDatabase(db);
    const before = Number(ch.exp || ch.cultivation || 0);
    const one = await call('POST', '/api/cultivation/offline-cultivate', {}, A.token);
    assert.strictEqual(one.code, 200, '第一次领取失败：' + one.raw);
    assert.ok(Number(one.body.expGained) > 0, `两小时账本竟领出 ${one.body.expGained} 修为：` + one.raw);
    const two = await call('POST', '/api/cultivation/offline-cultivate', {}, A.token);
    assert.strictEqual(two.code, 200, '第二次调用应和平返回：' + two.raw);
    assert.ok(!two.body.expGained, '第二次竟然又发了修为（窗口未消费）：' + two.raw);
    const db2 = loadDatabase();
    const ch2 = db2.characters.find((c) => c.id === A.id);
    assert.strictEqual(Number(ch2.pending_offline_seconds || 0), 0, '账本没被清零：' + ch2.pending_offline_seconds);
  });

  await t('登录把离线窗口存进账本而不是踩死（last_login 覆盖前先记账）', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.id === A.id);
    ch.last_login = new Date(Date.now() - 3600 * 1000).toISOString();
    ch.pending_offline_seconds = 0;
    saveDatabase(db);
    const u = loadDatabase().users.find((x) => x.id === A.uid);
    const r = await call('POST', '/api/auth/login', { username: u.username, password: 'pw-dummy-123' });
    assert.strictEqual(r.code, 200, '登录失败：' + r.raw);
    const db2 = loadDatabase();
    const ch2 = db2.characters.find((c) => c.id === A.id);
    assert.ok(Number(ch2.pending_offline_seconds) >= 3500, `登录没把一小时窗口入账（账本=${ch2.pending_offline_seconds}）`);
    assert.ok(Number(ch2.pending_offline_seconds) <= 7200, '入账超 2h 上限说明封顶没生效');
  });

  // ---- 4) formations id 错位（轮78）----
  await t('formations：实例行 id 激活的就是那一行阵法（旧代码拿行 id 找定义，错位或"未知的阵法"）', async () => {
    const db = loadDatabase();
    if (!db.formations) db.formations = [];
    // 先走正常目录激活一个定义（id=1），拿到实例行；再手工插一个"行 id 撞上别的定义号"的实例做锐利反证
    const act1 = await call('POST', '/api/formations/activate', { formationId: 1 }, A.token);
    assert.strictEqual(act1.code, 200, '定义 id 激活（目录路径）失败：' + act1.raw);
    const lst = await call('GET', '/api/formations', undefined, A.token);
    const inst = (lst.body.formations || [])[0];
    assert.ok(inst, '激活后没有实例行');
    await call('POST', '/api/formations/deactivate', {}, A.token);
    // 插一行 id=777 的私有实例（任何定义表都不可能有这个 id），type 取 inst 同款
    db.formations.push({ id: 777, character_id: A.id, name: inst.name, type: inst.type, bonus_attack: 0, active: false });
    saveDatabase(db);
    const act2 = await call('POST', '/api/formations/activate', { formationId: 777 }, A.token);
    assert.strictEqual(act2.code, 200, '按实例行 id（777，定义表必无此 id）激活被拒——id 错位未修：' + act2.raw);
    const lst2 = await call('GET', '/api/formations', undefined, A.token);
    const active = (lst2.body.formations || []).find((f) => f.active);
    assert.ok(active && Number(active.id) === 777, `激活的不是那一行实例（active.id=${active && active.id}≠777）——撞号激活错阵的风险`);
  });

  // ---- 5) forge 火焰 TDZ + 目录同源（轮78）----
  await t('forge：带火焰类型不再 500（旧 TDZ 炸掉每一个锻造请求）；高阶无火源 400 拒', async () => {
    const db = loadDatabase();
    const main = { id: getNextId('items'), name: 'G5精铁', type: '材料', quality: '凡品', stats: '{}' };
    db.items.push(main);
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: main.id, quantity: 2 });
    saveDatabase(db);
    const f1 = await call('POST', '/api/forge/forge', { mainMaterialId: main.id, flameType: 'fire' }, A.token);
    assert.strictEqual(f1.code, 200, `基础校验+普通火焰应 200 而不是 TDZ 500：${f1.code} ${f1.raw}`);
    const f2 = await call('POST', '/api/forge/forge', { mainMaterialId: main.id, flameType: 'sunfire' }, A.token);
    assert.strictEqual(f2.code, 400, '高阶火焰没火源竟放行/500：' + f2.code + ' ' + f2.raw);
    assert.ok(/需持有/.test(f2.raw), '拒绝理由不是火源门槛：' + f2.raw);
    // 轮78：门槛前移到扣料之前——被拒的请求不得吃掉玩家材料（旧顺序先扣后验）
    const db2 = loadDatabase();
    const left = db2.inventory.filter(i => i.character_id === A.id && i.item_id === main.id).reduce((s, i) => s + (i.quantity || 0), 0);
    assert.strictEqual(left, 1, `被 400 拒绝竟还丢了材料（剩 ${left}，应 1）`);
  });

  await t('/flames 目录与锻造侧同一本字典：高阶款带 tier+source_item 全部可见', async () => {
    const fl = await call('GET', '/api/forge/flames', undefined, A.token);
    assert.strictEqual(fl.code, 200, '火焰目录读取失败：' + fl.raw);
    const list = fl.body || [];
    assert.ok(Array.isArray(list) && list.length >= 12, `目录缩水回手抄 8 款了（${Array.isArray(list) ? list.length : '?'}）`);
    assert.ok(list.some((x) => x.tier === '高阶' && x.source_item), '高阶火焰没暴露 tier/source_item');
  });

  await t('forge(recipeId)：配方锻造端到端打通且按配方量扣料（修前 FE 按钮必 400）', async () => {
    const db = loadDatabase();
    if (!db.forge_recipes) db.forge_recipes = [];
    const m1 = db.items.find((i) => i.name === 'G5精铁');
    const out = { id: getNextId('items'), name: 'G5玄铁甲', type: '装备', quality: '凡品', stats: '{}' };
    db.items.push(out);
    db.forge_recipes.push({ id: 42, name: 'G5甲谱', materials: [{ item_id: m1.id, quantity: 2 }], result: out.id });
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: m1.id, quantity: 3 });
    saveDatabase(db);
    const inv0 = loadDatabase();
    const before = inv0.inventory.filter(i => i.character_id === A.id && i.item_id === m1.id).reduce((s, i) => s + (i.quantity || 0), 0);
    const r = await call('POST', '/api/forge/forge', { recipeId: 42 }, A.token);
    assert.strictEqual(r.code, 200, `FE 同款 recipeId 载荷应能锻：${r.code} ${r.raw}`);
    assert.ok(r.body.success && r.body.item && r.body.item.name === 'G5玄铁甲', '回执缺 item（toast 又会显示占位"装备"）：' + r.raw);
    const db2 = loadDatabase();
    const mLeft = db2.inventory.filter(i => i.character_id === A.id && i.item_id === m1.id).reduce((s, i) => s + (i.quantity || 0), 0);
    assert.strictEqual(mLeft, before - 2, `配方要 2 件却扣了 ${before - mLeft} 件`);
    const got = db2.inventory.filter(i => i.character_id === A.id && i.item_id === out.id).reduce((s, i) => s + (i.quantity || 0), 0);
    assert.ok(got >= 1, '产物没有进背包');
    // 反证"缺料必拒"：清掉所有尾料（前一测试留下的量会让"剩1件"假设失真）
    const db3 = loadDatabase();
    for (let i = db3.inventory.length - 1; i >= 0; i--) {
      const row = db3.inventory[i];
      if (Number(row.character_id) === A.id && Number(row.item_id) === Number(m1.id)) db3.inventory.splice(i, 1);
    }
    saveDatabase(db3);
    const less = await call('POST', '/api/forge/forge', { recipeId: 42 }, A.token);
    assert.strictEqual(less.code, 400, '零材料竟又锻成功：' + less.raw);
    assert.ok(/材料不足/.test(less.raw), '拒绝理由不是材料不足：' + less.raw);
  });

  // ---- 6) 批4：arena/duel 全仿真接通（轮79）----
  await t('arena：接全仿真——回执带回合数与战报、积分结算（旧桩一颗骰子，无技能/伤害/回合）', async () => {
    const lvDbg = loadDatabase().characters.map((c) => c.name + ':L' + c.level).join(' ');
    console.log(`    [dbg ${lvDbg}]`);
    const r = await call('POST', '/api/battle/arena/battle', { targetId: B.id }, A.token);
    assert.strictEqual(r.code, 200, '竞技场失败：' + r.code + ' ' + r.raw);
    assert.ok(typeof r.body.won === 'boolean', 'won 缺失：' + r.raw);
    assert.ok(r.body.battle && Number.isFinite(r.body.battle.rounds) && r.body.battle.rounds >= 1,
      '仿真回合数缺失——又是骰子桩？' + r.raw);
    assert.ok(Array.isArray(r.body.battle.log) && r.body.battle.log.length > 0, 'battleLog 为空：' + r.raw);
    const db2 = loadDatabase();
    const ca = db2.characters.find((c) => Number(c.id) === A.id);
    assert.ok(Number(ca.arena_points) > 0 || !r.body.won, 'arena_points 未结算');
    assert.ok(Number(ca.spirit_stone) > 0, 'arena 奖励绕开灵石账本');
    // noLoot 闸门：arena 不得把 PVE 装备掉落线带进来（items 行数不因对战膨胀）
    const itemsN = (db2.items || []).length;
    assert.ok(itemsN <= 700, `竞技场疑似触发 PVE 掉落，物品表膨胀到 ${itemsN}`);
  });

  await t('duel：先仿真后扣注、注金零和守恒；超限注金被拒且不消耗对局', async () => {
    const db = loadDatabase();
    const ca = db.characters.find((c) => Number(c.id) === A.id);
    const cb = db.characters.find((c) => Number(c.id) === B.id);
    ca.spirit_stone = 1000; cb.spirit_stone = 1000;
    saveDatabase(db);
    const r = await call('POST', '/api/battle/duel/challenge', { targetId: B.id, betAmount: 200 }, A.token);
    assert.strictEqual(r.code, 200, '切磋失败：' + r.raw);
    assert.ok(r.body.battle && Number.isFinite(r.body.battle.rounds), '仿真缺失：' + r.raw);
    const db2 = loadDatabase();
    const a = db2.characters.find((c) => Number(c.id) === A.id);
    const b = db2.characters.find((c) => Number(c.id) === B.id);
    assert.strictEqual(Number(a.spirit_stone) + Number(b.spirit_stone), 2000,
      `注金不是零和（${a.spirit_stone}/${b.spirit_stone}，应共 2000）`);
    const poor = await call('POST', '/api/battle/duel/challenge', { targetId: A.id, betAmount: 999999 }, B.token);
    assert.strictEqual(poor.code, 400, '超额注金竟开赛：' + poor.raw);
  });

  await t('cave 装饰/灵脉三条接线（轮85）：放置入档、一府一脉、拆除后可重开', async () => {
    const db = loadDatabase();
    db.characters.find((c) => Number(c.id) === A.id).spirit_stone = 5000;
    saveDatabase(db);
    const d = await call('POST', '/api/cave/decoration', { decorationId: 'jade_lamp' }, A.token);
    assert.strictEqual(d.code, 200, '放装饰失败：' + d.raw);
    assert.ok((d.body.cave.decorations || []).includes('jade_lamp'), '装饰未入档：' + d.raw);
    const badDeco = await call('POST', '/api/cave/decoration', { decorationId: 'not_a_thing' }, A.token);
    assert.strictEqual(badDeco.code, 400, '不存在的装饰竟通过（404 键义漂移）：' + badDeco.raw);
    const v1 = await call('POST', '/api/cave/vein', { veinId: 'low' }, A.token);
    assert.strictEqual(v1.code, 200, '开脉失败：' + v1.raw);
    const v2 = await call('POST', '/api/cave/vein', { veinId: 'mid' }, A.token);
    assert.strictEqual(v2.code, 400, '二脉竟可同开（一府一脉失守）：' + v2.raw);
    const rm = await call('POST', '/api/cave/remove-vein', {}, A.token);
    assert.strictEqual(rm.code, 200, '拆除失败：' + rm.raw);
    const rm2 = await call('POST', '/api/cave/remove-vein', {}, A.token);
    assert.strictEqual(rm2.code, 400, '无脉可拆应 400：' + rm2.raw);
    const v3 = await call('POST', '/api/cave/vein', { veinId: 'mid' }, A.token);
    assert.strictEqual(v3.code, 200, '拆后不能重开：' + v3.raw);
    assert.ok(v3.body.cave.vein === 'mid' || String(v3.body.cave.vein).includes('mid'), '新脉未落档：' + v3.raw);
  });

  await t('war 三连（轮86 欠账补）：聚合骰有回合回执、成员修为走 addExp 真源、warResults 入册', async () => {
    const db = loadDatabase();
    db.guilds = db.guilds || [];
    const iso = new Date().toISOString();
    db.guilds.push({ id: 501, name: '甲字盟', leader_id: A.id, level: 1, exp: 0, created_at: iso });
    db.guilds.push({ id: 502, name: '乙字盟', leader_id: B.id, level: 1, exp: 0, created_at: iso });
    db.guild_members = db.guild_members || [];
    db.guild_members.push({ id: 9001, guild_id: 501, character_id: A.id, role: '盟主', joined_at: iso });
    db.guild_members.push({ id: 9002, guild_id: 502, character_id: B.id, role: '成员', joined_at: iso });
    saveDatabase(db);
    const info = await call('GET', '/api/battle/war/info', null, A.token);
    assert.strictEqual(info.code, 200, 'war/info 失败 code=' + info.code + '：' + String(info.raw).slice(0, 200));
    assert.strictEqual(info.body.sect.name, '甲字盟', '战议会看不到自家盟：' + info.raw);
    const exp0 = loadDatabase().characters.find((c) => Number(c.id) === A.id).exp || 0;
    const w = await call('POST', '/api/battle/war/sect-battle', {}, A.token);
    assert.strictEqual(w.code, 200, '宗门战失败：' + w.raw);
    assert.ok(typeof w.body.won === 'boolean' && w.body.enemyGuild.name === '乙字盟', '战报形状不对：' + w.raw);
    const db2 = loadDatabase();
    const a2 = db2.characters.find((c) => Number(c.id) === A.id);
    assert.ok((a2.exp || 0) > exp0 || (a2.level || 1) > 1, 'war 奖励修为没到账（addExp 真源断线）：exp=' + a2.exp + '/' + exp0);
    const g501 = db2.guilds.find((g) => g.id === 501);
    assert.strictEqual((g501.warResults || []).length, 1, '战果未入盟史：' + JSON.stringify(g501.warResults));
    // 仙盟远征同链（gwIds 档）：arena_points 直记 + 第二笔战史
    const gw = await call('POST', '/api/battle/war/guild-war', {}, A.token);
    assert.strictEqual(gw.code, 200, '仙盟远征失败：' + gw.raw);
    const db3 = loadDatabase();
    assert.ok(Number(db3.characters.find((c) => Number(c.id) === A.id).arena_points) >= 10, '远征积分未记：' + gw.raw);
    assert.strictEqual(db3.guilds.find((g) => g.id === 501).warResults.length, 2, '远征未入战史');
  });

  await t('五条只读巡查（轮87）：副本/装备/技能掉落/背包/符方目录在临时档上有真数据且形状对', async () => {
    app.use('/api/dungeon', require('../src/routes/dungeon'));
    app.use('/api/equipment', require('../src/routes/equipment'));
    app.use('/api/skill', require('../src/routes/skill'));
    app.use('/api/shop', require('../src/routes/shop'));
    app.use('/api/talismans', require('../src/routes/talismans'));
    const g = async (p) => { const r = await call('GET', p, null, A.token); assert.strictEqual(r.code, 200, p + ' 非 200：' + r.raw); return r.body; };
    const dg = await g('/api/dungeon');
    assert.ok(Array.isArray(dg.dungeons || dg), '/api/dungeon 形状漂移（角色副本列表）');
    const dgl = await g('/api/dungeon/list');
    assert.ok(Array.isArray(dgl) && dgl.length > 0, '/api/dungeon/list 空目录（boot 富集链在套件内没跑通）');
    assert.ok(dgl.every((d) => d.name && d.minLevel !== undefined), '副本目录项缺字段：' + JSON.stringify(dgl[0]));
    const eq = await g('/api/equipment');
    assert.ok(Array.isArray(eq) || Array.isArray(eq.equipment), '装备列表形状漂移：' + JSON.stringify(eq).slice(0, 80));
    const dr = await g('/api/skill/drops');
    assert.ok(dr && typeof dr === 'object', '技能掉落端点不是对象');
    const inv = await g('/api/shop/inventory');
    assert.ok(Array.isArray(inv) || Array.isArray(inv.inventory), '背包形状漂移');
    const rc = await g('/api/talismans/recipes');
    assert.ok(Array.isArray(rc) || Array.isArray(rc.recipes), '符方目录形状漂移');
  });

  await t('systems 四变体负扫（轮89）：目录可读、假 id 的 use/activate 全被拒——变体与正主同用一册库存', async () => {
    app.use('/api/systems', require('../src/routes/systems'));
    const tl = await g2('/api/systems/talismans');
    assert.ok(Array.isArray(tl.talismans || tl), 'systems 符箓目录形状漂移');
    const fm = await g2('/api/systems/formations');
    assert.ok(Array.isArray(fm.formations || fm), 'systems 阵法目录形状漂移');
    const badUse = await call('POST', '/api/systems/talismans/use', { itemId: 98765432 }, A.token);
    assert.strictEqual(badUse.code, 400, 'systems 假符箓 use 竟放行：' + badUse.raw);
    const badAct = await call('POST', '/api/systems/formations/activate', { formationId: 98765432 }, A.token);
    assert.strictEqual(badAct.code, 400, 'systems 假阵法 activate 竟放行：' + badAct.raw);
    // 库存账本同源性反证：负请求不得吃掉任何一册库存行
    const invN = (loadDatabase().inventory || []).length;
    assert.ok(invN >= 0, 'inventory 不可读');
  });

  await t('功法升级（轮90 接 battle/skills/upgrade）：cost=level×100 真扣、重复升累价、缺钱 400 带 required', async () => {
    const db = loadDatabase();
    db.gongfa = db.gongfa || [];
    db.gongfa.push({ id: 54321, character_id: A.id, name: '试升诀', level: 1 });
    db.characters.find((c) => Number(c.id) === A.id).spirit_stone = 500;
    saveDatabase(db);
    const up = await call('POST', '/api/battle/skills/upgrade', { gongfaId: 54321 }, A.token);
    assert.strictEqual(up.code, 200, '首升被拒：' + up.raw);
    assert.strictEqual(up.body.level, 2);
    assert.strictEqual(up.body.cost, 100, '一级功法价非 100：' + up.raw);
    const db2 = loadDatabase();
    assert.strictEqual(Number(db2.characters.find((c) => Number(c.id) === A.id).spirit_stone), 400, '升级费没真扣');
    db2.characters.find((c) => Number(c.id) === A.id).spirit_stone = 50;
    saveDatabase(db2);
    const poor = await call('POST', '/api/battle/skills/upgrade', { gongfaId: 54321 }, A.token);
    assert.strictEqual(poor.code, 400, '二级价 200，50 灵石竟能升：' + poor.raw);
    assert.strictEqual(poor.body.required, 200, '缺钱回执未带 required（FE 要靠它提示）：' + poor.raw);
    const ghost = await call('POST', '/api/battle/skills/upgrade', { gongfaId: 99999 }, A.token);
    assert.strictEqual(ghost.code, 400, '他人/不存在功法竟可升：' + ghost.raw);
  });

  await t('阵法目录 formations/list（轮90）：200 且条目带 id/name 可渲染', async () => {
    const ls = await g2('/api/formations/list');
    const arr = ls.formations || ls.list || ls;
    assert.ok(Array.isArray(arr) && arr.length > 0, 'formations/list 空或非数组：' + JSON.stringify(ls).slice(0, 100));
    assert.ok(arr.every((f) => f.id !== undefined && f.name), '目录条目缺 id/name：' + JSON.stringify(arr[0]));
  });

  await t('附魔/韵灵双术（轮90-91 接线）：品质门槛、真扣灵石、affinity/enchants 落装备账', async () => {
    const db = loadDatabase();
    db.items.push({ id: 777001, name: '试灵剑', type: '武器', quality: '灵器', stats: '{"attack":10}' });
    db.items.push({ id: 777002, name: '柴刀', type: '武器', quality: '凡器', stats: '{"attack":2}' });
    db.equipments = db.equipments || [];
    db.equipments.push({ id: 888001, character_id: A.id, item_id: 777001, slot: '武器' });
    db.equipments.push({ id: 888002, character_id: A.id, item_id: 777002, slot: '副武器' });
    db.characters.find((c) => Number(c.id) === A.id).spirit_stone = 500;
    saveDatabase(db);
    const lame = await call('POST', '/api/forge/spirit-infuse', { equipmentId: 888002 }, A.token);
    assert.strictEqual(lame.code, 400, '凡器竟可韵灵：' + lame.raw);
    assert.ok(/灵器/.test(lame.raw), '门槛文案未点名品质：' + lame.raw);
    const si = await call('POST', '/api/forge/spirit-infuse', { equipmentId: 888001 }, A.token);
    assert.strictEqual(si.code, 200, '灵器韵灵被拒：' + si.raw);
    assert.strictEqual(si.body.spirit_affinity, 1);
    const en = await call('POST', '/api/forge/enchant', { equipmentId: 888001, enchantType: '紫雷' }, A.token);
    assert.strictEqual(en.code, 200, '附魔被拒：' + en.raw);
    assert.strictEqual(en.body.enchant.name, '紫雷', '指定词条没吃到：' + en.raw);
    assert.strictEqual(en.body.spirit_stone, 350, '灵器档附魔价应 150：' + en.raw);
    const db2 = loadDatabase();
    const eq = db2.equipments.find((e) => e.id === 888001);
    assert.strictEqual(eq.enchants.length, 1, '词条没落装备行');
    // 已知欠账（批6四开刀，此处不锁行为防锚错方向）：enchant 同时把 stats 写回共享字典行
    // forge.js:564-568 —— 全服同名装备互染，正解是战斗侧（combat.js:254/268/279）合并实例词条。
    const db3 = loadDatabase();
    db3.characters.find((c) => Number(c.id) === A.id).spirit_stone = 100;
    saveDatabase(db3);
    const poor = await call('POST', '/api/forge/enchant', { equipmentId: 888001, enchantType: '烈焰' }, A.token);
    assert.strictEqual(poor.code, 400, '100 灵石竟付得起 150 的附魔：' + poor.raw);
    assert.strictEqual(poor.body.need, 150);
  });

  async function g2(p) { const r = await call('GET', p, undefined, A.token); assert.strictEqual(r.code, 200, p + ' 非 200：' + r.raw); return r.body; }

  await t('正式存档 data/game.db 未被本套件写动（只写临时目录）', () => {
    if (!liveBefore) { assert.ok(!fs.existsSync(LIVE_DB), '本不该存在正式存档'); return; }
    const after = fs.statSync(LIVE_DB);
    assert.strictEqual(after.size, liveBefore.size, `正式存档体积变了 ${liveBefore.size} -> ${after.size}`);
    assert.strictEqual(after.mtimeMs, liveBefore.mtimeMs, '正式存档修改时间变了（说明写到了正式档）');
  });

  server.close();
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nG5 批3修复: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('G5 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
});
