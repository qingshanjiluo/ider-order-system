/**
 * G9 · 聊天室 WebSocket 行为套件（轮96）
 * 起真 server.js（tmp 数据目录），用真 ws 客户端打四条产品裁决：
 *   坏票拒登 / 世界广播+落档 / 5秒8条限速 / 仙盟频道盟籍隔离（旁听洞封死）/ 私聊直达不落公共史。
 * spawn 姿势抄 test-skill-chain：stdio ignore + stderr 落文件（沙箱禁 pipe 捕获，吞错就查无此人）。
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const PORT = 3299;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g9-'));
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const live0 = fs.existsSync(LIVE_DB) ? { size: fs.statSync(LIVE_DB).size, mtime: fs.statSync(LIVE_DB).mtimeMs } : null;
const ERR_FD = fs.openSync(path.join(TMP, 'server-err.log'), 'w');

const results = [];
async function t(name, fn) {
  try { await fn(); results.push('  ✅ ' + name); }
  catch (e) { results.push('  ❌ ' + name + ': ' + e.message); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function call(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const headers = {};
    if (data) headers['content-type'] = 'application/json';
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) {} resolve({ code: rs.statusCode, body: j, raw: buf }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function reg(tag) {
  const u = 'g9' + tag + Date.now().toString(36).slice(-6);
  const r = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
  assert.strictEqual(r.code, 200, '注册失败 ' + r.raw);
  return { token: r.body.token, userId: r.body.userId };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/?token=' + encodeURIComponent(token));
    ws.got = [];
    ws.on('message', (d) => { try { ws.got.push(JSON.parse(d.toString())); } catch (e) {} });
    ws.on('error', reject);
    ws.on('open', () => resolve(ws));
    setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) reject(new Error('connect 超时')); }, 5000);
  });
}
const has = (ws, pred, ms) => new Promise((resolve) => {
  const iv = setInterval(() => {
    if (ws.got.some(pred)) { clearInterval(iv); resolve(true); }
  }, 50);
  setTimeout(() => { clearInterval(iv); resolve(ws.got.some(pred)); }, ms || 1500);
});

(async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, DSH_DATA_DIR: TMP, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'ignore', ERR_FD]
  });
  try {
    for (let i = 0; i < 40; i++) { await sleep(300); try { const h = await call('GET', '/api/health'); if (h.code === 200) break; } catch (e) {} }

    let A, B;
    await t('坏票拒登：无有效通行证的连接被服务端关闭', async () => {
      const bad = new WebSocket('ws://127.0.0.1:' + PORT + '/?token=garbage');
      const outcome = await new Promise((resolve) => {
        bad.on('close', () => resolve('close'));
        bad.on('error', () => { /* 紧随 close */ });
        setTimeout(() => resolve('hang'), 2500);
      });
      assert.strictEqual(outcome, 'close', '坏 token 连接未被关（拒登闸失效）');
    });

    await t('世界频道：广播直达 + /chat/history 落档', async () => {
      A = await reg('a'); B = await reg('b');
      const wa = await connect(A.token), wb = await connect(B.token);
      await has(wa, (m) => m.type === 'connected');
      wa.send(JSON.stringify({ type: 'chat', channel: 'world', content: 'G9HelloWorld' }));
      assert.ok(await has(wb, (m) => m.content === 'G9HelloWorld'), '世界广播没到 B');
      const h = await call('GET', '/api/chat/history?channel=world', null, B.token);
      assert.ok((h.body.messages || []).some((m) => m.content === 'G9HelloWorld'), '聊天未落档：' + h.raw);
      wa.close(); wb.close();
    });

    await t('限速：5 秒窗口第 9 条起吃 rate 通知（洪水不再白吃 DB 写）', async () => {
      const w = await connect(A.token);
      for (let i = 0; i < 12; i++) w.send(JSON.stringify({ type: 'chat', channel: 'world', content: 'burst' + i }));
      assert.ok(await has(w, (m) => m.type === 'rate', 2000), '连发 12 条无一被限：' + JSON.stringify(w.got.map((m) => m.type)));
      w.close();
    });

    await t('仙盟频道：盟籍隔离——外人 join 无效、收不到密谈，自家人可见', async () => {
      await call('POST', '/api/guild/token/claim', {}, A.token);
      const g = await call('POST', '/api/guild/create', { name: '文书盟' }, A.token);
      assert.strictEqual(g.code, 200, '建盟失败（后续测无法进行）：' + JSON.stringify(g.body));
      await sleep(300);
      const wa = await connect(A.token); // 重连以刷新 guildId（连接期计算）
      const wb = await connect(B.token);
      wa.send(JSON.stringify({ type: 'join_channel', channel: 'guild' }));
      wb.send(JSON.stringify({ type: 'join_channel', channel: 'guild' })); // 无盟籍者应被拒
      await sleep(250);
      wa.send(JSON.stringify({ type: 'chat', channel: 'guild', content: '密谋甲' }));
      await sleep(700);
      assert.ok(wa.got.some((m) => m.content === '密谋甲'), '盟内人自己都没收到');
      assert.ok(!wb.got.some((m) => m.content === '密谋甲'), 'B 旁听了仙盟密谈（隔离洞复发）');
      const hB = await call('GET', '/api/chat/history?channel=guild', null, B.token);
      assert.deepStrictEqual(hB.body.messages, [], '外人拉仙盟史竟然有货');
      wa.close(); wb.close();
    });

    await t('私聊 whisper：定向直达 + 回执 delivered + 公共史无痕', async () => {
      const wa = await connect(A.token), wb = await connect(B.token);
      await has(wb, (m) => m.type === 'connected');
      wa.send(JSON.stringify({ type: 'whisper', to: B.userId, content: '悄悄话G9' }));
      assert.ok(await has(wb, (m) => m.type === 'whisper' && m.content === '悄悄话G9'), 'B 没收到私聊');
      assert.ok(await has(wa, (m) => m.type === 'whisper' && m.delivered === true), 'A 无 delivered 回执');
      const h = await call('GET', '/api/chat/history?channel=world', null, B.token);
      assert.ok(!(h.body.messages || []).some((m) => (m.content || '').includes('悄悄话G9')), '私聊进了公共档案');
      wa.close(); wb.close();
    });

    await t('正式存档 data/game.db 未被本套件写动', () => {
      if (live0) {
        const now = fs.statSync(LIVE_DB);
        assert.strictEqual(now.size, live0.size, 'game.db 大小变了');
        assert.ok(Math.abs(now.mtime - live0.mtime) < 1, 'game.db 被摸过 mtime');
      }
    });
  } finally {
    child.kill();
    try { fs.closeSync(ERR_FD); } catch (e) {}
    const errLog = path.join(TMP, 'server-err.log');
    try { if (fs.existsSync(errLog) && fs.statSync(errLog).size > 0) console.log('  [server stderr]\n' + fs.readFileSync(errLog, 'utf8').slice(0, 600)); } catch (e) {}
    for (let i = 0; i < 12; i++) { try { fs.rmSync(TMP, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } } // Windows 杀进程后文件锁有延迟
  }
  const fails = results.filter((r) => r.startsWith('  ❌')).length;
  console.log(results.join('\n'));
  console.log(`\nG9 聊天WS: ${results.length - fails} 通过, ${fails} 失败`);
  process.exit(fails ? 1 : 0);
})();
