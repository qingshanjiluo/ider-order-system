/* 阶段3 集成验收（四相）：
 *   node scripts/test-phase3-integration.js phaseA    # 服务器运行中：注册
 *   node scripts/test-phase3-integration.js inject    # 服务器停止：注入材料
 *   node scripts/test-phase3-integration.js phaseB    # 服务器运行中：锻造/图纸/采集/熟练度
 *   node scripts/test-phase3-integration.js cleanup   # 服务器停止：清理
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3212';
const STATE = path.join(__dirname, '..', 'data', '.p3test-state.json');

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
    const username = `p3int_${Date.now() % 100000}`;
    const reg = await api('POST', '/api/auth/register', { username, password: 'p3test123456' });
    assert.ok(reg.json.token, `注册失败: ${JSON.stringify(reg.json)}`);
    fs.writeFileSync(STATE, JSON.stringify({ username, password: 'p3test123456', userId: reg.json.userId }));
    console.log(`  ✅ 注册 ${username} (userId=${reg.json.userId})`);
  }

  if (mode === 'inject') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const char = db.characters.find(c => c.user_id === state.userId);
    assert.ok(char, '角色不存在');
    const byName = (n) => (db.items || []).find(i => i.name === n);
    const give = (name, qty) => {
      const item = byName(name);
      assert.ok(item, `物品不存在: ${name}`);
      db.inventory.push({ id: store.getNextId('inventory'), character_id: char.id, item_id: item.id, quantity: qty });
      return item;
    };
    const main = give('碎石', 15);        // 凡品主材（锻造 + 图纸1材料）
    give('木材', 12);                      // 辅材（图纸1材料）
    give('灵草', 10);
    state.mainItemId = main.id;
    fs.writeFileSync(STATE, JSON.stringify(state));
    store.saveDatabase(db);
    store.close();
    console.log(`  ✅ 已注入材料（主材 item_id=${main.id}）`);
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const login = await api('POST', '/api/auth/login', { username: state.username, password: state.password });
    const token = login.json.token;
    assert.ok(token, '登录失败');

    await t('POST /forge 元素锻造主入口（修复验证）', async () => {
      let crafted = false;
      for (let i = 0; i < 12 && !crafted; i++) {
        const r = await api('POST', '/api/forge/forge', { mainMaterialId: state.mainItemId, auxMaterialIds: [], catalystIds: [], flameType: 'basic' }, token);
        assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 200));
        if (r.json.success) crafted = true;
      }
      assert.ok(crafted, '12次锻造均失败（概率异常）');
    });
    await t('锻造产出熟练度（crafting 类别）', async () => {
      const r = await api('GET', '/api/character/proficiency', null, token);
      const c = r.json.proficiency.crafting;
      assert.ok(c.exp > 0 || c.level > 0, `crafting exp=${c.exp} level=${c.level}`);
    });
    await t('采集接入熟练度', async () => {
      const r = await api('POST', '/api/gathering/gather', { mapId: 1 }, token);
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.proficiency, '响应缺少 proficiency');
    });
    await t('图纸学习（消耗材料 → learned）', async () => {
      const r = await api('POST', '/api/forge/blueprints/learn', { blueprintId: 1 }, token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.learned, '凡铁剑图纸');
    });
    await t('图纸列表 learned 标记', async () => {
      const r = await api('GET', '/api/forge/blueprints', null, token);
      const bp = r.json.blueprints.find(b => b.id === 1);
      assert.ok(bp && bp.learned === true);
    });
    await t('熟练度总览端点：五类别齐全', async () => {
      const r = await api('GET', '/api/character/proficiency', null, token);
      const keys = Object.keys(r.json.proficiency);
      for (const k of ['crafting', 'alchemy', 'talisman', 'formation', 'gathering']) {
        assert.ok(keys.includes(k), `缺 ${k}`);
      }
      assert.deepStrictEqual(r.json.ladder.length, 10);
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
    // 清理锻造产出的全局 items（forged_by）
    db.items = (db.items || []).filter(i => !i.forged_by || !chars.includes(i.forged_character_id));
    store.saveDatabase(db);
    store.close();
    fs.unlinkSync(STATE);
    console.log(`  ✅ 已清理 ${state.username}`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
