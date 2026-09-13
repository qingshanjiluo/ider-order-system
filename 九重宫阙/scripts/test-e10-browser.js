/**
 * 第 26 套 · E10 真浏览器渲染闭环（轮68）
 *
 * 补的是清单上挂了很久的一条自白：`test-fe-render-smoke.js`（第 16 套）自己写明
 * "它不是 Playwright：没有布局、没有 CSS、没有真实事件循环" —— 它用 vm + 假 DOM 跑前端函数，
 * 能证明函数逻辑，却证明不了"浏览器真能把这个包跑起来"。E10 要的就是后者。
 *
 * 零新依赖：本机装有 Edge / Chrome，用 `--headless --dump-dom` 取**真渲染后的 DOM**。
 * 三个坑全是本轮实测踩到的：
 *   1) msedge.exe / chrome.exe 是 GUI 子系统程序，PowerShell 的 `>` 接不住它的 stdout
 *      （现象：退出码为空、文件 0 字节）。⇒ 一律 node spawnSync + **文件句柄** stdio。
 *   2) 不给独立 `--user-data-dir` 时，无头实例可能挂到桌面上已开着的浏览器上，不可复现甚至挂住。
 *   3) 起服务必须用**绝对路径** spawn：`spawn(node, ['server.js'], {cwd: ROOT})` 在这台机器上
 *      表现为子进程活着、stdout/stderr 两个文件都空、端口永远 ECONNREFUSED —— 因为 ROOT 含中文，
 *      相对解析不可靠。第 25 套一直用 path.join(ROOT,'server.js')，照它抄。
 *      另外实测本机服务约 5 秒才 ready，轮询窗口给到 20 秒，别把"慢"当成"起不来"。
 *
 * 判据的敏感性（轮68 实测）：原始 index.html 的 `<input>` 6 个 / 14831 字节，浏览器渲染后
 * 8 个 / 15326 字节 —— 多出来那段来自 app.js 执行。本套件不写死数字：每次现场抓原始 HTML
 * 做差分，并额外跑一次**禁用 JS**（--blink-settings=scriptEnabled=false）作负向对照。
 * 实测禁用 JS 时 input 数直接掉到 0（比原始 6 还少：无脚本时 Edge 连静态视图都不完整），
 * 所以对照的判据是"JS 开 > JS 关"且"JS 开 > 原始"，只证明**DOM 依赖 JS 执行**这一件事；
 * 不去主张"关掉 JS 就等于原始 HTML"——那与实测不符，写出来就是假话。
 *
 * 找不到内核 ⇒ 判红而不是判绿：宁可说"这台机器没测成"，也不把没验证的事写成通过。
 * 同时把度量落进 scripts/.e10-state.json，清单的 E10 行据此如实表述。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const liveBefore = fs.readFileSync(LIVE_DB);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e10-'));
const STATE_FILE = path.join(__dirname, '.e10-state.json');
const SERVER_JS = path.join(ROOT, 'server.js');   // 坑 3：绝对路径
const PORT = 31800 + (process.pid % 180);         // 与第 25 套错开区间
const DATA_DIR = path.join(TMP, 'data');

const BROWSERS = [
  { name: 'edge', bin: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'edge64', bin: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'chrome', bin: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'chrome86', bin: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' }
];

let pass = 0, fail = 0, crashed = false;
let CHILD = null, ERRF = null;
function t(label, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') throw new Error('t() 回调不得返回 Promise（异步失败会溜掉），请先 await 再断言');
    pass++;
    console.log('  ✅ ' + label);
  } catch (e) {
    fail++;
    console.log('  ❌ ' + label + ': ' + (e && e.message ? String(e.message).split('\n')[0] : String(e)));
  }
}
function killChild() {
  if (CHILD && CHILD.exitCode === null) { try { CHILD.kill(); } catch (e) {} }
}
function md5Of(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').toUpperCase(); }
function finish(baseCode) {
  killChild();
  let code = baseCode;
  let touched = false;
  try { touched = !fs.readFileSync(LIVE_DB).equals(liveBefore); } catch (e) { touched = true; }
  if (touched) { console.log('  ❌ 正式存档被改动，隔离失败（强制判红）'); code = 1; }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log('\n  正式存档 MD5 = ' + md5Of(LIVE_DB) + '（基线 864715332020DF16C3EA5185F3C369F5）');
  process.exitCode = code;
}
function getOnce(p, port) {
  return new Promise((resolve, reject) => {
    const rq = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', timeout: 4000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: body }));
      // 响应流自己的 error 必须单独挂：req.on('error') 管不到"头已收到、读 body 时被 reset"
      res.on('error', reject);
    });
    rq.on('error', reject);
    rq.on('timeout', () => rq.destroy(new Error('超时')));
    rq.end();
  });
}
// 浏览器同时在拉这个服务，瞬时 ECONNRESET/EPIPE 属正常抖动 ⇒ 有界重试；重试后仍失败才抛出
async function get(p, port, tries) {
  const n = tries == null ? 5 : tries;
  let last = null;
  for (let i = 0; i < n; i++) {
    try { return await getOnce(p, port); }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 400)); }
  }
  throw last;
}
function tailErr() {
  try {
    if (!ERRF || !fs.existsSync(ERRF)) return '(无 stderr 文件)';
    const s = fs.readFileSync(ERRF, 'utf8').trim().split('\n');
    return s.slice(-8).join(' | ').slice(0, 500) || '(stderr 为空)';
  } catch (e) { return '(读 stderr 失败)'; }
}
function startServer() {
  return new Promise((resolve, reject) => {
    ERRF = path.join(TMP, 'server.err');
    const eo = fs.openSync(ERRF, 'a');
    const base = PORT;
    let attempt = 0;
    const launch = () => {
      const port = base + attempt;
      const child = spawn(process.execPath, [SERVER_JS], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { DSH_DATA_DIR: DATA_DIR, PORT: String(port), NODE_ENV: 'test' }),
        stdio: ['ignore', 'ignore', eo]   // stderr 落文件：'ignore' 会把"为什么起不来"整个吞掉
      });
      CHILD = child;
      let settled = false;
      const nextPort = (why) => {
        if (settled) return;
        settled = true;
        attempt++;
        if (attempt >= 4) { reject(new Error('连续 4 个端口起不来（起点 ' + base + '）。stderr：' + tailErr() + '；末次原因：' + why)); return; }
        console.log('  · 第 ' + attempt + ' 次起服务失败（端口 ' + port + '）：' + String(why).slice(0, 200) + ' ⇒ 换端口重试');
        launch();
      };
      child.once('exit', (code, sig) => nextPort('子进程退出 code=' + code + ' sig=' + sig));
      const deadline = Date.now() + 25000;   // 实测本机约 5 秒 ready，给足余量
      const poll = () => {
        if (settled) return;
        get('/api/health', port).then((r) => {
          if (r.status === 200) { settled = true; resolve({ port, child }); }
          else if (Date.now() > deadline) nextPort('health 一直回 ' + r.status);
          else setTimeout(poll, 500);
        }).catch((e) => {
          if (Date.now() > deadline) nextPort('25 秒内连不上 127.0.0.1:' + port + '（' + (e && e.code) + '）');
          else setTimeout(poll, 500);
        });
      };
      poll();
    };
    launch();
  });
}
/** 用无头内核把 url 渲染成 DOM 写进 outfile */
function render(bin, url, outfile, disableJs) {
  const prof = path.join(TMP, 'profile-' + Date.now() + '-' + Math.floor(Math.random() * 1e4));
  fs.mkdirSync(prof, { recursive: true });
  const args = [
    '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--disable-dev-shm-usage',
    '--user-data-dir=' + prof,
    '--virtual-time-budget=8000'
  ];
  if (disableJs) args.push('--blink-settings=scriptEnabled=false');
  args.push('--dump-dom', url);
  const fd = fs.openSync(outfile, 'w');
  const efe = fs.openSync(outfile + '.err', 'w');
  const r = spawnSync(bin, args, { stdio: ['ignore', fd, efe], timeout: 90000 });
  fs.closeSync(fd);
  fs.closeSync(efe);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  return { status: r.status, signal: r.signal, errCode: r.error ? r.error.code : null };
}
const countOf = (text, needle) => (text ? text.split(needle).length - 1 : 0);

