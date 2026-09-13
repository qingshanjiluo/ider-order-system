/**
 * G4 · 延寿通道端到端（轮55 · 上线必修「打通延寿通道」）
 *
 * 轮53 量出的事实：`balance.LIFE_GAIN` 写好了四档丹/三件灵植/宗门赏赐/长生功，`gameTime` 也早就有
 * 受 35% 硬闸的写入器 `addLifespanBonus()`，但**全仓只有 T0-1 应劫一个调用者** ⇒ 玩家手上一条延寿通道都没有，
 * 铁律(2)「元婴之后必须经营寿元」因此没有执行手段（可获得 0/3）。轮55 接的是：货架 + /shop/use-item + 背包按钮。
 *
 * 这里断言的不是"接口存在"，而是这条通道**作为玩家手段成立且不破坏守恒**：
 *   ① 背包接口带出 longevity 标注（前端不必抄第二份名单）
 *   ② 服用 → longevity_years 严格递增、每次增量 == floor(当时境界基础寿元 × LIFE_GAIN 比例)
 *   ③ 35% 延寿闸关得死：到闸后再用返回 423，且**道具不损耗**（不为系统的拒绝白扣玩家东西）
 *   ④ perLife（本世 3 次）用满后 423；转世清零（源码级：与 longevity_years 同处归零）
 *   ⑤ 前端确有入口，且灵植名字没有硬编码进 public/
 *
 * 只写 DSH_DATA_DIR 的存档副本；正式存档逐字节不得动（末尾 MD5 双检）。
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const liveBefore = md5(LIVE_DB);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-longevity-'));
fs.copyFileSync(LIVE_DB, path.join(TMP, 'game.db'));
process.env.DSH_DATA_DIR = TMP;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const B = require('../src/config/balance');
const gameTime = require('../src/services/gameTime');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};

const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/character', require('../src/routes/character'));
app.use('/api/shop', require('../src/routes/shop'));

const run = async () => {
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;
  const call = (method, p, data, token) => new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers, agent: false }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (_) { } resolve({ code: rs.statusCode, body: j, raw: buf.slice(0, 200) }); });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });

  // 轮63：具名压进 schema 的 3-20 字符规则（旧拼法 21 字符）
  const u = `g4`.slice(0,0) + "g4" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 100);
  const reg = await call('POST', '/api/auth/register', { username: u, password: 'pw-g4-dummy-1', nickname: u, faction: 'martial' });
  assert.ok(reg.code === 200 && reg.body && reg.body.token, `注册失败：${reg.code} ${reg.raw}`);
  const token = reg.body.token;
  const db = loadDatabase();
  const uid = db.users.find((x) => x.username === u).id;
  const me = () => db.characters.find((c) => Number(c.user_id) === Number(uid));

  const PLANT = '万年血参';
  const plantItem = db.items.find((i) => i.name === PLANT);
  assert.ok(plantItem, `存档里没有灵植「${PLANT}」，后面的断言无意义`);
  const shelf = (db.shop || []).find((s) => Number(s.item_id) === Number(plantItem.id));
  const cfg = B.LIFE_GAIN.plants[PLANT];

  console.log('== G4 · 延寿通道 ==');
  console.log(`  ℹ ${PLANT}：配置 ratio=${cfg.ratio} perLife=${cfg.perLife}，货架=${shelf ? `id${shelf.id} 价${shelf.price}` : '【未上架】'}`);

  await t('① 三件灵植全部在货架上（轮53 实测 0/3 上架）', () => {
    const miss = Object.keys(B.LIFE_GAIN.plants).filter((n) => {
      const it = db.items.find((i) => i.name === n);
      return !it || !(db.shop || []).some((s) => Number(s.item_id) === Number(it.id));
    });
    assert.deepStrictEqual(miss, [], `仍未上架的延寿灵植：${miss.join('、')}`);
  });

  // 灌 4 株进背包（买货路径由 G2/商店用例覆盖，这里测的是"使用"通道）
  const give = (qty) => {
    const row = (db.inventory || []).find(i => Number(i.character_id) === Number(me().id) && Number(i.item_id) === Number(plantItem.id));
    if (row) row.quantity = qty;
    else db.inventory.push({ id: Date.now() % 1e8, character_id: me().id, item_id: plantItem.id, quantity: qty });
    saveDatabase(db);
  };
  give(4);

  await t('①b 背包接口带出 longevity 标注（前端不需要第二份名单）', async () => {
    const r = await call('GET', '/api/character/inventory', null, token);
    assert.strictEqual(r.code, 200, `inventory 请求失败 ${r.code}`);
    const row = (r.body || []).find((x) => x.item && x.item.name === PLANT);
    assert.ok(row, '背包里找不到该灵植');
    assert.ok(row.longevity, '缺少 longevity 标注 ⇒ 前端只能硬编码名单，正是我们要防的第二真源');
    assert.strictEqual(row.longevity.perLife, cfg.perLife, 'perLife 与 LIFE_GAIN 不一致');
    assert.strictEqual(row.longevity.leftThisLife, cfg.perLife, '新号本世剩余次数应为 perLife');
    assert.strictEqual(row.longevity.canUse, true, '未达闸却不可用');
    assert.ok(row.longevity.years > 0, '延寿年数为 0 ⇒ 该通道对本境界无意义');
  });

  const expectGain = () => Math.floor(gameTime.getLifespanBase(me()) * cfg.ratio);
  let prevLongevity = me().longevity_years || 0;

  await t('② 服用：寿元桶严格递增、增量等于比例值、道具被消耗', async () => {
    for (let k = 1; k <= cfg.perLife; k++) {
      const want = expectGain();
      const r = await call('POST', '/api/shop/use-item', { itemName: PLANT }, token);
      assert.strictEqual(r.code, 200, `第 ${k} 次服用失败：${r.code} ${r.raw}`);
      assert.strictEqual(r.body.success, true, `第 ${k} 次未成功：${r.raw}`);
      assert.strictEqual(r.body.type, 'longevity');
      assert.strictEqual(r.body.gained, want, `第 ${k} 次增量 ${r.body.gained} != floor(${want})`);
      const now = me().longevity_years;
      assert.ok(now > prevLongevity, `第 ${k} 次后延寿桶未增长（${prevLongevity} → ${now}）`);
      prevLongevity = now;
      assert.strictEqual(r.body.leftThisLife, cfg.perLife - k, `第 ${k} 次后本世剩余应为 ${cfg.perLife - k}`);
      const left = (db.inventory.find(i => Number(i.item_id) === Number(plantItem.id) && Number(i.character_id) === Number(me().id)) || {}).quantity || 0;
      assert.strictEqual(left, 4 - k, `第 ${k} 次后背包应剩 ${4 - k} 株，实际 ${left}`);
    }
  });

  await t('②b 延寿始终不越过 35% 硬闸', () => {
    const ceiling = gameTime.longevityCeiling(gameTime.getLifespanBase(me()));
    assert.ok(me().longevity_years <= ceiling, `longevity_years ${me().longevity_years} 越过闸 ${ceiling}`);
    assert.ok(gameTime.effectiveLifespan(me()) <= Math.floor(gameTime.getLifespanBase(me()) * (1 + B.LONGEVITY_BONUS_CAP_RATIO)) + 1,
      '有效寿元上限被延寿通道推破 135% 边界');
  });

  await t('③ perLife 用满后拒绝，且**不白扣道具**（先判定后扣减）', async () => {
    give(2);
    const before = (db.inventory.find(i => Number(i.item_id) === Number(plantItem.id)) || {}).quantity;
    const r = await call('POST', '/api/shop/use-item', { itemName: PLANT }, token);
    assert.strictEqual(r.code, 423, `已用满仍返回 ${r.code}（期望 423 状态锁）⇒ ${r.raw}`);
    assert.strictEqual(r.body.type, 'lifespan_locked');
    assert.ok(/本世已用满/.test(r.body.error || ''), `拒绝原因没写清：${r.raw}`);
    const after = (db.inventory.find(i => Number(i.item_id) === Number(plantItem.id) && Number(i.character_id) === Number(me().id)) || {}).quantity;
    assert.strictEqual(after, before, `被拒绝却消耗了道具（${before} → ${after}）`);
    assert.strictEqual(me().longevity_years, prevLongevity, '被拒绝却仍然加了寿元');
  });

  await t('③b 已到延寿闸时拒绝且原因可读（闸与 perLife 是两回事）', async () => {
    const c = me();
    const fresh = `g4b_${Date.now()}`;
    const reg2 = await call('POST', '/api/auth/register', { username: fresh, password: 'pw-g4-dummy-1', nickname: fresh, faction: 'martial' });
    assert.ok(reg2.code === 200, '二号注册失败');
    const uid2 = loadDatabase().users.find((x) => x.username === fresh).id;
    const db2 = loadDatabase();
    const c2 = db2.characters.find((x) => Number(x.user_id) === Number(uid2));
    c2.longevity_years = gameTime.longevityCeiling(gameTime.getLifespanBase(c2));
    db2.inventory.push({ id: 998877, character_id: c2.id, item_id: plantItem.id, quantity: 1 });
    saveDatabase(db2);
    const r = await call('POST', '/api/shop/use-item', { itemName: PLANT }, reg2.body.token);
    assert.strictEqual(r.code, 423, `闸已关死却返回 ${r.code} ⇒ ${r.raw}`);
    assert.ok(/上限|封顶/.test(r.body.error || ''), `未说明是闸的原因：${r.raw}`);
    assert.ok(c);
  });

  await t('④ 转世把延寿桶与本世计数一起归零（源码级：同处清零，不另立第二套）', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src/services/gameTime.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const i = s.indexOf('character.longevity_years = 0;');
    assert.ok(i >= 0, 'gameTime 里找不到转世清延寿桶的语句（轮55 之前的行为改了？）');
    assert.ok(s.slice(i, i + 260).includes('character.longevity_grants = {}'),
      '转世只清了延寿桶却没清本世计数 ⇒ 玩家转世后灵植次数永久减少（隐性损失）');
    assert.ok(!/longevity_grants\s*=[^=]/.test(s.replace(/character\.longevity_grants = \{\};?/g, '')),
      '除转世外 gameTime 还有第二处写 longevity_grants 的地方');
  });

  await t('⑤ 前端确有入口，且没有把灵植名单抄进 public/', () => {
    const ui = fs.readFileSync(path.join(ROOT, 'public/js/ui.js'), 'utf8');
    const appjs = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    const apijs = fs.readFileSync(path.join(ROOT, 'public/js/api.js'), 'utf8');
    assert.ok(/data-use-item/.test(ui), 'ui.js 没渲染「服用」按钮 ⇒ 服务端通道成了幽灵入口');
    assert.ok(/row\.item \|\| \{\}/.test(ui), 'ui.js 仍在读背包行本身（"未知物品"那个 bug 没修）');
    assert.ok(/useItem\(/.test(apijs) && /data-use-item/.test(appjs), 'api/app 缺少使用链路');
    const leaked = fs.readdirSync(path.join(ROOT, 'public/js'))
      .filter(f => f.endsWith('.js'))
      .filter(f => ['万年血参', '九转灵芝', '仙灵草'].some(n => fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8').includes(n)));
    assert.deepStrictEqual(leaked, [], `前端硬编码了灵植名单（名单只应在 LIFE_GAIN）：${leaked.join(',')}`);
  });

  await t('⑥ 寿元算术没有第二处实现（use-item 必须走 gameTime.addLifespanBonus）', () => {
    const goods = fs.readFileSync(path.join(ROOT, 'src/services/lifespan-goods.js'), 'utf8');
    assert.ok(/gameTime\.addLifespanBonus\(/.test(goods), 'lifespan-goods 没调用唯一的延寿写入器');
    assert.ok(!/character\.(longevity_years|lifespan_bonus_years|age_years)\s*=[^=]/.test(goods.replace(/^\s*\/\/.*$/gm, '')),
      'lifespan-goods 自己动手改寿元桶 ⇒ 35% 闸被绕过');
    const shopSrc = fs.readFileSync(path.join(ROOT, 'src/routes/shop.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/character\.longevity_years\s*=[^=]/.test(shopSrc), '路由直接写延寿桶（绕过唯一写入器）');
    assert.ok(/lifespan-goods/.test(shopSrc) && /lifespan-goods/.test(fs.readFileSync(path.join(ROOT, 'src/routes/character.js'), 'utf8')),
      'use-item 或 inventory 没有引用 lifespan-goods ⇒ 通道没接上');
  });

  server.close();
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log(`\nG4 延寿通道: ${pass} 通过, ${fail} 失败`);
  console.log(`  正式存档 MD5 未变 = ${liveBefore === md5(LIVE_DB)}`);
  if (liveBefore !== md5(LIVE_DB)) fail++;
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error('  💥 ' + (e && e.stack ? e.stack : e)); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { } process.exit(1); });
