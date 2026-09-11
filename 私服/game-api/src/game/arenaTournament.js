/**
 * 擂台赛系统（升仙大会）
 * 每日自动开启，分组淘汰赛制。
 *
 * 流程：
 * 1. 报名阶段（2小时）：玩家报名，按境界分组
 * 2. 对战阶段（3小时）：分组内1v1淘汰，每轮随机配对
 * 3. 决赛阶段：各组冠军进入决赛轮，最终决出前三名
 * 4. 结算：发放奖励，重置状态
 *
 * 数据存储：
 * - arena_tournament_state：当前赛事状态
 * - arena_tournament_brackets：对阵表
 * - arena_tournament_results：历史战绩
 */
import { createDb } from '../db.js';
import { getSectById } from './dataLoader.js';

// ── 时间常量 ──
const REGISTRATION_SEC = 2 * 3600;   // 报名阶段 2 小时
const BATTLE_SEC = 3 * 3600;         // 对战阶段 3 小时
const TOURNAMENT_CYCLE = 24 * 3600;  // 每日一轮

// ── 境界分组 ──
const REALM_GROUPS = [
  { id: 1, name: '炼气组', minLevel: 1, maxLevel: 40 },
  { id: 2, name: '筑基组', minLevel: 41, maxLevel: 70 },
  { id: 3, name: '金丹组', minLevel: 71, maxLevel: 100 },
  { id: 4, name: '元婴组', minLevel: 101, maxLevel: 130 },
  { id: 5, name: '化神组', minLevel: 131, maxLevel: 999 },
];

// ── 奖励 ──
const REWARDS = {
  // 冠军奖励
  champion: [
    { id: 128, name: '雅韵丹', count: 5, weight: 30 },
    { id: 130, name: '圣战丹', count: 5, weight: 30 },
    { id: 131, name: '坤元丹', count: 5, weight: 20 },
    { id: 54, name: '五色神炼铁', count: 5, weight: 20 },
  ],
  // 亚军奖励
  runner_up: [
    { id: 128, name: '雅韵丹', count: 3, weight: 40 },
    { id: 130, name: '圣战丹', count: 3, weight: 40 },
    { id: 54, name: '五色神炼铁', count: 3, weight: 20 },
  ],
  // 季军奖励
  third: [
    { id: 128, name: '雅韵丹', count: 2, weight: 50 },
    { id: 54, name: '五色神炼铁', count: 2, weight: 50 },
  ],
  // 参与奖
  participation: [
    { id: 1, name: '筑基丹', count: 1, weight: 100 },
  ],
};

// ── 工具函数 ──

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function _seededRand(seed) {
  const x = (seed * 1103515245 + 12345) >>> 0;
  return (x % 10000) / 10000;
}

function pickReward(pool, seed) {
  let total = 0;
  for (const r of pool) total += r.weight;
  const rnd = seed !== undefined ? _seededRand(seed) : Math.random();
  let r = rnd * total;
  for (const x of pool) {
    r -= x.weight;
    if (r <= 0) return { id: x.id, name: x.name, count: x.count };
  }
  return pool[0] ? { id: pool[0].id, name: pool[0].name, count: pool[0].count } : null;
}

/**
 * 生成随机配对的对阵表（Power of 2 填充）
 * 返回 [{round, matchIndex, playerA, playerB, winner}]
 */
function generateBrackets(participants) {
  // 补到 2 的幂次
  let size = 1;
  while (size < participants.length) size *= 2;
  const padded = [...participants];
  while (padded.length < size) padded.push(null); // null = 轮空

  const totalRounds = Math.log2(size);
  const brackets = [];
  let currentRound = padded.map((p, i) => ({
    account_id: p ? p.account_id : null,
    name: p ? p.name : '轮空',
    level: p ? p.level : 0,
    sect_name: p ? p.sect_name : '',
    seed: i,
  }));

  for (let round = 0; round < totalRounds; round++) {
    const matches = [];
    for (let i = 0; i < currentRound.length; i += 2) {
      const a = currentRound[i];
      const b = currentRound[i + 1];
      matches.push({
        round: round + 1,
        match_index: Math.floor(i / 2),
        player_a: a?.account_id || null,
        player_a_name: a?.name || '轮空',
        player_b: b?.account_id || null,
        player_b_name: b?.name || '轮空',
        winner: null,
        finished: false,
      });
    }
    brackets.push(matches);
    // 为下一轮准备胜者槽位
    currentRound = matches.map(() => ({ account_id: null, name: '?', level: 0, sect_name: '', seed: 0 }));
  }

  return { total_rounds: totalRounds, brackets };
}

