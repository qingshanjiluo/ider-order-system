/**
 * Cron Trigger 定时任务处理器
 * Cloudflare Workers Scheduled Event → 定时执行联赛/擂台结算、数据清理等
 *
 * 触发频率：wrangler.toml 配置 [triggers] crons
 *   - 每 5 分钟：联赛/擂台赛季结算
 *   - 每小时：清理过期数据
 */
import { createDb } from '../db.js';
import { createLeagueSystem } from './leagueSystem.js';
import { createDuelRankSeason } from './duelRankSeason.js';
import { runAllAITicks } from './aiScheduler.js';

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/**
 * 处理 Scheduled Event
 * @param {ScheduledEvent} event
 * @param {object} env Cloudflare env（DB/JWT_SECRET 等绑定）
 * @param {object} ctx ExecutionContext
 */
export async function handleScheduled(event, env, ctx) {
  const start = Date.now();
  const now = new Date();
  const minute = now.getMinutes();
  const hour = now.getHours();
  console.log(`[cron] scheduled event fired at ${now.toISOString()} cron="${event.cron}"`);

  try {
    // ── 每10分钟：联赛/擂台结算 ──
    await settleLeague(env);
    await settleDuelRankSeason(env);

    // ── 每小时（整点）：清理过期数据 ──
    if (minute < 10) {
      await cleanupExpiredData(env);
    }

    // ── 每6小时：AI玩家行为tick ──
    if (hour % 6 === 0 && minute < 10) {
      await runAllAITicks(env);
    }

    const elapsed = Date.now() - start;
    console.log(`[cron] completed in ${elapsed}ms`);
  } catch (e) {
    console.error('[cron] error:', e?.message || e);
  }
}

/**
 * 联赛结算：触发当前赛季的回合推进
 */
async function settleLeague(env) {
  try {
    const league = createLeagueSystem(env);
    const season = await league.getCurrentSeason();
    if (!season) return;

    // 只在 running 状态且有未完成回合时推进
    if (season.status === 'running' && season.rounds_completed < season.total_rounds) {
      await league.runDueSettlement();
      console.log(`[cron] league settled: season=${season.season_id} round=${season.rounds_completed}/${season.total_rounds}`);
    }
  } catch (e) {
    console.error('[cron] league settle error:', e?.message || e);
  }
}

/**
 * 擂台赛季结算：检查是否到期并触发结算
 */
async function settleDuelRankSeason(env) {
  try {
    const duelSeason = createDuelRankSeason(env);
    const result = await duelSeason.trySettleIfDue();
    if (result?.settled) {
      console.log(`[cron] duel rank season settled: period=${result.periodIndex || '?'}`);
    }
  } catch (e) {
    console.error('[cron] duel rank settle error:', e?.message || e);
  }
}

/**
 * 每小时清理：过期数据、临时缓存等
 */
async function cleanupExpiredData(env) {
  const db = createDb(env);
  const now = nowSec();

  try {
    // 清理过期的邮箱验证码（>24 小时）
    const expiredCodes = await db.cleanupExpiredEmailCodes?.(now - 86400);
    if (expiredCodes > 0) {
      console.log(`[cron] cleaned ${expiredCodes} expired email codes`);
    }
  } catch (e) {
    console.error('[cron] cleanup email codes error:', e?.message);
  }

  try {
    // 清理过期的战斗会话（>24 小时）
    const expiredSessions = await db.cleanupExpiredBattleSessions?.(now - 86400);
    if (expiredSessions > 0) {
      console.log(`[cron] cleaned ${expiredSessions} expired battle sessions`);
    }
  } catch (e) {
    console.error('[cron] cleanup battle sessions error:', e?.message);
  }

  try {
    // 清理过期的 IP 封禁（已过期的临时封禁）
    await db.cleanupExpiredIpBans?.(now);
  } catch (e) {
    console.error('[cron] cleanup ip bans error:', e?.message);
  }
}
