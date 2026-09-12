/**
 * T0-1 应劫赢面量尺（**只读**，不写库）
 *
 * 判据是"扛劫"：应劫者顶住 N 重劫雷即胜，不必杀死天劫。
 *   N（劫重）= surviveRoundsBase + 境界在 eligibleRealms 中的位次（劫重递增，题材要求）
 *   天罚每下伤害 = 怪物面板伤害 × mul × U[strikeVariance]，其中
 *   mul = endurance × 理论可扛回合 /(N-1)  → 期望总伤害 = endurance × 玩家生命上限
 *   所以 **endurance=1.0 附近即五五开，且与境界无关**（这是把台阶函数换成连续旋钮的关键）。
 *
 * 三个指标一起看：选定劫敌胜率（满血/残血）、池内可战胜比例（防"劫=抽卡"）、endurance 扫描矩阵。
 * 复用真实实现：选人 = 线上 pickTribulationMonster；形态 = 线上 tribulationShape；回合 = combat.runBattleLoop。
 */
const { loadDatabase } = require('../src/database');
const combat = require('../src/services/battle/combat');
const characterService = require('../src/services/character');
const B = require('../src/config/balance');
const tri = require('../src/routes/tribulation');

const RUNS = Number(process.env.RUNS || 40);
const WIN_LOW = Number(process.env.WIN_LOW || 0.40), WIN_HIGH = Number(process.env.WIN_HIGH || 0.80);
const POOL_LOW = Number(process.env.POOL_LOW || 0.40);
const SWEEP = (process.env.SWEEP || '0.85,0.92,1.0,1.08,1.15').split(',').map(Number);
const PLAYER_CRIT = 0.08;
const CUR = Number(B.TRIBULATION.endurance);
const LIVE = (B.TRIBULATION.mode || 'kill') === 'survive';   // 线上判定口径

function fight(player, mob, shape) {
  const a = Object.assign({}, player, { hp: player.maxHp, cooldowns: {}, statusEffects: [] });
  if (player.startHpFraction != null) a.hp = Math.max(1, Math.round(a.maxHp * player.startHpFraction));
  const d = Object.assign({}, mob, { hp: mob.maxHp, cooldowns: {}, statusEffects: [] });
  const opts = {
    winMode: LIVE ? 'survive' : 'kill', surviveRounds: shape.rounds, strikeMul: shape.mul,
    strikeVariance: B.TRIBULATION.strikeVariance
  };
  const r = combat.runBattleLoop(a, d, opts);
  return { win: r.winner === 'attacker', rounds: r.round };
}
function statsOf(m) { try { return JSON.parse(m.stats || '{}'); } catch (e) { return null; } }
function mobEntity(m, level) {
  const st = statsOf(m);
  if (!st || !(Number(st.hp) > 0)) return null;
  return {
    name: m.name, level, hp: Number(st.hp), maxHp: Number(st.hp), mp: 0,
    attack: Number(st.attack) || 0, defense: Number(st.defense) || 0,
    speed: Number(st.speed) || 0, element: 'none', crit_rate: 0
  };
}
function playerEntity(realm, lv, base) {
  return {
    name: '应劫者', level: lv, realm,
    hp: characterService.calculateHpMax(lv, realm), maxHp: characterService.calculateHpMax(lv, realm),
    mp: 9999, attack: characterService.calculateAttack(lv, realm),
    defense: characterService.calculateDefense(lv, realm),
    speed: characterService.calculateSpeed(lv, realm), element: 'none', crit_rate: PLAYER_CRIT
  };
}
function tally(P, M, shape, frac) {
  let wins = 0, rounds = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = fight(Object.assign({}, P, { startHpFraction: frac }), M, shape);
    if (r.win) wins++;
    rounds += r.rounds;
  }
  return { rate: wins / RUNS, avg: rounds / RUNS };
}

const db = loadDatabase();
const base = (db.characters || [])[0];
if (!base) { console.log('库里没有角色'); process.exitCode = 3; }
const eligible = (B.TRIBULATION && B.TRIBULATION.eligibleRealms) || [];

