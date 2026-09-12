const fs = require('fs');
const rd = (f) => fs.readFileSync(f, 'utf8');
const strip = (b) => (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) ? b.slice(3) : b;
const F = 'scripts/gen-acceptance.js';
let s = rd(F);
const log = [];
// ① 插入探针块（放在 E 行推导标题之前）
const anchor = '// ============================ E1→E10 状态推导 ============================';
if (!s.includes('E3_MP_WIRED') && s.includes(anchor)) {
  const block = strip(fs.readFileSync('_probe.txt')).toString('utf8').replace(/\r\n/g, '\n');
  s = s.replace(anchor, block + anchor);
  log.push('探针块已插入');
} else log.push('探针块跳过（已存在或锚点丢失）');
// ② 用整段替换重写 E3 / E4 / E6 三行（按起止标记切片，不依赖正文文本）
function swap(startMark, endMark, file) {
  const a = s.indexOf(startMark);
  const b = s.indexOf(endMark);
  if (a < 0 || b < 0 || b <= a) { log.push(startMark + ' 未命中 ✗'); return; }
  s = s.slice(0, a) + strip(fs.readFileSync(file)).toString('utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '') + '\n' + s.slice(b);
  log.push(startMark.slice(0, 12) + ' 已换成探针推导版');
}
swap("R('E3', '战斗接线'", "R('E4', '修炼结算'", '_e3.txt');
swap("R('E4', '修炼结算'", "R('E5', '大限劫", '_e4.txt');
swap("R('E6', '数据深化'", "R('E7', '交付物'", '_e6.txt');
fs.writeFileSync(F, s, 'utf8');
console.log('  ' + log.join('\n  '));
console.log('  BOM 残留 = ' + ((rd(F).match(/\uFEFF/g) || []).length));
