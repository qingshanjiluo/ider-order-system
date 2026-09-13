/**
 * 大限劫（E5 / T0-1）——寿元耗尽后的应劫入口
 *
 * 职责边界（刻意很窄）：
 *   - 本文件**不判定生死**：判死只在 gameTime.shouldPassAway 一处，转世只在 gameTime.passAway 一处；
 *     这里只"询问"判定点能否开窗口、并在校验通过后结算战斗。
 *   - 续命一律经 gameTime.resolveTribulationVictory → addLifespanBonus，
 *     因此天然受 35% 延寿硬闸与 100 万绝对顶格约束（不在本文件重复实现任何寿元算术）。
 * 风格照抄 src/routes/economy.js（auth 逐路由挂、getChar、{error} 形状、saveDatabase(loadDatabase())）。
 */
const express = require('express');
const dmgCalc = require('../services/battle/damage');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');
const gameTime = require('../services/gameTime');
const opportunity = require('../services/opportunity'); // 轮67：事件写机缘
const combatService = require('../services/battle/combat');
const B = require('../config/balance');

/**
 * 扛劫判定需要顶住的回合数（T0-1，路线 c）：
 * 用**真实伤害函数**算出"这只劫敌每回合打玩家多少"，得到玩家理论可扛回合，再乘 surviveFraction。
 * 这样它随双方面板自动缩放：以后无论怎么重排怪物数值或调玩家曲线，劫的难度都保持在设计位上，
 * 不需要重新配平（旧做法是"挑一只更强的怪"，在确定性强对抗里等于把胜负写死）。
 */
/**
 * 应劫形态 = 劫重（整数、按境界递增）+ 天罚伤害倍率（**连续**、按双方面板自校准）。
 *
 * 为什么必须有连续旋钮：劫重是整数，只调它会让胜率变成台阶函数
 * （实测 surviveFraction 扫描：合体在 1.0 给 18%、0.9 给 93%、1.1 给 15%），配不平。
 * 现在期望伤害总和 = endurance × 玩家生命上限（N 道雷，每道期望 hp/N × endurance），endurance=1.0 即五五开，
 * 且与境界无关（渡劫和化神用同一个数），以后重排怪物表也不需要重新配平。
 */
function tribulationShape(player, mob) {
  const T = B.TRIBULATION || {};
  const list = T.eligibleRealms || [];
  const pos = list.indexOf(player && player.realm);
  const rounds = Math.max(2, (Number(B.TRIBULATION && B.TRIBULATION.surviveRoundsBase) || 3) + (pos >= 0 ? pos : 0));
  if (!player || !mob || !(Number(player.hp) > 0)) return { rounds, mul: 1, theoretical: null };
  const perRound = dmgCalc.calculateFinalDamage(
    { name: mob.name, level: mob.level, attack: mob.attack, defense: 0, hp: mob.hp, element: mob.element || 'none', crit_rate: mob.crit_rate || 0 },
    player, null).damage;
  if (!(perRound > 0)) return { rounds, mul: 1, theoretical: null };
  const theoretical = Number(player.hp) / perRound;
  const end = Number(B.TRIBULATION && B.TRIBULATION.endurance);
  // 每道劫雷的期望伤害 = endurance × 玩家生命 / N  → 期望总伤 = endurance × 生命，endurance=1 即五五开，
  // 且与境界、与劫敌自身面板都无关（劫敌只是天罚的载体），所以这是一个**可用**的连续旋钮。
  const mul = Math.max(0.05, Math.min(20, (Number.isFinite(end) ? end : 1) * Number(player.hp) / rounds / perRound));
  return { rounds, mul, theoretical };
}

/** 兼容旧名：只要劫重 */
function surviveRoundsFor(player, mob) {
  return tribulationShape(player, mob).rounds;
}

/** 天劫强度：目标等级 = 自身等级 + 固定小台阶，并被本境界等级上限夹住。
 *  旧口径 lv + (境界序号+1)×3 会让渡劫 +27 级，等于跨一整个境界去打飞升 Boss
 *  （sim-tribulation 实测五境界应劫胜率全 0.0%，R3"胜则续命"形同强制转世）。
 */
function tribulationTargetLevel(character, realmRow) {
  const lv = Math.max(1, Number(character && character.level) || 1);
  const step = (B.TRIBULATION && B.TRIBULATION.bossLevelStep) || 2;
  const cap = Number(realmRow && realmRow.max_level) || lv;
  return Math.min(lv + step, cap);
}

/**
 * 挑劫敌：**先限境界池，再按强度（hp）贴近池中位**取。
 * 以前按"等级区间中位最接近目标等级"选，等于在同一段 ±1.6 倍的强度带里凭运气抽档 ——
 * 单场战斗近乎确定（随机源只有暴击与克制），抽到池尾就是 0% 胜、抽到池中就是必胜。
 * 现在锁定"池中位强度"这一档，使应劫难度可预期；返回里带上 pickedHp/poolMedianHp 供复算与日志。
 * 确定性：同分按模板 id。
 */
