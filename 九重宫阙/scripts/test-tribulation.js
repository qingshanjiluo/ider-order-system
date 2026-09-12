/**
 * E5/T0-1 大限劫路由测试（永久套件）
 *
 * 口径说明（重要）：`POST /endure` 两条分支都会 saveDatabase()，
 * 因此**真打一场不应劫进本文件**（会往生产库写转世结果）——那部分用一次性探针跑，
 * 探针自带 game.db 备份/还原与 MD5 核对，证据记在开发日志里。
 * 本文件只锁：鉴权、参数校验、Boss 挑选的确定性、以及"路由绝不自己判生死"的源码契约。
 */
const assert = require('assert');
const express = require('express');
const http = require('http');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); pass++; }
  catch (e) { console.log(`❌ ${name}: ${e.message}`); fail++; }
}

const OPEN_SERVERS = [];
function listen(app) {
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => { OPEN_SERVERS.push(server); resolve(server); });
  });
}
/**
 * Windows 下若还有 handle 处于 closing 状态就直接 process.exit，会触发
 * libuv 断言 `!(handle->flags & UV_HANDLE_CLOSING)` 并让进程以非零码退出 ——
 * 测试全绿也会被判红。先显式销毁 keep-alive 连接，再在下一 tick 退出。
 */
function shutdown(fail) {
  for (const s of OPEN_SERVERS) {
    try {
      s.close();
      if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
      if (typeof s.closeIdleConnections === 'function') s.closeIdleConnections();
    } catch (e) { /* 忽略：已进入关闭流程 */ }
  }
  setImmediate(() => process.exit(fail ? 1 : 0));
}

/**
 * 不用 fetch：undici 的全局 keep-alive dispatcher 会留下 closing handle，
 * 在 Windows 上让进程以 libuv 断言崩溃（测试全绿仍判红）。
 * 这里用 agent:false + Connection:close，请求结束即彻底销毁 socket，事件循环无残留。
 */
