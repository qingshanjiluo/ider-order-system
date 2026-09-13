/**
 * E2 · 攻击模拟（P4 章程硬指标 · 轮52）
 *
 * 章程 E2 的验收原文是两句："攻击模拟脚本通过" + "无 secret 时 production 拒绝启动"。
 * 此前只有 test-tier-limit.js 证明限流中间件本身能计数，**没有任何一套从攻击者视角把
 * 认证、锁定、越权、注入、超大包、限流天花板串起来打一遍**。这一套补上。
 *
 * 装配：与 server.js 相同的中间件顺序（express.json → sanitizeMiddleware → rateLimit → tierLimit），
 * 路由只挂被攻击的那几条。全局限流是 100 次/分钟/IP，所以"打爆天花板"那条必须放最后，
 * 否则前面所有用例都会被 429 误伤 —— 这不是取巧，真实攻击也是分阶段的。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const jwt = require('jsonwebtoken');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-attack-'));
process.env.DSH_DATA_DIR = TMP;
// 轮63 看门狗：子进程句柄未关时 spawnSync 的 timeout 也可能拖不住，宁可判红不要假死
setTimeout(() => { console.log("  ❌ attack-sim 看门狗：300s 未退出，判红并强杀"); process.exit(1); }, 300000);
// 注意：这个夹具本身必须**通过**生产强度断言 —— 第一版我写成 'attack-sim-secret-…'，
// 里面的 "secret" 恰好命中 server.js 的弱口令黑名单，导致对照组"设了强 secret 反而退出"，
// 差点被误判成产品缺陷。用无禁用词的随机串才对。
process.env.JWT_SECRET = 'Xq7vK2pL9mRtz4WyB8nJd3Hf6Gs5' + 'A0cEu1iO';   // 48 字符，不含 change/default/secret/example

const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const { rateLimit } = require('../src/middleware/rateLimit');
const { sanitizeMiddleware } = require('../src/middleware/validate');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};

(async () => {
  console.log('== E2 · 攻击模拟（临时数据目录）==');

  const db0 = loadDatabase();
  require('../src/services/materials').ensureAll(db0);
  saveDatabase(db0);

  const app = express();
  app.use(express.json());
  app.use(sanitizeMiddleware);
  app.use(rateLimit);
  app.use(require('../src/middleware/tierLimit'));
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/character', require('../src/routes/character'));
  app.use('/api/shop', require('../src/routes/shop'));
  app.use('/api/admin', require('../src/routes/admin'));
  app.use('/api/friend', require('../src/routes/friend'));
  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use(require('../src/middleware/requestError'));   // 与 server.js 挂同一份，测到的就是线上那份
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  server.on('clientError', (e, sock) => { console.log(`  ⚠ clientError ${e.code || e.message}`); if (sock.writable) sock.destroy(); });
  process.on('uncaughtException', (e) => { console.log('  ⚠ 未捕获异常（会表现为 ECONNRESET）：' + (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : e)); });
  const port = server.address().port;

  const call = (method, p, body, token) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    // agent:false：每条攻击用独立连接。首版没写这个，"无 token"那条稳定 ECONNRESET 而**服务端零日志**，
    // 排查半天 —— 真因是第一条用例里 spawnSync 会阻塞事件循环约 6s（生产启动对照组），
    // keep-alive 池里那条已被服务端半关的旧 socket 被下一条请求复用，于是客户端 reset、服务端根本没收到请求。
    // 攻击模拟本来也该模拟"每次都是新连接"，不要退回池化。
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers, agent: false }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ code: rs.statusCode, body: j, raw: buf, type: rs.headers['content-type'] || '' }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

const uniq = (tag) => String(tag).replace(/[^A-Za-z0-9_]/g, '').slice(0, 7) + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 100); // 轮63：旧拼法 22-26 字符，超 register 的 3-20 规则
  const reg = async (tag, nickname) => {
    const u = uniq(tag);
    const r = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: nickname || u, faction: 'martial' });
    assert.strictEqual(r.code, 200, `注册 ${tag} 失败：${r.code} ${r.raw.slice(0, 120)}`);
    const db = loadDatabase();
    const uid = db.users.find((x) => x.username === u).id;
    const ch = db.characters.find((c) => Number(c.user_id) === Number(uid));
    return { token: r.body.token, user: u, id: Number(ch.id), name: ch.name };
  };

  const victim = await reg('atk_v');
  const rowsBefore = { users: loadDatabase().users.length, chars: loadDatabase().characters.length };

  await t('生产环境缺强 JWT_SECRET 必须拒绝启动（对照组：设了就必须一直跑着）', () => {
    // 子进程必须用**自己的**数据目录：与父进程共用一个临时库会撞 SQLite 文件锁，
    // 表现成"启动即退出"，把断言假阴性掉（本轮实测踩过）。stderr 用文件 fd 捕获（沙箱禁管道 stdio）。
    const kid = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-attack-kid-'));
      require('../src/database').snapshotDatabase(path.join(kid, 'game.db'));   // 轮61：裸拷贝会漏掉 -wal 里未 checkpoint 的已提交事务
    const boot = (secret, port) => {
      const out = fs.openSync(path.join(TMP, '_o.txt'), 'w');
      const err = fs.openSync(path.join(TMP, '_e.txt'), 'w');
      const r = spawnSync(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: ROOT, timeout: 6000, stdio: ['ignore', out, err],
        env: Object.assign({}, process.env, { NODE_ENV: 'production', JWT_SECRET: secret, PORT: String(port), DSH_DATA_DIR: kid })
      });
      fs.closeSync(out); fs.closeSync(err);
      return { r, err: fs.readFileSync(path.join(TMP, '_e.txt'), 'utf8'), out: fs.readFileSync(path.join(TMP, '_o.txt'), 'utf8') };
    };
    const bad = boot('', 24121);
    assert.notStrictEqual(bad.r.status, 0, '生产环境没有 JWT_SECRET 却启动成功了（任何人都能伪造 token）');
    assert.ok(/JWT_SECRET/.test(bad.err + bad.out), `拒绝启动但没说是为什么：${(bad.err + bad.out).slice(0, 200)}`);
    const weak = boot('change-me-default-secret', 24122);
    assert.notStrictEqual(weak.r.status, 0, '弱口令 JWT_SECRET（含 change/default/secret）竟被放行');
    assert.ok(/JWT_SECRET/.test(weak.err + weak.out), '弱口令被拒但没说明原因');
    const good = boot(process.env.JWT_SECRET, 24123);
    // 正常配置应当一直跑着，被 timeout 掐死（status === null）而不是自己退出
    assert.strictEqual(good.r.status, null, `设了强 secret 反而退出（code=${good.r.status}）：${(good.err + good.out).slice(0, 300)}`);
    fs.rmSync(kid, { recursive: true, force: true });
  });

  await t('无 token / 伪签名 / alg=none / 过期 token 一律 401 JSON（不得 200 也不得 500）', async () => {
    const forged = jwt.sign({ userId: victim.id, username: victim.user }, 'attacker-guessed-secret-xxxxxxxxxxxxxxxx');
    let none = '';
    try { none = jwt.sign({ userId: 1 }, { algorithm: 'none' }); } catch (e) { none = jwt.decode(forged) ? `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(JSON.stringify({ userId: 1 })).replace(/=+$/, '')}.` : ''; }
    const expired = jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { expiresIn: '-10s' });
    const cases = [['无', null], ['错签名', forged], ['alg=none', none], ['过期', expired], ['乱码', 'abc.def.ghi']];
    for (const [tag, tok] of cases) {
      let r;
      try {
        r = await call('GET', '/api/character', undefined, tok);
      } catch (e) {
        assert.fail(`${tag} 的 token 直接把连接打断了（${e.code || e.message}）：服务端在这条输入上崩了，不是"拒绝了请求"`);
      }
      assert.strictEqual(r.code, 401, `${tag} 的 token 得到 ${r.code}（应 401）：${r.raw.slice(0, 100)}`);
      assert.ok(r.body && r.body.error, `${tag} 的 401 响应不是 JSON：${r.raw.slice(0, 80)}`);
    }
  });

  await t('连续登录失败必须锁号（423 + retryAfterSeconds），锁定期内正确密码也被拒', async () => {
    const u = uniq('atk_lock');
    await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
    let lock = null;
    for (let i = 0; i < 8 && !lock; i++) {
      const r = await call('POST', '/api/auth/login', { username: u, password: 'wrong-password-' + i });
      if (r.code === 423) lock = r;
      else assert.ok(r.code === 400 || r.code === 401, `错密码返回了 ${r.code}：${r.raw.slice(0, 100)}`);
    }
    assert.ok(lock, '连错 8 次还没锁号（登录爆破没有代价）');
    assert.ok(Number(lock.body.retryAfterSeconds) > 0, '423 没带 retryAfterSeconds（前端没法倒计时）');
    const right = await call('POST', '/api/auth/login', { username: u, password: 'pw-dummy-123' });
    assert.strictEqual(right.code, 423, `锁定期内正确密码竟登录成功（${right.code}）—— 锁定没起作用`);
    assert.ok(/锁定|稍后再试|请稍后/.test(right.raw), '锁定文案没说清楚：' + right.raw.slice(0, 100));
  });

  await t("SQL 注入式用户名/道号不得绕过认证，也不得改变表行数", async () => {
    const evil = "a' OR '1'='1";
    const r = await call('POST', '/api/auth/login', { username: evil, password: "' OR 1=1 --" });
    assert.ok(r.code === 400 || r.code === 401, `注入式登录得到 ${r.code}（应被当普通用户名拒掉）：${r.raw.slice(0, 120)}`);
    const inj = await call('POST', '/api/auth/register', { username: uniq('atk_inj'), password: 'pw-dummy-123', nickname: "x'); DROP TABLE characters; --", faction: 'martial' });
    assert.ok(inj.code === 200 || inj.code === 400, `恶意道号注册返回 ${inj.code}：${inj.raw.slice(0, 120)}`);
    const db = loadDatabase();
    assert.ok(db.characters.length > rowsBefore.chars, 'characters 表被删了（不是参数化查询）');
    assert.strictEqual(db.users.length >= rowsBefore.users + (inj.code === 200 ? 1 : 0), true, 'users 行数异常');
  });

  await t('XSS 道号不得原样回吐成可执行片段（sanitize 生效且注册不被误杀）', async () => {
    const x = await reg('atk_xss', '<script>alert(1)</script>道号');
    const back = await call('GET', '/api/character', undefined, x.token);
    assert.strictEqual(back.code, 200, '回读自己角色失败：' + back.code);
    const name = String(back.body.name);
    assert.ok(!/<script/i.test(name), `道号里仍原样带着 <script>：${name}（前端 innerHTML 一插就是存储型 XSS）`);
    assert.ok(name.length > 0, 'sanitize 把整个道号吃掉了（合法字符也该留下）');
    console.log(`  ℹ sanitize 后的道号存成：${JSON.stringify(name)}`);
  });

  await t('普通玩家 token 打管理端点必须被拒（401/403），且不得 500', async () => {
    for (const p of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/characters']) {
      const r = await call('GET', p, undefined, victim.token);
      assert.ok(r.code === 401 || r.code === 403, `${p} 得到 ${r.code}（应为 401/403）：${r.raw.slice(0, 100)}`);
    }
    const target = loadDatabase().characters.find((c) => c.id === 1);
    const before = Number(target.spirit_stone);
    const post = await call('POST', '/api/admin/users/1/add-stones', { amount: 999999 }, victim.token);
    assert.ok(post.code === 401 || post.code === 403, `越权加灵石得到 ${post.code}（应为 401/403）`);
    assert.strictEqual(Number(loadDatabase().characters.find((c) => c.id === 1).spirit_stone), before, '越权请求竟然改动了别人的灵石余额');
  });

  await t('超大 body 与畸形 JSON 必须 4xx，不得 500，也不得扣钱', async () => {
    const before = Number(loadDatabase().characters.find((c) => c.id === victim.id).spirit_stone);
    const big = await call('POST', '/api/shop/buy', { itemId: 1, quantity: 'x'.repeat(2_000_000) }, victim.token);
    assert.ok(big.code < 500, `超大 payload 得到 ${big.code}（应 4xx/413）`);
    assert.ok(big.code >= 400, `超大 payload 竟被接受（${big.code}）`);
    assert.ok(/json/.test(big.type), `错误响应不是 JSON（前端 response.json() 会二次崩）：${big.type}`);
    assert.ok(big.body && big.body.error && big.body.status, '错误响应缺少 error/status 结构：' + big.raw.slice(0, 120));
    assert.strictEqual(Number(loadDatabase().characters.find((c) => c.id === victim.id).spirit_stone), before, '被拒的请求仍然扣了灵石');
    const r = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/shop/buy', method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + victim.token } }, (rs) => {
        let b = ''; rs.on('data', (c) => { b += c; }); rs.on('end', () => resolve({ code: rs.statusCode, raw: b, type: rs.headers['content-type'] || '' }));
      });
      req.on('error', reject);
      req.write('{"itemId": '); req.end();
    });
    assert.ok(r.code >= 400 && r.code < 500, `畸形 JSON 得到 ${r.code}：${r.raw.slice(0, 100)}`);
    assert.ok(/json/.test(r.type), `畸形 JSON 的错误页是 HTML 兜底（express 默认行为，日志还会喷堆栈）：${r.type} / ${r.raw.slice(0, 80)}`);
    assert.ok(!/at .*node_modules|SyntaxError/.test(r.raw), '错误响应把内部堆栈回给了客户端：' + r.raw.slice(0, 120));
  });

  await t('未知 /api/* 返回 404 JSON 而不是 HTML 兜底页', async () => {
    const r = await call('GET', '/api/definitely/not/here', undefined, victim.token);
    assert.strictEqual(r.code, 404, 'HTTP ' + r.code);
    assert.ok(/json/.test(r.type), 'Content-Type 不是 JSON：' + r.type);
  });

  await t('分层限流：/api/friend/* 超阈值必须 429 并带 scope 与 retryAfterSeconds', async () => {
    const hits = [];
    for (let i = 0; i < 33; i++) hits.push(await call('GET', '/api/friend/list', undefined, victim.token));
    const blocked = hits.find((r) => r.code === 429);
    assert.ok(blocked, `连打 33 次 /api/friend/list 还没限流（tierLimit 对这层没生效）：最后 ${hits[hits.length - 1].code}`);
    assert.ok(Number(blocked.body.retryAfterSeconds) > 0, '429 没带 retryAfterSeconds');
    assert.ok(blocked.body.scope, '429 没带 scope（前端不知道该提示哪一类操作）');
  });

  await t('全局限流天花板：100 次/分钟/IP 打爆后必须 429（放最后，前面用例共用这一份配额）', async () => {
    let got = null;
    for (let i = 0; i < 90 && !got; i++) {
      const r = await call('GET', '/api/health/probe', undefined, null);
      if (r.code === 429) got = r;
    }
    assert.ok(got, '连打 90 次仍没触发全局限流（IP 天花板没生效）');
    assert.ok(/频繁/.test(got.raw), '拒绝文案不对：' + got.raw.slice(0, 100));

    // 天花板已经打爆：此时伪造 X-Forwarded-For 换一个"来源"必须**不能**拿到新配额。
    // （express 默认不信任代理 ⇒ req.ip 用真实 socket 地址；只有部署在反代后显式设
    //  DSH_TRUST_PROXY 才按 XFF 判定 —— 那一档由下面这条静态锁保证是"要人主动开"的。）
    const spoof = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, path: '/api/health/probe', method: 'GET', agent: false,
        headers: { 'x-forwarded-for': '8.8.8.8', authorization: 'Bearer ' + victim.token }
      }, (rs) => { let b = ''; rs.on('data', (c) => { b += c; }); rs.on('end', () => resolve({ code: rs.statusCode, raw: b })); });
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(spoof.code, 429, `伪造 X-Forwarded-For 竟绕过了限流（得到 ${spoof.code}）—— 默认必须不信任代理头`);

    // ⚠ 扫描前先剥掉注释。这个仓库已经**四次**栽在"静态锁被自己的注释文本触发"上（注释里举反例是好事，
    // 但锁读的是字面量），所以这类锁必须只看代码。剥行注释 + 块注释，注释里的示例调用形态不再算数。
    const srvRaw = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const srv = srvRaw.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(/DSH_TRUST_PROXY/.test(srv), 'server.js 里找不到 trust proxy 的环境开关（反代后全服会共用一个限流桶）');
    assert.ok(!/app\.set\(\s*['"]trust proxy['"]\s*,\s*(true|1)\s*\)/.test(srv), 'trust proxy 被无条件打开（任何人都能伪造 XFF 绕限流与封禁）');
    assert.ok(/if \(trustProxy[\s\S]{0,240}app\.set\(\s*['"]trust proxy['"]/.test(srv), '剥离注释后找不到"受环境变量控制的 trust proxy 调用"（要么配置被删，要么被我的剥离正则误吞）');
  });

  await t('攻击全程不得污染正式存档，且攻击者不得凭空造出资源', () => {
    const db = loadDatabase();
    for (const c of db.characters) {
      assert.ok(Number(c.spirit_stone) >= 0, `角色 ${c.id} 灵石被写成负数 ${c.spirit_stone}`);
    }
    if (!liveBefore) { assert.ok(!fs.existsSync(LIVE_DB), '本不该存在正式存档'); return; }
    const after = fs.statSync(LIVE_DB);
    assert.strictEqual(after.size, liveBefore.size, `正式存档体积变了 ${liveBefore.size} -> ${after.size}`);
    assert.strictEqual(after.mtimeMs, liveBefore.mtimeMs, '正式存档修改时间变了（说明写到了正式档）');
  });

  server.close();
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nE2 攻击模拟: ${pass} 通过, ${fail} 失败`);
  // 本套件 require 了 rateLimit / tierLimit，它们内部有**未 unref 的清扫定时器**，
  // 不显式 process.exit 就会吊住门禁子进程（实测：门禁跑到超时）。汇总已打印、临时目录已清，直接退出。
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('E2 攻击模拟异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
});
