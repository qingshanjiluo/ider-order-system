#!/usr/bin/env node
/**
 * 覆盖率待核清单（轮61/62）：P5 第 7 项要求「人工核对 20 条」。机器不该替人签字，
 * 但机器可以把人要做的事压到最小：抽出 20 条待核项，每条带上端点与前端证据
 * （哪个文件第几行调用，或「前端未见调用」），最后一列的勾只由人来打。
 *
 * 验收清单第 7 项读的是本文件表格里已打勾的行数：签满 20 行之前保持判红。
 * 重生成时按行序号保留已有的勾（行序由同一份实测报告决定，稳定），但本脚本绝不新增勾。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DEST = '覆盖率待核清单.md';
const NEED = 20;

/* 端点来源：**直接调测量器**，不再从《前端可见性与覆盖率测量.md》里正则抽路径。
 *
 * 轮104 修：旧实现 grep 报告的 `/api/...` 字面量，而报告正文只列「未接线端点」与「幽灵调用」
 * 两类**异常**清单。当项目健康度提上来（未接线 0 条、幽灵 0 条）后，报告里就没有端点可抽了，
 * 于是 `review:gen` 直接抛「可核端点不足 20 条，只有 0」——**越健康越生成不出来**，是个反向激励。
 * 现在改为 import 测量器拿真实的 BE 路由表，健康度再高也拿得到端点。
 */
const { measure } = require('./endpoint-coverage.js');
const measured = measure();
const rep = rd('前端可见性与覆盖率测量.md');   // 仅用于页脚注明来源时间
const PLACEHOLDER = /^\/api\/(x|\.\.\.|\*|:id|\w+:\w*)$/;
/** 全部真实后端端点（形如 `/api/pet/capture`），剔除占位与根常量 */
const eps = [...measured.routes.keys()]
  // routes 的 key 是 `GET /api/achievement`（方法 + 空格 + 路径）；待核清单只要路径本身
  .map((k) => String(k).replace(/^[A-Z]+\s+/, '').trim())
  .filter((p) => p.startsWith('/api/'))
  .filter((p) => p.split('/').filter(Boolean).length >= 2)
  .filter((p) => !PLACEHOLDER.test(p) && p !== '/api')
  .filter((p, i, a) => a.indexOf(p) === i)   // 去重（同一路径可能注册多个方法）
  .sort();
if (eps.length < NEED) throw new Error('路由表里可核端点不足 ' + NEED + ' 条，只有 ' + eps.length);

const feBlobs = fs.readdirSync(path.join(ROOT, 'public', 'js')).filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, lines: rd('public/js/' + f).split('\n') }));
const NOCALL = '（前端未见调用）';
function feEvidence(ep) {
  const seg = ep.split('/').filter(Boolean).slice(-2).join('/');
  for (const b of feBlobs) {
    for (let i = 0; i < b.lines.length; i++) {
      if (b.lines[i].includes(seg)) return b.f + ':' + (i + 1) + ' ' + b.lines[i].trim().slice(0, 60);
    }
  }
  return NOCALL;
}

/* 轮61 实测：报告里「前端有调用」的只有个位数，硬凑 10/10 只能出 14 条。
 * 改成：有调用的先收（最多 10），不足 20 条用未接线补满。 */
const wired = eps.filter((e) => feEvidence(e) !== NOCALL);
const unwired = eps.filter((e) => feEvidence(e) === NOCALL);
const picked = wired.slice(0, 10)
  .concat(unwired.slice(0, Math.max(0, NEED - Math.min(wired.length, 10))));
if (picked.length !== NEED) throw new Error('抽取条数不等于要求：' + picked.length + '（wired ' + wired.length + '／unwired ' + unwired.length + '）');
const rows = picked.map((e) => ({ kind: feEvidence(e) === NOCALL ? '前端未见调用' : '前端有调用', ep: e }));

/* 只在表格行里数勾：说明文字里出现同类字符不算签字（轮61 就这么把已签数算成 1）。 */
const SIGNED_ROW = /^\| \d+ \|.*\| - \[[xX]\] \|$/;

const out = [];
out.push('# 前端覆盖率待核清单（**由 `node scripts/gen-review-sheet.js` 生成**）');
out.push('');
out.push('> P5 第 7 项要求「前端覆盖率清单人工核对 20 条」。**最后一列的勾必须由人打**：');
out.push('> 打满 ' + NEED + ' 行之前，《上线验收清单.md》第 7 项保持判红 —— 生成脚本只保留已有的勾，绝不新增。');
out.push('> 输入是《前端可见性与覆盖率测量.md》（门禁第 21 套每次带 --report 重出，不会引用过期数）；');
out.push('> 只收在路由源码里真出现过的路径，文档示例占位不算端点。');
out.push('> 核对方法：');
out.push('> - 「前端有调用」：照证据那行去界面点一次，确认请求真发出、响应真渲染（不是只有 fetch 没有回显）。');
out.push('> - 「前端未见调用」：判断它是有意不做（写进设计）还是漏做（记进《后续开发规划》），二者都算核对完成。');
out.push('');
out.push('| # | 类别 | 端点 | 前端证据 | 人核对（打勾即签字） |');
out.push('| --- | --- | --- | --- | --- |');
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  out.push('| ' + (i + 1) + ' | ' + r.kind + ' | `' + r.ep + '` | ' + feEvidence(r.ep) + ' | - [ ] |');
}
out.push('');
out.push('## DSH-HEADLINE');
out.push('');
out.push('```json');
out.push(JSON.stringify({
  kind: 'review-sheet', total: rows.length,
  wired: rows.filter((r) => r.kind === '前端有调用').length,
  unwired: rows.filter((r) => r.kind === '前端未见调用').length,
  signedNeeded: NEED, endpointsSeenInReport: eps.length
}, null, 1));
out.push('```');
let text = out.join('\n') + '\n';

if (fs.existsSync(path.join(ROOT, DEST))) {
  const prevSigned = {};
  for (const l of rd(DEST).split('\n')) {
    const m = l.match(/^\|\s*(\d+)\s*\|[^|]*\|[^|]*\|[^|]*\|\s*- \[([xX ])\] \|$/);
    if (m) prevSigned[Number(m[1])] = (m[2] === 'x' || m[2] === 'X');
  }
  text = text.split('\n').map((l) => {
    const m = l.match(/^\|\s*(\d+)\s*\|.*\| - \[ \] \|$/);
    return (m && prevSigned[Number(m[1])] === true) ? l.replace('- [ ]', '- [x]') : l;
  }).join('\n');
}
if (/[\uFEFF\u200B]/.test(text)) throw new Error('生成物含 BOM/零宽字符，先清源头');
fs.writeFileSync(path.join(ROOT, DEST), text, 'utf8');
console.log('  已生成 ' + DEST + '：' + rows.length + ' 条（有调用 ' + rows.filter((r) => r.kind === '前端有调用').length
  + '／未见调用 ' + rows.filter((r) => r.kind === '前端未见调用').length + '，端点池 ' + eps.length
  + '），人工已签 ' + (text.match(SIGNED_ROW) || []).length + '/' + NEED);
