/**
 * 完整投产链（一键可复现）
 *
 * 顺序不可换（每一步都依赖上一步的产出）：
 *   1. seed-content     新增 48 只怪 + 坊市上架（id 安全追加，不覆盖）
 *   2. align-monsters   把越出地图区间的怪拉回区间，并按"新等级所属池中位"配血
 *   3. rebalance-pool   池水位回调 + 池内补血 + 图内补血（循环迭代到收敛）
 *   4. dedupe-items     清同类重名（合并冗余件 + 改名区分同名不同物）
 *   5. fix-recipes      修"名字与产物对不上"的配方 + 补缺失产物 + 接新材料
 *   6. fix-dangling-refs 扫掉去重后残留的悬空引用
 *   7. content:export   把存档导出成定义台账（存档是真源）
 *
 * 幂等：全部脚本可重复跑（第二次为 0 改动）。
 * 用法：node scripts/run-content-pipeline.js [--dry]
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const dryArg = DRY ? ['--dry'] : [];

const STEPS = [
  ['seed-content.js', '新增内容（怪 + 坊市）'],
  ['align-monsters.js', '怪等级对齐地图区间 + 按池中位配血'],
  ['rebalance-pool.js', '池水位回调 / 池内补血 / 图内补血（迭代收敛）'],
  ['dedupe-items.js', '同类重名清理'],
  ['fix-recipes.js', '配方指向修正 + 缺失产物补齐'],
  ['fix-dangling-refs.js', '悬空引用清扫']
  // ⚠ 战斗标定（scripts/calibrate-bands.js）**没有**放进自动链，原因见 开发自治章程 R13：
  //   四段胜率带与 TTK 窗口在"段4 大乘~渡劫"上互相冲突（实测可行域极窄甚至为空），
  //   自动跑会在两个约束间反复震荡、每轮都改库，把内容数据搅乱。
  //   它保留为**手动诊断工具**：node scripts/calibrate-bands.js --dry（只报数不写库）。
  //   要真正落地需先裁决"胜率带 / TTK 窗口 谁优先"，见章程 R13 的待裁决条目。
];

for (const [script, label, extra] of STEPS) {
  console.log(`\n${'='.repeat(60)}\n▶ ${label}（${script}）\n${'='.repeat(60)}`);
  try {
    const out = execFileSync('node', [path.join(ROOT, 'scripts', script), ...(extra || []), ...dryArg], {
      encoding: 'utf8', maxBuffer: 1 << 24, cwd: ROOT
    });
    const lines = out.trim().split(/\r?\n/);
    console.log(lines.slice(-6).join('\n'));
  } catch (e) {
    console.error(`❌ ${script} 失败：`);
    console.error((e.stdout || '') + (e.stderr || ''));
    process.exit(1);
  }
}

if (!DRY) {
  console.log(`\n${'='.repeat(60)}\n▶ 导出定义台账\n${'='.repeat(60)}`);
  const out = execFileSync('node', [path.join(ROOT, 'src', 'scripts', 'content-sync.js'), 'export'], {
    encoding: 'utf8', maxBuffer: 1 << 24, cwd: ROOT
  });
  console.log(out.trim().split(/\r?\n/).slice(0, 3).join('\n'));
}

console.log('\n🟢 投产链完成。复跑验证：node scripts/test-gameplay-loop.js');