/**
 * 获取当前赛事时间窗口
 * 返回 { phase, startTs, endTs, nextTournamentTs }
 */
function getTournamentTiming(now) {
  const todayStart = new Date(new Date(now * 1000).toISOString().slice(0, 10) + 'T08:00:00Z').getTime() / 1000;
  const regEnd = todayStart + REGISTRATION_SEC;
  const battleEnd = regEnd + BATTLE_SEC;

  let phase, startTs, endTs;
  if (now < todayStart) {
    phase = 'upcoming';
    startTs = todayStart;
    endTs = todayStart;
  } else if (now < regEnd) {
    phase = 'registration';
    startTs = todayStart;
    endTs = regEnd;
  } else if (now < battleEnd) {
    phase = 'battle';
    startTs = regEnd;
    endTs = battleEnd;
  } else {
    phase = 'finished';
    startTs = battleEnd;
    endTs = battleEnd;
  }

  const nextTournamentTs = todayStart + TOURNAMENT_CYCLE;

  return { phase, startTs, endTs, nextTournamentTs };
}

// ── 主逻辑 ──

export function createArenaTournament(env) {
  const db = createDb(env);

  return {
    /**
     * 获取赛事信息
     */
    async getTournamentInfo(accountId) {
      const now = nowSec();
      const timing = getTournamentTiming(now);
      const state = await db.getArenaTournamentState();
      const myRegistration = state?.participants?.find(p => intVal(p.account_id, 0) === intVal(accountId, 0));
      const myBracket = myRegistration ? _findMyBracket(state?.brackets, accountId) : null;
      const myGroup = myRegistration ? REALM_GROUPS.find(g => g.id === intVal(myRegistration.group_id, 0)) : null;

      // 获取排行榜（按组内排名）
      const leaderboard = _buildLeaderboard(state, timing.phase);

      return {
        ok: true,
        phase: timing.phase,
        start_ts: timing.startTs,
        end_ts: timing.endTs,
        next_tournament_ts: timing.nextTournamentTs,
        remaining_sec: Math.max(0, timing.endTs - now),
        groups: REALM_GROUPS.map(g => ({
          id: g.id,
          name: g.name,
          min_level: g.minLevel,
          max_level: g.maxLevel,
          participant_count: state?.participants?.filter(p => intVal(p.group_id, 0) === g.id).length || 0,
        })),
        registered: !!myRegistration,
        group_id: myRegistration?.group_id || null,
        group_name: myGroup?.name || '',
        my_bracket: myBracket,
        my_rank: leaderboard.find(e => intVal(e.account_id, 0) === intVal(accountId, 0)) || null,
        leaderboard: leaderboard.slice(0, 20),
        total_participants: state?.participants?.length || 0,
        champion: state?.champion || null,
        last_rewards: state?.last_rewards || null,
      };
    },

    /**
     * 报名参加擂台赛
     */
    async register(accountId) {
      const now = nowSec();
      const timing = getTournamentTiming(now);
      if (timing.phase !== 'registration') {
        return { ok: false, error: '当前不是报名阶段' };
      }

      const player = await db.getPlayerByAccountId(accountId);
      if (!player) return { ok: false, error: '角色不存在' };

      const level = intVal(player.level, 1);
      const group = REALM_GROUPS.find(g => level >= g.minLevel && level <= g.maxLevel);
      if (!group) return { ok: false, error: '境界不符合参赛条件' };

      const state = await db.getArenaTournamentState() || { participants: [], brackets: null, champion: null };
      const existing = state.participants.find(p => intVal(p.account_id, 0) === intVal(accountId, 0));
      if (existing) return { ok: false, error: '已报名' };

      const sect = getSectById(intVal(player.sect_id, 0)) || {};
      state.participants.push({
        account_id: intVal(accountId, 0),
        name: player.name || `道友#${accountId}`,
        level,
        sect_name: sect.name || '散修',
        group_id: group.id,
        registered_at: now,
      });

      await db.setArenaTournamentState(state);
      return { ok: true, group_id: group.id, group_name: group.name };
    },

    /**
     * 开始对战（匹配 bracket 中的对手）
     */
    async startMatch(accountId, bracketRound, bracketMatchIndex) {
      const now = nowSec();
      const timing = getTournamentTiming(now);
      if (timing.phase !== 'battle') {
        return { ok: false, error: '当前不是对战阶段' };
      }

      const state = await db.getArenaTournamentState();
      if (!state?.brackets) return { ok: false, error: '对阵表未生成' };

      const round = state.brackets[intVal(bracketRound, 0) - 1];
      if (!round) return { ok: false, error: '无效的轮次' };

      const match = round[intVal(bracketMatchIndex, 0)];
      if (!match) return { ok: false, error: '无效的对战场次' };
      if (match.finished) return { ok: false, error: '该场次已结束' };

      const meId = intVal(accountId, 0);
      if (intVal(match.player_a, 0) !== meId && intVal(match.player_b, 0) !== meId) {
        return { ok: false, error: '你不在该对战场次中' };
      }

      // 获取对手数据
      const opponentId = intVal(match.player_a, 0) === meId ? intVal(match.player_b, 0) : intVal(match.player_a, 0);
      if (opponentId <= 0) return { ok: false, error: '对手轮空，自动晋级' };

      const playerRaw = await db.getPlayerByAccountId(accountId);
      if (!playerRaw) return { ok: false, error: '角色不存在' };

      const opponentRaw = await db.getPlayerByAccountId(opponentId);
      if (!opponentRaw) return { ok: false, error: '对手数据异常' };

      return {
        ok: true,
        match: { round: match.round, match_index: match.match_index },
        opponent: {
          account_id: opponentId,
          name: opponentRaw.name || '未知',
          level: intVal(opponentRaw.level, 1),
          sect_name: (getSectById(intVal(opponentRaw.sect_id, 0)) || {}).name || '散修',
        },
      };
    },

    /**
     * 结算对战结果
     */
    async settleMatch(accountId, bracketRound, bracketMatchIndex, winnerId) {
      const state = await db.getArenaTournamentState();
      if (!state?.brackets) return { ok: false, error: '对阵表未生成' };

      const round = state.brackets[intVal(bracketRound, 0) - 1];
      if (!round) return { ok: false, error: '无效轮次' };

      const match = round[intVal(bracketMatchIndex, 0)];
      if (!match) return { ok: false, error: '无效场次' };
      if (match.finished) return { ok: false, error: '已结算' };

      match.winner = intVal(winnerId, 0);
      match.finished = true;

      // 推进下一轮
      if (match.round < state.brackets.length) {
        const nextRound = state.brackets[match.round];
        const nextMatchIdx = Math.floor(match.match_index / 2);
        if (nextRound && nextRound[nextMatchIdx]) {
          const slot = match.match_index % 2 === 0 ? 'player_a' : 'player_b';
          nextRound[nextMatchIdx][slot] = match.winner;
          nextRound[nextMatchIdx][slot + '_name'] = match.winner === intVal(match.player_a, 0)
            ? match.player_a_name : match.player_b_name;
        }
      } else {
        // 决赛结束 → 产生冠军
        state.champion = {
          account_id: match.winner,
          name: match.winner === intVal(match.player_a, 0) ? match.player_a_name : match.player_b_name,
          won_at: nowSec(),
        };
        await _distributeRewards(db, state);
      }

      await db.setArenaTournamentState(state);
      return { ok: true };
    },

    /**
     * 获取赛事历史
     */
    async getHistory() {
      const history = await db.getArenaTournamentHistory(10);
      return { ok: true, history };
    },
  };
}

