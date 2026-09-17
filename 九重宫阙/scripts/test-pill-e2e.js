/**
 * G17 · 丹药系统端到端（轮112 立）。
 *
 * ## 存在理由
 *
 * 轮112 用一个**机器扫描**（"被写入但从未被读取的 character 字段"）批量找同类死接线，
 * 一次抓出 8 个死字段，全在 `src/routes/systems.js` 的 `/pills/use`。深查发现两个
 * 真缺陷，且都是**玩家能花钱买到的东西没效果**：
 *
 * **① 属性加成 100% 不生效。**
 * 旧代码把 `attack_bonus/defense_bonus/speed_bonus/exp_bonus` 写进
 * `character.temp_attack_bonus` 等字段，但 `combat.js` 的面板乘数链读的是
 * `buffService.getBuffMultiplier(charId, 'attack')`，真源是 `db.character_buffs` ——
 * 全项目**没有任何地方读** `character.temp_*_bonus`。
 * 影响面：物品表里 **6 条真丹药**带这些字段，其中 **4 条正在商店售卖**
 *（培元丹 50、聚灵丹 80、铁壁丹 80、疾风丹 80）—— 花钱买、吃了没效果。
 *
 * **② 3 个「名字以丹结尾但 type=消耗品」的物品用不了。**
 * 培元丹(id32)、回灵丹(id30，在售 10)、疗伤丹(id31，在售 10) 的 `type` 是「消耗品」，
 * 而 `/pills/use` 与 `/pills/my` 硬编码 `type === '丹药'`。
 * 故障链：商店能买 → 不进「我的丹药」列表 → 没有"使用"入口 → 直接调接口 400「无效的丹药」。
 * 前端 `app.js` 早就用 `name.includes('丹')` 认了这类物品，是后端不认。
 *
 * ## 判据（全部走真实消费端 + 真实贸易链）
 *
 * - 每条带属性加成的丹药：buff 必须落在 `character_buffs` 且**倍率精确**
 * - 用后面板必须**严格上升**；撤掉 buff 后必须**精确回落**到基线
 *   （面板是 `Math.floor((...) × 乘数)`，小基数下比值会是取整伪影，故用
 *    "严格单调 + 精确回落"而非比值相等 —— 后者会假红）
 * - `type=消耗品` 的丹必须能使用、必须在 `/pills/my` 与图鉴里出现
 * - **在售丹药必须能用**（把商店与使用打通，这是本缺陷对玩家的实际形态）
 * - 正式存档零侧写
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g17-pill-'));
process.env.DSH_DATA_DIR = TMP;
require('./lib/boot-parity').bootParity({ quiet: true });

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, getNextId } = require('../src/database');
const combat = require('../src/services/battle/combat');
const buffService = require('../src/services/buff');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/systems', require('../src/routes/systems'));
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
  console.log('== G17 · 丹药系统端到端 ==');

  const uname = 'g17' + Date.now().toString(36).slice(-7);
  const reg = await call('POST', '/api/auth/register',
    { username: uname, password: 'pw-dummy-123', nickname: uname, faction: 'martial' });
  assert.strictEqual(reg.code, 200, '注册失败：' + reg.raw);
  const TOKEN = reg.body.token;

  const db0 = loadDatabase();
  const uid = db0.users.find((x) => x.username === uname).id;
  const A = db0.characters.find((c) => Number(c.user_id) === Number(uid));
  assert.ok(A, '角色未创建');
  const CID = Number(A.id);

  const give = (name, qty) => {
    const db = loadDatabase();
    const it = (db.items || []).find((i) => i.name === name);
    assert.ok(it, `前提：物品「${name}」必须存在`);
    db.inventory.push({ id: getNextId('inventory'), character_id: CID, item_id: it.id, quantity: qty || 1 });
    saveDatabase(db);
    return it;
  };
  const buffOf = (stat) => (loadDatabase().character_buffs || [])
    .find((b) => Number(b.character_id) === CID && b.type === stat && b.expires_at > Date.now());

  /** 找出所有"带战斗属性加成"的丹药（按数据驱动，不硬编码名单） */
  const boosters = () => (loadDatabase().items || []).filter((it) => {
    const isPill = it.type === '丹药' || (it.type === '消耗品' && /丹$/.test(String(it.name || '')));
    if (!isPill) return false;
    let s = {}; try { s = JSON.parse(it.stats || '{}'); } catch { /* 忽略 */ }
    return s.attack_bonus || s.defense_bonus || s.speed_bonus;
  });

  await t('数据前提：确实存在带属性加成的丹药（否则本套件没意义）', async () => {
    const list = boosters();
    assert.ok(list.length >= 5,
      `带 attack/defense/speed_bonus 的丹药应 ≥5，实际 ${list.length} —— 若为 0 说明数据变了，本套件需重审`);
  });

  await t('每个带属性加成的丹药：buff 落到 character_buffs 且倍率精确', async () => {
    let checked = 0;
    for (const it of boosters()) {
      const s = JSON.parse(it.stats || '{}');
      const want = [
        ['attack', s.attack_bonus], ['defense', s.defense_bonus], ['speed', s.speed_bonus]
      ].filter(([, v]) => v != null);
      for (const [stat] of want) buffService.removeBuff(CID, stat);

      give(it.name, 1);
      const r = await call('POST', '/api/systems/pills/use', { itemId: it.id }, TOKEN);
      assert.strictEqual(r.code, 200, `使用「${it.name}」失败：${r.raw}`);

      for (const [stat, val] of want) {
        const b = buffOf(stat);
        assert.ok(b, `「${it.name}」用后 character_buffs 里没有 ${stat} buff —— `
          + '战斗读的就是这张表，写 character.temp_*_bonus 是死字段');
        assert.ok(Math.abs(Number(b.value) - Number(val)) < 1e-9,
          `「${it.name}」的 ${stat} buff 倍率应为 ${val}，实际 ${b.value}`);
      }
      for (const [stat] of want) buffService.removeBuff(CID, stat);
      checked++;
    }
    assert.ok(checked >= 5, '应至少验到 5 条，实际 ' + checked);
  });

  await t('每条丹药：用后面板严格上升，撤 buff 后精确回落到基线', async () => {
    for (const it of boosters()) {
      const s = JSON.parse(it.stats || '{}');
      const statsList = [
        ['attack', s.attack_bonus], ['defense', s.defense_bonus], ['speed', s.speed_bonus]
      ].filter(([, v]) => v != null).map(([k]) => k);

      for (const stat of statsList) buffService.removeBuff(CID, stat);
      const base = {};
      for (const stat of statsList) base[stat] = combat.getEntity(CID, 'character')[stat];

      give(it.name, 1);
      const r = await call('POST', '/api/systems/pills/use', { itemId: it.id }, TOKEN);
      assert.strictEqual(r.code, 200, `使用「${it.name}」失败：${r.raw}`);

      for (const stat of statsList) {
        const after = combat.getEntity(CID, 'character')[stat];
        assert.ok(after > base[stat],
          `「${it.name}」的 ${stat} 没进战斗面板：${base[stat]} → ${after}`
          + '（旧版只写 character.temp_*_bonus，战斗读的是 db.character_buffs）');
      }
      for (const stat of statsList) buffService.removeBuff(CID, stat);
      for (const stat of statsList) {
        const reverted = combat.getEntity(CID, 'character')[stat];
        assert.strictEqual(reverted, base[stat],
          `撤掉「${it.name}」的 ${stat} buff 后面板没精确回落：${base[stat]} → ${reverted}`);
      }
    }
  });

  await t('type=消耗品 的「丹」必须能使用（旧版一律 400 无效的丹药）', async () => {
    const db = loadDatabase();
    const consumablePills = (db.items || []).filter(
      (i) => i.type === '消耗品' && /丹$/.test(String(i.name || ''))
    );
    assert.ok(consumablePills.length >= 3,
      `应至少 3 个"type=消耗品但名字以丹结尾"的物品，实际 ${consumablePills.length}`);

    for (const it of consumablePills) {
      const dbc = loadDatabase();
      dbc.characters.find((c) => Number(c.id) === CID).hp = 10;
      dbc.characters.find((c) => Number(c.id) === CID).mp = 10;
      saveDatabase(dbc);
      give(it.name, 1);
      const r = await call('POST', '/api/systems/pills/use', { itemId: it.id }, TOKEN);
      assert.strictEqual(r.code, 200,
        `「${it.name}」(type=${it.type}) 无法使用：${r.raw} —— `
        + '玩家能在商店买到它，却在药品页看不到也用不了');
    }
  });

  await t('这些「丹」必须出现在 /pills/my 与丹药图鉴里', async () => {
    const db = loadDatabase();
    for (const n of ['回灵丹', '疗伤丹', '培元丹']) {
      const it = (db.items || []).find((i) => i.name === n);
      if (!it) continue;
      // 确保背包里有货
      db.inventory.push({ id: getNextId('inventory'), character_id: CID, item_id: it.id, quantity: 2 });
    }
    saveDatabase(db);

    const my = await call('GET', '/api/systems/pills/my', undefined, TOKEN);
    assert.strictEqual(my.code, 200, '取我的丹药失败：' + my.raw);
    const myNames = (my.body || []).map((p) => p.name);
    for (const n of ['回灵丹', '疗伤丹', '培元丹']) {
      if (!(loadDatabase().items || []).some((i) => i.name === n)) continue;
      assert.ok(myNames.includes(n),
        `「${n}」没出现在 /pills/my（前端"我的丹药"列表用它渲染）。`
        + '当前列表：' + JSON.stringify(myNames));
    }

    const cat = await call('GET', '/api/systems/pills', undefined, TOKEN);
    assert.strictEqual(cat.code, 200, '取图鉴失败：' + cat.raw);
    const catNames = (cat.body || []).map((p) => p.name);
    for (const n of ['回灵丹', '疗伤丹', '培元丹']) {
      if (!(loadDatabase().items || []).some((i) => i.name === n)) continue;
      assert.ok(catNames.includes(n), `「${n}」没出现在丹药图鉴里`);
    }
  });

  await t('在售丹药必须真能用（打通"商店买 → 药品页用"这条链）', async () => {
    const db = loadDatabase();
    const isPill = (it) => it && (it.type === '丹药' || (it.type === '消耗品' && /丹$/.test(String(it.name || ''))));
    const onSale = (db.shop || [])
      .map((s) => (db.items || []).find((i) => Number(i.id) === Number(s.item_id)))
      .filter(isPill);
    assert.ok(onSale.length >= 3, `商店在售丹药应 ≥3，实际 ${onSale.length}`);

    let usable = 0;
    for (const it of onSale) {
      const dbc = loadDatabase();
      dbc.characters.find((c) => Number(c.id) === CID).hp = 10;
      dbc.characters.find((c) => Number(c.id) === CID).mp = 10;
      // 前面几条断言会把货用光 —— 这里按"玩家刚从商店买下"建模：
      // 先移除该 item 的旧行，再给一行干净的，确保库存状态确定。
      dbc.inventory = (dbc.inventory || []).filter(
        (i) => !(Number(i.character_id) === CID && Number(i.item_id) === Number(it.id))
      );
      dbc.inventory.push({ id: getNextId('inventory'), character_id: CID, item_id: it.id, quantity: 1 });
      saveDatabase(dbc);

      const r = await call('POST', '/api/systems/pills/use', { itemId: it.id }, TOKEN);
      assert.strictEqual(r.code, 200,
        `在售丹药「${it.name}」无法使用：${r.raw} —— 这是"花钱买到没用的东西"`);
      usable++;
    }
    assert.ok(usable >= 3, '实际可用的在售丹药 ' + usable);
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
  console.log(`G17 丹药端到端: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('G17 致命错误：' + e.message);
  console.error(e.stack);
  process.exit(1);
});
