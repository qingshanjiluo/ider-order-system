/* 阶段2 集成验收（两相）：
 *   node scripts/test-phase2-integration.js phaseA   # 服务器运行中：注册/寿命/战斗
 *   node scripts/test-phase2-integration.js inject   # 服务器停止：注入高龄
 *   node scripts/test-phase2-integration.js phaseB   # 服务器运行中：坐化转世断言
 *   node scripts/test-phase2-integration.js cleanup  # 服务器停止：清理测试数据
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3209';
const STATE = path.join(__dirname, '..', 'data', '.p2test-state.json');

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
    const username = `p2int_${Date.now() % 100000}`;
    const reg = await api('POST', '/api/auth/register', { username, password: 'p2test123456' });
    const token = reg.json.token;
    const userId = reg.json.userId;
    assert.ok(token, `注册失败: ${JSON.stringify(reg.json)}`);
    fs.writeFileSync(STATE, JSON.stringify({ username, password: 'p2test123456', userId }));

    console.log('== 注册 v2 初始化 ==');
    let char;
    await t('角色带三层属性/灵根/寿命/伤势字段', async () => {
      const r = await api('GET', '/api/character', null, token);
      assert.strictEqual(r.status, 200);
      char = r.json;
      assert.ok(char.stats && char.stats.constitution >= 5, 'stats 缺失');
      assert.ok(Array.isArray(char.spirit_roots) && char.spirit_roots.length >= 1, '灵根缺失');
      assert.ok(char.age_years >= 16 && char.age_years < 16.01, `age=${char.age_years}（注册与查询间实时衰老属正常）`);
      assert.strictEqual(char.injury, 0);
      assert.strictEqual(char.reincarnation_count, 0);
    });
    await t('寿命面板：炼气基础 200 年', async () => {
      assert.strictEqual(char.lifespan.ascended, false);
      assert.strictEqual(char.lifespan.lifespan, 200);
      assert.ok(char.lifespan.remaining <= 184);
    });
    await t('编年史 birth 事件落库', async () => {
      const store = require('../src/db/store');
      const events = store.queryRel('lifespan_events', { character_id: char.id });
      assert.ok(events.some(e => e.type === 'birth'), 'birth 事件缺失');
    });

    console.log('== 修炼与升级寿命 ==');
    await t('修炼获得经验', async () => {
      const r = await api('POST', '/api/cultivation/cultivate', { duration: 60 }, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 200));
      assert.ok(r.json.expGained >= 60, `expGained=${r.json.expGained}`);
    });
    await t('升级 +1% 境界寿元/级', async () => {
      const r = await api('GET', '/api/character', null, token);
      const lv = r.json.level;
      assert.ok(lv > 1, `level=${lv} 未升级`);
      const expectedBonus = (lv - 1) * 2; // 炼气200×1%=2年/级
      assert.ok(Math.abs(r.json.lifespan_bonus_years - expectedBonus) < 0.01,
        `bonus=${r.json.lifespan_bonus_years} 期望≈${expectedBonus}`);
    });

    console.log('== 战斗元素路径（中文怪物元素 → 规范7系）==');
    await t('地图战斗全链路不抛错', async () => {
      const r = await api('POST', '/api/battle/battle', {}, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
      assert.ok(r.json.battle || r.json.log || r.json.rounds || r.json.result || r.json.victory !== undefined, '缺少战斗结果');
    });
  }

  if (mode === 'inject') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const c = db.characters.find(x => x.user_id === state.userId);
    assert.ok(c, '角色不存在');
    c.age_years = 5000; // 炼气 cap 200 → 寿元已尽
    store.saveDatabase(db);
    store.close();
    console.log(`  ✅ 已注入 age=5000（character ${c.id}）`);
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const login = await api('POST', '/api/auth/login', { username: state.username, password: state.password });
    const token = login.json.token;
    assert.ok(token, '登录失败');
    await t('寿元耗尽 → 加载即自动坐化转世', async () => {
      const r = await api('GET', '/api/character', null, token);
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.reincarnated, '缺少 reincarnated 标记');
      assert.strictEqual(r.json.realm, '炼气');
      assert.strictEqual(r.json.level, 1);
      assert.strictEqual(r.json.age_years, 16);
      assert.strictEqual(r.json.reincarnation_count, 1);
    });
    await t('转世后再加载：状态干净（不再触发转世）', async () => {
      const r = await api('GET', '/api/character', null, token);
      assert.strictEqual(r.json.reincarnated, null);
      assert.strictEqual(r.json.lifespan.lifespan, 200);
    });
    await t('转世编年史 pass_away + reincarnate 落库', async () => {
      const store = require('../src/db/store');
      const r = await api('GET', '/api/character', null, token);
      const events = store.queryRel('lifespan_events', { character_id: r.json.id });
      assert.ok(events.some(e => e.type === 'pass_away'), 'pass_away 缺失');
      assert.ok(events.some(e => e.type === 'reincarnate'), 'reincarnate 缺失');
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
      if (Array.isArray(db[k])) {
        db[k] = db[k].filter(x => x && x.user_id !== state.userId && !chars.includes(x.character_id));
      }
    }
    store.saveDatabase(db);
    store.close();
    const sqlite = require('node:sqlite');
    const sdb = new sqlite.DatabaseSync('data/game.db');
    sdb.prepare(`DELETE FROM lifespan_events WHERE character_id IN (${chars.join(',') || '0'})`).run();
    sdb.close();
    fs.unlinkSync(STATE);
    console.log(`  ✅ 已清理测试账号 ${state.username}（character ${chars.join(',')}）`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