// ── 内部辅助 ──

function _findMyBracket(brackets, accountId) {
  if (!brackets) return null;
  const meId = intVal(accountId, 0);
  for (let r = 0; r < brackets.length; r++) {
    const round = brackets[r];
    for (let m = 0; m < round.length; m++) {
      const match = round[m];
      if (intVal(match.player_a, 0) === meId || intVal(match.player_b, 0) === meId) {
        return {
          round: r + 1,
          match_index: m,
          opponent_name: intVal(match.player_a, 0) === meId ? match.player_b_name : match.player_a_name,
          opponent_id: intVal(match.player_a, 0) === meId ? intVal(match.player_b, 0) : intVal(match.player_a, 0),
          finished: match.finished,
          winner: match.winner,
          is_winner: match.finished && match.winner === meId,
        };
      }
    }
  }
  return null;
}

function _buildLeaderboard(state, phase) {
  if (!state?.participants) return [];
  // 按组内排名（简化：按 level 排序，同级按 registered_at 排序）
  const groups = {};
  for (const p of state.participants) {
    const gid = intVal(p.group_id, 0);
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(p);
  }
  const result = [];
  for (const gid of Object.keys(groups)) {
    const list = groups[gid];
    list.sort((a, b) => (b.level - a.level) || (a.registered_at - b.registered_at));
    for (let i = 0; i < list.length; i++) {
      result.push({ ...list[i], group_rank: i + 1 });
    }
  }
  return result;
}

