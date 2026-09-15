/**
 * 测试聚合器（npm test 入口）
 * 串行跑内容/回归测试，任一失败即非零退出；供 CI 与发版前门禁使用。
 *
 * 轮58：两处改动为 P5 服务 ——
 *   ① 两个数值 sim 现在带 `--report`，让四张表在每次门禁里都被重出，杜绝"清单引用过期数字"；
 *   ② 跑完把套件清单与失败数写进 `scripts/.test-totals.json`，验收清单生成器读它（不再手抄"385 项全绿"）。
 *      注意：这份工件描述的是**上一次完整门禁**的结果（本套件的检查项跑在它之前），生成器会如实标注。
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SUITES = [
  ['内容完整性', 'scripts/test-content.js'],
  ['阶段2 回归', 'scripts/test-phase2.js'],
  ['阶段3 回归', 'scripts/test-phase3.js'],
  ['阶段6 回归', 'scripts/test-phase6.js'],
  ['E1 互斥锁', 'scripts/test-lock.js'],
  ['E1 auth 角色互斥', 'scripts/test-auth-lock.js'],
  ['E2 分层限流', 'scripts/test-tier-limit.js'],
  ['E3 战斗掉落', 'scripts/test-loot.js'],
  ['E5 大限劫路由', 'scripts/test-tribulation.js'],
  ['G1 功法与技能获取链', 'scripts/test-gongfa-e2e.js'],
  ['G2 好友与市场', 'scripts/test-social-market-e2e.js'],
  // 轮54：经验曲线真源与"速度只填满境界"探针（曲线改了必须立刻能看出有没有接上）
  ['G3 经验真源', 'scripts/test-exp-curve-e2e.js'],
  // 轮55：延寿通道端到端（铁律(2) 的执行手段，后端+货架+前端三段一起锁）
  ['G4 延寿通道', 'scripts/test-longevity-e2e.js'],
  // 轮77：批3 修复回归（temper 白嫖 / use-storage 键义 / offline 窗口消费，三桩各有 HTTP 级锁）
  ['G5 批3修复回归', 'scripts/test-forge-cave-fixes.js'],
  // 轮81：AI 密钥池/降级/复用/审核/生成点（由孤儿 test-phase8-integration.js 进程内改造，旧档案依赖已死）
  ['G6 AI密钥池', 'scripts/test-ai-keys-e2e.js'],
  // 轮82：传记/编年史/AI 润色审核闭环（由孤儿 test-phase9-integration.js 进程内改造）
  ['G7 传记编年史', 'scripts/test-chronicle-e2e.js'],
  // 轮83：任务进度钩子（level/checkin/guild 三类此前无进度源，4/8 任务永不可完成）
  ['G8 任务钩子', 'scripts/test-quest-hooks-e2e.js'],
  ['G9 聊天WS', 'scripts/test-chat-ws-e2e.js'], // 轮96：真 socket 打拒登/广播/限速/盟籍隔离/私聊
  ['G10 经济行为', 'scripts/test-market-econ.js'], // 轮97：托管/价带/限频/自洗/守恒/过期回仓/系数钳制
  ['S1 入口 boot 探针', 'scripts/probe-server.js'],
  ['S2 P3 可见性', 'scripts/test-p3-visibility-e2e.js'],
  ['S3 前端渲染冒烟', 'scripts/test-fe-render-smoke.js'],
  // P4 章程硬指标（轮52）：E1 的 HTTP 级并发守恒 + E2 的攻击模拟
  ['E1 HTTP 并发守恒', 'scripts/concurrency-test.js'],
  ['E2 攻击模拟', 'scripts/attack-sim.js'],
  // P4 数值验证（轮53）：追赶校验 cumT vs L（同时是曲线方向锁）+ 经济守恒与 30 世收支
  //   轮58 起带 --report：门禁顺手把两张表重出，验收清单才有资格引用它们的数字
  ['E9 追赶校验', 'scripts/sim-balance.js', ['--report', '数值追赶校验.md']],
  ['E9 经济守恒', 'scripts/sim-economy.js', ['--report', '经济守恒表.md']],
  // 轮59：覆盖率报告也被验收清单引用 ⇒ 同样必须在门禁里重出（否则删一个端点，清单就拿着旧数说谎）
  ['S4 API 覆盖率', 'scripts/endpoint-coverage.js', ['--report', '前端可见性与覆盖率测量.md']],
  // P5（轮58）：验收清单不许是手抄文档，必须由实测重出并与 git 里的版本一致
  ['E2 安全头与入参校验', 'scripts/test-e2-security.js'],
  ['战斗技能链','scripts/test-skill-chain.js'],
  ['E10 真浏览器渲染', 'scripts/test-e10-browser.js'],
  // 轮61：容器恢复演练把存档弄丢后新增（WAL 下裸拷贝备份会丢未 checkpoint 的已提交事务）
  ['S5 存档快照与恢复', 'scripts/test-db-snapshot.js'],
  ['P5 验收清单新鲜度', 'scripts/test-acceptance-fresh.js']
];

let failed = 0;
const results = [];
for (const suite of SUITES) {
  const [label, rel, extra] = suite;
  const file = path.join(__dirname, '..', rel);
  if (!fs.existsSync(file)) { console.log(`⏭️  ${label} 跳过（无 ${rel}）`); results.push({ label, ok: false, skipped: true }); failed++; continue; }
  const r = spawnSync(process.execPath, [file, ...(extra || [])], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  const ok = r.status === 0;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  results.push({ label, ok, exit: r.status });
  if (!ok) failed++;
}

// 上一段注释里说清楚：这份工件描述"本次门禁"的结果，被清单新鲜度套件读到时它还没写 —— 所以
// 清单里引用的是**上一次**的计数。要改变这种"滞后一格"，唯一办法是把本套件挪到最前，而它依赖
// 全套件的结论，挪不动；因此生成器必须把"滞后一格"这件事印在文档里，而不是假装实时。
try {
  fs.writeFileSync(path.join(__dirname, '.test-totals.json'), JSON.stringify({
    suites: results.length,
    failed,
    green: failed === 0,
    labels: results.map((x) => x.label)
  }, null, 2) + '\n', 'utf8');
} catch (e) { console.log('  ⚠ 写 .test-totals.json 失败：' + e.message); }

console.log(failed ? `\n🔴 ${failed} 个测试套件失败` : `\n🟢 全部 ${results.length} 个测试套件通过`);
process.exit(failed ? 1 : 0);
