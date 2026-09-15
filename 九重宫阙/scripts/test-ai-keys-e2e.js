/**
 * G6 · AI 密钥池/降级/复用/审核/生成点（轮81 由孤儿 test-phase8-integration.js 改造）
 *
 * 旧孤儿套是全库唯一覆盖 /api/ai/admin/* 的测试——但它要求"预先起服 + 打正式档"
 * （BASE=3224、cleanup 直删 data/game.db），与门禁隔离纪律相悖，早已 FATAL 出局。
 * 现在：临时 DSH_DATA_DIR + 进程内挂载 + fetch 保留（Node 24 原生）。
 * 密钥测速指向 127.0.0.1:9（discard 端口，connect 即 refused，无外网依赖）。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g6-ai-'));
process.env.DSH_DATA_DIR = TMP;
delete process.env.AI_ADMIN_TOKEN; // 生产封禁逻辑在 NODE_ENV=test 下不触发；清 env 防本机干扰

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== G6 · AI 密钥池与生成管线（临时数据目录）==');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/character', require('../src/routes/character'));
  app.use('/api/ai', require('../src/routes/ai'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const api = async (method, p, body, token, headers = {}) => {
    const res = await fetch(BASE + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body === undefined || body === null ? undefined : JSON.stringify(body)
    });
    let json; const text = await res.text();
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
  const H = { 'X-Admin-Token': 'dev-admin' };

  const u = 'g6' + Date.now().toString(36).slice(-6);
  const reg = await api('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
  assert.ok(reg.status === 200 && reg.json.token, '注册失败：' + reg.status);
  const TOKEN = reg.json.token;
  // 熟练度注入（器方推演门槛 crafting≥8）——临时目录内直接改，等价旧 inject 档
  {
    const db = loadDatabase();
    const ch = db.characters.find((c) => c.user_id === reg.json.userId);
    ch.proficiency = { crafting: { level: 8, exp: 0 }, alchemy: { level: 2, exp: 0 }, talisman: { level: 0, exp: 0 }, formation: { level: 0, exp: 0 }, gathering: { level: 0, exp: 0 } };
    ch.spirit_stone = 100000;
    ch.last_epiphany_at = 0;
    saveDatabase(db);
  }

  let keyId = null, genId = null;

  await t('管理员鉴权（轮91 合流三面）：裸 401 / 错头 403 / 平权 JWT 403', async () => {
    const bare = await fetch(BASE + '/api/ai/admin/keys');
    assert.strictEqual(bare.status, 401, '裸请求应被 JWT 闸以未登录拒：' + bare.status);
    const wrong = await fetch(BASE + '/api/ai/admin/keys', { headers: { 'X-Admin-Token': 'wrong' } });
    assert.strictEqual(wrong.status, 403, '错头仍须 403（头通道语义不变）：' + wrong.status);
    const r = await api('GET', '/api/ai/admin/keys', null, TOKEN); // 平权用户 JWT 走新回落闸
    assert.strictEqual(r.status, 403, '平权 JWT 竟然读到密钥池：' + r.status);
  });

  await t('轮91 合流正门：is_admin JWT 直读密钥池与审核池（FE 后台通道）', async () => {
    const uu = 'aiadmin' + Date.now().toString(36).slice(-6);
    let r = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: uu, password: 'pw-dummy-123', nickname: '甲执事', faction: 'martial' }) });
    const j = await r.json();
    const db = loadDatabase();
    db.users.find((x) => x.id === j.userId).is_admin = 1;
    saveDatabase(db);
    const kh = { Authorization: 'Bearer ' + j.token };
    r = await fetch(BASE + '/api/ai/admin/keys', { headers: kh });
    assert.strictEqual(r.status, 200, 'is_admin JWT 进不了 AI 后台：' + r.status);
    const kb = await r.json();
    assert.ok(Array.isArray(kb.keys) && kb.keys.every((k) => {
      const s = JSON.stringify(k);
      return !s.includes('sk-test-abcdef') && (k.api_key === undefined || String(k.api_key).includes('*'));
    }), 'JWT 通道泄漏 api_key 明文/脱敏漂移');
    r = await fetch(BASE + '/api/ai/admin/generations', { headers: kh });
    assert.strictEqual(r.status, 200, '审核池同理要通：' + r.status);
  });

  await t('添加密钥 + 列表脱敏（api_key 明文不得出接口）', async () => {
    const r = await api('POST', '/api/ai/admin/keys', { name: '测试池', provider: 'openai', base_url: 'http://127.0.0.1:9', api_key: 'sk-test-abcdef', model: 'test-model' }, TOKEN, H);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    keyId = r.json.id;
    const list = await api('GET', '/api/ai/admin/keys', null, TOKEN, H);
    const k = list.json.keys.find((x) => x.id === keyId);
    assert.ok(k && String(k.api_key).includes('***'), '密钥未脱敏：' + JSON.stringify(k));
  });

  await t('测速失败计数（不可达端点 → fail_count=1 持久化）', async () => {
    const r = await api('POST', `/api/ai/admin/keys/${keyId}/test`, {}, TOKEN, H);
    assert.strictEqual(r.json.ok, false, '不可达端点竟测速成功');
    assert.ok(Number(r.json.fail_count) >= 1, 'fail_count 未累计：' + JSON.stringify(r.json));
  });

  await t('生成：LLM 不可达 → 本地词库降级、自动 approved、程序化数值齐', async () => {
    const r = await api('POST', '/api/ai/generate', { purpose: 'recipe_forge', params: { element: 'fire', quality: '玄阶' } }, TOKEN);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.source, 'local');
    assert.strictEqual(r.json.status, 'approved');
    assert.ok(r.json.content.name && Number(r.json.content.stats.attack) > 0, '缺程序化数值：' + JSON.stringify(r.json.content));
    genId = r.json.generationId;
  });

  await t('复用：同参数二次生成直接命中（不重复烧 LLM）', async () => {
    const r = await api('POST', '/api/ai/generate', { purpose: 'recipe_forge', params: { element: 'fire', quality: '玄阶' } }, TOKEN);
    assert.strictEqual(r.json.reused, true);
    assert.strictEqual(r.json.generationId, genId);
  });

  await t('审核池：forcePending → 管理员 review approved → 第三次复用', async () => {
    const nonce = 'g6_' + Date.now();
    const r1 = await api('POST', '/api/ai/generate', { purpose: 'lore', params: { event: nonce }, forcePending: true }, TOKEN);
    assert.strictEqual(r1.json.status, 'pending', JSON.stringify(r1.json));
    const ok = await api('POST', `/api/ai/admin/generations/${r1.json.generationId}/review`, { action: 'approved', note: '文风合格' }, TOKEN, H);
    assert.strictEqual(ok.status, 200, '审核落锤失败：' + JSON.stringify(ok.json));
    const r2 = await api('POST', '/api/ai/generate', { purpose: 'lore', params: { event: nonce } }, TOKEN);
    assert.strictEqual(r2.json.reused, true, 'approve 后未复用');
  });

  await t('生成点1：器方推演——8 级门槛通过、灵石 500 真扣、approved 直接入库', async () => {
    const before = (await api('GET', '/api/character', null, TOKEN)).json.spirit_stone;
    const r = await api('POST', '/api/ai/recipes/forge', { element: 'metal' }, TOKEN);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.cost, 500, '计费口径漂移：' + JSON.stringify(r.json));
    assert.strictEqual(r.json.learned, true, 'approved 应直接入库');
    const after = (await api('GET', '/api/character', null, TOKEN)).json.spirit_stone;
    assert.strictEqual(Number(before) - Number(after), 500, '灵石扣费不真（before-after=' + (before - after) + '）');
  });

  await t('生成点2：顿悟（冷却闸存在：成功后二试必 400）', async () => {
    const r1 = await api('POST', '/api/ai/epiphany', {}, TOKEN);
    assert.ok([200, 400].includes(r1.status), '顿悟端点异常：' + r1.status);
    if (r1.status === 200 && r1.json.success !== false) {
      const r2 = await api('POST', '/api/ai/epiphany', {}, TOKEN);
      assert.strictEqual(r2.status, 400, '成功后没有冷却闸=可连点刷功法：' + JSON.stringify(r2.json));
    }
  });

  await t('purposes 目录可读（六类全列，供前端管理页渲染）', async () => {
    const r = await api('GET', '/api/ai/purposes', null, TOKEN, H);
    assert.strictEqual(r.status, 200, 'purposes 读端失败：' + r.status);
    const list = Array.isArray(r.json) ? r.json : (r.json.purposes || []);
    for (const p of ['recipe_forge', 'recipe_alchemy', 'guild_content', 'lore', 'skill_invent', 'sect_found']) {
      assert.ok(list.includes(p), `purpose 目录缺 ${p}：` + JSON.stringify(list));
    }
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
  console.log(`\nG6 AI密钥池: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('G6 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
});
