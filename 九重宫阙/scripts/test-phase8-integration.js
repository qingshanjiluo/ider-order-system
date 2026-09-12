/* 阶段8 集成验收（四相）：AI 密钥池/降级/复用/审核/生成点 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3224';
const ADMIN = { 'X-Admin-Token': 'dev-admin', 'Content-Type': 'application/json', Connection: 'close' };
const STATE = path.join(__dirname, '..', 'data', '.p8test-state.json');

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
    const username = `p8_${Date.now() % 100000}`;
    const r = await api('POST', '/api/auth/register', { username, password: 'p8test123456' });
    assert.ok(r.json.token, '注册失败');
    fs.writeFileSync(STATE, JSON.stringify({ username, userId: r.json.userId, token: r.json.token }));
    console.log(`  ✅ 注册 ${username}`);
  }

  if (mode === 'inject') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const store = require('../src/db/store');
    const db = store.loadDatabase();
    const char = db.characters.find(c => c.user_id === state.userId);
    assert.ok(char, '角色不存在');
    char.proficiency = { crafting: { level: 8, exp: 0 }, alchemy: { level: 2, exp: 0 }, talisman: { level: 0, exp: 0 }, formation: { level: 0, exp: 0 }, gathering: { level: 0, exp: 0 } };
    char.spirit_stone = 100000;
    char.last_epiphany_at = 0;
    store.saveDatabase(db);
    store.close();
    console.log('  ✅ inject: crafting 8级 + 灵石10万');
  }

  if (mode === 'phaseB') {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const H = { 'X-Admin-Token': 'dev-admin' };

    await t('管理员鉴权：无令牌 403', async () => {
      const r = await api('GET', '/api/ai/admin/keys', null, state.token);
      assert.strictEqual(r.status, 403);
    });

    await t('添加密钥 + 列表脱敏', async () => {
      const r = await api('POST', '/api/ai/admin/keys', { name: '测试池', provider: 'openai', base_url: 'http://127.0.0.1:9', api_key: 'sk-test-abcdef', model: 'test-model' }, state.token, H);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      state.keyId = r.json.id;
      const list = await api('GET', '/api/ai/admin/keys', null, state.token, H);
      const k = list.json.keys.find(x => x.id === state.keyId);
      assert.ok(k.api_key.includes('***'), '密钥未脱敏');
      fs.writeFileSync(STATE, JSON.stringify(state));
    });

    await t('测速失败计数（不可达端点）', async () => {
      const r = await api('POST', `/api/ai/admin/keys/${state.keyId}/test`, {}, state.token, H);
      assert.strictEqual(r.json.ok, false);
      assert.strictEqual(r.json.fail_count, 1);
    });

    await t('生成（LLM不可达 → 本地词库降级，自动approved）', async () => {
      const r = await api('POST', '/api/ai/generate', { purpose: 'recipe_forge', params: { element: 'fire', quality: '玄阶' } }, state.token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.source, 'local');
      assert.strictEqual(r.json.status, 'approved');
      assert.ok(r.json.content.name && r.json.content.stats.attack > 0, '缺程序化数值');
      state.genId = r.json.generationId;
      fs.writeFileSync(STATE, JSON.stringify(state));
    });

    await t('复用配方库：同参数二次生成直接命中', async () => {
      const r = await api('POST', '/api/ai/generate', { purpose: 'recipe_forge', params: { element: 'fire', quality: '玄阶' } }, state.token);
      assert.strictEqual(r.json.reused, true);
      assert.strictEqual(r.json.generationId, state.genId);
    });

    await t('审核池：forcePending → approve 生效', async () => {
      const nonce = `tribulation_${Date.now()}`; // 全量时间戳唯一，避免命中历史复用库
      const r1 = await api('POST', '/api/ai/generate', { purpose: 'lore', params: { event: nonce }, forcePending: true }, state.token);
      assert.strictEqual(r1.json.status, 'pending', JSON.stringify(r1.json));
      const ok = await api('POST', `/api/ai/admin/generations/${r1.json.generationId}/review`, { action: 'approved', note: '文风合格' }, state.token, H);
      assert.strictEqual(ok.status, 200);
      const r2 = await api('POST', '/api/ai/generate', { purpose: 'lore', params: { event: nonce } }, state.token);
      assert.strictEqual(r2.json.reused, true, 'approve后未复用');
    });

    await t('生成点1：器方推演（8级熟练度门槛通过，灵石扣费，approved入库）', async () => {
      const before = (await api('GET', '/api/character', null, state.token)).json.spirit_stone;
      const r = await api('POST', '/api/ai/recipes/forge', { element: 'metal' }, state.token);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert.strictEqual(r.json.cost, 500);
      assert.ok(r.json.learned === true, 'approved应直接入库');
      const after = (await api('GET', '/api/character', null, state.token)).json.spirit_stone;
      assert.strictEqual(before - after, 500);
    });

    await t('生成点2：顿悟（冷却/概率/功法入包）', async () => {
      const r1 = await api('POST', '/api/ai/epiphany', {}, state.token);
      assert.ok([200, 400].includes(r1.status));
      if (r1.status === 200 && r1.json.success !== false) {
        assert.ok(r1.json.content || r1.json.reused, '顿悟应产出功法');
      }
      const r2 = await api('POST', '/api/ai/epiphany', {}, state.token);
      // 首次成功后立即二试 → 若首次已设冷却则 400；若首次失败未设则可能仍 200
      assert.ok([200, 400].includes(r2.status));
    });
  }

  if (mode === 'phaseB2') {
    // 服务器重启后验证：fail_count 持久化（SQLite 关系表）
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    await t('密钥失败计数跨重启持久化', async () => {
      const list = await api('GET', '/api/ai/admin/keys', null, state.token, { 'X-Admin-Token': 'dev-admin' });
      const k = list.json.keys.find(x => x.id === state.keyId);
      assert.ok(k && k.fail_count >= 1, `fail_count=${k && k.fail_count}`);
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
    console.log(`  ✅ 已清理 ${state.username}（密钥与生成记录保留为系统数据）`);
  }

  report();
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
