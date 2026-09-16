/**
 * 完整投产链（一键可复现）
 *
 * 顺序不可换（每一步都依赖上一步的产出）：
 *   1. seed-content     新增 48 只怪 + 坊市上架（id 安全追加，不覆盖）
 *   2. align-monsters   把越出地图区间的怪拉回区间，并按"新等级所属池中位"配血
 *   3. rebalance-pool   池水位回调 + 池内补血 + 图内补血（循环迭代到收敛）
 *   4. align-monster-attack 怪攻击对齐玩家曲线（R13；必须在血量定稿之后）
 *   5. dedupe-items     清同类重名（合并冗余件 + 改名区分同名不同物）
 *   6. fix-recipes      修"名字与产物对不上"的配方 + 补缺失产物 + 接新材料
 *   7. fix-dangling-refs 扫掉去重后残留的悬空引用
 *   8. content:export   把存档导出成定义台账（存档是真源）
 *
 * 为什么 attack 排在血量之后：pressure 的目标值是"该境界玩家攻击 × 系数"，
 * 与怪自身血量无关；但脚本内置的 TTK 护栏要用血量算"几回合打死玩家"，血量没定稿就会算错。
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
  ['align-monster-attack.js', '怪攻击对齐玩家曲线（TTK 护栏内置）', DRY ? ['--dry'] : ['--apply']],
  ['dedupe-items.js', '同类重名清理'],
  ['fix-recipes.js', '配方指向修正 + 缺失产物补齐'],
  ['fix-dangling-refs.js', '悬空引用清扫']
  // ⚠ 战斗分段标定（scripts/calibrate-bands.js）**没有**放进自动链：
  //   它是"在给定曲线上微调胜率带"的手动诊断工具，会在胜率带与 TTK 窗口间反复试探、
  //   每轮都改库。曲线本身已由 align-monster-attack 修正（R13），标定不再需要进链。
  //   仍可手动跑：node scripts/calibrate-bands.js（默认 dry-run，只报数）。
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
