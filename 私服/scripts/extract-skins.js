/**
 * extract-skins.js — 从 docs/ider_skin_full.user.js 抽取 8 套皮肤 CSS
 * 输出到 私服艾德尔修仙传/frontend/skins/*.css
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '..', 'docs', 'ider_skin_full.user.js');
const OUT_DIR = path.join(ROOT, 'frontend', 'skins');

const SKIN_KEYS = ['inkwash', 'cyber', 'luxe', 'magazine', 'wabi', 'minimal', 'frost', 'brutal'];

function main() {
  const code = fs.readFileSync(SRC, 'utf-8');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 定位 SKINS 对象起始
  const skinsStart = code.indexOf('const SKINS = {');
  if (skinsStart < 0) throw new Error('SKINS not found');

  // 在 SKINS 对象内，按 key 切分：key: { ... css: `...` }
  // 用括号匹配找到每个 skin 定义的结束，再抽取其 css 模板字符串
  const extracted = {};

  for (const key of SKIN_KEYS) {
    const keyRe = new RegExp(`(^|\\n)[ \\t]*${key}:\\s*\\{`);
    const m = keyRe.exec(code);
    if (!m) { console.warn('[skip] ' + key + ' not found'); continue; }

    // 从 key 定义开始，做大括号配对
    let start = m.index + m[0].indexOf('{');
    let depth = 0;
    let i = start;
    let inStr = false, strCh = '', strStart = -1;
    const cssStarts = []; // {start,end} 模板字符串内 CSS 边界

    for (; i < code.length; i++) {
      const c = code[i];
      if (inStr) {
        if (c === '\\') { i++; continue; }
        if (c === strCh) {
          inStr = false;
          if (strCh === '`' && strStart >= 0) {
            cssStarts.push({ start: strStart, end: i });
          }
        }
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        inStr = true; strCh = c;
        if (c === '`') strStart = i + 1;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
    const end = i;

    // css 模板字符串（找 css: 开头的最长那个）
    let cssBody = null;
    const cssKeyRe = /css:\s*`/g;
    let cm;
    while ((cm = cssKeyRe.exec(code.substring(start, end)))) {
      const abs = start + cm.index + cm[0].length - 1; // 指向反引号位置
      const tpl = cssStarts.find(t => t.start === abs + 1);
      if (tpl) {
        cssBody = code.substring(tpl.start, tpl.end);
      }
    }
    if (cssBody == null) { console.warn('[skip] ' + key + ' no css'); continue; }

    extracted[key] = cssBody.trim();
    const outPath = path.join(OUT_DIR, key + '.css');
    fs.writeFileSync(outPath, cssBody.trim() + '\n', 'utf-8');
    console.log('✔ ' + key + ' -> ' + path.relative(ROOT, outPath) + ' (' + cssBody.length + ' chars)');
  }

  // 写皮肤注册表
  const registry = [];
  for (const key of SKIN_KEYS) {
    if (!extracted[key]) continue;
    registry.push({ key, file: key + '.css' });
  }
  fs.writeFileSync(
    path.join(ROOT, 'shared', 'skin-registry.json'),
    JSON.stringify({ skins: registry, defaultSkin: 'inkwash' }, null, 2)
  );
  console.log('\nregistry: shared/skin-registry.json (' + registry.length + ' skins)');
}

main();
