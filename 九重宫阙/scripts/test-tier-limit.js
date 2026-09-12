/**
 * E2 · 分层限流回归测试（进程内 express，不占固定端口）
 * 反证要点：未超阈值必须全过；超阈值必须 429 且带 Retry-After；/api/health 永不被限；
 * 不同前缀互不影响（AI 被打满不应连带坊市）。
 */
const assert = require('assert');
const http = require('http');
const express = require('express');
const tierLimit = require('../src/middleware/tierLimit');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};

(async () => {
  console.log('== E2 · 分层限流 ==');
  const app = express();
  app.use(tierLimit);
  app.get('/api/ai/narrate', (req, res) => res.json({ ok: 1 }));
  app.get('/api/shop/list', (req, res) => res.json({ ok: 1 }));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/unlisted', (req, res) => res.json({ ok: 1 }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;

  const hit = (path) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (rs) => {
      rs.resume();
      resolve({ code: rs.statusCode, retry: rs.headers['retry-after'], remaining: rs.headers['x-ratelimit-remaining'] });
    }).on('error', reject);
  });

  await t('阈值内全过，越界即 429 且带 Retry-After', async () => {
    tierLimit.reset();
    const ai = tierLimit._tiers.find((x) => x.prefix === '/api/ai/');
    const codes = [];
    for (let i = 0; i < ai.max + 2; i++) codes.push((await hit('/api/ai/narrate')).code);
    assert.ok(codes.slice(0, ai.max).every((c) => c === 200), '阈值内被误限');
    assert.ok(codes.slice(ai.max).every((c) => c === 429), '超限未拦截：' + codes.join(','));
    const over = await hit('/api/ai/narrate');
    assert.ok(Number(over.retry) >= 1, '缺少 Retry-After');
  });

  await t('前缀互不影响：AI 打满后坊市仍可用', async () => {
    const shop = await hit('/api/shop/list');
    assert.strictEqual(shop.code, 200, `坊市被连带限流：${shop.code}`);
  });

  await t('健康探针永不被限（监控不能瞎）', async () => {
    for (let i = 0; i < 300; i++) await hit('/api/health');
    assert.strictEqual((await hit('/api/health')).code, 200);
  });

  await t('未列出前缀交由全局限流兜底（本层不拦）', async () => {
    tierLimit.reset();
    for (let i = 0; i < 40; i++) await hit('/api/unlisted');
    assert.strictEqual((await hit('/api/unlisted')).code, 200);
  });

  await t('Remaining 头随请求递减（前端可自检）', async () => {
    tierLimit.reset();
    const a = await hit('/api/shop/list');
    const b = await hit('/api/shop/list');
    const shop = tierLimit._tiers.find((x) => x.prefix === '/api/shop/');
    assert.strictEqual(Number(a.remaining), shop.max - 1);
    assert.strictEqual(Number(b.remaining), shop.max - 2);
  });

  server.close();
  console.log(`\nE2 限流测试: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
