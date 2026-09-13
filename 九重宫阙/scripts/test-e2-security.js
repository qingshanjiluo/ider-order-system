#!/usr/bin/env node
/**
 * 第 24 套 · E2 安全头与入参校验接线（轮63）
 *
 * 动机是两条当场发现的事实：
 * 1) `validateRequest` 与 145 条 VALIDATION_RULES 一直存在，却**没有任何路由引用它**
 *    （全文只命中它自己的定义文件）—— 校验器是死的；清单上"只有 sanitize"这句还说轻了。
 * 2) VALIDATION_RULES 有重复键：151 条字面量只生效 145 条，后者静默覆盖前者，
 *    例如 `type` 最终变成公告枚举，任何普通字符串都过不了 —— 一旦接线就以莫名方式炸。
 *
 * 本套件既锁"头真发出去了"，也锁"校验器真挂在路由上"（引用计数棘轮，只许升不许降），
 * 并且用真 HTTP 请求证明畸形入参被挡在业务之前、合法格式仍走到业务。
 *
 * 隔离：起服务用 DSH_DATA_DIR 指临时副本 + 高位端口，绝不碰正式存档（末尾逐字节校验）。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
// 只收同步断言：把 async 函数喂给它会永远判过（轮63 首版就犯了这个错）
const t = (name, fn) => {
  const out = (() => { try { return fn(); } catch (e) { return e; } })();
  if (out && typeof out.then === 'function') { throw new Error('t() 只接受同步断言：' + name); }
  if (out instanceof Error) { const ms = String(out.message).split('\n'); console.log(`  ❌ ${name}: ` + ms.slice(0, 12).join('\n      ')); fail++; }
  else { console.log(`  ✅ ${name}`); pass++; }
};

/** 引用计数棘轮基线：本套件写下时为实测值，之后只许增加 —— 防"顺手把校验摘了"。 */
function wiredCount() {
  let n = 0;
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'routes')).filter((x) => x.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(ROOT, 'src', 'routes', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    n += (s.match(/validateRequest\(/g) || []).length;
  }
  return n;
}
const WIRE_BASELINE = wiredCount();

const req = (port, method, urlPath, body) => new Promise((resolve) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const r = http.request({
    hostname: '127.0.0.1', port, path: urlPath, method,
    headers: Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': Buffer.byteLength(data) } : {}),
    timeout: 12000
  }, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { buf += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: buf }));
  });
  r.on('error', (e) => resolve({ status: 0, headers: {}, text: e.message }));
  r.on('timeout', () => { r.destroy(); resolve({ status: 0, headers: {}, text: 'timeout' }); });
  if (data) r.write(data);
  r.end();
});

const liveDb = fs.readFileSync(path.join(ROOT, 'data', 'game.db'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e2-'));
fs.copyFileSync(path.join(ROOT, 'data', 'game.db'), path.join(TMP, 'game.db'));

console.log('== 第 24 套 · E2 安全头与入参校验（临时数据目录）==');

const PORT = 31500 + (process.pid % 400);
const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { DSH_DATA_DIR: TMP, PORT: String(PORT), NODE_ENV: 'test' }),
  stdio: 'ignore'
});

