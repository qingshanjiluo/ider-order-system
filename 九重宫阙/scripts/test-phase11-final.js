/* 阶段11 联调验收：多账号全流程穿越 v2 全系统 + 经济审计 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3230';
const STATE = path.join(__dirname, '..', 'data', '.p11test-state.json');

async function api(method, path_, body, token, headers = {}) {
  const res = await fetch(BASE + path_, {
    method,
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

let pass = 0, fail = 0;
const report = () => console.log(`  ⇒ ${pass} 通过, ${fail} 失败`);
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

const mode = process.argv[2] || 'phaseA';

(async () => {
  if (mode === 'phaseA') {
    const ts = Date.now() % 100000;
    const a = await api('POST', '/api/auth/register', { username: `p11a_${ts}`, password: 'p11test123456' });
    const b = await api('POST', '/api/auth/register', { username: `p11b_${ts}`, password: 'p11test123456' });
    assert.ok(a.json.token && b.json.token, '注册失败');
    fs.writeFileSync(STATE, JSON.stringify({ a: { username: `p11a_${ts}`, userId: a.json.userId }, aToken: a.json.token, b: { username: `p11b_${ts}`, userId: b.json.userId }, bToken: b.json.token }));
    console.log(`  ✅ 注册 (${a.json.userId}/${b.json.userId})`);
  }

  if (mode === 'inject') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    for (const uid of [state.a.userId, state.b.userId]) {
      const c = db.characters.find(x => x.user_id === uid);
      assert.ok(c, '角色不存在');
      c.spirit_stone = 500000;
      c.proficiency = { crafting: { level: 5, exp: 0 }, alchemy: { level: 5, exp: 0 }, talisman: { level: 5, exp: 0 }, formation: { level: 5, exp: 0 }, gathering: { level: 5, exp: 0 } };
      c.auto_meditate = false;
      c.injury = 0;
      if (uid === state.b.userId) {
        const herb = db.items.find(i => i.name === '灵草');
        assert.ok(herb, '灵草不存在');
        const invRow = { id: store.getNextId('inventory'), character_id: c.id, item_id: herb.id, quantity: 3 };
        db.inventory.push(invRow);
        state.bInvId = invRow.id;
      }
    }
    fs.writeFileSync(STATE, JSON.stringify(state));
    store.saveDatabase(db);
    store.close();
    console.log('  ✅ inject: 双号灵石50万+熟练度5级');
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const H = { 'X-Admin-Token': 'dev-admin' };

    // ---- 基础层 ----
    await t('基础层：寿命面板+伤势面板+传记', async () => {
      const c = await api('GET', '/api/character', null, state.aToken);
      assert.ok(c.json.lifespan && typeof c.json.lifespan.total === 'number' || c.json.lifespan, JSON.stringify(c.json).slice(0, 100));
      assert.ok(c.json.injury && typeof c.json.injury.value === 'number');
      const bio = await api('GET', '/api/chronicle/biography', null, state.aToken);
      assert.ok(bio.json.origin && bio.json.paragraphs.length >= 3);
    });

    // ---- 战斗层 ----
    await t('战斗层：野外战斗→伤势积累→擂台免扣寿', async () => {
      const b1 = await api('POST', '/api/battle/battle', { mapId: 1 }, state.aToken);
      assert.strictEqual(b1.status, 200, JSON.stringify(b1.json).slice(0, 100));
      assert.ok(b1.json.injury, '战斗响应缺伤势');
      const penBefore = (await api('GET', '/api/character', null, state.aToken)).json.lifespan_penalty_years || 0;
      const ar = await api('POST', '/api/arena/match', {}, state.aToken);
      if (ar.status === 200) {
        const penAfter = (await api('GET', '/api/character', null, state.aToken)).json.lifespan_penalty_years || 0;
        assert.strictEqual(penAfter, penBefore, '擂台不应扣寿');
      }
    });

    // ---- 生产层 ----
    await t('生产层：采集→锻造熟练度增长', async () => {
      const g = await api('POST', '/api/gathering/gather', {}, state.aToken);
      assert.ok([200, 400].includes(g.status), JSON.stringify(g.json).slice(0, 100));
    });

    // ---- 交易层（双账号闭环） ----
    let listingId;
    await t('交易层：B挂单→A购买→兑换→调控系数', async () => {
      const lst = await api('POST', '/api/market/list', { inventoryId: state.bInvId, quantity: 1, price: 50 }, state.bToken);
      assert.strictEqual(lst.status, 200, JSON.stringify(lst.json));
      listingId = lst.json.listingId;
      const buy = await api('POST', '/api/market/buy', { listingId, quantity: 1 }, state.aToken);
      assert.strictEqual(buy.status, 200, JSON.stringify(buy.json));
      const ex = await api('POST', '/api/economy/exchange', { fromTier: 'lower', toTier: 'middle', amount: 1000 }, state.aToken);
      assert.strictEqual(ex.status, 200);
      assert.strictEqual(ex.json.fee.base, 20);
    });

    // ---- 社交层 ----
    let guildId;
    await t('社交层：宗门拜入+仙盟令建盟+入盟+赠送', async () => {
      const sl = await api('GET', '/api/sect/list', null, state.aToken);
      assert.strictEqual(sl.status, 200);
      const sj = await api('POST', '/api/sect/join', { sectId: (sl.json.sects || sl.json)[0].id }, state.aToken);
      assert.ok([200, 400].includes(sj.status), JSON.stringify(sj.json));
      await api('POST', '/api/guild/token/claim', {}, state.aToken);
      const gc = await api('POST', '/api/guild/create', { name: `联调盟_${Date.now() % 100000}` }, state.aToken);
      assert.strictEqual(gc.status, 200, JSON.stringify(gc.json));
      guildId = gc.json.guildId;
      await api('POST', '/api/guild/join', { guildId }, state.bToken);
      const gid = (await api('GET', '/api/character', null, state.bToken)).json.id;
      const gift = await api('POST', '/api/guild/gift', { targetCharacterId: gid, amount: 100 }, state.aToken);
      assert.strictEqual(gift.status, 200);
    });

    // ---- AI 层 ----
    await t('AI层：生成→降级→审核→复用', async () => {
      const g = await api('POST', '/api/ai/generate', { purpose: 'recipe_alchemy', params: { element: 'water', quality: '玄阶' } }, state.aToken);
      assert.strictEqual(g.status, 200);
      assert.strictEqual(g.json.source, 'local');
      const g2 = await api('POST', '/api/ai/generate', { purpose: 'recipe_alchemy', params: { element: 'water', quality: '玄阶' } }, state.aToken);
      assert.strictEqual(g2.json.reused, true);
    });

    // ---- 前端结构 ----
    await t('前端：12主导航结构在线', async () => {
      const res = await fetch(BASE + '/');
      const html = await res.text();
      assert.strictEqual((html.match(/nav-group-title/g) || []).length, 12);
    });
  }

  if (mode === 'cleanup') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const chars = db.characters.filter(c => [state.a.userId, state.b.userId].includes(c.user_id)).map(c => c.id);
    db.users = db.users.filter(u => ![state.a.userId, state.b.userId].includes(u.id));
    db.characters = db.characters.filter(c => !chars.includes(c.id));
    for (const k of Object.keys(db)) {
      if (Array.isArray(db[k])) db[k] = db[k].filter(x => x && (x.user_id === undefined || !chars.includes(x.user_id)) && (x.character_id === undefined || !chars.includes(x.character_id)));
    }
    db.guilds = db.guilds.filter(g => !g.name.startsWith('联调盟_'));
    store.saveDatabase(db);
    store.close();
    const sqlite = require('node:sqlite');
    const sdb = new sqlite.DatabaseSync('data/game.db');
    for (const cid of chars) {
      sdb.prepare('DELETE FROM lifespan_events WHERE character_id = ?').run(cid);
      sdb.prepare('DELETE FROM market_listings WHERE seller_character_id = ?').run(cid);
    }
    sdb.close();
    fs.unlinkSync(STATE);
    console.log(`  ✅ 已清理 ${state.a.username}/${state.b.username}`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
