/**
 * G1 · 功法获取链端到端（轮46 新增；真 HTTP + DSH_DATA_DIR 临时数据目录）
 *
 * 这条套件断言的是"玩家拿得到"，不是"定义存在"—— 正是 T1-1 硬约束 2 要求的口径：
 *   注册(新号 100 灵石) -> 坊市买黄阶具名功法 -> POST /gongfa/equip -> db.gongfa 真的多出一行
 *   -> 宗门 join/contribute/library/learn 学来第二门 -> 功法书研读得第三门 -> unequip 回到背包
 * 反证同样必须成立：灵石不足买不到、未入宗门学不到、指向不存在功法的功法书必须被拒（不许兜底伪造）、
 * 同一本书不能重复参悟。
 *
 * 全程只写系统临时目录，正式存档 data/game.db 逐字节不得改动（末尾有体积+修改时间双检）。
 * 中途给角色加灵石/等级属测试夹具（模拟挂机所得），每处都写明，避免被误读成"接口能凭空印钱"。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-gongfa-e2e-'));
process.env.DSH_DATA_DIR = TMP;


// 轮108 boot 平价（scripts/lib/boot-parity.js）：空档只跑 materials.ensureAll 是**兜底回填**，
// 它假设 db.items 已有基础数据 —— 实测跑完只有 327 件物品，而正式档 634 件。带着瘦档跑
// 测试会得出不可信的结论（可能假绿）。这里先按台账播种并自检规模。
// 位置要求：必须在任何 require('../src/database') 之前 —— store.js 的 DATA_DIR 在模块加载时固化。
require('./lib/boot-parity').bootParity({ quiet: true });
const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const materials = require('../src/services/materials');
const sectService = require('../src/services/sect');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== G1 · 功法获取链端到端（临时数据目录）==');

  // 空档 + 内容保障工序 = 与 boot 完全相同的一道工序（server.js 里也是这句）
  const db0 = loadDatabase();
  materials.ensureAll(db0);
  try { sectService.ensureSeeded(db0); } catch (e) { console.log('  · sect ensureSeeded 跳过：' + e.message); }
  saveDatabase(db0);

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/shop', require('../src/routes/shop'));
  app.use('/api/gongfa', require('../src/routes/gongfa'));
  app.use('/api/sect', require('../src/routes/sect'));
  app.use('/api/skill', require('../src/routes/skill'));   // 轮47：同一套壳里把技能获取链也走一遍
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;

  const call = (method, p, body, token) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => {
        let j = null;
        try { j = JSON.parse(buf); } catch (e) { /* 保留原文 */ }
        resolve({ code: rs.statusCode, body: j, raw: buf.slice(0, 200) });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  const store = { token: null, userId: null, charId: null };

  await t('新号注册即得 100 灵石（买得起最廉价的具名功法，T1-1 硬约束 2 的量化前提）', async () => {
    const u = 'gfE2e' + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 100); // 轮63：旧写法 21 字符超 schema 上限 20
    const r = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
    assert.ok(r.code === 200 && r.body && (r.body.token || r.body.success), '注册失败：' + r.code + ' ' + r.raw);
    store.token = r.body.token;
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.user_id === db.users.find((x) => x.username === u).id);
    assert.ok(ch, '注册没建角色');
    store.charId = Number(ch.id);
    assert.strictEqual(Number(ch.spirit_stone), 100, '新号起始灵石不再是 100，黄阶定价口径需复核');
  });

  await t('坊市确有 <=100 灵石的具名功法货架（ensureGongfaShelves 落的架）', async () => {
    const r = await call('GET', '/api/shop/items', undefined, store.token);
    const rows = Array.isArray(r.body) ? r.body : (r.body && (r.body.items || r.body.shop)) || [];
    assert.ok(r.code === 200 && rows.length > 0, 'GET /api/shop/items 拿不到货架：' + r.code + ' ' + r.raw);
    const db = loadDatabase();
    const cheap = rows.map((s) => {
      const rowId = Number(s.id != null ? s.id : s.shop_id);
      const it = db.items.find((i) => Number(i.id) === Number(s.item_id));
      return it && it.type === '功法' && Number(s.price) <= 100 ? { shopId: rowId, itemId: Number(it.id), name: it.name, price: Number(s.price), quality: it.quality } : null;
    }).filter(Boolean);
    assert.ok(cheap.length >= 5, `<=100 灵石的具名功法只有 ${cheap.length} 条`);
    store.buy = cheap[0];
  });

  await t('灵石不足买不到（负向：门槛是真门槛，不是摆设）', async () => {
    const db = loadDatabase();
    const rows = db.shop.map((s) => { const it = db.items.find((i) => Number(i.id) === Number(s.item_id)); return it && it.type === '功法' && Number(s.price) > 100 ? s : null; }).filter(Boolean);
    assert.ok(rows.length, '档上竟没有更贵的功法，本反证失效');
    const r = await call('POST', '/api/shop/buy', { itemId: Number(rows[0].id), quantity: 1 }, store.token);
    assert.strictEqual(r.code, 400, '买得起不该买的贵的功法：' + r.raw);
    assert.ok(/灵石不足/.test(r.raw), '拒绝理由不是灵石不足：' + r.raw);
  });

  await t('买功法 -> /gongfa/equip -> db.gongfa 真的出现实例行（本轮核心断言）', async () => {
    const before = (loadDatabase().gongfa || []).length;
    const b = await call('POST', '/api/shop/buy', { itemId: Number(store.buy.shopId), quantity: 1 }, store.token);
    assert.ok(b.code === 200, '购买失败：' + b.code + ' ' + b.raw);
    const e = await call('POST', '/api/gongfa/equip', { itemId: Number(store.buy.itemId), type: 'cultivation' }, store.token);
    assert.ok(e.code === 200 && e.body && e.body.success, '装备失败：' + e.code + ' ' + e.raw);
    const g = await call('GET', '/api/gongfa', undefined, store.token);
    assert.ok(Array.isArray(g.body) && g.body.length === before + 1, `GET /api/gongfa 行数 ${g.body && g.body.length}，应为 ${before + 1}`);
    assert.ok(g.body[0].item && g.body[0].item.name, '实例行没带上功法定义（前端面板会是空的）');
    store.equippedId = Number(g.body[0].id);
  });
  await t('装上修炼功法后，九乘区的功法乘区真的从 1.0 抬起（轮60 直连断言：证明实例行不是躺着好看，会进结算）', () => {
    const svc = require('../src/services/cultivation');
    const model = require('../src/services/cultivation-model');
    const db = loadDatabase();
    const ch = db.characters.find((c) => Number(c.id) === store.charId);
    const detail = svc.getCultivationDetail(ch);
    const withG = Number(detail.parts && detail.parts.gongfa);
    const ctx = svc.buildContext(ch, db);
    const bare = model.expPerSecond(Object.assign({}, ctx, { gongfas: [] }));
    assert.ok(ctx.gongfas.length >= 1, 'ctx 里一个功法都没有，说明 db.gongfa 实例行没被 buildContext 吃到');
    const cs = Number(JSON.parse((db.items.find((i) => Number(i.id) === Number(store.buy.itemId)) || {}).stats || '{}').cultivation_speed);
    assert.ok(Number(ctx.gongfas[0].cultivationSpeed) === cs,
      `ctx 的 cultivationSpeed=${ctx.gongfas[0].cultivationSpeed} 与 items 定义 ${cs} 不一致（cultivation.js 的换算断了）`);
    assert.ok(Number.isFinite(withG) && withG > 1, `功法乘区没抬起（装完仍是 ${withG}）：实例行存在但模型没吃到`);
    assert.ok(Math.abs(Number(bare.parts.gongfa) - 1) < 1e-9, `空手基准不是 1.0 而是 ${bare.parts.gongfa}（本断言的因果对照失效）`);
    if (!detail.capped && !bare.capped) {
      assert.ok(Number(detail.rate) > Number(bare.rate), `总速率未因功法上升：${detail.rate} vs ${bare.rate}`);
    } else {
      console.log(`  · 一侧撞上总闸（capped=${!!detail.capped}/${!!bare.capped}），只比乘区不比总速率`);
    }
  });


  await t('槽位上限真实生效（/gongfa/slots 报 n/max，修炼槽 3 格不可突破）', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => Number(c.id) === store.charId);
    ch.spirit_stone = 999999;             // 夹具：模拟挂机/采集所得，不是接口能力
    saveDatabase(db);
    const rows = db.shop.map((s) => { const it = db.items.find((i) => Number(i.id) === Number(s.item_id)); return it && it.type === '功法' && it.quality === '玄阶' ? s : null; }).filter(Boolean);
    for (let i = 0; i < 2 && rows.length; i++) {   // 已装 1 门，再装 2 门刚好填满 3 格
      const target = db.items.find((x) => Number(x.id) === Number(rows[i].item_id));
      const b = await call('POST', '/api/shop/buy', { itemId: Number(rows[i].id), quantity: 1 }, store.token);
      assert.ok(b.code === 200, '买第 ' + (i + 1) + ' 本失败：' + b.raw);
      const e = await call('POST', '/api/gongfa/equip', { itemId: Number(target.id), type: 'cultivation' }, store.token);
      assert.ok(e.code === 200, '第 ' + (i + 1) + ' 次装备应成功：' + e.raw);
    }
    const s = await call('GET', '/api/gongfa/slots', undefined, store.token);
    assert.ok(s.code === 200 && s.body && s.body.cultivation, 'slots 契约异常：' + s.raw);
    assert.strictEqual(Number(s.body.cultivation.maxSlots), 3, '修炼槽上限不是 3');
    assert.ok(s.body.cultivation.equipped.length >= 3, '修炼槽没填满，本测试没触到上限');
    // 槽位已满，再装第 4 门必须被拒
    const db2 = loadDatabase();
    const anyOther = db2.shop.map((x) => { const it = db2.items.find((i) => Number(i.id) === Number(x.item_id)); return it && it.type === '功法' ? { shopId: Number(x.id), itemId: Number(it.id) } : null; }).filter(Boolean).pop();
    const b2 = await call('POST', '/api/shop/buy', { itemId: anyOther.shopId, quantity: 1 }, store.token);
    assert.ok(b2.code === 200, '买第 4 本失败：' + b2.raw);
    const e2 = await call('POST', '/api/gongfa/equip', { itemId: anyOther.itemId, type: 'cultivation' }, store.token);
    assert.strictEqual(e2.code, 400, '第 4 门修炼功法竟然装上了，槽位上限是假的：' + e2.raw);
    assert.ok(/上限/.test(e2.raw), '拒绝理由不对：' + e2.raw);
  });

  await t('卸下会回到背包（功法不是消耗品，装备/卸下必须可逆）', async () => {
    const db = loadDatabase();
    const before = db.inventory.filter((i) => Number(i.character_id) === store.charId).length;
    const u = await call('POST', '/api/gongfa/unequip', { gongfaId: store.equippedId }, store.token);
    assert.ok(u.code === 200, '卸下失败：' + u.code + ' ' + u.raw);
    const after = loadDatabase().inventory.filter((i) => Number(i.character_id) === store.charId).length;
    assert.strictEqual(after, before + 1, '卸下没把物品退回背包');
  });

  await t('未入宗门学不到宗门功法（负向）', async () => {
    const r = await call('POST', '/api/sect/library/learn', { name: '青锋引灵诀' }, store.token);
    assert.strictEqual(r.code, 400, '未入宗门竟然能学：' + r.raw);
    assert.ok(/未加入宗门/.test(r.raw), '拒绝理由不对：' + r.raw);
  });

  await t('入宗门 -> 捐灵石 -> 功法架有货 -> 学成并装备（宗门路线闭环）', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => Number(c.id) === store.charId);
    ch.level = 20;                        // 夹具：过宗门入门等级门槛（joinReq.minLevel 5）
    saveDatabase(db);
    const j = await call('POST', '/api/sect/join', { sectId: 1 }, store.token);
    assert.ok(j.code === 200 && (!j.body || j.body.ok !== false), '入门失败：' + j.code + ' ' + j.raw);
    const c = await call('POST', '/api/sect/contribute', { amount: 500 }, store.token);
    assert.ok(c.code === 200, '捐献失败：' + c.raw);
    const l = await call('GET', '/api/sect/library', undefined, store.token);
    const entries = (l.body && l.body.entries) || [];
    assert.ok(entries.filter((e) => e.kind === '功法').length >= 4, `宗门功法架只有 ${entries.length} 行，ensureSectBase 又没人调用了`);
    store.learnName = entries.find((e) => e.kind === '功法' && e.quality === '黄阶').name;
    const le = await call('POST', '/api/sect/library/learn', { name: store.learnName }, store.token);
    assert.ok(le.code === 200 && le.body && le.body.ok, '学功法失败：' + le.code + ' ' + le.raw);
    const owned = loadDatabase().inventory.find((i) => Number(i.character_id) === store.charId && loadDatabase().items.find((x) => Number(x.id) === Number(i.item_id) && x.name === store.learnName));
    assert.ok(owned, '学成的功法没进背包');
    const e = await call('POST', '/api/gongfa/equip', { itemId: Number(owned.item_id), type: 'cultivation' }, store.token);
    assert.ok(e.code === 400 || e.code === 200, '装备返回异常：' + e.raw);   // 槽位可能已满，两种都算契约内
  });

  await t('指向不存在功法的功法书必须被拒（不许随机生成糊弄）', async () => {
    const db = loadDatabase();
    // 轮108 修：这条断言原先写的是"随便找一本功法书"，靠**临时档里功法恰好不存在**成立。
    // 但临时档跑 materials.ensureAll 只有 327 件物品（正式档 634），而正式档里
    // id=14 是真实存在的「基础剑诀」—— 于是同一段代码在正式档会"研读成功"。
    // 也就是说这条产品性质（指向虚空的书必须被拒）**从未被真正构造过**，是假绿。
    // 现在显式造一本两个键都指向虚空的功法书，任何档里都成立。
    const bookId = db.items.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0) + 1;
    const GHOST_ID = 987654;
    assert.ok(!db.items.some((i) => Number(i.id) === GHOST_ID), '夹具 id 撞上了真实物品');
    db.items.push({
      id: bookId, name: '残破的无名经卷', type: '功法书', quality: '黄阶',
      stats: JSON.stringify({ gongfa_id: GHOST_ID, gongfa: '并不存在的虚空功法', sell_price: 10 }),
      description: '夹具：id 与名字都指向不存在的功法'
    });
    db.inventory.push({ id: 900000 + bookId, character_id: store.charId, item_id: bookId, quantity: 1 });
    saveDatabase(db);

    const st = await call('POST', '/api/gongfa/study', { itemId: bookId }, store.token);
    assert.strictEqual(st.code, 400, '目标功法不存在竟然研读成功：' + st.raw);
    assert.ok(/不是功法|功法不存在/.test(st.raw), '拒绝理由不对：' + st.raw);
    store.bookId = bookId;
    store.ghostBookName = '残破的无名经卷';
  });

  await t('补齐目标功法后研读成功：消耗一本书、发放对应功法、重复研读被拒', async () => {
    const db = loadDatabase();
    const book = db.items.find((i) => Number(i.id) === store.bookId);
    const st = JSON.parse(book.stats || '{}');
    // 夹具：补一条真的功法物品，名字与书上写的一致（正式档里由 init-db 播下）
    const target = { id: Number(st.gongfa_id), name: st.gongfa, type: '功法', quality: '黄阶', realm: '炼气', stats: '{}', description: '夹具：模拟正式档里播下的目标功法' };
    if (!db.items.some((i) => Number(i.id) === target.id)) db.items.push(target);
    saveDatabase(db);
    const ok = await call('POST', '/api/gongfa/study', { itemId: store.bookId }, store.token);
    assert.ok(ok.code === 200 && ok.body && ok.body.success, '研读失败：' + ok.code + ' ' + ok.raw);
    assert.strictEqual(String(ok.body.learned), String(st.gongfa), '研读出来的功法名不对');
    const again = await call('POST', '/api/gongfa/study', { itemId: store.bookId }, store.token);
    assert.strictEqual(again.code, 400, '重复研读竟然成功：' + again.raw);
    assert.ok(/背包中没有该物品|已修习过该功法/.test(again.raw), '重复研读的拒绝理由异常：' + again.raw);
  });

  await t('GET /api/skill/all 列出全部非隐藏技能（含轮47 新加的飞升期禁式）——技能侧的"看得见"', async () => {
    const r = await call('GET', '/api/skill/all', undefined, store.token);
    const list = (r.body && r.body.skills) || [];
    assert.ok(r.code === 200 && list.length >= 300, `技能列表只有 ${list.length} 条（应为全部非隐藏 ${320 - 19} 条上下）：${r.code} ${r.raw}`);
    assert.ok(!list.some((x) => x.is_hidden), '列表把隐藏技也端出来了，与"隐藏"口径矛盾');
    assert.ok(list.some((x) => String(x.required_realm || '').indexOf('飞升') === 0), '列表里找不到飞升期技能，新加的 106 门没有真的上线');
    const shop = await call('GET', '/api/skill/shop', undefined, store.token);
    const books = (shop.body && shop.body.shop) || [];
    assert.ok(books.length >= 20, `技能书商店只有 ${books.length} 条（source=shop 的池子没接上）`);
    assert.ok(books.some((b) => ['圣阶', '仙阶'].includes(b.quality)), '技能书商店里一本高阶书都没有，高阶内容对坊市玩家不可见');
  });

  await t('炼气号学不了高阶技（境界闸生效，补出来的高阶内容不是点了就有）', async () => {
    const hi = require('../src/services/skill').SKILLS_DATA.find((x) => x.required_realm === '飞升期' && !(x.prerequisites || []).length) ||
      require('../src/services/skill').SKILLS_DATA.find((x) => x.required_realm === '飞升期');
    const r = await call('POST', '/api/skill/learn', { skillId: hi.id }, store.token);
    assert.strictEqual(r.code, 400, `境界不足竟然学到了 ${hi.name}：${r.raw}`);
    assert.ok(/需要境界/.test(r.raw), '拒绝理由不是境界：' + r.raw);
  });

  await t('隐藏技两扇白嫖门都关着（猜 id 学 / 自报条件解锁 都不给）', async () => {
    const hidden = require('../src/services/skill').SKILLS_DATA.find((x) => x.is_hidden && x.quality === '仙阶');
    assert.ok(hidden, '库里没有 仙阶 隐藏技，本反证失效');
    const a = await call('POST', '/api/skill/learn', { skillId: hidden.id }, store.token);
    assert.strictEqual(a.code, 400, `/learn 竟然能学隐藏技 ${hidden.name}：${a.raw}`);
    assert.ok(/机缘/.test(a.raw), 'learn 的拒绝理由异常：' + a.raw);
    const b = await call('POST', '/api/skill/unlock-hidden', { skillId: hidden.id, condition: true }, store.token);
    assert.ok(b.code === 409 || b.code === 400, `/unlock-hidden 在无机缘时竟回了 ${b.code}（无判据/未达成必须是 4xx，不能假装成功）：${b.raw}`);
    assert.ok(!((b.body || {}).success), '响应里出现了 success，前端会当成功处理');
    assert.strictEqual((loadDatabase().player_skills || []).filter((ps) => ps.skill_id === hidden.id).length, 0, '隐藏技还是被写进 player_skills 了');
  });

  await t('学一门低阶技能 -> player_skills 真的多一行且扣灵石（技能侧"拿得到"）', async () => {
    const db = loadDatabase();
    const ch = db.characters.find((c) => Number(c.id) === store.charId);
    const before = (db.player_skills || []).filter((ps) => Number(ps.character_id) === store.charId).length;
    const stone = Number(ch.spirit_stone);
    const def = require('../src/services/skill').SKILLS_DATA.find((x) => x.required_realm === '炼气期' && !(x.prerequisites || []).length && !x.is_hidden);
    const r = await call('POST', '/api/skill/learn', { skillId: def.id }, store.token);
    assert.ok(r.code === 200 && r.body && r.body.success, `学 ${def.name} 失败：${r.code} ${r.raw}`);
    const after = loadDatabase().player_skills.filter((ps) => Number(ps.character_id) === store.charId).length;
    assert.strictEqual(after, before + 1, 'player_skills 没多出行（战斗侧唯一真源接不上）');
    assert.strictEqual(Number(loadDatabase().characters.find((c) => Number(c.id) === store.charId).spirit_stone), stone - Number(def.learn_cost || 0), '灵石扣得不等于 learn_cost');
    const again = await call('POST', '/api/skill/learn', { skillId: def.id }, store.token);
    assert.strictEqual(again.code, 400, '同一门技能竟然能学两次：' + again.raw);
  });

  await t('正式存档 data/game.db 未被本套件写动（只写临时目录）', () => {
    if (!liveBefore) { assert.ok(!fs.existsSync(LIVE_DB), '本不该存在正式存档'); return; }
    const after = fs.statSync(LIVE_DB);
    assert.strictEqual(after.size, liveBefore.size, `正式存档体积变了 ${liveBefore.size} -> ${after.size}`);
    assert.strictEqual(after.mtimeMs, liveBefore.mtimeMs, '正式存档修改时间变了（说明写到了正式档）');
  });

  server.close();
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nG1 功法与技能获取链: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  // 轮63：exitCode 不强退 ⇒ 异常路径上未关的 server 句柄会吊住事件循环（门禁假死过一次）
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('G1 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  // 轮63：exitCode 不强退 ⇒ 异常路径上未关的 server 句柄会吊住事件循环（门禁假死过一次）
  setTimeout(() => process.exit(process.exitCode), 300).unref();
});
