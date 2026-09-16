/**
 * sim-battle 的可复用内核 —— 从 scripts/sim-battle.js 抽出来，供标定脚本 require。
 *
 * 为什么必须抽出来共用（轮103 最大的坑）：
 *   标定脚本最初"照着 sim-battle 抄了一份差不多的建卡代码"，但抄错了三个字段：
 *     · element：我写 'none'，sim-battle 是 'fire'（元素克制直接改伤害倍率）
 *     · 暴击：我写 crit_rate:0.08，sim-battle 是 critChance:0.05
 *     · MP：我漏了 maxMp/mp
 *   结果标定算出的段平均（37.6%）与验收实测（58.7%）差 20 个点，
 *   标定脚本"自认为落带"、验收却判红，震荡 8 轮都收敛不了。
 *   教训：**凡是"验收用的测量"与"标定用的测量"，必须共用同一份代码**。
 *
 * 本文件是 sim-battle.js 的唯一真源，sim-battle.js 与 calibrate-bands.js 都从这里 require。
 */
const path = require('path');
const characterService = require(path.join(__dirname, '..', 'src', 'services', 'character'));
const combat = require(path.join(__dirname, '..', 'src', 'services', 'battle', 'combat'));

/** 参考玩家卡（与线上 calculate* 同源；角色不带技能 = 实测"普攻为主"的真实现状） */
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
function monstersFor(db, realm) {
  const r = (db.realms || []).find((x) => x.name === realm);
  const lo = Number(r && r.min_level) || 1;
  const hi = Number(r && r.max_level) || 10;
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
  const r = combat.runBattleLoop(a, d, {});   // 与线上 startBattle 同一份回合循环
  return { win: r.winner === 'attacker', timeout: r.timedOut, rounds: r.round };
}

module.exports = { buildPlayer, monstersFor, fight };