function rq(port, opts = {}) {
  const { method = 'GET', path = '/', headers = {}, body = null } = opts;
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, method, path, agent: false,
      headers: Object.assign({ Connection: 'close' }, headers)
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', d => { data += d; });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (e) { json = { unparsed: data }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const router = require('../src/routes/tribulation');
  const { loadDatabase } = require('../src/database');
  const B = require('../src/config/balance');
  const gameTime = require('../src/services/gameTime');

  console.log('== E5/T0-1 大限劫路由 ==');

  await t('模块可挂载且导出两个受测辅助函数', () => {
    assert.strictEqual(typeof router, 'function', '路由未导出 express router');
    assert.strictEqual(typeof router.pickTribulationMonster, 'function');
    assert.strictEqual(typeof router.tribulationTargetLevel, 'function');
  });

  await t('天劫目标等级确定性：随境界单调、同输入同输出', () => {
    const a = router.tribulationTargetLevel({ level: 30 }, 0);
    const b = router.tribulationTargetLevel({ level: 30 }, 5);
    assert.ok(b > a, '更高境界的天劫反而更弱');
    assert.strictEqual(a, router.tribulationTargetLevel({ level: 30 }, 0), '同一输入产生不同结果');
    assert.strictEqual(
      router.tribulationTargetLevel({ level: 30 }, 5),
      30 + 6 * B.TRIBULATION.bossLevelPerRealm, '未走 balance 常数（写死了？）');
    assert.strictEqual(router.tribulationTargetLevel({}, 0), 1 + B.TRIBULATION.bossLevelPerRealm, '缺 level 未降级');
  });

  await t('Boss 挑选：优先不弱于目标等级、结果确定、极端输入不崩', () => {
    const db = loadDatabase();
    assert.ok((db.monsters || []).length >= 86, `怪物模板池退化：${(db.monsters || []).length}`);
    assert.ok((db.realms || []).length >= 10, `境界表退化：${(db.realms || []).length}`);
    const pick = (realm, level) => router.pickTribulationMonster(db, { realm, level });
    const p1 = pick('化神', 40);
    const p2 = pick('化神', 40);
    assert.ok(p1 && p1.tpl && p1.tpl.name, '挑不出天劫之敌');
    assert.strictEqual(p1.tpl.id, p2.tpl.id, '同输入挑到不同的怪');
    assert.ok(p1.hi >= p1.targetLevel, `天劫强度低于目标等级：hi=${p1.hi} target=${p1.targetLevel}`);
    assert.ok(pick('渡劫', 400).targetLevel > p1.targetLevel, '渡劫天劫不强于化神');
    assert.ok(pick(undefined, undefined).tpl.name, '字段全缺也应能兜底挑出一只');
    assert.strictEqual(router.pickTribulationMonster({ realms: [], monsters: [] }, { level: 1 }), null,
      '空池应返回 null 交由路由报错，而不是崩');
  });

  await t('GET /status 与 POST /endure 无 token 一律 401（auth 逐路由挂上了）', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/tribulation', router);
    const server = await listen(app);
    const port = server.address().port;
    try {
      for (const [method, path] of [['GET', '/api/tribulation/status'], ['POST', '/api/tribulation/endure']]) {
        const r = await rq(port, {
          method, path, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : null
        });
        assert.strictEqual(r.status, 401, `${method} ${path} 未鉴权，返回 ${r.status}`);
      }
    } finally { server.close(); }
  });

  await t('源码契约：路由不自行判生死、不自行写寿元（判定点唯一）', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'routes', 'tribulation.js'), 'utf8');
    assert.strictEqual((src.match(/gameTime\.passAway\(/g) || []).length, 1, 'passAway 调用点必须恰好 1 处');
    assert.strictEqual((src.match(/shouldPassAway\(/g) || []).length, 1, '判死询问点必须恰好 1 处');
    for (const forbidden of [/character\.age_years\s*=/, /lifespan_bonus_years\s*=/, /longevity_years\s*=/, /effectiveLifespan\([^)]*\)\s*=/]) {
      assert.ok(!forbidden.test(src), `路由直接改写了寿元字段（${forbidden}）——寿元算术只准在 gameTime 里`);
    }
    assert.ok(src.includes('gameTime.settleTime(character'), '未走统一时间引擎推进年龄');
    assert.ok(src.includes('gameTime.resolveTribulationVictory(') && src.includes('gameTime.resolveTribulationDefeat('),
      '未调用应劫结算函数');
    assert.ok(src.includes('saveDatabase(db)'), '结算后未落库');
  });

  await t('幽灵配置：TRIBULATION 每个字段都被消费', () => {
    const fs = require('fs');
    const path = require('path');
    const files = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
      }
    })(path.join(__dirname, '..', 'src'));
    const all = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    for (const key of Object.keys(B.TRIBULATION)) {
      if (key === 'eligibleRealms' || key === 'bossLevelPerRealm') continue; // 在 balance 内部与路由各自消费
      assert.ok(all.includes(`TRIBULATION.${key}`) || all.includes(`B.TRIBULATION && B.TRIBULATION.${key}`),
        `TRIBULATION.${key} 无人消费（幽灵配置）`);
    }
    assert.ok(!Object.prototype.hasOwnProperty.call(B.TRIBULATION, 'maxAttemptsPerWindow'),
      'maxAttemptsPerWindow 已判定为死配置，不得复活');
  });

  await t('GET /status 真跑（只读）：大限将至可显示，且 GET 不得擅自开窗', async () => {
    const jwt = require('jsonwebtoken');
    const config = require('../src/config');
    const db = loadDatabase();
    const ch = db.characters.find(c => gameTime.effectiveLifespan(c) !== null);
    assert.ok(ch, '库里没有可测角色');
    const snap = { realm: ch.realm, age_years: ch.age_years, trib: ch.tribulation };
    ch.realm = '化神';
    ch.age_years = gameTime.effectiveLifespan(ch) + 1;   // 寿元已竭
    const token = jwt.sign({ userId: ch.user_id }, config.jwt.secret, { expiresIn: '1m' });
    const app = express();
    app.use(express.json());
    app.use('/api/tribulation', router);
    const server = await listen(app);
    try {
      const port = server.address().port;
      const H = { Authorization: 'Bearer ' + token };
      const r = await rq(port, { path: '/api/tribulation/status', headers: H });
      assert.strictEqual(r.status, 200, `status 未 200，实为 ${r.status}`);
      const body = r.json;
      assert.strictEqual(body.eligible, true, '化神应具应劫资格');
      assert.strictEqual(body.imminent, true, '寿元已竭却未报"大限将至"（前端无从提示）');
      assert.ok(body.boss && body.boss.name && body.boss.targetLevel > 0, `未给出天劫之敌：${JSON.stringify(body.boss)}`);
      assert.ok(body.remaining <= 0, `remaining 口径不对：${body.remaining}`);
      assert.ok(!ch.tribulation, 'GET 把窗口开了（读操作产生写副作用）');
      // 同一个 GET 连打三次必须完全一致（幂等，且不推进任何状态）
      const again = (await rq(port, { path: '/api/tribulation/status', headers: H })).json;
      assert.strictEqual(again.stage, body.stage);
      assert.strictEqual(again.imminent, body.imminent);
      assert.strictEqual(again.boss.targetLevel, body.boss.targetLevel, '同一面板两次给出不同天劫强度');
    } finally {
      ch.realm = snap.realm; ch.age_years = snap.age_years; ch.tribulation = snap.trib;
      server.close();
    }
  });

  await t('server.js 已挂载 /api/tribulation', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(/app\.use\(\s*['"]\/api\/tribulation['"]/.test(src), '路由未在 server 挂载');
  });

  console.log(`\nE5 大限劫路由测试: ${pass} 通过, ${fail} 失败`);
  shutdown(fail);   // 不可在此前直接 process.exit：见 shutdown() 注释
})();
