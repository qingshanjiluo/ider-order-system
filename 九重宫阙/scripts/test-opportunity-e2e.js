/**
 * G11 · 机缘链行为套件（轮98）
 * r67 骨架 + r69 副本解读之后的首轮行为证明：
 *   单元面——濒死口径/副本键映射/发放幂等/未知键拒；
 *   HTTP 面——无记录 409、客户端自报仍无效（r47 洞恒关）、有记录且闸门足则真解锁。
 * tmp 数据目录 + 进程内 express（不整 boot，机缘链不依赖商店目录）。
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');

process.env.DSH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g11-'));
const { loadDatabase, saveDatabase } = require('../src/database');
const opp = require('../src/services/opportunity');

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const live0 = fs.existsSync(LIVE_DB) ? { size: fs.statSync(LIVE_DB).size, mtime: fs.statSync(LIVE_DB).mtimeMs } : null;

const results = [];
async function t(name, fn) {
  try { await fn(); results.push('  ✅ ' + name); }
  catch (e) { results.push('  ❌ ' + name + ': ' + e.message); }
}

const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/skill', require('../src/routes/skill'));
const srv = http.createServer(app);
const PORT = 3297;

function call(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const headers = {};
    if (data) headers['content-type'] = 'application/json';
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) {} resolve({ code: rs.statusCode, body: j }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  await t('濒死口径逐字：≤1% 取胜记，>1% 不记，败局不记，垃圾输入不记', () => {
    assert.strictEqual(opp.opportunityFromBattle({ winner: 'attacker', attackerMaxHp: 1000, attackerFinalHp: 5 }), opp.KEYS.NEAR_DEATH_VICTORY);
    assert.strictEqual(opp.opportunityFromBattle({ winner: 'attacker', attackerMaxHp: 1000, attackerFinalHp: 60 }), null);
    assert.strictEqual(opp.opportunityFromBattle({ winner: 'defender', attackerMaxHp: 1000, attackerFinalHp: 1 }), null);
    assert.strictEqual(opp.opportunityFromBattle({ winner: 'attacker', attackerMaxHp: 0, attackerFinalHp: 0 }), null);
    assert.strictEqual(opp.opportunityFromBattle(null), null);
  });

  await t('副本键映射认名不认 id（跨环境稳定，r69 裁决）', () => {
    assert.strictEqual(opp.opportunityFromDungeonClear({ name: '剑冢深处' }), opp.KEYS.SWORD_TOMB_ENLIGHTENMENT);
    assert.strictEqual(opp.opportunityFromDungeonClear({ name: '剑冢深处', id: 999 }), opp.KEYS.SWORD_TOMB_ENLIGHTENMENT);
    assert.strictEqual(opp.opportunityFromDungeonClear({ name: '新手木桩' }), null);
    assert.strictEqual(opp.opportunityFromDungeonClear({ id: 28 }), null);
  });

  await t('发放幂等：同键累加不重复建行，未知键拒收', () => {
    const c = { opportunities: [] };
    assert.strictEqual(opp.record(c, opp.KEYS.TRIBULATION_SURVIVED).recorded, true);
    assert.strictEqual(opp.record(c, opp.KEYS.TRIBULATION_SURVIVED).repeated, true);
    assert.strictEqual(c.opportunities.length, 1);
    assert.strictEqual(c.opportunities[0].count, 2);
    assert.strictEqual(opp.record(c, 'free_lunch').recorded, false);
  });

  let TK, CID;
  await t('注册可用（tmp 进程内栈）', async () => {
    await new Promise((r) => srv.listen(PORT, r));
    const u = 'g11' + Date.now().toString(36).slice(-6);
    const rr = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
    assert.strictEqual(rr.code, 200, JSON.stringify(rr.body));
    TK = rr.body.token;
    const db = loadDatabase();
    CID = db.characters.find((c) => c.user_id === rr.body.userId).id;
  });

  await t('无机缘记录：unlock-hidden 409 且告知缺哪条（不假装成功）', async () => {
    const r = await call('POST', '/api/skill/unlock-hidden', { skillId: 'forbidden_seal' }, TK);
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.required_opportunity, opp.KEYS.NEAR_DEATH_VICTORY);
  });

  await t('自报字段旁路恒关：condition/opportunity 随便塞，仍 409（r47 洞复验）', async () => {
    const r = await call('POST', '/api/skill/unlock-hidden', { skillId: 'forbidden_seal', condition: true, opportunity: 'near_death_victory' }, TK);
    assert.strictEqual(r.code, 409, '客户端自报竟可解锁：' + JSON.stringify(r.body));
  });

  await t('无判据的隐藏技：如实挂账 409（required_opportunity=null）', async () => {
    const r = await call('POST', '/api/skill/unlock-hidden', { skillId: 'phoenix_wrath' }, TK);
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.required_opportunity, null);
  });

  await t('有记录+闸门足：真解锁写库（前置暗影诀可学，轮98 死锁链已修）', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => x.id === CID);
    c.opportunities = [{ key: opp.KEYS.NEAR_DEATH_VICTORY, count: 1, at: new Date().toISOString() }];
    c.realm = '大乘'; c.level = 100; c.spirit_stone = 5000000;
    saveDatabase(db);
    const pre = await call('POST', '/api/skill/learn', { skillId: 'shadow_strike' }, TK);
    assert.strictEqual(pre.code, 200, '前置暗影诀都学不了：' + JSON.stringify(pre.body));
    const r = await call('POST', '/api/skill/unlock-hidden', { skillId: 'forbidden_seal' }, TK);
    assert.strictEqual(r.code, 200, '达标仍解不开：' + JSON.stringify(r.body));
    assert.strictEqual(r.body.unlocked, true);
    const db2 = loadDatabase();
    assert.ok((db2.player_skills || []).some((p) => p.character_id === CID && p.skill_id === 'forbidden_seal'), '解锁未写库');
  });

  await t('正式存档 data/game.db 未被本套件写动', () => {
    if (live0) {
      const now = fs.statSync(LIVE_DB);
      assert.strictEqual(now.size, live0.size, 'game.db 大小变了');
      assert.ok(Math.abs(now.mtime - live0.mtime) < 1, 'game.db 被摸过 mtime');
    }
  });

  srv.close();
  for (let i = 0; i < 10; i++) { try { fs.rmSync(process.env.DSH_DATA_DIR, { recursive: true, force: true }); break; } catch (e) { await new Promise((r) => setTimeout(r, 400)); } }
  const fails = results.filter((r) => r.startsWith('  ❌')).length;
  console.log(results.join('\n'));
  console.log(`\nG11 机缘链: ${results.length - fails} 通过, ${fails} 失败`);
  process.exit(fails ? 1 : 0);
})();
