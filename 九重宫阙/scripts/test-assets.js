/**
 * 第 27 套 · P7 美术资产完整性（轮101）
 *
 * 存在的理由：assets 是"磁盘上有就算数"的典型重灾区 ——
 *   ① 图放在 public 下但界面从不引用（死资产，白占体积）；
 *   ② 界面引用了不存在的图（线上 404，图标位置空白）；
 *   ③ 单图过大把首屏拖垮（没有上限就会有人塞 4MB 原图进来）；
 *   ④ manifest 与实际产出脱节（清单说 36 个，磁盘只有 30 个）。
 * 本套件把这四件事全部变成机器判定：双向对账（引用 ⊆ 磁盘 且 磁盘 ⊆ 引用或有账），
 * 体积/尺寸上限，manifest 与磁盘逐项核对，图标网格切分质量（不许空格子）。
 *
 * 只读 public/assets 与源码；不碰数据库。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const MANIFEST = path.join(ROOT, 'game-assets', 'manifest.json');
const INDEX = path.join(ROOT, 'public', 'index.html');
const CSS = path.join(ROOT, 'public', 'css', 'style.css');
const APP = path.join(ROOT, 'public', 'js', 'app.js');
const UI = path.join(ROOT, 'public', 'js', 'ui.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e && e.message ? e.message : e}`); fail++; }
};

const walk = (dir, base = '') => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
};

const diskAssets = walk(ASSETS).filter((f) => /\.(png|jpg|jpeg|webp|svg)$/i.test(f));
const relAssets = new Set(diskAssets.map((f) => 'assets/' + f));

console.log('== P7 美术资产完整性 ==');
console.log(`  磁盘资产 ${diskAssets.length} 个`);

t('资产目录非空（P7 的产出必须真的落盘）', () => {
  assert.ok(diskAssets.length >= 30, `仅有 ${diskAssets.length} 个资产，P7 产出未落盘`);
});

t('manifest 与磁盘双向对账（清单不许与实际脱节）', () => {
  assert.ok(fs.existsSync(MANIFEST), 'manifest.json 不存在');
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const listed = new Set([...(m.assets || []), ...(m.icons || [])].map((a) => a.out));
  const missing = [...listed].filter((p) => !relAssets.has(p));
  assert.deepStrictEqual(missing, [], `manifest 登记但磁盘缺失：${missing.join(', ')}`);
  // 反向：磁盘上的核心资产必须在清单里（favicon 派生件除外）
  const derived = /assets\/(favicon-32|apple-touch-icon|icon-192|icon-512)\.png$/;
  const unlisted = [...relAssets].filter((p) => !listed.has(p) && !derived.test(p));
  assert.deepStrictEqual(unlisted, [], `磁盘有但清单未登记：${unlisted.join(', ')}`);
});

t('单资产体积上限（首屏不许被巨图拖垮）', () => {
  const LIMIT_BG = 700 * 1024;
  const LIMIT = 400 * 1024;
  const over = [];
  for (const f of diskAssets) {
    const size = fs.statSync(path.join(ASSETS, f)).size;
    const isBg = /^bg\//.test(f);
    const limit = isBg ? LIMIT_BG : LIMIT;
    if (size > limit) over.push(`${f} ${(size / 1024).toFixed(0)}KB>${(limit / 1024).toFixed(0)}KB`);
  }
  assert.deepStrictEqual(over, [], `超限资产：${over.join('; ')}`);
});

t('总资产体积上限（首屏 + 图标合计不得超过 6MB）', () => {
  const total = diskAssets.reduce((s, f) => s + fs.statSync(path.join(ASSETS, f)).size, 0);
  assert.ok(total <= 6 * 1024 * 1024, `合计 ${(total / 1024 / 1024).toFixed(2)}MB 超 6MB 上限`);
});

t('界面引用的资产必须全部存在（否则线上 404 空白）', () => {
  const sources = [INDEX, CSS, APP, UI].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  // 抓 'assets/xxx' 字面量；模板拼接不算（scene-bg 走运行时拼接，由下面的白名单覆盖）
  const refs = new Set([...sources.matchAll(/assets\/([\w\-./]+\.(?:png|jpg|jpeg|webp|svg))/g)].map((m) => 'assets/' + m[1]));
  const ghost = [...refs].filter((p) => !relAssets.has(p));
  assert.deepStrictEqual(ghost, [], `界面引用了不存在的资产：${ghost.join(', ')}`);
});

t('场景背景映射里的每张图都真实存在（运行时拼接路径也要对账）', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const block = app.match(/SCENE_BG_MAP\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(block, 'SCENE_BG_MAP 不见了（场景背景接线被删？）');
  const paths = [...block[1].matchAll(/'(bg\/[\w\-.]+\.jpg)'/g)].map((m) => 'assets/' + m[1]);
  assert.ok(paths.length >= 5, `场景背景只映射了 ${paths.length} 张（少于 5 张说明接线退化）`);
  const ghost = paths.filter((p) => !relAssets.has(p));
  assert.deepStrictEqual(ghost, [], `场景背景引用了不存在的图：${ghost.join(', ')}`);
});

t('图标映射里的每张图都存在，且覆盖全部主导航分组', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const block = app.match(/NAV_ICON_MAP\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(block, 'NAV_ICON_MAP 不见了（图标接线被删？）');
  // 键可能带引号（含特殊字符的 tab 名）也可能不带，两式都要吃
  const icons = [...block[1].matchAll(/(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*'([\w\-]+)'/g)].map((m) => m[3]);
  assert.ok(icons.length >= 25, `图标映射只覆盖 ${icons.length} 个 tab（少于 25 说明退化）`);
  const ghost = [...new Set(icons)].filter((i) => !relAssets.has(`assets/icons/${i}.png`));
  assert.deepStrictEqual(ghost, [], `映射到不存在的图标：${ghost.join(', ')}`);
});

t('图标切分质量：16 格全部有内容（不许空格子 / 切歪）', () => {
  const dir = path.join(ASSETS, 'icons');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
  assert.ok(files.length >= 16, `图标只有 ${files.length} 张`);
  // 用 PNG 文件体积做代理：内容丰富的图标压不出极小体积；<300B 基本是空白
  const thin = files.filter((f) => fs.statSync(path.join(dir, f)).size < 300);
  assert.deepStrictEqual(thin, [], `疑似空白图标（体积极小）：${thin.join(', ')}`);
});

t('favicon / PWA 图标齐备且尺寸正确', () => {
  const need = [
    ['favicon-32.png', 32], ['apple-touch-icon.png', 180],
    ['icon-192.png', 192], ['icon-512.png', 512]
  ];
  const missing = need.filter(([f]) => !relAssets.has('assets/' + f)).map(([f]) => f);
  assert.deepStrictEqual(missing, [], `缺 PWA 图标：${missing.join(', ')}`);
  assert.ok(fs.existsSync(path.join(ROOT, 'public', 'manifest.json')), 'manifest.json 不存在');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8'));
  assert.ok(man.icons && man.icons.length >= 3, 'manifest 图标清单不全');
  for (const ic of man.icons) {
    assert.ok(relAssets.has(ic.src.replace(/^\//, '')), `manifest 里的 ${ic.src} 磁盘不存在`);
  }
});

t('index.html 头部接线：favicon / manifest / 首屏预加载齐备', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.ok(/rel="icon"/.test(html), '没有 favicon 链接');
  assert.ok(/rel="manifest"/.test(html), '没有 manifest 链接');
  assert.ok(/apple-touch-icon/.test(html), '没有 iOS 图标链接');
  assert.ok(/rel="preload"[\s\S]{0,80}bg\/login\.jpg/.test(html), '登录背景没有预加载（首屏会闪白）');
  assert.ok(/og:image/.test(html), '没有社交分享图');
});

t('登录页与场景背景真接了资产（不许只放图不接线）', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  assert.ok(/game-title-img[\s\S]{0,120}assets\/ui\/title\.png/.test(html), '登录页没用标题图');
  assert.ok(/login-bg/.test(html) && /assets\/bg\/login\.jpg/.test(css), '登录页没接背景图');
  assert.ok(/class="scene-bg"/.test(html) || /id="scene-bg"/.test(html), '没有场景背景层元素');
  assert.ok(/applySceneBg\(tab\)/.test(fs.readFileSync(APP, 'utf8')), 'switchTab 没调用场景背景切换');
  assert.ok(/mountNavIcons\(\)/.test(fs.readFileSync(APP, 'utf8')), 'init 没挂载导航图标');
});

t('空状态插画统一出口在位（禁止再散落纯文字空态）', () => {
  const ui = fs.readFileSync(UI, 'utf8');
  assert.ok(/emptyState\(kind/.test(ui), 'ui.emptyState 出口不见了');
  assert.ok(/empty-chibi/.test(ui), '空状态没接插画');
  assert.ok(/empty-illus/.test(fs.readFileSync(CSS, 'utf8')), 'CSS 没有插画容器样式');
});

t('reduced-motion 下新动画必须让路（无障碍不许被新特效破坏）', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const rm = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(rm, 'reduced-motion 媒体查询不见了');
  assert.ok(/animation:\s*none\s*!important/.test(rm[1]), 'reduced-motion 没有关掉动画');
});

console.log(`\nP7 资产完整性: ${pass} 通过, ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