async function _distributeRewards(db, state) {
  const now = nowSec();
  const rewards = [];

  // 冠军
  if (state.champion?.account_id > 0) {
    const r = pickReward(REWARDS.champion, now);
    if (r) {
      await _sendRewardMail(db, state.champion.account_id, r, '擂台赛冠军');
      rewards.push({ rank: 1, account_id: state.champion.account_id, reward: r });
    }
  }

  // 亚军和季军从半决赛败者中选
  if (state.brackets) {
    const finalRound = state.brackets[state.brackets.length - 1];
    const semiRound = state.brackets.length >= 2 ? state.brackets[state.brackets.length - 2] : null;

    if (semiRound) {
      const losers = semiRound.filter(m => m.finished && m.winner > 0)
        .map(m => m.winner === intVal(m.player_a, 0) ? intVal(m.player_b, 0) : intVal(m.player_a, 0))
        .filter(id => id > 0);

      if (losers.length >= 1 && losers[0] !== intVal(state.champion?.account_id, 0)) {
        const r2 = pickReward(REWARDS.runner_up, now + 1);
        if (r2) {
          await _sendRewardMail(db, losers[0], r2, '擂台赛亚军');
          rewards.push({ rank: 2, account_id: losers[0], reward: r2 });
        }
      }
      if (losers.length >= 2 && losers[1] !== intVal(state.champion?.account_id, 0)) {
        const r3 = pickReward(REWARDS.third, now + 2);
        if (r3) {
          await _sendRewardMail(db, losers[1], r3, '擂台赛季军');
          rewards.push({ rank: 3, account_id: losers[1], reward: r3 });
        }
      }
    }
  }

  // 参与奖
  for (const p of (state.participants || [])) {
    if (intVal(p.account_id, 0) === intVal(state.champion?.account_id, 0)) continue;
    const rp = pickReward(REWARDS.participation, intVal(p.account_id, 0));
    if (rp) await _sendRewardMail(db, p.account_id, rp, '擂台赛参与');
  }

  state.last_rewards = rewards;
}

async function _sendRewardMail(db, accountId, reward, title) {
  const { getItemById } = await import('./dataLoader.js');
  const item = getItemById(reward.id);
  const name = reward.name || item?.name || '奖励';
  const count = Math.max(1, intVal(reward.count, 1));
  const itemData = item && typeof item === 'object' && Object.keys(item).length > 0
    ? structuredClone(item)
    : { id: reward.id, name, type: 'consumable' };
  try {
    await db.createMailboxMessage(accountId, {
      type: 'system',
      title: title,
      content: `恭喜你在${title}中表现出色！奖励：${name} x${count}。`,
      attachments: [{ kind: 'item', item: itemData, item_id: intVal(reward.id, 0), count }],
    });
  } catch (e) {
    console.error('[arena] 发送奖励邮件失败:', accountId, reward, e?.message || e);
  }
}
