/**
 * 测试聚合器（npm test 入口）
 * 串行跑内容/回归测试，任一失败即非零退出；供 CI 与发版前门禁使用。
 */
const { spawnSync } = require('child_process');
const path = require('path');

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
  ['S1 入口 boot 探针', 'scripts/probe-server.js'],
  ['S2 P3 可见性', 'scripts/test-p3-visibility-e2e.js'],
  ['S3 前端渲染冒烟', 'scripts/test-fe-render-smoke.js'],
  // P4 章程硬指标（轮52）：E1 的 HTTP 级并发守恒 + E2 的攻击模拟
  ['E1 HTTP 并发守恒', 'scripts/concurrency-test.js'],
  ['E2 攻击模拟', 'scripts/attack-sim.js'],
  // P4 数值验证（轮53）：追赶校验 cumT vs L（同时是曲线方向锁）
  ['E9 追赶校验', 'scripts/sim-balance.js']
];

let failed = 0;
for (const [label, rel] of SUITES) {
  const file = path.join(__dirname, '..', rel);
  if (!require('fs').existsSync(file)) { console.log(`⏭️  ${label} 跳过（无 ${rel}）`); continue; }
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  const ok = r.status === 0;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failed++;
}

console.log(failed ? `\n🔴 ${failed} 个测试套件失败` : '\n🟢 全部测试套件通过');
process.exit(failed ? 1 : 0);
