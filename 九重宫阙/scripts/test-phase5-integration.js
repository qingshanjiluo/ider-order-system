/* 阶段5 集成验收（四相）：战斗伤势接线/调息闸门/擂台免扣寿/槽位下发 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3217';
const STATE = path.join(__dirname, '..', 'data', '.p5test-state.json');

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
    const username = `p5int_${Date.now() % 100000}`;
    const reg = await api('POST', '/api/auth/register', { username, password: 'p5test123456' });
    assert.ok(reg.json.token, `注册失败: ${JSON.stringify(reg.json)}`);
    fs.writeFileSync(STATE, JSON.stringify({ username, password: 'p5test123456', userId: reg.json.userId }));
    console.log(`  ✅ 注册 ${username}`);
  }

  if (mode === 'inject1') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const char = db.characters.find(c => c.user_id === state.userId);
    assert.ok(char, '角色不存在');
    char.injury = 85; // 触发自动调息闸门（默认阈值80）
    char.auto_meditate = true;
    char.level = 1;
    store.saveDatabase(db);
    store.close();
    console.log('  ✅ inject1: injury=85 auto_meditate=true');
  }

  if (mode === 'inject2') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const char = db.characters.find(c => c.user_id === state.userId);
    assert.ok(char, '角色不存在');
    char.injury = 0;
    char.auto_meditate = false;
    char.level = 1;
    store.saveDatabase(db);
    store.close();
    console.log('  ✅ inject2: injury=0 auto_meditate=false');
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const login = await api('POST', '/api/auth/login', { username: state.username, password: state.password });
    const token = login.json.token;
    assert.ok(token, '登录失败');

    await t('自动调息闸门：伤势≥阈值拒绝战斗', async () => {
      const r = await api('POST', '/api/battle/battle', { mapId: 1 }, token);
      assert.strictEqual(r.status, 400, JSON.stringify(r.json).slice(0, 120));
      assert.ok(r.json.error.includes('调息'));
    });
  }

  if (mode === 'phaseB2') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const login = await api('POST', '/api/auth/login', { username: state.username, password: state.password });
    const token = login.json.token;
    assert.ok(token, '登录失败');

    await t('战斗后伤势积累', async () => {
      const r = await api('POST', '/api/battle/battle', { mapId: 2 }, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 150));
      assert.ok(r.json.injury, '响应缺 injury');
      assert.ok(r.json.injury.value > 0, `injury=${JSON.stringify(r.json.injury)}`);
    });

    await t('PVE 战败 → 重伤扣寿（defeat 2%）', async () => {
      const lifespanBefore = 0;
      // 地图战斗直到战败（等级1 vs map6）
      let lostYears = 0, heavySeen = null;
      for (let i = 0; i < 12 && lostYears === 0; i++) {
        const r = await api('POST', '/api/battle/battle', { mapId: 6 }, token);
        if (r.status !== 200) break;
        if (r.json.heavyInjury) { heavySeen = r.json.heavyInjury; lostYears = r.json.heavyInjury.lostYears; }
      }
      assert.ok(heavySeen, '未见重伤事件');
      assert.ok(lostYears > 0, `lostYears=${lostYears}`);
      const store2 = require('../src/db/store');
      const db2 = store2.loadDatabase();
      const char2 = db2.characters.find(c => c.user_id === state.userId);
      assert.ok((char2.lifespan_penalty_years || 0) > lifespanBefore, '寿命惩罚未持久化');
      store2.close();
    });

    await t('擂台规则：伤势积累、免扣寿', async () => {
      // 动态基线：角色此前 PVE 战败已有永久寿元惩罚
      const store0 = require('../src/db/store');
      const db0 = store0.loadDatabase();
      const char0 = db0.characters.find(c => c.user_id === state.userId);
      const penaltyBefore = char0.lifespan_penalty_years || 0;
      store0.close();
      const r = await api('POST', '/api/arena/match', {}, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 150));
      assert.ok(r.json.injury, '擂台响应缺 injury');
      assert.strictEqual(r.json.heavyInjury, undefined, '擂台不应有重伤扣寿');
      const store2 = require('../src/db/store');
      const db2 = store2.loadDatabase();
      const char2 = db2.characters.find(c => c.user_id === state.userId);
      assert.strictEqual(char2.lifespan_penalty_years || 0, penaltyBefore, '擂台扣寿了！');
      store2.close();
    });

    await t('技能列表下发 slotLimits 与 cdPenalty', async () => {
      const r = await api('GET', '/api/skill/list', null, token);
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.json.slotLimits, { main: 3, sub: 3, ultimate: 1 });
      assert.ok(r.json.cdPenalty >= 1);
      assert.ok(r.json.maxSlots >= 3);
    });

    await t('角色面板返回伤势面板 + 恢复 tick 字段', async () => {
      const r = await api('GET', '/api/character', null, token);
      assert.ok(r.json.injury && typeof r.json.injury.value === 'number');
      assert.ok('autoMeditating' in r.json.injury);
      assert.ok('recovered' in r.json.injury);
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
    for (const cid of chars) sdb.prepare('DELETE FROM lifespan_events WHERE character_id = ?').run(cid);
    sdb.close();
    fs.unlinkSync(STATE);
    console.log(`  ✅ 已清理 ${state.username}`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
