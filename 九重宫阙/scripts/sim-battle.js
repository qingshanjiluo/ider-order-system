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

function buildPlayer(realm, level) {
  return {
    name: `${realm}·${level}级`,
    type: 'character',
    level, realm,
    maxHp: characterService.calculateHpMax(level, realm),
    hp: characterService.calculateHpMax(level, realm),
    maxMp: characterService.calculateMpMax(level, realm),
    mp: characterService.calculateMpMax(level, realm),
    attack: characterService.calculateAttack(level, realm),
    defense: characterService.calculateDefense(level, realm),
    speed: characterService.calculateSpeed(level, realm),
    element: 'fire',
    critChance: 0.05,
    skills: [],
    cooldowns: {},
    statusEffects: []
  };
}

/** 怪物模板 stats 是 JSON 字符串（本仓约定），全量解析，解析失败的模板单独计数 */
function monstersFor(realm) {
  const r = realmRow(realm);
  const lo = Number(r && r.min_level) || 1;
  const hi = Number(r && r.max_level) || 10;
  const target = (lo + hi) / 2;
  const pool = [];
  let broken = 0;
  for (const tpl of db.monsters || []) {
    let range = tpl.level_range;
    if (typeof range === 'string') { try { range = JSON.parse(range); } catch (e) { range = null; } }
    if (!Array.isArray(range) || range.length < 2) { broken++; continue; }
    const mid = (Number(range[0]) + Number(range[1])) / 2;
    if (mid < lo - 2 || mid > hi + 2) continue;
    let stats = {};
    try { stats = JSON.parse(tpl.stats || '{}'); } catch (e) { broken++; continue; }
    if (!Number.isFinite(Number(stats.hp))) { broken++; continue; }
    pool.push({
      name: tpl.name, level: mid,
      maxHp: Number(stats.hp), hp: Number(stats.hp),
      maxMp: 0, mp: 0,
      attack: Number(stats.attack) || 0,
      defense: Number(stats.defense) || 0,
      speed: Number(stats.speed) || 0,
      element: tpl.element || 'none',
      critChance: Number(stats.crit) || 0,
      skills: [], cooldowns: {}, statusEffects: []
    });
  }
  return { pool, broken };
}

/** 回合结构照抄 startBattle 的主循环（去掉 DB 与奖励结算） */
function fight(player, mob) {
  const a = Object.assign({}, player, { hp: player.maxHp, cooldowns: {}, statusEffects: [] });
  const d = Object.assign({}, mob, { hp: mob.maxHp, cooldowns: {}, statusEffects: [] });
  let round = 0;
  while (a.hp > 0 && d.hp > 0) {
    round++;
    const attackerFirst = combat.decideInitiative(a, d);
    const first = attackerFirst ? a : d;
    const second = attackerFirst ? d : a;
    const r1 = combat.executeRound(first, second, attackerFirst ? 'attacker' : 'defender', null);
    second.hp -= r1.damage;
    if (second.hp <= 0) break;
    const r2 = combat.executeRound(second, first, attackerFirst ? 'defender' : 'attacker', null);
    first.hp -= r2.damage;
    if (first.hp <= 0) break;
    if (round >= 50) break;
  }
  const timeout = a.hp > 0 && d.hp > 0;
  const win = a.hp > 0;   // 与主循环同一判定：攻方存活即胜（含磨不死怪的超时）
  return { win, timeout, rounds: round };
}

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
