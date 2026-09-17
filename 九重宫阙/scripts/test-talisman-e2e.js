/**
 * G15 · 符箓系统端到端（轮111 立）。
 *
 * ## 存在理由
 *
 * 轮111 机器审计发现：符箓系统 `col_talismans` **0 行**（从未被使用），
 * 而深查发现两个**方向相反的真缺陷**，且都没有任何门禁覆盖：
 *
 * **① 成本端：做任何符都只吃"背包里第一件材料"。**
 * 旧代码 `const materials = inventory.filter(i => 物品.type === '材料'); materials[0].quantity -= 1;`
 * —— 不看配方要什么。实证：把「九转还魂草」（宝品）排背包最前，做**凡品**「治愈符」
 * 就吃掉了它；把「灵草」排前面就吃灵草。5 条配方的材料需求**完全相同**。
 *
 * **② 效果端：符箓效果 100% 不生效。**
 * 旧代码写 `character.temp_attack_bonus = 1.3`，但战斗面板读的是
 * `buffService.getBuffMultiplier(charId,'attack')`（真源 db.character_buffs），
 * 全项目**没有任何地方读 character.temp_attack_bonus**。玩家花材料做出的符用了等于没用。
 * 传送符更直接：只回一句文案，不改任何状态。
 *
 * ## 判据（全部走真实消费端，不看源码文本）
 *
 * - 成本端：扣的**必须是配方点名的材料**；背包里排更前面的贵重材料**不得被动**
 * - 拒绝路径：材料不足 / 灵石不足 → 400 且**零副作用**（不扣灵石、不扣材料、不产符）
 * - 效果端：用符后 `combat.getEntity().attack`（战斗真面板）**必须真的变**
 * - 治愈符：瞬时回血按 max_hp 比例
 *
 * 只写临时数据目录；正式存档体积+mtime 双检。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g15-talisman-'));
process.env.DSH_DATA_DIR = TMP;

// boot 平价：必须在任何 require('../src/database') 之前（store.js 的 DATA_DIR 模块加载时固化）
require('./lib/boot-parity').bootParity({ quiet: true });

const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, getNextId } = require('../src/database');
const combat = require('../src/services/battle/combat');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/talismans', require('../src/routes/talismans'));
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
  console.log('== G15 · 符箓系统端到端 ==');

  const uname = 'g15' + Date.now().toString(36).slice(-7);
  const reg = await call('POST', '/api/auth/register',
    { username: uname, password: 'pw-dummy-123', nickname: uname, faction: 'martial' });
  assert.strictEqual(reg.code, 200, '注册失败：' + reg.raw);
  const TOKEN = reg.body.token;

  const db0 = loadDatabase();
  const uid = db0.users.find((x) => x.username === uname).id;
  const A = db0.characters.find((c) => Number(c.user_id) === Number(uid));
  assert.ok(A, '角色未创建');

  const itemByName = (n) => (db0.items || []).find((i) => i.name === n);
  const 朱砂 = itemByName('朱砂'), 灵草 = itemByName('灵草'), 还魂草 = itemByName('九转还魂草');
  assert.ok(朱砂 && 灵草 && 还魂草, '配方引用的材料在物品表里必须存在');

  const spiritOf = () => Number(loadDatabase().characters.find((c) => Number(c.id) === Number(A.id)).spirit_stone);
  const heldOf = (itemId) => (loadDatabase().inventory || [])
    .filter((i) => Number(i.character_id) === Number(A.id) && Number(i.item_id) === Number(itemId))
    .reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const talismanCount = () => (loadDatabase().talismans || []).length;

  // 铺底：灵石 + 三种材料，**把最贵的排最前**（复现旧版吃掉第一件的场景）
  {
    const db = loadDatabase();
    db.characters.find((c) => Number(c.id) === Number(A.id)).spirit_stone = 10000;
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 还魂草.id, quantity: 3 });
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 灵草.id, quantity: 5 });
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 朱砂.id, quantity: 5 });
    saveDatabase(db);
  }

  await t('配方引用的材料都能在物品表里按名解析（id 不连续，禁硬编码）', async () => {
    const list = await call('GET', '/api/talismans/recipes', undefined, TOKEN);
    assert.strictEqual(list.code, 200, '取配方失败：' + list.raw);
    const recipes = list.body.recipes || [];
    assert.ok(recipes.length >= 5, '配方数应 ≥5，实际 ' + recipes.length);
    for (const r of recipes) {
      assert.ok(Array.isArray(r.materials) && r.materials.length > 0,
        `配方「${r.name}」没有材料需求 —— 这正是旧版"随便吃一件材料"的根因`);
      assert.ok(Number.isFinite(r.spiritStone), `配方「${r.name}」没有灵石成本`);
      for (const spec of r.materials) {
        assert.ok(typeof spec.name === 'string' && spec.name, `配方「${r.name}」的材料项缺 name`);
        assert.ok(Number(spec.quantity) > 0, `配方「${r.name}」的 ${spec.name} 数量必须为正`);
        assert.ok((loadDatabase().items || []).some((i) => i.name === spec.name),
          `配方「${r.name}」引用的材料「${spec.name}」在物品表里不存在`);
      }
    }
  });

  await t('成本端：做「雷击符」只扣配方点名的朱砂，排更前的贵重材料不得被动', async () => {
    const 朱砂前 = heldOf(朱砂.id), 还魂草前 = heldOf(还魂草.id);
    assert.ok(朱砂前 >= 2, '铺底朱砂应 ≥2');
    const r = await call('POST', '/api/talismans/craft', { name: '雷击符' }, TOKEN);
    assert.strictEqual(r.code, 200, '制作失败：' + r.raw);
    const 朱砂后 = heldOf(朱砂.id), 还魂草后 = heldOf(还魂草.id);
    assert.strictEqual(朱砂前 - 朱砂后, 2, `雷击符应扣朱砂 2，实际 ${朱砂前 - 朱砂后}`);
    assert.strictEqual(还魂草后, 还魂草前,
      `排在最前的「九转还魂草」被吃了（${还魂草前}→${还魂草后}）—— 旧版就是这样，'
      + '扣的是背包第一件而不是配方要的那件`);
  });

  await t('拒绝路径：材料不足 → 400 且零副作用（不扣灵石/材料，不产符）', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === Number(A.id));
    c.spirit_stone = 10000;
    // 把朱砂清空，只留 1 个（雷击符要 2）
    db.inventory = (db.inventory || []).filter((i) => Number(i.item_id) !== Number(朱砂.id));
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 朱砂.id, quantity: 1 });
    saveDatabase(db);

    const ssBefore = spiritOf(), 朱砂Before = heldOf(朱砂.id), talBefore = talismanCount();
    const r = await call('POST', '/api/talismans/craft', { name: '雷击符' }, TOKEN);
    assert.strictEqual(r.code, 400, '材料不足竟成功：' + r.raw);
    assert.ok(/朱砂/.test(r.raw), '错误信息应点名缺哪种材料：' + r.raw);
    assert.strictEqual(spiritOf(), ssBefore, '被拒时不该扣灵石');
    assert.strictEqual(heldOf(朱砂.id), 朱砂Before, '被拒时不该扣材料');
    assert.strictEqual(talismanCount(), talBefore, '被拒时不该产出符箓');
  });

  await t('拒绝路径：灵石不足 → 400 且零副作用', async () => {
    const db = loadDatabase();
    db.characters.find((x) => Number(x.id) === Number(A.id)).spirit_stone = 1;
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 朱砂.id, quantity: 5 });
    saveDatabase(db);

    const ssBefore = spiritOf(), 朱砂Before = heldOf(朱砂.id);
    const r = await call('POST', '/api/talismans/craft', { name: '雷击符' }, TOKEN);
    assert.strictEqual(r.code, 400, '灵石不足竟成功：' + r.raw);
    assert.strictEqual(spiritOf(), ssBefore, '被拒时不该扣灵石');
    assert.strictEqual(heldOf(朱砂.id), 朱砂Before, '被拒时不该扣材料');
  });

  await t('拒绝路径：未知符名 → 400 且列出可选项', async () => {
    const r = await call('POST', '/api/talismans/craft', { name: '根本不存在的符' }, TOKEN);
    assert.strictEqual(r.code, 400, '未知符名竟成功：' + r.raw);
    assert.ok(/雷击符/.test(r.raw), '应列出可选项：' + r.raw);
  });

  await t('效果端：用雷击符后战斗面板攻击真的变（走 buffService，不是死字段）', async () => {
    const db = loadDatabase();
    db.characters.find((x) => Number(x.id) === Number(A.id)).spirit_stone = 10000;
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 朱砂.id, quantity: 5 });
    saveDatabase(db);

    const crafted = await call('POST', '/api/talismans/craft', { name: '雷击符' }, TOKEN);
    assert.strictEqual(crafted.code, 200, '制作失败：' + crafted.raw);

    const atkBefore = combat.getEntity(Number(A.id), 'character').attack;
    const list = await call('GET', '/api/talismans', undefined, TOKEN);
    const lei = (list.body.talismans || []).find((x) => x.name === '雷击符');
    assert.ok(lei, '刚做的雷击符应在持有列表里');

    const use = await call('POST', '/api/talismans/use', { talismanId: lei.id }, TOKEN);
    assert.strictEqual(use.code, 200, '使用失败：' + use.raw);

    const atkAfter = combat.getEntity(Number(A.id), 'character').attack;
    assert.ok(atkAfter > atkBefore,
      `符箓效果没进战斗面板：攻击 ${atkBefore} → ${atkAfter}。`
      + '旧版写的是 character.temp_attack_bonus，而战斗读 buffService（db.character_buffs），两者不通');
  });

  await t('效果端：buff 落在 character_buffs 表（战斗的真源），而不是死字段', async () => {
    const db = loadDatabase();
    const buffs = (db.character_buffs || []).filter((b) => Number(b.character_id) === Number(A.id) && b.expires_at > Date.now());
    assert.ok(buffs.length >= 1, 'character_buffs 里应有未过期的 buff');
    assert.ok(buffs.some((b) => b.type === 'attack' && Number(b.value) > 1),
      '应有一条 attack 类型且倍率 >1 的 buff，实际：' + JSON.stringify(buffs));
    const c = db.characters.find((x) => Number(x.id) === Number(A.id));
    assert.strictEqual(c.temp_attack_bonus, undefined,
      '不该再往 character.temp_attack_bonus 这个无人消费的字段写值');
  });

  await t('效果端：治愈符按 max_hp 比例瞬时回血', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === Number(A.id));
    c.spirit_stone = 10000;
    c.max_hp = 1000; c.hp = 100;
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 灵草.id, quantity: 5 });
    saveDatabase(db);

    const crafted = await call('POST', '/api/talismans/craft', { name: '治愈符' }, TOKEN);
    assert.strictEqual(crafted.code, 200, '制作失败：' + crafted.raw);
    const list = await call('GET', '/api/talismans', undefined, TOKEN);
    const heal = (list.body.talismans || []).find((x) => x.name === '治愈符');
    assert.ok(heal, '刚做的治愈符应在持有列表里');

    const r = await call('POST', '/api/talismans/use', { talismanId: heal.id }, TOKEN);
    assert.strictEqual(r.code, 200, '使用失败：' + r.raw);
    const hpAfter = Number(loadDatabase().characters.find((x) => Number(x.id) === Number(A.id)).hp);
    assert.strictEqual(hpAfter - 100, 300, `应回 30% × 1000 = 300，实际 ${hpAfter - 100}`);
  });

  await t('使用扣量：最后一张符用掉后从持有列表消失', async () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => Number(x.id) === Number(A.id));
    c.spirit_stone = 10000;
    db.inventory.push({ id: getNextId('inventory'), character_id: A.id, item_id: 灵草.id, quantity: 5 });
    // 清掉现有治愈符，确保从 1 开始
    db.talismans = (db.talismans || []).filter((x) => !(Number(x.character_id) === Number(A.id) && x.type === 'healing'));
    saveDatabase(db);

    await call('POST', '/api/talismans/craft', { name: '治愈符' }, TOKEN);
    const before = await call('GET', '/api/talismans', undefined, TOKEN);
    const one = (before.body.talismans || []).find((x) => x.type === 'healing');
    assert.strictEqual(one.quantity, 1, '应正好持有 1 张');

    await call('POST', '/api/talismans/use', { talismanId: one.id }, TOKEN);
    const after = await call('GET', '/api/talismans', undefined, TOKEN);
    assert.ok(!(after.body.talismans || []).some((x) => x.type === 'healing'),
      '用光后应从持有列表消失（数量归零的行应被清理）');
  });

  server.close();

  // 正式档零侧写
  const liveAfter = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;
  await t('正式存档零侧写（体积+mtime 双检）', async () => {
    if (liveBefore && liveAfter) {
      assert.strictEqual(liveAfter.size, liveBefore.size, '正式档体积变了');
      assert.strictEqual(liveAfter.mtimeMs, liveBefore.mtimeMs, '正式档 mtime 变了');
    }
  });

  console.log('');
  console.log(`G15 符箓端到端: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('G15 致命错误：' + e.message);
  console.error(e.stack);
  process.exit(1);
});
