/**
 * S1 · 入口 boot 探针（轮48）
 *
 * 为什么要有这个文件：轮40 的提交 bfc4541 在 server.js 里插进了两行一模一样的
 * `const tribulationRoutes = require('./src/routes/tribulation')` —— 重复声明 = SyntaxError =
 * **后端入口整整 7 轮无法启动**，而这段时间里 `npm test` 从 244 涨到 283 全绿。
 * 原因是所有套件都自己 new 一个 express 再手动挂路由，没有任何进程真的执行过 server.js。
 *
 * 本探针就是补上这一层：在 game.db 的**临时隔离副本**上把真实入口 require 起来（同进程，避免
 * Windows 沙箱下 spawn 捕获子进程 stdio 的 EPERM 限制），然后用 HTTP 打真实中间件栈：
 *   health 200 / 未登录 401 / 未知 API 路径 404 JSON（不是 SPA HTML）/ 静态页 200。
 * 正式存档 data/game.db 逐字节不得动（末尾体积 + mtime 双检）。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

// 隔离：把存档拷进临时目录，让 boot 的内容管线与 autosave 全部落在副本上
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-boot-probe-'));
if (liveBefore) fs.copyFileSync(LIVE_DB, path.join(TMP, 'game.db'));
process.env.DSH_DATA_DIR = TMP;
const PORT = 20000 + Math.floor(Math.random() * 9000);
process.env.PORT = String(PORT);

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

const get = (p) => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'GET' }, (rs) => {
    let b = '';
    rs.on('data', (c) => { b += c; });
    rs.on('end', () => resolve({ code: rs.statusCode, body: b, type: rs.headers['content-type'] || '' }));
  });
  r.on('error', (e) => resolve({ code: 'ERR', body: e.code, type: '' }));
  r.end();
});

(async () => {
  console.log('== S1 · 入口 boot 探针（真 server.js + 隔离副本）==');

  let booted = null, bootErr = null;
  try {
    require(path.join(ROOT, 'server.js'));      // 这一步本身就会把"入口起不来"变成套件红
    booted = true;
  } catch (e) {
    bootErr = e;
  }
  await t('server.js 能被 require 并启动（轮40~47 的静默 SyntaxError 不得复发）', () => {
    assert.ok(booted, `入口启动失败：${bootErr && bootErr.message}`);
  });

  if (!booted) { finish(); return; }

  let health = null;
  for (let i = 0; i < 40; i++) {
    health = await get('/api/health');
    if (health.code === 200) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await t('GET /api/health 返回 200 且带服务标识（真实中间件栈全通）', () => {
    assert.strictEqual(health.code, 200, `health 不是 200：${health.code} ${String(health.body).slice(0, 120)}`);
    const j = JSON.parse(health.body);
    assert.strictEqual(j.ok, true, 'health.ok 不为 true');
    assert.ok(j.service, 'health 里没有 service 字段');
  });
  await t('受保护端点未登录一律 401 JSON（而不是 500、403 或 HTML）', async () => {
    for (const p of ['/api/friend/list', '/api/market/prices', '/api/gongfa', '/api/skill/all', '/api/character']) {
      const r = await get(p);
      assert.strictEqual(r.code, 401, `${p} 未登录应 401，实得 ${r.code} ${String(r.body).slice(0, 80)}`);
      assert.ok(/application\/json/.test(r.type), `${p} 的 401 不是 JSON：${r.type}`);
    }
  });
  await t('未知 API 路径返回 404 JSON，绝不回落到 SPA HTML（章程 E10 前置条件）', async () => {
    const r = await get('/api/definitely/not/a/route');
    assert.strictEqual(r.code, 404, `未知 API 应 404，实得 ${r.code}`);
    assert.ok(/application\/json/.test(r.type), `未知 API 回落成了 HTML（前端会把 404 当 JSON 解析炸掉）：${r.type}`);
  });
  await t('静态入口 index.html 可取（前端与 API 同源可用）', async () => {
    const r = await get('/');
    assert.strictEqual(r.code, 200, `首页应 200，实得 ${r.code}`);
    assert.ok(/<html|<!doctype/i.test(r.body), '首页返回的不是 HTML');
  });

  await new Promise((r) => setTimeout(r, 200));
  await t('正式存档 data/game.db 未被探针写动（只写临时副本）', () => {
    if (!liveBefore) { assert.ok(true); return; }
    const after = fs.statSync(LIVE_DB);
    assert.strictEqual(after.size, liveBefore.size, `正式存档体积变化 ${liveBefore.size} -> ${after.size}`);
    assert.strictEqual(after.mtimeMs, liveBefore.mtimeMs, '正式存档 mtime 变化（探针写到正式档了）');
  });

  finish();
})().catch((e) => {
  console.error('S1 探针异常：', e && e.stack ? e.stack : e);
  fail++;
  finish();
});

function finish() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  console.log(`\nS1 入口探针: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  // server.js 会留下 watch/interval 句柄，探针必须主动结束而不是等事件循环空掉
  setTimeout(() => process.exit(fail ? 1 : 0), 300).unref();
}