console.log(`T0-1 应劫赢面（只读）| 口径 mode=${B.TRIBULATION.mode || 'kill'} | 每格 ${RUNS} 场 | 窗口 ${(WIN_LOW * 100)}-${(WIN_HIGH * 100)}% | balance.endurance 当前 = ${CUR}`);
console.log(`可应劫境界: ${eligible.join('/')}   劫重 = ${B.TRIBULATION.surviveRoundsBase} 起递增   天罚波动 ${JSON.stringify(B.TRIBULATION.strikeVariance)}\n`);

const matrix = {};
for (const e of SWEEP.concat([CUR])) {
  B.TRIBULATION.endurance = e;   // 只在进程内覆盖，用于扫描；不写文件不写库
  matrix[String(e) + (e === CUR ? '*' : '')] = eligible.map((realm) => {
    const row = (db.realms || []).find(r => r.name === realm);
    if (!row) return null;
    const lv = Number(row.max_level);
    const picked = tri.pickTribulationMonster(db, Object.assign({}, base, { realm, level: lv }));
    const P = playerEntity(realm, lv, base);
    const M = picked && picked.tpl ? mobEntity(picked.tpl, picked.targetLevel || lv) : null;
    if (!M) return null;
    const shape = tri.tribulationShape(P, M);
    return { rate: tally(P, M, shape, 1.0).rate, rounds: shape.rounds };
  });
}
B.TRIBULATION.endurance = CUR;

if (!LIVE) { console.log('（线上 mode=kill：endurance 扫描跳过 —— 该旋钮只在 survive 口径下起作用）'); } else {
console.log(['endurance\\境界'].concat(eligible).join('\t'));
for (const k of Object.keys(matrix)) {
  console.log([k].concat(matrix[k].map(c => c ? (c.rate * 100).toFixed(0) + '%' : '-')).join('\t'));
}
console.log(''); }
console.log(['境界', '选定劫敌', '劫重N', '理论可扛回合', '满血胜率', '残血胜率', '池可战胜比例', '均回合'].join('\t'));

let allOk = true, measured = 0;
for (const realm of eligible) {
  const row = (db.realms || []).find(r => r.name === realm);
  if (!row) { console.log(`${realm}\t无境界行`); allOk = false; continue; }
  const lv = Number(row.max_level);
  const picked = tri.pickTribulationMonster(db, Object.assign({}, base, { realm, level: lv }));
  const P = playerEntity(realm, lv, base);
  const M = picked && picked.tpl ? mobEntity(picked.tpl, picked.targetLevel || lv) : null;
  if (!M) { console.log(`${realm}\t选不出劫敌`); allOk = false; continue; }
  const shape = tri.tribulationShape(P, M);
  const full = tally(P, M, shape, 1.0), hurt = tally(P, M, shape, 0.5);
  const rLo = Number(row.min_level), rHi = Number(row.max_level);
  let beatable = 0, counted = 0;
  for (const m of (db.monsters || [])) {
    const st = statsOf(m);
    if (!st || !(Number(st.hp) > 0)) continue;
    const rg = Array.isArray(m.level_range) ? m.level_range : [];
    const lo = Number(rg[0]) || 1, hi = Number(rg[1]) || lo;
    if (!(hi >= rLo && lo <= rHi)) continue;
    const ME = mobEntity(m, Math.round((lo + hi) / 2));
    if (!ME) continue;
    counted++;
    if (tally(P, ME, tri.tribulationShape(P, ME), 1.0).rate >= 0.5) beatable++;
  }
  const share = counted ? beatable / counted : 0;
  const ok = full.rate >= WIN_LOW && full.rate <= WIN_HIGH && share >= POOL_LOW;
  if (!ok) allOk = false;
  measured++;
  console.log([
    realm + (ok ? '' : ' ✗'), `${M.name} hp${M.hp}`, String(shape.rounds),
    shape.theoretical ? shape.theoretical.toFixed(2) : '-',
    (full.rate * 100).toFixed(1) + '%', (hurt.rate * 100).toFixed(1) + '%',
    (share * 100).toFixed(1) + '% (' + beatable + '/' + counted + ')', full.avg.toFixed(1)
  ].join('\t'));
}
console.log(`\n实测境界数 = ${measured}/${eligible.length}`);
console.log(allOk ? '判定：🟢 各境界应劫赢面都在窗口内（顶住 N 重劫雷即胜，N 与倍率按面板自校准）'
  : '判定：🔴 有境界越窗（过高=停滞无代价，过低=形同强制转世；按扫描矩阵调 endurance）');
process.exitCode = allOk ? 0 : 2;