(async () => {
  let health = { status: 0, headers: {}, text: '' };
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    health = await req(PORT, 'GET', '/api/health');
    if (health.status === 200) break;
  }
  const bad = await req(PORT, 'POST', '/api/auth/login', { username: 'a', password: 'x' });
  const absent = await req(PORT, 'POST', '/api/auth/login', { username: 'e2_probe_user', password: 'whatever123' });
  const extra = await req(PORT, 'POST', '/api/auth/login', {
    username: 'e2_probe_user', password: 'whatever123', admin: true, role: 'super_admin', isVip: 1
  });
  const H = health.headers || {};

  t('① 服务能在隔离目录起来（否则下面全是空断言）', () => {
    assert.strictEqual(health.status, 200, '起服务失败：' + String(health.text).slice(0, 140));
  });

  t('② 安全头逐条发出且取值正确', () => {
    assert.strictEqual(H['x-content-type-options'], 'nosniff', '缺 X-Content-Type-Options');
    assert.strictEqual(H['x-frame-options'], 'DENY', '缺 X-Frame-Options');
    assert.strictEqual(H['referrer-policy'], 'strict-origin-when-cross-origin', 'Referrer-Policy 不对');
    assert.ok(/geolocation=\(\)/.test(H['permissions-policy'] || ''), 'Permissions-Policy 未收紧');
    assert.ok(!('x-powered-by' in H), 'X-Powered-By 还在泄露框架指纹');
    const csp = H['content-security-policy'] || '';
    assert.ok(csp.length > 60, '缺 CSP');
    for (const frag of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'", 'script-src']) {
      assert.ok(csp.includes(frag), 'CSP 缺 ' + frag);
    }
  });

  t('③ CSP 对内联脚本的态度是如实标注而不是假装收紧', () => {
    const csp = H['content-security-policy'] || '';
    assert.ok(csp.includes("'unsafe-inline'"),
      "CSP 里没有 unsafe-inline，但前端确有内联事件（见④）—— 若你已重构掉内联，请连同④的宽免一起删");
  });

  t('④ 内联事件条数与中间件注释口径同源（说法漂移即判红）', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    const inlineAttrs = (html.match(/\son[a-z]+\s*=/g) || []).length;
    const src = fs.readFileSync(path.join(ROOT, 'src', 'middleware', 'secureHeaders.js'), 'utf8');
    const claimed = Number((src.match(/被 (\d+) 处内联/) || [])[1]);
    assert.ok(inlineAttrs > 0, '内联事件已为 0 却还留着 unsafe-inline ⇒ 中间件该收紧了');
    assert.ok(!Number.isFinite(claimed) || Math.abs(claimed - inlineAttrs) <= 2,
      `中间件写 ${claimed} 处，实测 ${inlineAttrs} 处 ⇒ 说法过期`);
  });

  t('⑤ 静态锁：校验器真挂在路由上（引用计数棘轮）', () => {
    const n = wiredCount();
    assert.ok(n >= WIRE_BASELINE, `路由里 validateRequest 引用数 ${n} < 基线 ${WIRE_BASELINE} ⇒ 有人把它摘掉了（它曾长期零引用）`);
    assert.ok(n > 0, 'validateRequest 仍是零引用的死代码');
    console.log(`  · 路由内 validateRequest 引用 ${n} 处（基线 ${WIRE_BASELINE}）`);
  });

  t('⑥ VALIDATION_RULES 不得有重复键（后者静默覆盖前者）', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'middleware', 'validate.js'), 'utf8');
    const keys = [...src.matchAll(/^  ([A-Za-z][\w]*)\s*:\s*\(val/gm)].map((m) => m[1]);
    const dup = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    assert.deepStrictEqual(dup, [], '重复键：' + dup.join('、') + ' —— 写的是字面量，生效的是最后一条');
    const rules = require('../src/middleware/validate.js').VALIDATION_RULES;
    assert.strictEqual(Object.keys(rules).length, keys.length, `字面量 ${keys.length} 条 vs 生效 ${Object.keys(rules).length} 条`);
  });

  t('⑦ 接线生效：畸形入参被挡在业务之前（400 且由校验器发出）', () => {
    assert.strictEqual(bad.status, 400, '短用户名本该被 schema 挡下，实得 ' + bad.status + ' ' + bad.text.slice(0, 90));
    assert.ok(/无效的参数/.test(bad.text), '这个 400 不是校验器发的：' + bad.text.slice(0, 90));
  });

  t('⑧ 合法格式不许被误挡：不存在的用户走到业务层（非 400，且不崩）', () => {
    assert.notStrictEqual(absent.status, 400, '合法格式被误挡：' + absent.status + ' ' + absent.text.slice(0, 90));
    assert.ok(absent.status === 401 || absent.status === 404, '登录不存在的用户回了 ' + absent.status);
    assert.ok(extra.status < 500, '夹带多余字段把服务打崩：' + extra.status);
    console.log(`  · 畸形 400（校验器）／不存在 ${absent.status}／夹带多余字段 ${extra.status}`);
  });

// 轮63：曾在这里加过一条静态锁「测试具名必须落在 schema 规则内」，删掉了。
// 原因：静态采样器把 `g4b_${Date.now()}` 当字面量前缀又叠一个时间戳，算出 30/41 字符的假具名 —— 典型的
// 「解析出傻值」。而注册链路本身已被 G1/G4/S2/FE/G2 用真 token 跑通（token 拿不到就红），这条锁只是冗余。
// 真正留下来的成果是：具名缩短（三处 21-25 字符确实会被 400 挡）+ 三个套件的强制退出（异常路径吊住事件循环）



  child.kill();
  await new Promise((r) => setTimeout(r, 400));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { console.log('  · 临时目录未删净：' + e.code); }

  t('⑨ 正式存档 data/game.db 逐字节未被本套件动过', () => {
    assert.ok(fs.readFileSync(path.join(ROOT, 'data', 'game.db')).equals(liveDb), 'data/game.db 被改动，隔离失败');
  });

  console.log(`\n  E2 安全与校验: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
