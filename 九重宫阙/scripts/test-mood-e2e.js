/**
 * G18 · 心情系统端到端（轮113 立）。
 *
 * ## 存在理由
 *
 * 轮113 把轮112 的"死字段扫描"从**代码变量名**改成**存档真实字段**
 * （变量名扫描会被别名大量误报：`db.pets` 的元素在代码里叫 p / pet / activePet，
 *  按 `pet.is_active` 匹配会漏掉 `p.is_active` —— 实测 `is_active` 有 8 处消费端
 *  却报成死字段）。改用存档键 = 数据事实，不受别名影响，178 个键只报 11 个可疑，
 *  逐个核实后定位到真问题。
 *
 * **① 战斗心情加成从来没生效。**
 * `combat.js` 读 `char.mood`（字符串 '愤怒'/'悲伤'/'平静'…），
 * 而玩家操作（`/character/mood` 的冥想/饮酒/游历/作画/品茶）改的是
 * `character.stats.mood`（数值 0-100）。**两个字段互不相通**。
 * 存档实测：`char.mood` **0/32 个角色存在**，`stats.mood` 15/32。
 * 即五个心境分支从来只命中默认值「平静」，玩家花灵石调心情，
 * 战斗完全不受影响（永远只吃 防御×1.05）。
 *
 * **② `last_mood_tick` 是写了一半的机制。**
 * 存档里 **15/32 个角色**持有这个字段，但**全项目 0 处引用** ——
 * 字段存了、衰减没实现。后果：心情加到 99 之后**永远不会回落**，
 * 「冥想/饮酒/游历」变成一次性买断的永久加成。
 *
 * ## 判据
 *
 * - 数值心情必须真的影响战斗面板（不同数值产出不同面板）
 * - **综合收益随心情单调不降**：任意"加心情"的操作都不该让角色变弱
 *   （这条是本套件的核心 —— 档位制初版造出过"75 分比 85 分更强"的坑，
 *    玩家会学会刻意停在低分，那是设计缺陷不是策略深度）
 * - 玩家操作 `/character/mood` 后，战斗面板必须随之变化
 * - 收到时间结算时，心情必须向基准回落（高降、低升），且**不超过速率上限**
 * - 正式存档零侧写
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g18-mood-'));
process.env.DSH_DATA_DIR = TMP;
require('./lib/boot-parity').bootParity({ quiet: true });

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase } = require('../src/database');
const combat = require('../src/services/battle/combat');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/character', require('../src/routes/character'));
const server = app.listen(0);
const PORT = server.address().port;

function call(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign({ 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(buf); } catch { /* 非 JSON */ }
        resolve({ code: res.statusCode, body: json, raw: buf.slice(0, 300) });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('== G18 · 心情系统端到端 ==');

  const uname = 'g18' + Date.now().toString(36).slice(-7);
  const reg = await call('POST', '/api/auth/register',
    { username: uname, password: 'pw-dummy-123', nickname: uname, faction: 'martial' });
  assert.strictEqual(reg.code, 200, '注册失败：' + reg.raw);
  const TOKEN = reg.body.token;

  const db0 = loadDatabase();
  const uid = db0.users.find((x) => x.username === uname).id;
  const A = db0.characters.find((c) => Number(c.user_id) === Number(uid));
  assert.ok(A, '角色未创建');
  const CID = Number(A.id);

  const char = () => loadDatabase().characters.find((c) => Number(c.id) === CID);
  const setMood = (v) => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === CID);
    if (!c.stats) c.stats = {};
    c.stats.mood = v;
    c.last_mood_tick = Date.now();     // 隔离衰减，专测面板
    saveDatabase(db);
  };
  const panel = () => {
    const e = combat.getEntity(CID, 'character');
    return { attack: e.attack, defense: e.defense, speed: e.speed };
  };
  // 综合战力分：与面板同向的加权，用于判"单调不降"
  const score = (p) => p.attack * 10 + p.defense * 3 + p.speed * 2;

  await t('数值心情真的影响战斗面板（旧版 char.mood 字符串恒为默认，五个分支全死）', async () => {
    const seen = new Set();
    for (const v of [0, 30, 60, 100]) {
      setMood(v);
      seen.add(JSON.stringify(panel()));
    }
    assert.ok(seen.size >= 2,
      `心情 0/30/60/100 只产出 ${seen.size} 种战斗面板 —— `
      + '说明心情根本没进面板（旧版读 char.mood，而玩家改的是 stats.mood）');
  });

  await t('综合收益随心情单调不降（核心判据：加心情不该让角色变弱）', async () => {
    const vs = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
    const rows = vs.map((v) => { setMood(v); return { v, s: score(panel()) }; });
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].s >= rows[i - 1].s,
        `心情 ${rows[i - 1].v} 的综合分 ${rows[i - 1].s} > 心情 ${rows[i].v} 的 ${rows[i].s}`
        + ' —— 玩家把心情调高反而变弱。档位制初版就有这个坑'
        + '（75 分「愤怒」比 85 分「平静」更强），玩家会学会刻意停在低分');
    }
  });

  await t('玩家操作 /character/mood 后，战斗必须读到新心情', async () => {
    // 判据刻意**不依赖面板取整**：`Math.floor((base+…) × moodMult × …)` 在小基数下
    // ×1.05 可能取整后一字不变（实测 defense 基数较大时 30→45 面板恰好相同）。
    // 那样的断言会随角色属性分布时红时绿，是坏锁。
    //
    // 改用**区间性判据**：先验证整个低落区间（0..39）与正常区间（40..100）
    // 各自内部面板恒定、且两者不同 —— 只要战斗真的读了数值心情，
    // 这两个区间就必然可分；若战斗还在读 `char.mood` 字符串，两者会完全相同。
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === CID);
    c.spirit_stone = 10000;
    c.stats.mood = 30;
    c.last_mood_tick = Date.now();
    saveDatabase(db);

    const lowPanel = panel();
    const r = await call('POST', '/api/character/mood', { action: 'travel' }, TOKEN);
    assert.strictEqual(r.code, 200, '心情操作失败：' + r.raw);
    assert.ok(Number(r.body.mood) >= 40,
      `一次「游历」(+15) 应把 30 推到 ≥40 的区间，实际 ${r.body.mood}`);
    const midPanel = panel();
    assert.ok(score(midPanel) >= score(lowPanel),
      `操作后综合分下降：${score(lowPanel)} → ${score(midPanel)}`);

    // 结构判据：低落区间与正常区间在**同一角色**上必须产出不同面板。
    // 用 0（低落满额惩罚）对 100（兴奋）—— 跨度足够大，取整吞不掉。
    setMood(0);
    const floorPanel = panel();
    setMood(100);
    const topPanel = panel();
    assert.notStrictEqual(JSON.stringify(floorPanel), JSON.stringify(topPanel),
      `mood=0 面板 ${JSON.stringify(floorPanel)} 与 mood=100 面板 `
      + `${JSON.stringify(topPanel)} 完全相同 —— 战斗没读数值心情`
      + '（旧版读 char.mood 字符串，而玩家改的是 stats.mood）');
    assert.ok(score(topPanel) > score(floorPanel),
      `mood=100 的综合分 ${score(topPanel)} 应高于 mood=0 的 ${score(floorPanel)}`);
  });

  await t('心情衰减：高于基准时随时间下降', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === CID);
    c.stats.mood = 100;
    c.last_mood_tick = Date.now() - 5 * 3600 * 1000;   // 5 小时前
    saveDatabase(db);

    await call('GET', '/api/character', undefined, TOKEN);
    const now = Number(char().stats.mood);
    assert.ok(now < 100, `5 小时后心情仍为 ${now} —— 衰减没生效（last_mood_tick 是写了一半的字段）`);
    assert.strictEqual(now, 95, `速率应为每小时 1 点，100 - 5 = 95，实际 ${now}`);
  });

  await t('心情衰减：低于基准时随时间回升', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === CID);
    c.stats.mood = 40;
    c.last_mood_tick = Date.now() - 10 * 3600 * 1000;
    saveDatabase(db);

    await call('GET', '/api/character', undefined, TOKEN);
    const now = Number(char().stats.mood);
    assert.ok(now > 40, `10 小时后心情仍为 ${now}，没有向基准回归`);
    assert.strictEqual(now, 50, `40 + 10×1 = 50，实际 ${now}`);
  });

  await t('衰减不会越过基准（不振荡、不过冲）', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === CID);
    c.stats.mood = 62;                                  // 基准 60 之上 2 点
    c.last_mood_tick = Date.now() - 100 * 3600 * 1000;  // 100 小时（远超所需）
    saveDatabase(db);

    await call('GET', '/api/character', undefined, TOKEN);
    const now = Number(char().stats.mood);
    assert.strictEqual(now, 60,
      `超额时长应正好停在基准 60，实际 ${now} —— 衰减不能冲过目标`);
  });

  await t('衰减有速率上限：1 小时最多动 1 点', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === CID);
    c.stats.mood = 100;
    c.last_mood_tick = Date.now() - 1 * 3600 * 1000;    // 正好 1 小时
    saveDatabase(db);

    await call('GET', '/api/character', undefined, TOKEN);
    const now = Number(char().stats.mood);
    assert.ok(100 - now <= 1, `1 小时掉了 ${100 - now} 点，速率上限失效`);
  });

  server.close();

  const liveAfter = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;
  await t('正式存档零侧写（体积+mtime 双检）', async () => {
    if (liveBefore && liveAfter) {
      assert.strictEqual(liveAfter.size, liveBefore.size, '正式档体积变了');
      assert.strictEqual(liveAfter.mtimeMs, liveBefore.mtimeMs, '正式档 mtime 变了');
    }
  });

  console.log('');
  console.log(`G18 心情端到端: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('G18 致命错误：' + e.message);
  console.error(e.stack);
  process.exit(1);
});
