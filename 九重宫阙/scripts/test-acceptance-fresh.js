#!/usr/bin/env node
/**
 * 第 21 套 · P5 验收清单新鲜度（轮58）
 *
 * 存在的理由：《上线验收清单.md》曾经是一份**手抄文档**，到轮58 已经烂到 ——
 *   结论表还写"157 项全绿"（实际 20+ 套 / 385 条）、E4 写"九乘区速度模型未实现"（T0-2 早做完）、
 *   E5 写"大限劫零实现"（轮40 已修并上了第 9 套锁）、E6 写"材料 86 未达标"（P1 早达标）。
 * 拿会说谎的文档判 GO/NO-GO 不成立，所以清单改成 `gen-acceptance.js` 的产物，本套件负责让它**不敢过期**。
 *
 * 三条锁：
 *   ① 输入齐备：两张 sim 表尾部必须有 DSH-HEADLINE 机器块（否则清单只能靠抄）；
 *   ② 逐字新鲜：跑 `gen-acceptance.js --check`，与 git 里的版本必须一字不差；
 *   ③ 谎话回归：把本轮抓到的具体过期断言钉成"再出现即红"，防止有人（包括我）手改回去。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); fail++; }
};
const assert = require('assert');

t('① 清单的输入是机器块而不是手抄（两张 sim 表都要有 DSH-HEADLINE）', () => {
  for (const f of ['数值追赶校验.md', '经济守恒表.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `缺数值表 ${f}：门禁内 sim 未跑或未带 --report`);
    const m = rd(f).match(/## DSH-HEADLINE[\s\S]*?```json\n([\s\S]*?)\n``/);
    assert.ok(m, `${f} 尾部没有 DSH-HEADLINE 机器块 ⇒ 验收清单只能靠人抄数字，正是本轮要消灭的东西`);
    const j = JSON.parse(m[1]);
    assert.ok(Number.isFinite(j.failed), `${f} 的机器块没有 failed 计数`);
    assert.strictEqual(j.failed, 0, `${f} 机器块显示 ${j.failed} 条失败 ⇒ 数值本身就没绿，别去改清单`);
  }
});

t('② 逐字新鲜：gen-acceptance --check 必须与仓库里的清单一字不差', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-acceptance.js'), '--check'],
    { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.strictEqual(r.status, 0, '验收清单与实测不一致（文档过期）。重跑：npm run accept:gen\n' +
    out.trim().split('\n').slice(0, 6).map((l) => '      ' + l).join('\n'));
});

t('③ 谎话回归：轮58 抓到的过期断言不得再出现在清单里', () => {
  const s = rd('上线验收清单.md');
  const lies = [
    [/157 ?项?全绿/, '门禁证据停在轮30 的 157 项'],
    [/大限劫零实现/, 'E5 的大限劫轮40 已实现并有第 9 套锁'],
    [/九乘区速度模型未实现/, 'E4 的九乘区模型 T0-2 已接入生产路径'],
    [/QUALITY_PRICE[^。]{0,40}缺丹药\/材料品质词/, '回收词表轮56 已补齐（未覆盖 0 件）'],
    [/cultivation_speed[^\n]{0,30}(全档无人提供|一行都没有)/, '轮57 已订正：字段在 items 里活着，空的是 db.gongfa 实例表'],
    [/第 30 轮自动生成/, '清单标题还写着手抄轮次，说明是被人改回去的'],
    [/技能定义 0（320）/, '轮59 的读错集合说法：技能定义在代码侧（实测 320 条），不是空集合'],
    [/功法乘区对玩家不可达/, '轮60 已修：/gongfa/equip 落库归一为中文规范词，G1 直连断言锁住乘区会抬起']
  ];
  const hit = lies.filter(([re]) => re.test(s)).map(([, why]) => why);
  assert.deepStrictEqual(hit, [], '清单里出现已知过期说法：\n      ' + hit.join('\n      ') + '\n      ⇒ 若数值真的回退，先修数值再重出清单，不要手改文档。');
  assert.ok(/由 `node scripts\/gen-acceptance\.js` 生成/.test(s), '清单没声明自己是产物 ⇒ 生成器被绕过过');
  assert.ok(/NO-GO|GO/.test(s), '清单没有结论');
});

t('④ 每个门控项都必须带实测依据（不许空格子自我认证）', () => {
  const s = rd('上线验收清单.md');
  const rows = s.split('\n').filter((l) => /^\| \d+ \| .* \| .🟢 过|🔴 不过. \|/.test(l.replace(/\s+$/, '')) || /^\| \d+ \|[^|]+\|[^|]+\|/.test(l));
  const table = s.split('\n');
  const i = table.findIndex((l) => l.startsWith('| # | 门控项'));
  assert.ok(i > 0, '找不到 P5 七项门控表 ⇒ 生成器改版忘了同步本锁');
  const bad = [];
  for (let k = i + 2; k < table.length && /^\|/.test(table[k]); k++) {
    const c = table[k].split('|');
    if (c.length < 5 || !c[3].trim() || c[4].trim().length < 8) bad.push('第 ' + (k - i - 1) + ' 行依据过短/为空');
    if (!/🟢 过|🔴 不过/.test(c[3])) bad.push('第 ' + (k - i - 1) + ' 行没有判定');
  }
  assert.deepStrictEqual(bad, [], '门控表有格子没有实测依据：' + bad.join('、') + '（共 ' + rows.length + ' 行参与校验）');
});

console.log(`\n  P5 验收清单新鲜度: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