function pickTribulationMonster(db, character) {
  const realms = (db && db.realms) || [];
  const realmRow = realms.find(x => x && x.name === (character && character.realm)) || null;
  const target = tribulationTargetLevel(character, realmRow);
  const all = [];
  for (const m of ((db && db.monsters) || [])) {
    const range = Array.isArray(m.level_range) ? m.level_range : [];
    const lo = Math.max(1, Number(range[0]) || 1);
    const hi = Math.max(lo, Number(range[1]) || lo);
    let st = {}; try { st = JSON.parse(m.stats || "{}"); } catch (e) { st = null; }
    if (!st) continue;
    const hp = Number(st.hp) || 0;
    if (hp <= 0) continue;
    all.push({ tpl: m, lo, hi, mid: (lo + hi) / 2, hp, attack: Number(st.attack) || 0, defense: Number(st.defense) || 0 });
  }
  if (!all.length) return null;
  const rLo = Number(realmRow && realmRow.min_level) || 1;
  const rHi = Number(realmRow && realmRow.max_level) || target;
  const sameRealm = all.filter(x => x.hi >= rLo && x.lo <= rHi);
  const pool = sameRealm.length ? sameRealm : all;
  const sorted = pool.map(x => x.hp).sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const cand = pool.slice().sort((a, b) => Math.abs(a.hp - med) - Math.abs(b.hp - med) || (a.tpl.id || 0) - (b.tpl.id || 0));
  const pick = cand[0];
  return {
    tpl: pick.tpl, targetLevel: target, lo: pick.lo, hi: pick.hi,
    band: sameRealm.length ? "本境界" : "全池回退",
    pickedHp: pick.hp, poolMedianHp: med, poolSize: pool.length
  };
}
function getChar(req, res, db) {
  const character = db.characters.find(c => c.user_id === req.userId);
  if (!character) {
    res.status(404).json({ success: false, error: '角色不存在' });
    return null;
  }
  return character;
}

/** 战斗回执裁剪：只回摘要与前若干行日志，避免整段日志打爆响应体 */
function brief(battle) {
  return {
    rounds: battle.rounds,
    winner: battle.winner,
    enemy: battle.defenderName || (battle.defender && battle.defender.name) || null,
    enemyLevel: battle.defenderLevel != null ? battle.defenderLevel : (battle.defender && battle.defender.level),
    myHpLeft: battle.attackerFinalHp,
    myHpMax: battle.attackerMaxHp,
    log: Array.isArray(battle.battleLog) ? battle.battleLog.slice(0, 24) : []
  };
}

