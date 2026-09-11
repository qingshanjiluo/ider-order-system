/**
 * B5 离线收益（在线基准记账式）：
 * 以玩家在线刷怪累计的场均收益为基准，离线期间按"离线时长 ÷ 单场耗时 × 场均收益 × 系数"结算。
 * 与完整战斗模拟解耦：确定性强、不受战斗引擎变动影响、超长离线按封顶时长截断，
 * 彻底避免"token 失效/模拟异常导致离线收益丢失"。
 */

function intVal(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : d; }
function numVal(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

// 单场耗时估算（回合 tick + 结算开销），用于把离线时长折算为场次
const AVG_SECONDS_PER_BATTLE = 8;
// 离线收益系数：>1 表示离线单场收益略高于在线（体现挂机价值）
const OFFLINE_RATE = 1.2;
// 离线结算封顶时长（秒）：12 小时，防止超长挂机无上限刷取
const MAX_OFFLINE_SECONDS = 12 * 3600;
// 无在线基准（新号/未刷过怪）时的等级兜底基准
const FALLBACK_AVG_EXP_PER_LEVEL = 4;
const FALLBACK_AVG_SPIRIT_PER_LEVEL = 0.8;
// 低于该时长不视为离线（与 sync 轮询阈值一致）
const MIN_OFFLINE_SECONDS = 90;

/**
 * 结算离线收益并直接写入 player（exp/spirit_stones/hp/mp）。
 * @returns {object|null} 与前端离线报告兼容的结果对象；时长不足返回 null
 */
function settleOfflineEarnings(player, offlineSeconds) {
  if (!player || !(offlineSeconds >= MIN_OFFLINE_SECONDS)) return null;

  const lv = intVal(player.level, 1);
  const offlineSec = Math.min(Math.max(MIN_OFFLINE_SECONDS, offlineSeconds), MAX_OFFLINE_SECONDS);

  const es = (player.earn_stats && typeof player.earn_stats === 'object') ? player.earn_stats : {};
  const battlesCount = intVal(es.battle_count, 0);

  // 有在线基准用场均；否则按等级兜底，保证新号也有离线收益
  let avgExp, avgSpirit;
  if (battlesCount > 0 && (Number(es.exp_total) || 0) > 0) {
    avgExp = Math.max(0, Math.floor((Number(es.exp_total) || 0) / battlesCount));
    avgSpirit = Math.max(0, Math.floor((Number(es.spirit_total) || 0) / battlesCount));
  } else {
    avgExp = Math.max(1, Math.floor(lv * FALLBACK_AVG_EXP_PER_LEVEL));
    avgSpirit = Math.max(1, Math.floor(lv * FALLBACK_AVG_SPIRIT_PER_LEVEL));
  }

  const estimatedBattles = Math.max(1, Math.floor(offlineSec / AVG_SECONDS_PER_BATTLE));
  const expGain = Math.floor(avgExp * estimatedBattles * OFFLINE_RATE);
  const spiritGain = Math.floor(avgSpirit * estimatedBattles * OFFLINE_RATE);

  player.exp = Math.floor((Number(player.exp) || 0) + expGain);
  player.spirit_stones = Math.floor((Number(player.spirit_stones) || 0) + spiritGain);
  // 离线即休息，恢复满血满蓝
  player.hp = intVal(player.max_hp, intVal(player.hp, 100));
  player.mp = intVal(player.max_mp, intVal(player.mp, 50));

  return {
    offline_seconds: offlineSec,
    battles: estimatedBattles,
    wins: estimatedBattles,
    losses: 0,
    draws: 0,
    win_rate: 100,
    boosted_battles: 0,
    boosted_wins: 0,
    exp_gained: expGain,
    spirit_gained: spiritGain,
    drops: [],
    mode: 'benchmark'
  };
}

module.exports = { settleOfflineEarnings, OFFLINE_RATE, MAX_OFFLINE_SECONDS };