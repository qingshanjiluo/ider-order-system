#!/usr/bin/env node
/**
 * 覆盖率待核清单（轮61）：P5 第 7 项要求"人工核对 20 条"。机器不该替人签字，
 * 但机器可以把人要做的事压到最小 —— 从实测报告里抽 20 条（10 条玩家可点 + 10 条未接线），
 * 每条带上端点与前端证据（哪个文件哪一行调用，或"前端未见调用"），留一个签字框。
 * 验收清单第 7 项读的是本文件里 "- [x]" 的已签条数：签满 20 条之前保持判红。
 * 重生成时按行序号保留已有的勾（行序由同一份实测报告决定，稳定），但绝不新增勾。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DEST = '覆盖率待核清单.md';
const HALF = 10;

const rep = rd('前端可见性与覆盖率测量.md');
const eps = [...new Set([...rep.matchAll(/\b(GET|POST|PUT|PATCH|DELETE) (\/api\/[A-Za-z0-9_\-.\/:]*)/g)]
  .map((m) => m[1] + ' ' + m[2]))];
const feBlobs = fs.readdirSync(path.join(ROOT, 'public', 'js')).filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, lines: rd('public/js/' + f).split('\n') }));

function feEvidence(ep) {
  const tail = ep.split(' ')[1].split('/').filter(Boolean).slice(-2).join('/');
  for (const b of feBlobs) {
    for (let i = 0; i < b.lines.length; i++) {
      if (b.lines[i].includes(tail)) return b.f + ':' + (i + 1) + ' ' + b.lines[i].trim().slice(0, 64);
    }
  }
  return '（前端未见调用）';
}

const clickable = [];
const unwired = [];
for (const ep of eps) {
  if (feEvidence(ep) === '（前端未见调用）') { if (unwired.length < HALF) unwired.push(ep); }
  else if (clickable.length < HALF) clickable.push(ep);
  if (clickable.length >= HALF && unwired.length >= HALF) break;
}
const rows = clickable.map((e) => ({ kind: '玩家可点', ep: e })).concat(unwired.map((e) => ({ kind: '未接线', ep: e })));

const out = [];
out.push('# 前端覆盖率待核清单（**由 `node scripts/gen-review-sheet.js` 生成**）');
out.push('');
out.push('> P5 第 7 项要求「前端覆盖率清单人工核对 20 条」。**签字框必须由人勾**：`- [x]` 满 20 条之前，');
out.push('> 《上线验收清单.md》第 7 项保持判红 —— 脚本不会替人打勾。');
out.push('> 输入是《前端可见性与覆盖率测量.md》（门禁第 21 套每次带 --report 重出，故不会引用过期数）。');
out.push('> 核对方法：照「前端证据」去点一次，看请求是否真发出、响应是否真渲染；`未接线` 那 10 条确认它是有意不做（写进设计）还是漏做（记进《后续开发规划》）。');
out.push('');
out.push('| # | 类别 | 端点 | 前端证据 | 人核对（勾上即签字） |');
out.push('| --- | --- | --- | --- | --- |');
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  out.push('| ' + (i + 1) + ' | ' + r.kind + ' | `' + r.ep + '` | ' + feEvidence(r.ep) + ' | - [ ] |');
}
out.push('');
out.push('## DSH-HEADLINE');
out.push('');
out.push('```json');
out.push(JSON.stringify({ kind: 'review-sheet', total: rows.length, clickable: clickable.length, unwired: unwired.length, signedNeeded: 20 }, null, 1));
out.push('```');
let text = out.join('\n') + '\n';
if (fs.existsSync(path.join(ROOT, DEST))) {
  const prevSigned = {};
  for (const l of rd(DEST).split('\n')) {
    const m = l.match(/^\|\s*(\d+)\s*\|[^|]*\|[^|]*\|[^|]*\|\s*- \[(x| )\]/);
    if (m) prevSigned[Number(m[1])] = (m[2] === 'x');
  }
  text = text.split('\n').map((l) => {
    const m = l.match(/^\|\s*(\d+)\s*\|.*\| - \[ \] \|$/);
    return (m && prevSigned[Number(m[1])] === true) ? l.replace('- [ ]', '- [x]') : l;
  }).join('\n');
}
if (/[\uFEFF\u200B]/.test(text)) throw new Error('生成物含 BOM/零宽字符，先清源头');
fs.writeFileSync(path.join(ROOT, DEST), text, 'utf8');
console.log('  已生成 ' + DEST + '：' + rows.length + ' 条（可点 ' + clickable.length + '／未接线 ' + unwired.length
  + '），已签 ' + (text.match(/- \[x\]/g) || []).length + ' 条');
