/**
 * G16 · 战斗阵法端到端（轮111 立）。
 *
 * ## 存在理由
 *
 * 轮111 机器审计：`col_formations` **0 行**（从未被使用）。深查发现与符箓**同源**的
 * 两个真缺陷，且无任何门禁覆盖：
 *
 * **① 零成本凭空获得。** `/activate` 不校验材料与灵石 —— 实证：新手号（100 灵石、
 * 无材料）直接 POST `formationId=4` 就激活了最强阵法「万剑归宗阵」(attack+25%)，
 * 灵石一分未扣。定义 id 路径在无实例时还会直接 push 一行。
 *
 * **② 效果无人消费。** `bonus_attack/defense/speed/hp/exp` 只在 formations.js
 * 自己里出现（定义 + 写库），全项目无消费端；`combat.js` 的面板乘数链
 *   attack = floor((base+equip+pet) × realmMultiplier × tempAttackBonus × mood × 伤势 × 宗门)
 * 里**没有 formations**。玩家激活阵法等于没激活。
 *
 * ## 判据（全部走真实消费端）
 *
 * - 成本：无材料/无灵石 → 400 且**零副作用**（不扣、不凭空多一行）
 * - 成本：备齐 → 成功，灵石与材料按配方扣
 * - 效果：激活后 `combat.getEntity().attack`（战斗真面板）**必须真的变**
 * - 撤阵：`/deactivate` 后必须**精确回落**（否则玩家可白嫖加成）
 * - 重复激活已有实例不重复收费
 * - 正式存档零侧写
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g16-formation-'));
process.env.DSH_DATA_DIR = TMP;
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
app.use('/api/formations', require('../src/routes/formations'));
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
  console.log('== G16 · 战斗阵法端到端 ==');

  const uname = 'g16' + Date.now().toString(36).slice(-7);
  const reg = await call('POST', '/api/auth/register',
    { username: uname, password: 'pw-dummy-123', nickname: uname, faction: 'martial' });
  assert.strictEqual(reg.code, 200, '注册失败：' + reg.raw);
  const TOKEN = reg.body.token;

  const db0 = loadDatabase();
  const uid = db0.users.find((x) => x.username === uname).id;
  const A = db0.characters.find((c) => Number(c.user_id) === Number(uid));
  assert.ok(A, '角色未创建');
  const CID = Number(A.id);

  const spiritOf = () => Number(loadDatabase().characters.find((c) => Number(c.id) === CID).spirit_stone);
  const myFormations = () => (loadDatabase().formations || []).filter((f) => Number(f.character_id) === CID);
  const heldOf = (itemId) => (loadDatabase().inventory || [])
    .filter((i) => Number(i.character_id) === CID && Number(i.item_id) === Number(itemId))
    .reduce((n, i) => n + (Number(i.quantity) || 0), 0);

  await t('每个阵法都有成本定义（材料按名可解析 + 灵石为正）', async () => {
    const list = await call('GET', '/api/formations/list', undefined, TOKEN);
    assert.strictEqual(list.code, 200, '取目录失败：' + list.raw);
    const defs = list.body.formations || [];
    assert.ok(defs.length >= 5, '阵法目录应 ≥5，实际 ' + defs.length);
    for (const d of defs) {
      assert.ok(d.cost, `阵法「${d.name}」没有成本定义 —— 这正是旧版"零成本白嫖"的根因`);
      assert.ok(Number(d.cost.spiritStone) > 0, `阵法「${d.name}」灵石成本必须为正`);
      assert.ok(Array.isArray(d.cost.materials) && d.cost.materials.length > 0,
        `阵法「${d.name}」没有材料需求`);
      for (const spec of d.cost.materials) {
        assert.ok((loadDatabase().items || []).some((i) => i.name === spec.name),
          `阵法「${d.name}」引用的材料「${spec.name}」在物品表里不存在`);
        assert.ok(Number(spec.quantity) > 0, `阵法「${d.name}」的 ${spec.name} 数量必须为正`);
      }
    }
  });

  await t('零成本白嫖必须被拒：新手号直接激活最强阵法 → 400 且零副作用', async () => {
    const before = { ss: spiritOf(), n: myFormations().length };
    assert.ok(before.ss < 4500, '前提：新手号灵石不足以布置万剑归宗阵');
    const r = await call('POST', '/api/formations/activate', { formationId: 4 }, TOKEN);
    assert.strictEqual(r.code, 400, '零成本竟激活成功：' + r.raw);
    assert.ok(/灵石不足/.test(r.raw), '应报灵石不足：' + r.raw);
    assert.strictEqual(spiritOf(), before.ss, '被拒时不该扣灵石');
    assert.strictEqual(myFormations().length, before.n, '被拒时不该凭空多一行阵法');
  });

  await t('材料不足必须被拒：给足灵石但不给材料 → 400 且零副作用', async () => {
    const db = loadDatabase();
    db.characters.find((c) => Number(c.id) === CID).spirit_stone = 100000;
    saveDatabase(db);
    const before = { ss: spiritOf(), n: myFormations().length };
    const r = await call('POST', '/api/formations/activate', { formationId: 4 }, TOKEN);
    assert.strictEqual(r.code, 400, '缺材料竟成功：' + r.raw);
    assert.ok(/材料不足/.test(r.raw), '应报材料不足：' + r.raw);
    assert.ok(/天外陨铁|紫晶砂/.test(r.raw), '应点名缺哪种材料：' + r.raw);
    assert.strictEqual(spiritOf(), before.ss, '被拒时不该扣灵石');
    assert.strictEqual(myFormations().length, before.n, '被拒时不该凭空多一行');
  });

  await t('备齐成本后可激活：灵石与材料按配方扣', async () => {
    const db0b = loadDatabase();
    const 陨铁 = (db0b.items || []).find((i) => i.name === '天外陨铁');
    const 紫晶 = (db0b.items || []).find((i) => i.name === '紫晶砂');
    assert.ok(陨铁 && 紫晶, '前提材料必须存在');

    const db = loadDatabase();
    db.characters.find((c) => Number(c.id) === CID).spirit_stone = 5000;
    db.inventory.push({ id: getNextId('inventory'), character_id: CID, item_id: 陨铁.id, quantity: 3 });
    db.inventory.push({ id: getNextId('inventory'), character_id: CID, item_id: 紫晶.id, quantity: 3 });
    saveDatabase(db);

    const r = await call('POST', '/api/formations/activate', { formationId: 4 }, TOKEN);
    assert.strictEqual(r.code, 200, '备齐成本仍失败：' + r.raw);
    assert.strictEqual(spiritOf(), 500, '应扣 4500 灵石，实际剩 ' + spiritOf());
    assert.strictEqual(heldOf(陨铁.id), 0, '天外陨铁应被扣光');
    assert.strictEqual(heldOf(紫晶.id), 0, '紫晶砂应被扣光');
    assert.strictEqual(myFormations().length, 1, '应恰好拥有一个阵法实例');
  });

  await t('效果端：激活后战斗面板攻击真的变（走 buffService，不是死字段）', async () => {
    const db = loadDatabase();
    const active = (db.formations || []).find((f) => Number(f.character_id) === CID && f.active);
    assert.ok(active, '应有一个已激活的阵法');
    // 万剑归宗阵 bonus_attack=25 → 面板 ×1.25
    const atk = combat.getEntity(CID, 'character').attack;
    // 撤掉 buff 后应当回落，用回落值反推"确实加了"
    const buffBefore = (loadDatabase().character_buffs || [])
      .filter((b) => Number(b.character_id) === CID && b.type === 'attack' && b.expires_at > Date.now());
    assert.ok(buffBefore.length >= 1,
      'character_buffs 里应有 attack 类型的未过期 buff（战斗真源）—— 旧版只写 col_formations，战斗读不到');
    assert.ok(atk > 0, '面板攻击应为正');
  });

  await t('撤阵后必须精确回落（否则玩家可白嫖加成）', async () => {
    const atkOn = combat.getEntity(CID, 'character').attack;
    const r = await call('POST', '/api/formations/deactivate', undefined, TOKEN);
    assert.strictEqual(r.code, 200, '撤阵失败：' + r.raw);
    const atkOff = combat.getEntity(CID, 'character').attack;
    assert.ok(atkOff < atkOn,
      `撤阵后面板没回落：${atkOn} → ${atkOff}。撤阵必须同时撤掉 buff，否则加成永久白嫖`);
    const buffs = (loadDatabase().character_buffs || [])
      .filter((b) => Number(b.character_id) === CID && b.type === 'attack' && b.expires_at > Date.now());
    assert.strictEqual(buffs.length, 0, '撤阵后不该还有 attack buff');
  });

  await t('重新激活已有实例不重复收费', async () => {
    const ssBefore = spiritOf();
    const r = await call('POST', '/api/formations/activate', { formationId: 4 }, TOKEN);
    assert.strictEqual(r.code, 200, '重新激活失败：' + r.raw);
    assert.strictEqual(spiritOf(), ssBefore, '切换激活不该再扣灵石');
    assert.strictEqual(r.body.paid, null, 'paid 应为 null（已有实例不收费）');
  });

  await t('换阵不叠加：切到另一阵时旧阵加成必须撤掉', async () => {
    const db0c = loadDatabase();
    const 玄铁 = (db0c.items || []).find((i) => i.name === '玄铁矿');
    const 朱砂 = (db0c.items || []).find((i) => i.name === '朱砂');
    const db = loadDatabase();
    db.characters.find((c) => Number(c.id) === CID).spirit_stone = 100000;
    db.inventory.push({ id: getNextId('inventory'), character_id: CID, item_id: 玄铁.id, quantity: 3 });
    db.inventory.push({ id: getNextId('inventory'), character_id: CID, item_id: 朱砂.id, quantity: 3 });
    saveDatabase(db);

    const atkSword = combat.getEntity(CID, 'character').attack;
    // 用 type 换阵 —— 这是消解"实例 id 与目录 id 数值相同"歧义的明确入参
    const r = await call('POST', '/api/formations/activate', { type: 'big_dipper' }, TOKEN);   // 天罡北斗阵 attack+15
    assert.strictEqual(r.code, 200, '换阵失败：' + r.raw);
    const activeRows = (loadDatabase().formations || []).filter((f) => Number(f.character_id) === CID && f.active);
    assert.strictEqual(activeRows.length, 1, '同一时刻只能有一个激活的阵法');
    assert.strictEqual(activeRows[0].type, 'big_dipper', '激活的应是新换的阵');
    const atkNew = combat.getEntity(CID, 'character').attack;
    // +25% 换成 +15%，面板必须下降；若两阵叠加则反而更高
    assert.ok(atkNew < atkSword,
      `换阵后攻击 ${atkSword} → ${atkNew} —— 若两阵 buff 叠加会不降反升，说明换阵没撤旧 buff`);
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
  console.log(`G16 阵法端到端: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('G16 致命错误：' + e.message);
  console.error(e.stack);
  process.exit(1);
});
