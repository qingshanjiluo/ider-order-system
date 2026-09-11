/* 阶段4 集成验收（四相）：宗门列表/入宗门槛/杂役/贡献/建筑/兑换 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3215';
const STATE = path.join(__dirname, '..', 'data', '.p4test-state.json');

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
    const username = `p4int_${Date.now() % 100000}`;
    const reg = await api('POST', '/api/auth/register', { username, password: 'p4test123456' });
    assert.ok(reg.json.token, `注册失败: ${JSON.stringify(reg.json)}`);
    fs.writeFileSync(STATE, JSON.stringify({ username, password: 'p4test123456', userId: reg.json.userId }));
    console.log(`  ✅ 注册 ${username} (userId=${reg.json.userId})`);
  }

  if (mode === 'inject') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const char = db.characters.find(c => c.user_id === state.userId);
    assert.ok(char, '角色不存在');
    char.level = 6;
    char.spirit_stone = 10000;
    store.saveDatabase(db);
    store.close();
    console.log(`  ✅ 已注入 level=6 spirit_stone=${char.spirit_stone}`);
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const login = await api('POST', '/api/auth/login', { username: state.username, password: state.password });
    const token = login.json.token;
    assert.ok(token, '登录失败');

    await t('宗门列表 18 家 NPC 宗门', async () => {
      const r = await api('GET', '/api/sect/list', null, token);
      assert.strictEqual(r.json.sects.length, 18, `实际 ${r.json.sects.length}`);
      const wx = r.json.sects.find(s => s.key === 'wuxing');
      assert.strictEqual(wx.joinReq.minRoots, 3);
    });
    await t('入宗门槛：等级不足被拒', async () => {
      const r = await api('POST', '/api/sect/join', { sectId: 'tongxuan' }, token); // 需15级
      assert.strictEqual(r.status, 400);
      assert.ok(r.json.error.includes('等级不足'));
    });
    await t('入宗成功（万界商城，扣入宗费）', async () => {
      const r = await api('POST', '/api/sect/join', { sectId: 'wanjie' }, token); // fee 500
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.feePaid, 500);
      const c = await api('GET', '/api/character', null, token);
      assert.strictEqual(c.json.spirit_stone, 9500);
    });
    await t('重复入宗被拒', async () => {
      const r = await api('POST', '/api/sect/join', { sectId: 'feiyu' }, token);
      assert.strictEqual(r.status, 400);
    });
    await t('杂役堂：获得贡献值', async () => {
      const r = await api('POST', '/api/sect/chores/daily', {}, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.ok(r.json.contributionGain >= 4 && r.json.contributionGain <= 12, `gain=${r.json.contributionGain}`);
    });
    await t('杂役堂：当日重复被拒', async () => {
      const r = await api('POST', '/api/sect/chores/daily', {}, token);
      assert.strictEqual(r.status, 400);
    });
    await t('捐献灵石换贡献', async () => {
      const r = await api('POST', '/api/sect/contribute', { amount: 5000 }, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.ok(r.json.contribution >= 5004);
    });
    await t('捐修建筑：杂役堂升级（动态基准，全宗共享，满级则验证上限拒绝）', async () => {
      const my = await api('GET', '/api/sect/my', null, token);
      const before = my.json.buildings.find(b => b.key === 'chore').level;
      const r = await api('POST', '/api/sect/buildings/upgrade', { buildingKey: 'chore' }, token);
      if (before >= 5) {
        assert.strictEqual(r.status, 400);
        assert.ok(r.json.error.includes('最高等级'));
      } else {
        assert.strictEqual(r.status, 200, JSON.stringify(r.json));
        assert.strictEqual(r.json.level, before + 1);
      }
    });
    await t('藏宝阁兑换：贡献扣减 + 物品入库', async () => {
      const r = await api('POST', '/api/sect/exchange', { itemName: '回灵丹' }, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.item, '回灵丹');
    });
    await t('宗门增益生效（/my benefits）', async () => {
      const r = await api('GET', '/api/sect/my', null, token);
      assert.strictEqual(r.json.inSect, true);
      assert.ok(r.json.benefits.choreBonus > 0, '杂役堂加成应>0');
      assert.ok(typeof r.json.benefits.cultivateSpeedBonus === 'number');
    });
    await t('退出宗门：贡献清零记录', async () => {
      const r = await api('POST', '/api/sect/leave', {}, token);
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.lostContribution > 0);
      const my = await api('GET', '/api/sect/my', null, token);
      assert.strictEqual(my.json.inSect, false);
    });
  }

  if (mode === 'cleanup') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const chars = db.characters.filter(c => c.user_id === state.userId).map(c => c.id);
    db.users = db.users.filter(u => u.id !== state.userId);
    db.characters = db.characters.filter(c => c.user_id !== state.userId);
    for (const k of Object.keys(db)) {
      if (Array.isArray(db[k])) db[k] = db[k].filter(x => x && x.user_id !== state.userId && !chars.includes(x.character_id));
    }
    store.saveDatabase(db);
    store.close();
    const sqlite = require('node:sqlite');
    const sdb = new sqlite.DatabaseSync('data/game.db');
    for (const cid of chars) {
      sdb.prepare('DELETE FROM sect_members WHERE character_id = ?').run(cid);
    }
    sdb.close();
    fs.unlinkSync(STATE);
    console.log(`  ✅ 已清理 ${state.username}`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
