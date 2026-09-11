/**
 * 斗法战神榜赛季（Worker 版）
 * 迁移自 server/game/duelRankSeason.js。
 * 7天周期，结算时给第一名发奖、全员重置 rank。
 * 第一期奖励固定《庚金淬炼法》，之后从池子随机。
 *
 * 纯函数（getCurrentPeriodIndex/getNextSettlementTs/getPeriodStartTs/pickPeriodReward）
 * 直接导出供路由使用；需要 DB 的 trySettleIfDue 通过 createDuelRankSeason(env) 工厂创建。
 * 偏差：原模块依赖进程内 dbAsync 单例与 setInterval 定时结算，
 *       本版本改为请求级触发（rank 路由调用 trySettleIfDue）+ 显式注入 nowSec 便于测试。
 */
import { createDb } from '../db.js';
import { getItemById } from './dataLoader.js';

const PERIOD_SEC = 7 * 24 * 3600; // 7天
const EPOCH_UTC8 = 1735660800; // 2025-01-01 00:00 UTC+8

// 奖励池：itemId, count, weight（丹药最高、材料其次、书籍最低、万象森罗生灭法更低）
const REWARD_POOL = {
  // 第一期固定
  books: [
    { id: 96, name: '《戊土淬炼法》', count: 1, weight: 10 },
    { id: 97, name: '《庚金淬炼法》', count: 1, weight: 10 },
    { id: 98, name: '《甲木淬炼法》', count: 1, weight: 10 },
    { id: 99, name: '《癸水淬炼法》', count: 1, weight: 10 },
    { id: 100, name: '《丙火淬炼法》', count: 1, weight: 10 },
    { id: 95, name: '《巽风斩》', count: 1, weight: 10 },
    { id: 120, name: '《最终一战》', count: 1, weight: 10 },
    { id: 101, name: '《万象森罗生灭法》', count: 1, weight: 2 }
  ],
  pills: [
    { id: 128, name: '雅韵丹', count: 3, weight: 50 },
    { id: 130, name: '圣战丹', count: 3, weight: 50 },
    { id: 131, name: '坤元丹', count: 3, weight: 50 },
    { id: 132, name: '神木丸', count: 3, weight: 50 }
  ],
  materials: [
    { id: 54, name: '五色神炼铁', count: 3, weight: 30 },
    { id: 71, name: '九凤丹霞砂', count: 3, weight: 30 }
  ]
};

function getCurrentPeriodIndex(nowSec) {
  const now = Number.isFinite(Number(nowSec)) ? Math.floor(Number(nowSec)) : Math.floor(Date.now() / 1000);
  return Math.floor((now - EPOCH_UTC8) / PERIOD_SEC);
}

function getNextSettlementTs(nowSec) {
  const periodIndex = getCurrentPeriodIndex(nowSec);
  return EPOCH_UTC8 + (periodIndex + 1) * PERIOD_SEC;
}

function getPeriodStartTs(periodIndex) {
  return EPOCH_UTC8 + intVal(periodIndex, 0) * PERIOD_SEC;
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function _seededRand(seed) {
  const x = (seed * 1103515245 + 12345) >>> 0;
  return (x % 10000) / 10000;
}

/** 第一期固定庚金淬炼法，之后加权随机（seed 用于结算；无 seed 时用于展示，用 periodIndex 做确定性预览） */
function pickPeriodReward(periodIndex, randomSeed) {
  if (periodIndex <= 0) {
    return { id: 97, name: '《庚金淬炼法》', count: 1 };
  }
  const all = [];
  for (const p of REWARD_POOL.pills) all.push(p);
  for (const m of REWARD_POOL.materials) all.push(m);
  for (const b of REWARD_POOL.books) all.push(b);
  let total = 0;
  for (const r of all) total += r.weight;
  const rnd = randomSeed !== undefined ? _seededRand(randomSeed) : _seededRand(periodIndex * 7919 + 1);
  let r = rnd * total;
  for (const x of all) {
    r -= x.weight;
    if (r <= 0) return { id: x.id, name: x.name, count: x.count };
  }
  return all[0] ? { id: all[0].id, name: all[0].name, count: all[0].count } : { id: 97, name: '《庚金淬炼法》', count: 1 };
}

/** 按 account_id 分组取最高分（多角色 slot 只计一次），返回冠军 account_id */
async function getLeaderboardFirst(db) {
  return db.getTopDuelRankAccount();
}

async function resetAllDuelRankScores(db, score = 1000) {
  await db.resetAllDuelRankScores(score);
}

async function sendRewardMail(db, accountId, reward) {
  const item = getItemById(reward.id);
  const name = reward.name || (item?.name) || '奖励';
  const count = Math.max(1, Number(reward.count) || 1);
  const itemData = item && typeof item === 'object' && Object.keys(item).length > 0
    ? structuredClone(item)
    : { id: reward.id, name, type: 'book' };
  try {
    await db.createMailboxMessage(accountId, {
      type: 'system',
      title: '战神榜本期奖励',
      content: `恭喜你获得本期战神榜第一名！奖励：${name} x${count}。`,
      attachments: [{ kind: 'item', item: itemData, item_id: Number(reward.id) || 0, count }]
    });
  } catch (e) {
    console.error('[duel-rank] 发送冠军奖励邮件失败:', accountId, reward, e?.message || e);
  }
}

/** 检查并执行结算：当进入新区间时，结算上一期（nowSec 可注入，默认当前时间）
 * 偏差：原版 `now < getNextSettlementTs()` 恒为 true（nextTs 永远在未来），结算永不会触发；
 *      本版本以 lastSettled 落后作为触发依据，惰性调用每次结算滞后的一期。 */
async function trySettleIfDue(db, nowSec) {
  const now = Number.isFinite(Number(nowSec)) ? Math.floor(Number(nowSec)) : Math.floor(Date.now() / 1000);
  const periodIndex = getCurrentPeriodIndex(now);
  const lastSettled = await db.getDuelRankLastSettledPeriod();
  const toSettle = periodIndex - 1;
  if (periodIndex < 1 || lastSettled >= toSettle) return { settled: false };
  const first = await getLeaderboardFirst(db);
  const reward = pickPeriodReward(toSettle, Math.floor(Math.random() * 1e9));
  if (first && first.account_id > 0) {
    await sendRewardMail(db, first.account_id, reward);
    console.log('[duel-rank] 赛季结算: 期数', toSettle, '冠军 account_id', first.account_id, '奖励', reward?.name, 'x' + (reward?.count || 1));
  } else {
    console.log('[duel-rank] 赛季结算: 期数', toSettle, '无冠军（参与人数为0）');
  }
  await resetAllDuelRankScores(db, 1000);
  await db.setDuelRankLastSettledPeriod(toSettle);
  return { settled: true, periodIndex: toSettle, winnerId: first?.account_id || 0, reward };
}

/** 工厂：绑定 env 的 DB 封装，返回 db 相关接口（对齐 server 版方法名） */
export function createDuelRankSeason(env) {
  const db = createDb(env);
  return {
    getCurrentPeriodIndex,
    getNextSettlementTs,
    getPeriodStartTs,
    pickPeriodReward,
    trySettleIfDue: (nowSec) => trySettleIfDue(db, nowSec),
    REWARD_POOL
  };
}

export {
  getCurrentPeriodIndex,
  getNextSettlementTs,
  getPeriodStartTs,
  pickPeriodReward,
  REWARD_POOL
};