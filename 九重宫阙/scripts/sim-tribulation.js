/**
 * T0-1 应劫胜率模拟（**只读**，不写库）
 *
 * 为什么要有它：章程 R3 把"寿元耗尽"做成心魔大限劫 —— 胜则续 `renewRatio × cap` 寿元、败则转世。
 * 若应劫≈必败，R3 就等同于"到点强制转世"；若≈必胜，则 A2 的"停滞会死"彻底失去牙齿。
 * E5 只证明了"能触发、能判定、败会转世"，从未量过**赢面**。
 *
 * 两个度量（缺一不可）：
 *   1. **选定劫敌胜率**：线上 `pickTribulationMonster` 真正会选中的那一只（本境界池的池中位强度），
 *      满血与 50% 残血各跑一批；
 *   2. **池内可战胜比例**：本境界全池逐只打一遍 —— 用来防止"劫变成抽卡"，
 *      即选档逻辑一旦按等级中位而不是强度挑，可能抽到池尾 0% 胜或池头必胜。
 *
 * ⚠ 方差的诚实说明：单场战斗在本游戏里**近乎确定**（随机源只有暴击与五行克制），
 * 所以"同一只怪跑 60 场"得到的不是分布而是常数。这里给玩家 8% 暴击率以引入可测方差，
 * 并主要看 100% / 0% 两极是否被中间值取代；玩家真实暴击、技能与宠物未纳入（那些是 E4/E7 的事）。
 */
const { loadDatabase } = require('../src/database');
const combat = require('../src/services/battle/combat');
const characterService = require('../src/services/character');
const B = require('../src/config/balance');
const { pickTribulationMonster } = require('../src/routes/tribulation');

const RUNS = Number(process.env.RUNS || 30);
const WIN_LOW = 0.40, WIN_HIGH = 0.80;   // 选定劫敌满血胜率的提案窗口
const POOL_LOW = 0.40;                    // 池内可战胜比例下限（防"劫=抽卡"）
const PLAYER_CRIT = 0.08;

/** 与 sim-battle 同源：回合结构照抄 startBattle 主循环（去掉 DB 与奖励结算） */
function fight(player, mob) {
  const a = Object.assign({}, player, { hp: player.maxHp, cooldowns: {}, statusEffects: [] });
  const d = Object.assign({}, mob, { hp: mob.maxHp, cooldowns: {}, statusEffects: [] });
  if (player.startHpFraction != null) a.hp = Math.max(1, Math.round(a.maxHp * player.startHpFraction));
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
  return { win: a.hp > 0, timeout: a.hp > 0 && d.hp > 0, rounds: round };
}

function parseStats(m) {
  try { return JSON.parse(m.stats || '{}'); } catch (e) { return null; }
}
function rangeOf(m) {
  const r = Array.isArray(m.level_range) ? m.level_range : [];
  const lo = Math.max(1, Number(r[0]) || 1);
  return { lo, hi: Math.max(lo, Number(r[1]) || lo) };
}
function mobEntity(m, level) {
  const st = parseStats(m);
  if (!st) return null;
  const hp = Number(st.hp) || 0;
  if (hp <= 0) return null;
  return {
    name: m.name, level, hp, maxHp: hp, mp: 0,
    attack: Number(st.attack) || 0, defense: Number(st.defense) || 0,
    speed: Number(st.speed) || 0, element: 'none', crit_rate: 0
  };
}
function tally(P, M, frac) {
  let wins = 0, rounds = 0, tos = 0;
  for (let i = 0; i < RUNS; i++) {
    const p = Object.assign({}, P, { startHpFraction: frac });
    const r = fight(p, M);
    if (r.win) wins++;
    if (r.timeout) tos++;
    rounds += r.rounds;
  }
  return { rate: wins / RUNS, avg: rounds / RUNS, to: tos / RUNS };
}

const db = loadDatabase();
const base = (db.characters || [])[0];
if (!base) { console.log('库里没有角色，无法构造应劫样本'); process.exitCode = 3; }

