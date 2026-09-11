/* 阶段7 集成验收（五相）：仙盟令门槛/队列串行/参与建设/赠送灵石 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const STATE = path.join(__dirname, '..', 'data', '.p7test-state.json');

async function api(method, path_, body, token) {
  const res = await fetch(BASE + path_, {
    method,
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
    const a = await api('POST', '/api/auth/register', { username: `p7a_${ts}`, password: 'p7test123456' });
    const b = await api('POST', '/api/auth/register', { username: `p7b_${ts}`, password: 'p7test123456' });
    assert.ok(a.json.token && b.json.token, '注册失败');
    fs.writeFileSync(STATE, JSON.stringify({ a: { username: `p7a_${ts}`, userId: a.json.userId }, aToken: a.json.token, b: { username: `p7b_${ts}`, userId: b.json.userId }, bToken: b.json.token }));
    console.log(`  ✅ 注册 (${a.json.userId}/${b.json.userId})`);
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));

    await t('无仙盟令时创建被拒（门槛生效）', async () => {
      const r = await api('POST', '/api/guild/create', { name: `测试盟_${Date.now() % 100000}` }, state.aToken);
      assert.strictEqual(r.status, 400);
      assert.ok(r.json.error.includes('仙盟令'), r.json.error);
    });

    await t('邀请奖励领取初级仙盟令；重复领取拒绝', async () => {
      const r = await api('POST', '/api/guild/token/claim', {}, state.aToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      const r2 = await api('POST', '/api/guild/token/claim', {}, state.aToken);
      assert.strictEqual(r2.status, 400);
    });

    await t('持令创建仙盟成功（灵石零消耗）', async () => {
      const before = (await api('GET', '/api/character', null, state.aToken)).json.spirit_stone;
      const r = await api('POST', '/api/guild/create', { name: `测试盟_${Date.now() % 100000}` }, state.aToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      state.guildId = r.json.guildId;
      const after = (await api('GET', '/api/character', null, state.aToken)).json.spirit_stone;
      assert.strictEqual(after, before, '灵石被扣了！');
      fs.writeFileSync(STATE, JSON.stringify(state));
    });

    await t('B 加入仙盟', async () => {
      const r = await api('POST', '/api/guild/join', { guildId: state.guildId }, state.bToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    });
  }

  if (mode === 'phaseB2') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));

    await t('第二建筑升级被拒（队列串行）', async () => {
      const r1 = await api('POST', '/api/guild/buildings/upgrade', { buildingId: 'hall' }, state.aToken);
      assert.strictEqual(r1.status, 200, JSON.stringify(r1.json));
      const r2 = await api('POST', '/api/guild/buildings/upgrade', { buildingId: 'library' }, state.aToken);
      assert.strictEqual(r2.status, 400);
      assert.ok(r2.json.error.includes('串行'), JSON.stringify(r2.json));
    });

    await t('参与建设：人数加速 + 贡献', async () => {
      const r1 = await api('POST', '/api/guild/buildings/participate', { buildingId: 'hall' }, state.aToken);
      assert.strictEqual(r1.status, 200, JSON.stringify(r1.json));
      const r2 = await api('POST', '/api/guild/buildings/participate', { buildingId: 'hall' }, state.bToken);
      assert.strictEqual(r2.status, 200);
      assert.ok(r2.json.participants === 2 && r2.json.speedup < 1, JSON.stringify(r2.json));
    });

    await t('机会成本：建设期间修炼/战斗被拒', async () => {
      const c = await api('POST', '/api/cultivation/cultivate', { duration: 10 }, state.aToken);
      assert.strictEqual(c.status, 400);
      assert.ok(c.json.error.includes('建设'), c.json.error);
      const bt = await api('POST', '/api/battle/battle', { mapId: 1 }, state.aToken);
      assert.strictEqual(bt.status, 400);
      assert.ok(bt.json.error.includes('建设'), bt.json.error);
    });

    await t('赠送灵石：同盟成员到账', async () => {
      const before = (await api('GET', '/api/character', null, state.bToken)).json.spirit_stone || 0;
      const r = await api('POST', '/api/guild/gift', { targetCharacterId: state.b.userId, amount: 100 }, state.aToken);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      const after = (await api('GET', '/api/character', null, state.bToken)).json.spirit_stone || 0;
      assert.strictEqual(after - before, 100);
    });

    await t('自赠无效', async () => {
      const c = (await api('GET', '/api/character', null, state.aToken)).json;
      const r = await api('POST', '/api/guild/gift', { targetCharacterId: c.id, amount: 50 }, state.aToken);
      assert.strictEqual(r.status, 400);
    });
  }

  if (mode === 'inject') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const guild = db.guilds.find(g => g.id === state.guildId);
    assert.ok(guild, '仙盟不存在');
    guild.funds = (guild.funds || 0) + 10000;
    store.saveDatabase(db);
    store.close();
    console.log('  ✅ inject: 仙盟资金 +10000');
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
    db.guilds = db.guilds.filter(g => !g.name.startsWith('测试盟_'));
    store.saveDatabase(db);
    store.close();
    fs.unlinkSync(STATE);
    console.log(`  ✅ 已清理 ${state.a.username}/${state.b.username}`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
