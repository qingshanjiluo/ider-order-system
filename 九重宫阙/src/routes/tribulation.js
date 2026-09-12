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
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');
const gameTime = require('../services/gameTime');
const combatService = require('../services/battle/combat');
const B = require('../config/balance');

/** 天劫强度：目标等级 = 自身等级 + (境界序号+1)×每阶加成。确定性，不含随机。 */
function tribulationTargetLevel(character, realmIndex) {
  const lv = Math.max(1, Number(character && character.level) || 1);
  const per = (B.TRIBULATION && B.TRIBULATION.bossLevelPerRealm) || 3;
  return lv + (Math.max(0, realmIndex) + 1) * per;
}

/**
 * 从天劫模板池挑一只与目标等级匹配的怪（复用轮 29 的 buildMonsterFromTemplate 通道）。
 * 优先取"区间上界不弱于目标"的候选，再取中位最接近目标者；同分按 id 保证确定性。
 */
function pickTribulationMonster(db, character) {
  const realms = (db && db.realms) || [];
  const idx = realms.findIndex(r => r && r.name === (character && character.realm));
  const target = tribulationTargetLevel(character, idx);
  const pool = ((db && db.monsters) || []).map(m => {
    const range = Array.isArray(m.level_range) ? m.level_range : [];
    const lo = Math.max(1, Number(range[0]) || 1);
    const hi = Math.max(lo, Number(range[1]) || lo);
    return { tpl: m, lo, hi, mid: (lo + hi) / 2 };
  });
  if (!pool.length) return null;
  const tough = pool.filter(x => x.hi >= target);
  const cand = (tough.length ? tough : pool).slice()
    .sort((a, b) => Math.abs(a.mid - target) - Math.abs(b.mid - target) || (a.tpl.id || 0) - (b.tpl.id || 0));
  return { tpl: cand[0].tpl, targetLevel: target, lo: cand[0].lo, hi: cand[0].hi };
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

    const battle = await combatService.startBattle(character.id, picked.tpl.id, 'character', 'monster', skillIndex);
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
module.exports.tribulationTargetLevel = tribulationTargetLevel;