/** 应劫面板（E10 可见性用：窗口倒计时必须能让前端显示出来） */
router.get('/status', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = getChar(req, res, db);
    if (!character) return;
    gameTime.settleTime(character, Date.now());
    const info = gameTime.lifespanInfo(character);
    const trib = character.tribulation || null;
    const windowRemaining = gameTime.tribulationRemaining(character);
    const target = pickTribulationMonster(db, character);
    // 只读推断，**不在 GET 里开窗**（读操作不得产生写副作用）：
    // 寿元已竭但窗口尚未由判定点开启时，面板仍要告诉玩家"大限将至，出手即应劫"。
    const exhausted = !info.ascended && (info.remaining || 0) <= 0;
    const imminent = exhausted && gameTime.tribulationEligible(character)
      && (!trib || trib.stage === 'pending' || trib.stage === 'survived');
    res.json({
      ascended: info.ascended,
      eligible: gameTime.tribulationEligible(character),
      realm: character.realm,
      age: info.age,
      lifespan: info.lifespan,
      remaining: info.remaining,
      pct: info.pct,
      stage: trib ? trib.stage : null,
      imminent,
      attempts: trib ? (trib.attempts || 0) : 0,
      windowYears: (B.TRIBULATION && B.TRIBULATION.windowYears) || 0,
      windowRemaining,
      // 游戏 10 年 = 现实 1 天，把倒计时直译成现实时长，避免玩家以为"下线就没了"
      windowRealDays: windowRemaining == null ? null : Math.round((windowRemaining / 10) * 10) / 10,
      renewRatio: (B.TRIBULATION && B.TRIBULATION.renewRatio) || 0,
      boss: target ? { name: target.tpl.name, levelRange: [target.lo, target.hi], targetLevel: target.targetLevel } : null,
      eligibleRealms: (B.TRIBULATION && B.TRIBULATION.eligibleRealms) || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 出手应劫：胜则按当时上限比例续命，败则当场坐化转世 */
router.post('/endure', auth, async (req, res) => {
  try {
    const db = loadDatabase();
    const character = getChar(req, res, db);
    if (!character) return;
    gameTime.settleTime(character, Date.now());   // 时间推进仍只走唯一引擎

    if (gameTime.isAscended(character)) {
      return res.status(400).json({ success: false, error: '已超脱寿数，无劫可应' });
    }
    if (!gameTime.tribulationEligible(character)) {
      return res.status(400).json({ success: false, error: '境界未至天劫之列（化神以上方有大限之劫）' });
    }

    const cap = gameTime.effectiveLifespan(character);
    const age = Number(character.age_years) || 0;
    const trib = character.tribulation;

    if (trib && trib.stage === 'failed') {
      return res.status(400).json({ success: false, error: '天劫已败，魂魄将散，静待转世' });
    }
    if (!trib || trib.stage !== 'pending') {
      if (age < cap) {
        return res.status(400).json({
          success: false, error: `寿元尚存 ${Math.ceil(cap - age)} 载，未到大限`, remaining: cap - age
        });
      }
      // 生死裁定仍然交给唯一判定点：此刻它只会开窗口（survived 亦在此转回 pending）
      gameTime.shouldPassAway(character);
      if (!character.tribulation || character.tribulation.stage !== 'pending') {
        return res.status(409).json({ success: false, error: '寿元已尽而天劫不临，请直接转世' });
      }
    }

    const picked = pickTribulationMonster(db, character);
    if (!picked) {
      return res.status(500).json({ success: false, error: '无可用的天劫之敌（monsters 模板池为空？）' });
    }
    const raw = req.body && req.body.skillIndex;
    const skillIndex = Number.isInteger(raw) ? raw : null;

// T0-1 路线 c：应劫不是"杀死天劫"，而是"顶住 N 重劫雷"（N 由双方面板自校准）
    const pEnt = combatService.getEntity(character.id, 'character', db);
    const mEnt = combatService.getEntity(picked.tpl.id, 'monster', db);
      const needRounds = tribulationShape(Object.assign({}, pEnt, { realm: character.realm }), mEnt);
    const battle = await combatService.startBattle(character.id, picked.tpl.id,
      'character', 'monster', skillIndex, ((B.TRIBULATION && B.TRIBULATION.mode) || 'kill') === 'survive'
  ? { winMode: 'survive', surviveRounds: needRounds.rounds, strikeMul: needRounds.mul, strikeVariance: B.TRIBULATION.strikeVariance }
  : null);
    if (!battle) {
      return res.status(500).json({ success: false, error: '战斗未能开始' });
    }
    if (battle.error) {
      // 战斗没打成：绝不改动劫与寿元状态，玩家可以重试
      return res.status(400).json({ success: false, error: battle.error, enemy: picked.tpl.name });
    }

    const won = battle.winner === 'attacker';
    if (won) {
      const v = gameTime.resolveTribulationVictory(character);
      if (!v.success) return res.status(409).json({ success: false, error: v.error });
      // 轮67：应劫而生 = 一条服务端机缘（heaven_gate「渡劫不昧本心」的判据）。
      // 必须在 resolveTribulationVictory 之后：只有真的续上命才算渡过来，v.success 为假时上面已经 return 掉了。
      opportunity.record(character, opportunity.KEYS.TRIBULATION_SURVIVED, { realm: character.realm || null });
      saveDatabase(db);
      return res.json({
        success: true, won: true,
        renewYears: v.gainedYears,
        capBefore: v.capBefore, capAfter: v.capAfter,
        topOut: v.gainedYears === 0,   // 渡劫顶格：续无可续，唯有飞升（A 案）
        lifespan: gameTime.lifespanInfo(character),
        battle: Object.assign(brief(battle), { enemy: picked.tpl.name, bossTargetLevel: picked.targetLevel })
      });
    }

    const lost = gameTime.resolveTribulationDefeat(character, `应劫身亡，第 ${(character.tribulation && character.tribulation.attempts) || 1} 次`);
    const summary = gameTime.passAway(character, db);   // 唯一转世出口
    saveDatabase(db);
    res.json({
      success: true, won: false,
      passedAway: true,
      tribulationStage: lost.stage,
      reincarnation_count: character.reincarnation_count,
      retained: summary.retained, lost_assets: summary.lost,
      lifespan: gameTime.lifespanInfo(character),
      battle: Object.assign(brief(battle), { enemy: picked.tpl.name, bossTargetLevel: picked.targetLevel })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
// 供测试与后续复用（同 loginGuard/tierLimit 的挂载方式，不影响 express 挂载）
module.exports.pickTribulationMonster = pickTribulationMonster;
module.exports.surviveRoundsFor = surviveRoundsFor;
module.exports.tribulationShape = tribulationShape;
module.exports.tribulationTargetLevel = tribulationTargetLevel;