const eligible = (B.TRIBULATION && B.TRIBULATION.eligibleRealms) || [];
console.log(`T0-1 应劫胜率模拟（只读）| 每格 ${RUNS} 场 | 选定劫敌窗口 ${WIN_LOW * 100}-${WIN_HIGH * 100}% | 池可战胜比例下限 ${POOL_LOW * 100}%`);
console.log(`可应劫境界: ${eligible.join('/')}   （玩家暴击率按 ${(PLAYER_CRIT * 100)}% 计入，见文件头方差说明）\n`);
console.log(['境界', '选定劫敌', '其hp', '池中位hp', '满血胜率', '残血胜率', '池可战胜比例', '池/均回合'].join('\t'));

let allOk = true, measured = 0;
for (const realm of eligible) {
  const row = (db.realms || []).find(r => r.name === realm);
  if (!row) { console.log(`${realm}\t无境界行`); allOk = false; continue; }
  const lv = Number(row.max_level);
  const ch = Object.assign({}, base, { realm, level: lv });
  const picked = pickTribulationMonster(db, ch);
  const P = {
    name: '应劫者', level: lv, realm,
    hp: characterService.calculateHpMax(lv, realm),
    maxHp: characterService.calculateHpMax(lv, realm),
    mp: 9999,
    attack: characterService.calculateAttack(lv, realm),
    defense: characterService.calculateDefense(lv, realm),
    speed: characterService.calculateSpeed(lv, realm),
    element: 'none', crit_rate: PLAYER_CRIT
  };
  if (!picked || !picked.tpl) { console.log(`${realm}\t**选不出劫敌**`); allOk = false; continue; }
  const PM = mobEntity(picked.tpl, picked.targetLevel || lv);
  if (!PM) { console.log(`${realm}\t选定劫敌 stats 不可解析`); allOk = false; continue; }
  const full = tally(P, PM, 1.0), hurt = tally(P, PM, 0.5);

  // 池内可战胜比例：本境界全池逐只（每只 5 场，够判 0/100 与中间态）
  const rLo = Number(row.min_level), rHi = Number(row.max_level);
  const inBand = (db.monsters || []).filter(m => {
    const st = parseStats(m); if (!st || !(Number(st.hp) > 0)) return false;
    const rg = rangeOf(m);
    return rg.hi >= rLo && rg.lo <= rHi;
  });
  let beatable = 0, counted = 0;
  for (const m of inBand) {
    const M = mobEntity(m, Math.round((rangeOf(m).lo + rangeOf(m).hi) / 2));
    if (!M) continue;
    counted++;
    if (tally(P, M, 1.0).rate >= 0.5) beatable++;
  }
  const share = counted ? beatable / counted : 0;
  const okPick = full.rate >= WIN_LOW && full.rate <= WIN_HIGH;
  const okPool = share >= POOL_LOW;
  if (!okPick || !okPool) allOk = false;
  measured++;
  console.log([
    realm + (okPick && okPool ? '' : ' ✗'), `${picked.tpl.name}`, `${picked.pickedHp}`, `${picked.poolMedianHp}`,
    (full.rate * 100).toFixed(1) + '%', (hurt.rate * 100).toFixed(1) + '%',
    (share * 100).toFixed(1) + '% (' + beatable + '/' + counted + ')',
    `${inBand.length}/${full.avg.toFixed(1)}`
  ].join('\t'));
}

console.log(`\n实测境界数 = ${measured}/${eligible.length}`);
console.log(`续命口径：胜一场续 cap × ${(B.TRIBULATION.renewRatio * 100)}%（章程 R3 原文写 5%cap，分歧见开发日志）`);
console.log(allOk ? '判定：🟢 各境界应劫赢面都在提案窗口内，且池内可战胜比例达标' : '判定：🔴 有境界越窗（过低=形同强制转世，过高=停滞无代价）');
process.exitCode = allOk ? 0 : 2;
