/**
 * 端点覆盖率测量（P3 · 可靠覆盖率；轮49）
 *
 * 为什么不用 grep 眼看：以前判断"前端有没有接某接口"，靠的是搜字符串 + 印象，
 * 这种口径既说不出总数，也抓不住"前端调了一个后端根本没有的路径"（点了必 404）。
 * 本脚本把三件事量成可复现的数字：
 *   BE   —— 真实 express 路由栈里注册的 (method, path) 全集（解析 server.js 的挂载前缀 + require 各 router 遍历 stack）
 *   FE   —— public/js/*.js 里出现的所有路径字面量（api.js 的 `this.get('/x')` 约定 + app.js 的直调）
 *   TEST —— scripts/*.js 里被测试真正打过的 /api/ 路径
 * 并给出三个结论：FE 覆盖率、TEST 覆盖率、以及两类缺陷清单：
 *   幽灵调用（FE 调了但 BE 没有 —— 用户点了就是 404/500）
 *   未接线端点（BE 有但 FE 与测试都没碰 —— 功能存在但玩家看不见）
 *
 * 只读：不 require server.js（那会真的起服务），只 require 各路由模块本身；不写库。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_JS = ['api.js', 'app.js', 'character.js', 'game.js', 'chat.js', 'ui.js']
  .map((f) => path.join(ROOT, 'public', 'js', f))
  .filter((f) => fs.existsSync(f));

const read = (p) => fs.readFileSync(p, 'utf8');

/** 把模板串/参数段归一：`/shop/items?id=${x}` -> `/shop/items`，`/:id` 与 `${...}` -> `*` */
function normPath(raw) {
  let p = String(raw).split('?')[0].split('#')[0];
  p = p.replace(/\$\{[^}]*\}/g, '*').replace(/:[A-Za-z_][\w]*/g, '*');
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/** 1) BE 真值：解析 server.js 的挂载，再遍历每个 router 的 stack */
function backendRoutes() {
  const server = read(path.join(ROOT, 'server.js'));
  const out = new Map();          // 'METHOD /api/x' -> { source }
  const add = (method, p, source) => {
    const key = `${method} ${normPath(p)}`;
    if (!out.has(key)) out.set(key, { source });
  };
  const mounts = [...server.matchAll(/app\.use\('(\/api\/[a-z-]+)'\s*,\s*(?:require\('\.\/([^']+)'\)|([A-Za-z$][\w$]*))/g)];
  const byVar = new Map();
  for (const m of server.matchAll(/(?:const|let)\s+([A-Za-z$][\w$]*)\s*=\s*require\('\.\/([^']+)'\)/g)) byVar.set(m[1], m[2]);

  let skipped = 0;
  for (const m of mounts) {
    const prefix = m[1];
    const rel = m[2] || byVar.get(m[3]);
    if (!rel) { skipped++; continue; }
    let router;
    try { router = require(path.join(ROOT, rel)); } catch (e) { skipped++; continue; }
    const stack = (router && (router.stack || (router.router && router.router.stack))) || [];
    for (const layer of stack) {
      if (!layer.route) { skipped++; continue; }
      const methods = Object.keys(layer.route.methods || {}).filter((k) => layer.route.methods[k]);
      const full = prefix + (layer.route.path === '/' ? '' : layer.route.path);
      for (const mm of methods) add(mm.toUpperCase(), full, path.basename(rel));
    }
    // 直接 app.get('/api/health') 之类的内联端点
  }
  for (const m of server.matchAll(/app\.(get|post|put|delete|patch)\('(\/api\/[^']*)'/g)) {
    add(m[1].toUpperCase(), m[2], 'server.js');
  }
  return { routes: out, mountCount: mounts.length, skippedLayers: skipped };
}

/** 2) FE 调用的路径集合
 * 口径：把前端脚本里**所有以 / 开头的字符串字面量**当作候选路径。
 * 为什么不用"匹配 this.get('..') / api.post('..')"这种精确形状：轮49 第一版就是这么写的，
 * 结果只抓到 9 处，而 api.js 实际主约定是 `return this.request('GET', '/skill/list')`（180 处），
 * 于是测出"前端只覆盖 10.5%"这种**假到离谱**的数字。字面量全集 + 归一化虽然会把个别非路径串混进来，
 * 但方向上是保守可核的（下面会打印总数，异常一眼可见）。 */
function frontendCalls() {
  const set = new Map();          // '/api/x' -> 首次出现的文件
  for (const f of PUBLIC_JS) {
    const src = read(f);
    // 轮71（P6 批0）：口径盲区修复。旧字符类 [A-Za-z0-9_\-/:.${}?] 看不见带 `=` 或 `(` 的模板
    // 查询（`/chat/history?channel=${x}`、`/friend/search?name=${encodeURIComponent(...)}`），
    // 把**已接通**的端点误报成"未接线"。改成"到引号前的全部非空白"（与 :99 严格口径同族）；
    // normPath 会剥掉 `?query` 并把 `${...}`/`:` 归一为 `*`，归一后仍逐条对真路由栈，幽灵判定不受影响。
    for (const m of src.matchAll(/['"`]\/([A-Za-z][^'"`\s]*)['"`]/g)) {
      const raw = '/' + m[1];
      const p = normPath(raw.startsWith('/api') ? raw : '/api' + raw);
      if (p.split('/').filter(Boolean).length < 2) continue;      // 至少要有 /api/x
      if (!set.has(p)) set.set(p, path.basename(f));
    }
  }
  return set;
}

/** 3) 严格口径：玩家可点达 = 界面层直调路径 ∪ **被调用过的**包装方法体内的路径
 * 轮49 在这条上连错两次，都记在这里免得再犯：
 *   ① 只按 `this.get('/x')` 形状抓 → 漏掉主约定 `this.request('GET','/x')`，测出假的 10.5%；
 *   ② 改成"界面层文件里出现的路径" → app.js 调的是 `api.getSkillShop()`，路径写在 api.js 体内，
 *      于是把真实可达压成 7.6%（app.js 实际调用了 143 个不同包装方法，明显自相矛盾）。
 * 正确做法：按 `async name(` 把 api.js 切成方法段，被任何脚本调用过的方法，其段内路径计入可达。 */
function asApiPath(raw) {
  return normPath(String(raw).startsWith('/api') ? raw : '/api' + raw);
}

const PATH_RE = /['"`]\/([A-Za-z][^'"`\s]*)['"`]/g;

function pathsIn(src) {
  const s = new Set();
  for (const m of src.matchAll(PATH_RE)) s.add(asApiPath('/' + m[1]));
  return s;
}

function frontendReachable() {
  const apiFile = path.join(ROOT, 'public', 'js', 'api.js');
  const apiSrc = fs.existsSync(apiFile) ? read(apiFile) : '';
  const BASE = ['get', 'post', 'put', 'del', 'delete', 'request'];

  const ui = new Set();
  for (const f of PUBLIC_JS.filter((x) => x !== apiFile)) for (const p of pathsIn(read(f))) ui.add(p);

  const invoked = new Set();
  for (const f of PUBLIC_JS) {
    for (const m of read(f).matchAll(/\bapi\.([A-Za-z_$][\w$]*)\s*\(/g)) invoked.add(m[1]);
    for (const m of read(f).matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*\(/g)) invoked.add(m[1]);
  }

  const heads = [...apiSrc.matchAll(/\basync\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const reachable = new Set(ui);
  const apiPaths = new Set();
  let deadWrappers = 0;
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].index;
    const end = i + 1 < heads.length ? heads[i + 1].index : apiSrc.length;
    const seg = apiSrc.slice(start, end);
    const segPaths = pathsIn(seg);
    for (const p of segPaths) apiPaths.add(p);
    if (invoked.has(heads[i][1])) {
      for (const p of segPaths) reachable.add(p);
    } else {
      deadWrappers++;
    }
  }
  return {
    reachable,
    apiPaths: apiPaths.size,
    apiOnly: [...apiPaths].filter((p) => !reachable.has(p)),
    methods: heads.length,
    invoked: [...invoked].filter((n) => !BASE.includes(n)).length,
    deadWrappers
  };
}

/** 4) 测试真正打过的路径 */
function testCalls() {
  const set = new Set();
  const dir = path.join(ROOT, 'scripts');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = read(path.join(dir, f));
    for (const m of src.matchAll(/[`'"](\/api\/[A-Za-z0-9_\-/:.]*)[`'"]/g)) set.add(normPath(m[1]));
    for (const m of src.matchAll(/call\(\s*'[A-Z]+'\s*,\s*[`'"]([^`'"]+)[`'"]/g)) {
      const p = m[1];
      if (p.startsWith('/api')) set.add(normPath(p));
    }
  }
  return set;
}

function measure() {
  const be = backendRoutes();
  const fe = frontendCalls();
  const te = testCalls();

  const bePaths = new Set([...be.routes.keys()].map((k) => k.split(' ')[1]));
  const beAnyVerbs = new Map();     // path -> Set(method)
  for (const k of be.routes.keys()) {
    const [mm, p] = k.split(' ');
    if (!beAnyVerbs.has(p)) beAnyVerbs.set(p, new Set());
    beAnyVerbs.get(p).add(mm);
  }

  const hit = (p) => bePaths.has(p) || [...bePaths].some((bp) => bp.includes('*') && new RegExp('^' + bp.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '[^/]+' : '\\' + c)) + '$').test(p));

  const ghost = [];
  for (const [p, where] of fe) {
    if (!hit(p)) ghost.push({ call: p, in: where });
  }

  const fePaths = new Set(fe.keys());
  const coveredByFe = [...bePaths].filter(hit2);
  function hit2(bp) {
    if (fePaths.has(bp)) return true;
    if (bp.includes('*')) return [...fePaths].some((fp) => fp.includes('*') ? fp === bp : matchWild(bp, fp));
    return [...fePaths].some((fp) => fp.includes('*') && matchWild(fp, bp));
  }
  const coveredByTest = [...bePaths].filter((bp) => te.has(bp) || matchSome(bp, te));
  const feOnly = [...bePaths].filter((bp) => !coveredByFe.includes(bp));
  const unwired = [...bePaths].filter((bp) => !coveredByFe.includes(bp) && !coveredByTest.includes(bp));

  function matchWild(pat, other) {
    if (!pat.includes('*')) return false;
    const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$');
    return re.test(other);
  }
  function matchSome(bp, set) {
    if (bp.includes('*')) return [...set].some((x) => matchWild(bp, x) || x === bp);
    return [...set].some((x) => matchWild(x, bp));
  }

  return {
    totals: {
      be: bePaths.size,
      mounts: be.mountCount,
      fe: fePaths.size,
      test: te.size,
      skippedLayers: be.skippedLayers
    },
    rates: (() => {
      const reach = frontendReachable();
      const cov = [...bePaths].filter((bp) => reach.reachable.has(bp) || matchSome(bp, reach.reachable)
        || [...reach.reachable].some((x) => matchWild(bp, x) || x === bp));
      return {
        fe: bePaths.size ? Number((coveredByFe.length / bePaths.size * 100).toFixed(1)) : 0,
        test: bePaths.size ? Number((coveredByTest.length / bePaths.size * 100).toFixed(1)) : 0,
        clickable: bePaths.size ? Number((cov.length / bePaths.size * 100).toFixed(1)) : 0,
        apiMethods: reach.methods,
        apiInvoked: reach.invoked,
        apiOnlyCount: reach.apiOnly.length,
        clickableCount: cov.length,
        feNotWired: fePaths.size
      };
    })(),
    ghost: ghost.sort((a, b) => a.call.localeCompare(b.call)),
    feNotCovered: feOnly.sort(),
    unwired: unwired.sort(),
    // 轮104：把真实路由表导出去 —— `gen-review-sheet.js` 需要"全部端点"来抽人工待核清单。
    // 此前它去 grep 报告正文，而报告只列异常清单（未接线/幽灵），项目一健康就抽不到端点，
    // review:gen 直接抛错（越健康越生成不出来）。导出路由表让下游拿到稳定数据源。
    // key 形如 `GET /api/achievement`（与 sample 同形）。
    routes: new Map([...be.routes.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))),
    sample: [...be.routes.keys()].sort().slice(0, 8)
  };
}

if (require.main === module) {
  const r = measure();
  console.log(`BE 端点 ${r.totals.be}（挂载 ${r.totals.mounts} 个 router，未展开层 ${r.totals.skippedLayers}）`);
  console.log(`FE 调用 ${r.totals.fe} 条 → 名义覆盖 ${r.rates.fe}% ；TEST 调用 ${r.totals.test} 条 → 覆盖 ${r.rates.test}%`);
  console.log(`严格口径（界面层直调 ∪ 被调用包装方法体内的路径）→ 玩家可点覆盖 ${r.rates.clickable}%（${r.rates.clickableCount} 条）；只在 api.js 里有包装、界面没入口的接口 = ${r.rates.apiOnlyCount} 条`);
  console.log(`api.js 具名包装方法 ${r.rates.apiMethods} 个，其中被任何脚本调用过的 ${r.rates.apiInvoked} 个`);
  console.log(`名义与可点之差 = ${(r.rates.fe - r.rates.clickable).toFixed(1)} 个百分点（差得越多，说明"写好了但界面上点不到"的死方法越多）`);
  console.log(`幽灵调用（FE 有、BE 没有）= ${r.ghost.length}`);
  for (const g of r.ghost.slice(0, 40)) console.log(`   - ${g.call}   [public/js/${g.in}]`);
  console.log(`未接线端点（BE 有、FE 与测试都没碰）= ${r.unwired.length}`);
  for (const u of r.unwired.slice(0, 60)) console.log(`   - ${u}`);
  console.log('样例端点: ' + r.sample.join(' , '));

  // 报告由测量器自己生成：手抄数字的文档一定会过期，生成的不会。
  const ri = process.argv.indexOf('--report');
  if (ri > 0 && process.argv[ri + 1]) {
    const byGroup = new Map();
    for (const u of r.unwired) {
      const seg = u.split('/')[2] || '其他';
      if (!byGroup.has(seg)) byGroup.set(seg, []);
      byGroup.get(seg).push(u);
    }
    const lines = [
      '# 前端可见性与端点覆盖率测量', '',
      '> 本文件由 `node scripts/endpoint-coverage.js --report 前端可见性与覆盖率测量.md` 生成（P3 交付物，轮49）。',
      '> 数字每次重测即更新，不接受手抄。回归锁在 `scripts/test-content.js` 的「册五期」，用**绝对条数**做棘轮。', '',
      '## 一、口径（为什么不是 grep 眼看）', '',
      '- **BE**：真实 express 路由栈。解析 `server.js` 的 `app.use(\'/api/x\', require(...))` 得到前缀，再 require 该 router 遍历 `stack` 收集 `(method, path)`；参数段归一为 `*`。',
      '- **FE 名义**：`public/js/*.js` 里出现过的所有以 `/` 开头的字符串字面量（归一后加 `/api` 前缀）。含义是"代码里提到过这条路径"。',
      '- **FE 可点（严格）**：界面层文件（app/character/game/chat/ui.js）里直调的路径 ∪ **被调用过的** api.js 具名包装方法体内的路径。含义是"玩家点得到"。',
      '- **TEST**：`scripts/*.js` 里出现的 `/api/...` 字面量 —— 含源码文本锁里的路径，因此是**上界**（真正的 HTTP 断言以各 E/G/S 套件的实际请求为准）。', '',
      '### 两个被推翻的错误口径（写在这里免得再犯）', '',
      '1. 只匹配 `this.get(\'/x\')` 形状 → 漏掉本仓库主约定 `this.request(\'GET\', \'/x\')`（180 处），测出**假的 10.5%**；',
      '2. 只认"路径字面量出现在界面层文件" → app.js 调的是 `api.getSkillShop()` 这类包装（138 个方法被调用），',
      '   路径写在 api.js 体内，于是把真实可达压成**假的 7.6%**（与"138 个包装被调用"自相矛盾，才暴露口径错了）。', '',
      '## 二、本次实测', '',
      '| 指标 | 数值 |', '| --- | --- |',
      `| 后端端点总数 | ${r.totals.be}（${r.totals.mounts} 个 router，未展开层 ${r.totals.skippedLayers}） |`,
      `| 前端名义覆盖 | ${r.rates.fe}%（字面量 ${r.totals.fe} 条） |`,
      `| **玩家可点覆盖** | **${r.rates.clickable}%（${r.rates.clickableCount} 条）** |`,
      `| 回归测试覆盖 | ${r.rates.test}%（${r.totals.test} 条） |`,
      `| 幽灵调用（FE 有 / BE 无） | **${r.ghost.length}** |`,
      `| 只有 api 包装、界面没入口 | ${r.rates.apiOnlyCount} 条 |`,
      `| 界面与测试都没碰的端点 | ${r.unwired.length} 条 |`,
      `| api.js 具名包装 | ${r.rates.apiMethods} 个，被调用 ${r.rates.apiInvoked} 个 |`, '',
      '## 三、未接线端点（按模块）', '',
      ...[...byGroup.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `- **${k}**（${v.length}）：${v.map((x) => x.replace(`/api/${k}`, `/api/${k}`)).join('、')}`),
      '',
      '## 四、幽灵调用清单', '',
      r.ghost.length ? r.ghost.map((g) => `- \`${g.call}\`（出现在 public/js/${g.in}）`).join('\n') : '无 ✓ 前端没有指向不存在端点的按钮。',
      '',
      '## 五、读这些数字时要知道的三件事', '',
      '1. "名义覆盖"是**上界**：字面量在，不代表界面上有入口（所以必须有可点口径）。',
      '2. "可点"仍是静态判定：它证明路径被界面代码引用，不证明那条 UI 在真实浏览器里渲染成功 —— 后者要靠 P3 的浏览器冒烟（未做，已登记）。',
      '3. admin / ai 管理端一类端点"界面没入口"是**正常的**（它们由管理后台或人工调用），不计入玩家可见性缺陷；真正要清的是玩法类端点。', ''
    ];
    fs.writeFileSync(path.join(ROOT, process.argv[ri + 1]), lines.join('\n'), 'utf8');
    console.log(`报告已生成：${process.argv[ri + 1]}`);
  }
  process.exitCode = 0;
}

module.exports = { measure };
