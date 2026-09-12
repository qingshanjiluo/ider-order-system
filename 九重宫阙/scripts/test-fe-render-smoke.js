/**
 * S3 · 无浏览器 DOM 渲染冒烟（P3 收尾 · 轮51）
 *
 * 为什么要有这一套：轮49/50 把覆盖率测到"玩家可点 167 条"，但那是**静态判定** ——
 * 它只证明路径被界面代码引用，不证明 `loadXxxTab()` 真跑起来能渲染出东西。
 * 本套件用一个极简 DOM 垫片 + node 的 vm，真的把前端脚本当浏览器脚本执行，
 * 然后按 index.html 里**真实存在**的页签逐个调用 loadTabContent()，对着**真起来的后端**取数并渲染。
 * 它能抓到只有"真跑一遍"才能抓到的那一类错误：模板引用未定义变量、按钮指向不存在的函数、
 * 后端字段少一个就整页抛异常。（首跑就抓到 handleLogout 未定义，见 test 清单。）
 *
 * 它不是 Playwright：没有布局、没有 CSS、没有真实事件循环，也不会执行浏览器内建行为。
 * 所以断言只压硬事实 —— 不抛异常、渲染出非空 HTML、文本里不泄漏 undefined/NaN/[object Object]（按基线棘轮）。
 *
 * 只写 DSH_DATA_DIR 临时目录；正式存档逐字节不得动。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-fe-smoke-'));
process.env.DSH_DATA_DIR = TMP;
process.env.PORT = String(21000 + Math.floor(Math.random() * 900));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-secret-not-for-prod';

const LIVE_DB = path.join(ROOT, 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
// 只加载 index.html **真的引用**的脚本：这既是浏览器的事实，也顺手把"磁盘上有但页面从不加载"的孤档暴露出来
const SCRIPTS = [...new Set([...INDEX_HTML.matchAll(/src="js\/([\w.-]+\.js)"/g)].map((m) => m[1]))];
const TABS = [...new Set([...INDEX_HTML.matchAll(/data-tab="([a-z-]+)"/g)].map((m) => m[1]))].filter((x) => x !== 'admin');
// 泄漏面基线：历史遗留允许存在，但只许降不许升（新代码引入 undefined 会被这条咬住）
const LEAK_BASELINE = Number(process.env.DSH_SMOKE_LEAK_BASELINE || 0);
const ORPHAN_BASELINE = Number(process.env.DSH_SMOKE_ORPHAN_BASELINE || 2);

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};

// ---------- 极简 DOM 垫片（够渲染，不够布局） ----------
function makeEl(id) {
  return {
    id: id || '', innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    style: {}, dataset: {}, children: [], parentNode: null, offsetWidth: 100, scrollTop: 0, scrollHeight: 0,
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; },
    insertBefore(c) { this.children.push(c); return c; }, remove() { },
    querySelector() { return makeEl('qs'); }, querySelectorAll() { return []; },
    setAttribute(k, v) { if (k === 'id') this.id = v; }, getAttribute() { return null; }, hasAttribute() { return false; },
    focus() { }, blur() { }, click() { }, scrollIntoView() { }, select() { }, submit() { },
    insertAdjacentHTML(pos, h) { this.innerHTML += h; },
    closest() { return null; }, contains() { return false; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 40, bottom: 40, right: 100 }; },
    cloneNode() { return makeEl(this.id); }
  };
}

function makeDocument() {
  const byId = new Map();
  return {
    readyState: 'complete', title: '九重宫阙', _byId: byId,
    getElementById(id) { if (!byId.has(id)) byId.set(id, makeEl(id)); return byId.get(id); },
    querySelector(sel) { return makeEl(sel); }, querySelectorAll() { return []; },
    createElement(tag) { return makeEl('dyn_' + tag); }, createTextNode(s) { return { textContent: s }; },
    createDocumentFragment() { return makeEl('frag'); },
    addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html')
  };
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(), key: (i) => [...m.keys()][i] || null,
    get length() { return m.size; }, _map: m
  };
}

function leakKinds(html) {
  const out = [];
  if (/undefined/.test(html)) out.push('undefined');
  if (/NaN/.test(html)) out.push('NaN');
  if (/\[object Object\]/.test(html)) out.push('[object Object]');
  if (/\$\{/.test(html)) out.push('未插值的 ${…}');
  return out;
}
// 把泄漏点连人话一起打出来，免得只报"有 undefined"却无从下手
function leakContext(html) {
  const i = html.search(/undefined|NaN|\[object Object\]/);
  if (i < 0) return '';
  return html.slice(Math.max(0, i - 70), i + 40).replace(/\s+/g, ' ');
}

(async () => {
  console.log('== S3 · 无浏览器 DOM 渲染冒烟（真起后端 + 真跑前端脚本）==');

  const { loadDatabase, closeDatabase } = require(path.join(ROOT, 'src', 'database'));
  loadDatabase();
  require(path.join(ROOT, 'server.js'));
  await new Promise((r) => setTimeout(r, 350));
  const origin = `http://127.0.0.1:${process.env.PORT}`;

  const rawCall = (method, p, body, token) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    if (data) headers['content-length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: Number(process.env.PORT), path: p, method, headers }, (rs) => {
      let buf = '';
      rs.on('data', (c) => { buf += c; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ code: rs.statusCode, body: j, raw: buf.slice(0, 240) }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  const uname = `smoke_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
  const reg = await rawCall('POST', '/api/auth/register', { username: uname, password: 'pw-dummy-123', nickname: uname, faction: 'martial' });
  assert.ok(reg.code === 200 && reg.body && reg.body.token, '注册失败：' + reg.code + ' ' + reg.raw);
  const db0 = loadDatabase();
  const uid = db0.users.find((x) => x.username === uname).id;
  const myChar = db0.characters.find((c) => Number(c.user_id) === Number(uid));

  // ---------- 装前端脚本（顺序同 index.html） ----------
  const doc = makeDocument();
  const ls = makeStorage();
  ls.setItem('token', reg.body.token);
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    fetch: (u, o) => fetch(String(u).startsWith('http') ? u : origin + String(u), o),
    AbortController, TextEncoder, TextDecoder, URL, URLSearchParams,
    localStorage: ls, sessionStorage: makeStorage(),
    document: doc,
    location: { href: origin + '/', origin, pathname: '/', search: '', hash: '', protocol: 'http:', host: `127.0.0.1:${process.env.PORT}`, assign() { }, reload() { }, replace() { } },
    navigator: { userAgent: 'dsh-smoke', onLine: true, clipboard: { writeText: () => Promise.resolve() } },
    screen: { width: 1280, height: 800 }, innerWidth: 1280, innerHeight: 800,
    alert() { }, confirm: () => true, prompt: () => null,
    addEventListener() { }, removeEventListener() { },
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0), cancelAnimationFrame() { },
    matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } }),
    WebSocket: function WebSocket() { this.close = () => { }; this.send = () => { }; this.addEventListener = () => { }; },
    EventSource: function EventSource() { this.close = () => { }; this.addEventListener = () => { }; },
    IntersectionObserver: function IntersectionObserver() { this.observe = () => { }; this.unobserve = () => { }; this.disconnect = () => { }; },
    ResizeObserver: function ResizeObserver() { this.observe = () => { }; this.disconnect = () => { }; },
    Chart: function Chart() { this.destroy = () => { }; this.update = () => { }; },
    performance: { now: () => Date.now() }
  };
  // 浮空 Promise 探测：轮51 首次运行就是在套件收尾后蹦出 "Error: 角色不存在" 未捕获拒绝
  // （前端 setTimeout 里三个 fire-and-forget 调用），node 会因此非零退出 —— 浏览器里同样会喷控制台。
  // 这里显式收集，稍后作为一条断言，并把这类缺陷永久钉死在门禁里。
  const unhandled = [];
  process.on('unhandledRejection', (e) => { unhandled.push(String((e && e.message) || e)); });
  const timers = new Set();
  const _st = setTimeout, _si = setInterval;
  sandbox.setTimeout = (cb, ms, ...a) => { const id = _st(cb, ms, ...a); timers.add(id); return id; };
  sandbox.setInterval = (cb, ms, ...a) => { const id = _si(cb, ms, ...a); timers.add(id); return id; };
  sandbox.clearTimeout = (id) => { timers.delete(id); clearTimeout(id); };
  sandbox.clearInterval = (id) => { timers.delete(id); clearInterval(id); };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const loaded = [];
  for (const f of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', f), 'utf8'), ctx, { filename: 'public/js/' + f });
    loaded.push(f);
  }
  const tab = (id) => ((doc._byId.get(id) || {}).innerHTML || '');

  await t(`index.html 引用的 ${SCRIPTS.length} 个脚本在无浏览器环境下可装载执行`, () => {
    assert.deepStrictEqual(loaded, SCRIPTS, '装载清单与页面引用不一致');
    assert.strictEqual(vm.runInContext('typeof api', ctx), 'object', 'api 全局不存在');
    assert.strictEqual(vm.runInContext('typeof ui', ctx), 'object', 'ui 全局不存在');
    assert.strictEqual(vm.runInContext('typeof loadTabContent', ctx), 'function', 'loadTabContent 不存在');
  });

  await t('public/js 下不得有越来越多"磁盘上有、页面从不加载"的孤档', () => {
    const onDisk = fs.readdirSync(path.join(ROOT, 'public', 'js')).filter((f) => f.endsWith('.js'));
    const orphans = onDisk.filter((f) => !SCRIPTS.includes(f));
    if (orphans.length) console.log(`  ℹ 孤档（未被 index.html 加载）：${orphans.join(', ')}`);
    assert.ok(orphans.length <= ORPHAN_BASELINE,
      `孤档从 ${ORPHAN_BASELINE} 涨到 ${orphans.length}：${orphans.join(', ')}（放在 public/js 里但不被页面加载 = 死代码，且会骗过按文件扫描的工具）`);
  });

  await t(`${TABS.length} 个玩家页签都有 data-tab 导航与 loadTabContent 分支对应`, () => {
    const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    const missing = TABS.filter((x) => !new RegExp(`case '${x}':`).test(app));
    assert.deepStrictEqual(missing, [], `导航有页签但 switch 没有分支（点了是空白）：${missing.join(', ')}`);
  });

  const broken = [], thin = [], leaky = [];
  for (const name of TABS) {
    try {
      doc._byId.delete('tab-content');
      await vm.runInContext(`loadTabContent(${JSON.stringify(name)})`, ctx);
      const out = tab('tab-content');
      if (out.trim().length < 30) thin.push(`${name}(${out.trim().length}B)`);
      const lk = leakKinds(out);
      if (lk.length) { leaky.push(name); console.log(`  ⚠ 页签 ${name} 渲染泄漏 ${lk.join('/')} → …${leakContext(out)}…`); }
    } catch (e) {
      broken.push(`${name}: ${e && e.message ? String(e.message).slice(0, 140) : e}`);
    }
  }

  await t('每个页签渲染都不得抛异常', () => {
    assert.deepStrictEqual(broken, [], `抛异常的页签：\n    ${broken.join('\n    ')}`);
  });
  await t('每个页签必须渲染出实质内容（不许空白页）', () => {
    assert.deepStrictEqual(thin, [], `内容过薄/空白的页签：${thin.join(', ')}`);
  });
  await t(`渲染文本不得泄漏 undefined/NaN/[object Object]（基线 ${LEAK_BASELINE} 个页签）`, () => {
    assert.ok(leaky.length <= LEAK_BASELINE,
      `泄漏页签从 ${LEAK_BASELINE} 涨到 ${leaky.length}：${leaky.join(', ')}`);
  });

  await t('好友面板真点击链路（渲染 → 搜索 → 申请 → 面板刷新）', async () => {
    const rival = `smokeb_${Date.now() % 100000}`;
    const r2 = await rawCall('POST', '/api/auth/register', { username: rival, password: 'pw-dummy-123', nickname: rival, faction: 'magic' });
    assert.ok(r2.code === 200, '第二个角色注册失败：' + r2.code + ' ' + r2.raw);
    const db = loadDatabase();
    const ch2 = db.characters.find((c) => Number(c.user_id) === Number(db.users.find((x) => x.username === rival).id));

    doc._byId.delete('tab-content');
    await vm.runInContext(`loadTabContent('friend')`, ctx);
    const panel = tab('tab-content');
    assert.ok(/道友往来/.test(panel), '好友面板没渲染抬头：' + panel.slice(0, 120));
    assert.ok(/friend-kw/.test(panel), '搜索框不见了');
    assert.ok(/我的好友（0\/50）/.test(panel), '新角色好友数不是 0/50：' + (panel.match(/我的好友[^<]*/) || [''])[0]);

    doc.getElementById('friend-kw').value = ch2.name;   // 浏览器里输入框是渲染后就存在的实体
    await vm.runInContext(`handleFriendSearch()`, ctx);
    const res = tab('friend-search');
    assert.ok(/申请/.test(res), `搜索对方道号后没有申请按钮：${res.slice(0, 180)}`);
    assert.ok(res.includes(ch2.name), '搜索结果里没有对方道号');

    await vm.runInContext(`handleFriendRequest(${JSON.stringify(String(ch2.id))})`, ctx);
    const pend = (loadDatabase().friends || []).filter((f) => f.status === 'pending');
    assert.strictEqual(pend.length, 1, `发出申请后 pending 行数应 1，实际 ${pend.length}`);
    assert.ok(pend[0].character_id !== Number(ch2.id), '申请行把对方写成了发起方');

    doc._byId.delete('tab-content');
    await vm.runInContext(`loadTabContent('friend')`, ctx);
    assert.ok(/我发出的申请（1）/.test(tab('tab-content')), '面板没刷出"我发出的申请（1）"');
  });

  await t('突破面板真渲染（概率构成 + 契机丹 + 失败折寿都进了 DOM）', async () => {
    doc._byId.delete('tab-content');
    await vm.runInContext(`loadTabContent('cultivation')`, ctx);
    const out = tab('tab-content');
    assert.ok(/突破判定（与服务端结算同源）/.test(out), '没有突破判定区块');
    assert.ok(/境界基础/.test(out), '概率构成没有渲染出来');
    assert.ok(/契机丹持有 <b>\d+<\/b> 枚/.test(out), '契机丹枚数没渲染');
    assert.ok(/折寿 <b>\d+<\/b> 年/.test(out), '失败折寿预告没渲染');
    assert.ok(/心魔升至 \d+ 层/.test(out), '心魔预告没渲染');
  });

  await t('技能页总槽位 n/N 真的画出来（P3 第二条 · 子页容器也算）', async () => {
    doc._byId.delete('tab-content');
    await vm.runInContext(`loadTabContent('skill')`, ctx);
    const all = [...doc._byId.values()].map((e) => e.innerHTML || '').join('\n');
    assert.ok(/已用 \d+\/\d+/.test(all), `界面任何位置都没有总槽位 n/N（技能子页未渲染？）`);
    assert.ok(/min\(2\+境界序号, 8\)/.test(all), '没有说明上限来源（玩家不知道 2/8 从哪来）');
  });

  await t('角色页三张进度条有真实分母（血条 0/0 类假数据当场暴露）', async () => {
    doc._byId.delete('tab-content');
    await vm.runInContext(`loadTabContent('character')`, ctx);
    const out = tab('tab-content');
    // 轮51 就是靠这条抓到 bug：/api/character 的列名是 max_hp，而前端按 maxHp 读，
    // 配合 `|| 0` 兜底后血条永远显示 0/0 —— 不抛异常也不泄漏 undefined，只有"分母必须 > 0"能咬住。
    const nums = [...out.matchAll(/id="(?:hp|mp|exp)-text">(\d+)\/(\d+)</g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(nums.length >= 3, `三条进度读数没都渲染（只找到 ${nums.length} 条）`);
    for (const [cur, max] of nums) {
      assert.ok(max > 0, `进度条分母是 0（前端读的字段后端根本没给，界面在显示假数据）：${cur}/${max}`);
    }
  });

  await t('角色页掉落保底进度条真的画出来（P3 第三条）', async () => {
    doc._byId.delete('tab-content');
    await vm.runInContext(`loadTabContent('character')`, ctx);
    const out = tab('tab-content');
    assert.ok(/掉落保底/.test(out), '角色页没有掉落保底');
    assert.ok(/pity-bar/.test(out), '保底进度条元素不见了');
    assert.ok(/连续 \d+ 场空手/.test(out), '保底进度文案没渲染');
  });

  await t('所有 onclick 里出现的 handler 名字都真的有定义（点了不报 ReferenceError）', () => {
    const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    const all = SCRIPTS.map((f) => fs.readFileSync(path.join(ROOT, 'public', 'js', f), 'utf8')).join('\n');
    const names = new Set();
    for (const m of app.matchAll(/on(?:click|change|input|submit)="([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
    for (const m of INDEX_HTML.matchAll(/on(?:click|change|input|submit)="([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
    const defined = new Set();
    for (const m of all.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
    for (const m of all.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/g)) defined.add(m[1]);
    for (const m of all.matchAll(/(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);   // 挂在 window 上的（如 caveAction）
    // 注意：不把对象方法（`foo() {`）算作全局名 —— onclick 调的是裸函数名，对象方法够不着。
    const ghost = [...names].filter((n) => !defined.has(n));
    assert.deepStrictEqual(ghost, [], `按钮指向不存在的函数（点了必抛）：${ghost.join(', ')}`);
  });

  await t('前端跑完 1.2 秒后不得留下未捕获的 Promise 拒绝（fire-and-forget 必须自带 catch）', async () => {
    await new Promise((r) => setTimeout(r, 1250));   // 让 init 里 1s 后的那批后台调用真的发生
    assert.deepStrictEqual(unhandled, [], `未捕获拒绝：${unhandled.join(' | ')}`);
  });

  await t('正式存档 data/game.db 未被本套件写动（只写临时目录）', () => {
    if (!liveBefore) { assert.ok(!fs.existsSync(LIVE_DB), '本不该存在正式存档'); return; }
    const after = fs.statSync(LIVE_DB);
    assert.strictEqual(after.size, liveBefore.size, `正式存档体积变了 ${liveBefore.size} -> ${after.size}`);
    assert.strictEqual(after.mtimeMs, liveBefore.mtimeMs, '正式存档修改时间变了（说明写到了正式档）');
  });

  // 关掉页面脚本留下的定时器，否则它们会在存档检查之后继续打已销毁的临时库
  for (const id of timers) { try { clearTimeout(id); clearInterval(id); } catch (e) { /* 忽略 */ } }
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nS3 前端渲染冒烟: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
})().catch((e) => {
  console.error('S3 套件异常：', e && e.stack ? e.stack : e);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) { /* 忽略 */ }
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 300).unref();
});
