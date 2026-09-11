/**
 * 副本 API（Worker 版）
 * 迁移自 server/routes/dungeon.js：副本列表/怪物/组队/每日次数
 * - 列表类接口无需登录
 * - 队伍基于 dungeon_teams / dungeon_team_members 表（D1）
 */

import { getDungeons, getDungeonById, getDungeonEnemies, getDungeonEnemyById } from '../game/dataLoader.js';
import { getRealmQualityFromLevel } from '../game/combatUtils.js';
import { createDb } from '../db.js';
import { verifyToken } from '../auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T',
  'Access-Control-Max-Age': '86400'
};

const REALM_NAMES = { 1: '练气', 2: '筑基', 3: '结丹', 4: '元婴', 5: '化神', 6: '炼虚及以上' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

async function getAuthAccount(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  return verifyToken(token, env);
}

async function _buildDungeonTeamPayload(db, team, selfAccountId = 0) {
  if (!team) return null;
  const selfId = intVal(selfAccountId, 0);
  const leaderId = intVal(team.leader_account_id, 0);
  const members = await Promise.all((team.members || []).map(async (accountId) => {
    const aid = intVal(accountId, 0);
    const acc = await db.getAccountById(aid);
    const player = await db.getPlayerByAccountId(aid);
    return {
      account_id: aid,
      username: acc ? acc.username : '未知',
      player_name: (player && player.name) || (acc && acc.username) || '未知',
      level: player ? (Number(player.level) || 1) : 1,
      is_leader: aid === leaderId
    };
  }));
  return {
    team_code: team.team_code,
    leader_account_id: leaderId,
    self_account_id: selfId,
    is_leader: leaderId > 0 && selfId > 0 && leaderId === selfId,
    member_count: members.length,
    max_members: 3,
    members
  };
}

export async function handleDungeonRoute(request, env, route) {
  const method = request.method;
  const url = new URL(request.url);

  // ── 无需登录：列表 ──
  if (route === '/dungeon/list' && method === 'GET') {
    return json({ ok: true, dungeons: getDungeons() });
  }
  if (route === '/dungeon/monsters' && method === 'GET') {
    return json({ ok: true, monsters: getDungeonEnemies() });
  }

  const mMonsters = route.match(/^\/dungeon\/monsters\/(\d+)$/);
  if (mMonsters && method === 'GET') {
    const dungeon = getDungeonById(intVal(mMonsters[1], 0));
    if (!dungeon || !dungeon.id) return json({ ok: false, error: '副本不存在' });
    const ids = dungeon.monster_ids || [];
    const monsters = ids.map((id) => getDungeonEnemyById(id)).filter((m) => m.id);
    return json({ ok: true, monsters });
  }

  // ── 以下需要登录 ──
  const auth = await getAuthAccount(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = auth.accountId || auth.sub || 0;
  const db = createDb(env);

  // 获取副本详情（含今日剩余次数）
  const mDetail = route.match(/^\/dungeon\/(\d+)$/);
  if (mDetail && method === 'GET') {
    const dungeon = getDungeonById(intVal(mDetail[1], 0));
    if (!dungeon || !dungeon.id) return json({ ok: false, error: '副本不存在' });
    const completions = await db.getDungeonCompletionsToday(accountId, dungeon.id);
    const dailyLimit = Number(dungeon.daily_limit) || 2;
    const remaining = Math.max(0, dailyLimit - completions);
    const monsterIds = dungeon.monster_ids || [];
    const monsters = monsterIds.map((id) => getDungeonEnemyById(id)).filter((m) => m.id);
    return json({ ok: true, dungeon: { ...dungeon, monsters }, completions_today: completions, remaining_today: remaining });
  }

  // 创建队伍
  if (route === '/dungeon/team/create' && method === 'POST') {
    const code = await db.createDungeonTeam(accountId, 0);
    return json({ ok: true, team_code: code });
  }

  // 获取自己当前所在队伍
  if (route === '/dungeon/team/mine' && method === 'GET') {
    const team = await db.getMyDungeonTeam(accountId);
    if (!team) return json({ ok: true, team: null });
    return json({ ok: true, team: await _buildDungeonTeamPayload(db, team, accountId) });
  }

  // 加入队伍
  if (route === '/dungeon/team/join' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const teamCode = body.team_code;
    if (!teamCode || typeof teamCode !== 'string') return json({ ok: false, error: '请输入队伍码' });
    const code = teamCode.toUpperCase().trim();
    const team = await db.getDungeonTeam(code);
    if (!team) return json({ ok: false, error: '队伍不存在或已过期' });
    const leaderPlayer = await db.getPlayerByAccountId(team.leader_account_id);
    const joinerPlayer = await db.getPlayerByAccountId(accountId);
    if (leaderPlayer && joinerPlayer) {
      const leaderRealm = getRealmQualityFromLevel(Number(leaderPlayer.level) || 1);
      const joinerRealm = getRealmQualityFromLevel(Number(joinerPlayer.level) || 1);
      if (leaderRealm !== joinerRealm) {
        return json({ ok: false, error: `仅同境界可组队（队长${REALM_NAMES[leaderRealm]}，你${REALM_NAMES[joinerRealm]}）` });
      }
    }
    const r = await db.joinDungeonTeam(code, accountId);
    if (!r.ok) return json(r);
    return json({ ok: true });
  }

  // 获取队伍信息（含成员列表）
  const mTeam = route.match(/^\/dungeon\/team\/([A-Za-z0-9]+)$/);
  if (mTeam && method === 'GET') {
    const team = await db.getDungeonTeam(String(mTeam[1] || '').toUpperCase());
    if (!team) return json({ ok: false, error: '队伍不存在或已过期' });
    return json({ ok: true, team: await _buildDungeonTeamPayload(db, team, accountId) });
  }

  // 队长踢人
  if (route === '/dungeon/team/kick' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const code = String(body.team_code || '').toUpperCase().trim();
    const targetAccountId = intVal(body.target_account_id, 0);
    if (!code) return json({ ok: false, error: '队伍码无效' });
    if (targetAccountId <= 0) return json({ ok: false, error: '目标成员无效' });

    const team = await db.getDungeonTeam(code);
    if (!team) return json({ ok: false, error: '队伍不存在或已过期' });

    const leaderId = intVal(team.leader_account_id, 0);
    const selfId = intVal(accountId, 0);
    if (leaderId <= 0 || selfId !== leaderId) {
      return json({ ok: false, error: '仅队长可执行踢人操作' });
    }
    if (targetAccountId === leaderId) {
      return json({ ok: false, error: '队长不能踢自己，请直接离开队伍' });
    }
    const members = Array.isArray(team.members) ? team.members.map((v) => Number(v) || 0) : [];
    if (!members.includes(targetAccountId)) {
      return json({ ok: false, error: '目标不在当前队伍中' });
    }

    await db.leaveDungeonTeam(code, targetAccountId);
    const updated = await db.getDungeonTeam(code);
    if (!updated) return json({ ok: true, team: null });
    return json({ ok: true, team: await _buildDungeonTeamPayload(db, updated, accountId) });
  }

  // 离开队伍
  if (route === '/dungeon/team/leave' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    await db.leaveDungeonTeam(String(body.team_code || '').toUpperCase(), accountId);
    return json({ ok: true });
  }

  return null;
}