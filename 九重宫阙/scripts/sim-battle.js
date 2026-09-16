/**
 * E3/T0-3 验收脚本：sim-battle 四等级段胜率
 *
 * 章程 E3 原文要求四段胜率落在 75-92% / 60-78% / 45-65% / 30-50%（随进度递减 = 难度曲线成立）。
 *
 * 口径（写死在这里，免得日后争论）：
 *  - 复用**真实**的 combatService.executeRound / decideInitiative，回合结构照抄主循环
 *    （速度定先手、双方各出一招、round>=50 判超时），不另造一套战斗数学；
 *  - 角色属性来自 characterService.calculate*(level, realm)（唯一真源，与升级时写入的一致）；
 *  - 怪物取 db.monsters 模板按 level_range 中位归属等级段（全量统计，不抽样挑好看的）；
 *  - **只读**：不 saveDatabase，可安全对真库跑。
 *  - 角色不带技能（当前 gongfa 0 行、player_skills 仅 1 行装备）→ 实测的是"普攻为主"的真实现状。
 *  - 超时判定单列统计：主循环里 `attacker.hp>0 即判攻方胜`，意味着"50 回合磨不死怪"被记成赢，
 *    这个占比就是胜率数字里的水分，必须看见。
 */
const { loadDatabase } = require('../src/database');
const characterService = require('../src/services/character');
const combat = require('../src/services/battle/combat');

const db = loadDatabase();
const RUNS_PER_MATCHUP = Number(process.argv[2]) || 60;
const BAL = require('../src/config/balance');
if (process.env.GROWTH) { BAL.REALM_STAT_GROWTH = Number(process.env.GROWTH); }   // 扫参：不改文件即可试不同境界增长率
if (process.env.ATKB) { BAL.ATTACK_GROWTH_BIAS = Number(process.env.ATKB); }

const BANDS = [
  { label: '段1 炼气~筑基', realms: ['炼气', '筑基'], want: [0.75, 0.92] },
  { label: '段2 金丹~元婴', realms: ['金丹', '元婴'], want: [0.60, 0.78] },
  { label: '段3 化神~合体', realms: ['化神', '炼虚', '合体'], want: [0.45, 0.65] },
  { label: '段4 大乘~渡劫', realms: ['大乘', '渡劫'], want: [0.30, 0.50] }
];

const realmRow = (name) => (db.realms || []).find(r => r.name === name);

function midLevel(realm) {
  const r = realmRow(realm);
  if (!r) return 1;
  return Math.floor(((Number(r.min_level) || 1) + (Number(r.max_level) || 1)) / 2);
}

// 建卡 / 取池 / 回合这三件事统一由 sim-battle-lib 提供（唯一真源）。
// 轮103 教训：calibrate-bands 曾「照着本文件抄一份」，抄错 element/暴击字段，
// 标定值与验收值差 20 个点、白折腾 8 轮。抽出 lib 后两边共用，这类漂移不可能再发生。
const simLib = require('./sim-battle-lib');
const buildPlayer = simLib.buildPlayer;
const monstersFor = (realm) => simLib.monstersFor(db, realm);
const fight = simLib.fight;


console.log('E3 四等级段胜率模拟（只读，不写库）');
console.log(`口径：每对组合 ${RUNS_PER_MATCHUP} 场（executeRound 内含暴击/克制随机）\n`);
const header = ['等级段', '目标胜率', '实测胜率', '超时胜占比', '平均回合', '怪物池/模板'];
console.log(header.join('\t'));

let allOk = true;
for (const band of BANDS) {
  let wins = 0, total = 0, timeouts = 0, roundSum = 0, poolSize = 0, broken = 0;
  for (const realm of band.realms) {
    const level = midLevel(realm);
    const { pool, broken: b } = monstersFor(realm);
    broken += b;
    if (!pool.length) { console.log(`  ⚠ ${realm} 匹配不到任何怪物模板`); continue; }
    poolSize += pool.length;
    for (let i = 0; i < pool.length; i++) {
      const player = buildPlayer(realm, level);
      for (let k = 0; k < RUNS_PER_MATCHUP; k++) {
        const r = fight(player, pool[i]);
        total++;
        if (r.win) wins++;
        if (r.timeout) { timeouts++; roundSum += 50; } else roundSum += r.rounds;
      }
    }
  }
  const rate = total ? wins / total : 0;
  const inRange = rate >= band.want[0] && rate <= band.want[1];
  if (!inRange) allOk = false;
  const pct = (rate * 100).toFixed(1) + '%';
  console.log([
    band.label,
    `${(band.want[0] * 100).toFixed(0)}-${(band.want[1] * 100).toFixed(0)}%`,
    `${pct}${inRange ? ' ✓' : ' ✗'}`,
    total ? ((timeouts / total) * 100).toFixed(1) + '%' : '—',
    total ? (roundSum / total).toFixed(1) : '—',
    `${poolSize}(解析失败${broken})`
  ].join('\t'));
}
console.log(`\n结论：${'四段合计'}，判定：${allOk ? '🟢 四段全部落区间' : '🔴 有段位不达标'}`);
process.exitCode = allOk ? 0 : 2;