(async () => {
  console.log('== 第 26 套 · E10 真浏览器渲染（临时数据目录 ' + path.basename(TMP) + '）==');
  // 先铺副本，再让本进程指向它：反过来会让 store 在空目录上先建一个空库
  fs.cpSync(path.join(ROOT, 'data'), DATA_DIR, { recursive: true });
  process.env.DSH_DATA_DIR = DATA_DIR;
  const dbApi = require('../src/database');   // 必须晚于上面的赋值与铺副本

  let avail = null;
  for (const b of BROWSERS) { if (fs.existsSync(b.bin)) { avail = b; break; } }
  let kernel = 'none';
  if (avail) {
    // Windows 上 msedge/chrome 的 --version 不打印版本号（实测那句 GBK 中文是"已在会话中打开"），
    // 而内核真正的版本在 Application 下的同级版本目录里 ⇒ 从目录名取，零进程、与码页无关。
    let ver = '';
    try {
      const dir = path.dirname(avail.bin);
      ver = fs.readdirSync(dir).filter((d) => /^\d+(\.\d+){3}$/.test(d)).sort().pop() || '';
    } catch (e) { ver = ''; }
    kernel = avail.name + (ver ? ' ' + ver : ' (版本未取到)');
  }
  const srv = await startServer();
  const raw = await get('/', srv.port);
  const url = 'http://127.0.0.1:' + srv.port + '/';

  let domOn = '', domOff = '', onRes = null, offRes = null;
  if (avail) {
    const onP = path.join(TMP, 'dom-on.html'), offP = path.join(TMP, 'dom-off.html');
    onRes = render(avail.bin, url, onP, false);
    offRes = render(avail.bin, url, offP, true);
    if (onRes.status === 0 && fs.existsSync(onP)) domOn = fs.readFileSync(onP, 'utf8');
    if (offRes.status === 0 && fs.existsSync(offP)) domOff = fs.readFileSync(offP, 'utf8');
  }
  const healthAfter = await get('/api/health', srv.port);
  const chars = dbApi.loadDatabase().characters || [];

  t('① 本机存在可用无头内核并记录版本（找不到即判红，不把没测的写成通过）', () => {
    if (!avail) throw new Error('未找到 Edge/Chrome 二进制');
    if (!kernel || kernel === 'none') throw new Error('内核名未记录');
    console.log('  · 内核 = ' + kernel);
  });
  t('② 首页由服务端经 HTTP 给出（浏览器加载的是真响应，不是读盘）', () => {
    if (raw.status !== 200) throw new Error('首页 HTTP ' + raw.status);
    if (raw.text.indexOf('<html') < 0) throw new Error('首页不是 HTML');
  });
  t('③ 真浏览器执行了前端包：渲染后的 DOM 严格大于服务端原始 HTML', () => {
    if (!avail) throw new Error('无内核，未执行');
    if (onRes.status !== 0) throw new Error('内核退出码 ' + onRes.status + ' signal=' + onRes.signal + ' err=' + onRes.errCode);
    if (!domOn) throw new Error('DOM 为空');
    if (domOn.length <= raw.text.length + 200) {
      throw new Error('渲染后 ' + domOn.length + ' 字节 vs 原始 ' + raw.text.length + ' 字节 ⇒ 看不出 JS 加过东西');
    }
  });
  t('④ 内置负向对照：关掉 JS 后 input 数回落（证明 ③ 的差分真来自 JS 执行）', () => {
    if (!avail) throw new Error('无内核，未执行');
    if (offRes.status !== 0) throw new Error('禁用 JS 那次退出码 ' + offRes.status + '，对照不成立');
    const rawI = countOf(raw.text, '<input');
    const onI = countOf(domOn, '<input');
    const offI = countOf(domOff, '<input');
    if (onI <= rawI) throw new Error('JS 开时 input ' + onI + ' 未超过原始 ' + rawI + ' ⇒ ③ 只是字节噪声');
    if (offI >= onI) throw new Error('禁用 JS 后 input 仍是 ' + offI + '（开启时 ' + onI + '）⇒ 差分不是 JS 造出来的，判据不成立');
    console.log('  · input：原始 ' + rawI + ' / JS 开 ' + onI + ' / JS 关 ' + offI + '   字节：' + raw.text.length + ' → ' + domOn.length);
  });
  t('⑤ 未登录的浏览器视图不泄漏角色数据（一个角色名都不该出现）', () => {
    if (!avail) throw new Error('无内核，未执行');
    if (!domOn) throw new Error('DOM 为空');
    const names = chars.slice(0, 40).map((c) => String(c.name || ''));
    const hit = names.filter((n) => n.length >= 2 && domOn.indexOf(n) >= 0);
    if (hit.length) throw new Error('未登录渲染结果里出现角色名：' + hit.slice(0, 3).join('、'));
  });
  t('⑥ 两次渲染之后服务仍活着（浏览器不会把后端拖死）', () => {
    if (healthAfter.status !== 200) throw new Error('渲染后 health 回了 ' + healthAfter.status);
  });

  const state = {
    ran: !!avail,
    kernel: kernel,
    url: avail ? url : null,
    raw_bytes: raw.text.length,
    dom_bytes: domOn.length,
    inputs_raw: countOf(raw.text, '<input'),
    inputs_js_on: countOf(domOn, '<input'),
    inputs_js_off: countOf(domOff, '<input'),
    at: new Date().toISOString()
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  t('⑦ 度量落进 scripts/.e10-state.json（清单 E10 行据此表述，不靠口头宣称）', () => {
    const back = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (typeof back.ran !== 'boolean') throw new Error('状态文件缺 ran');
    if (back.ran && !back.dom_bytes) throw new Error('ran=true 却没记到 DOM 字节数');
    console.log('  · ' + JSON.stringify(back).slice(0, 170));
  });

  console.log('\nE10 真浏览器: ' + pass + ' 通过, ' + fail + ' 失败');
  finish((fail || crashed) ? 1 : 0);
})().catch((e) => {
  crashed = true;
  fail++;
  console.log('💥 套件异常: ' + (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : String(e)));
  finish(1);
});
