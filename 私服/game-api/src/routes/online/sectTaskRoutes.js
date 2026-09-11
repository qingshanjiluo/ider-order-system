/**
 * 宗门任务 API（Worker 版）
 * 迁移自 server/routes/online/sectTaskRoutes.js（mountSectTaskRoutes）
 * 说明：原 route 依赖 settlementLock（进程内写锁），本版本省略（D1 单请求串行）；
 *       settleKillTaskProgress 供战斗结算调用（迁移时保留导出）。
 */
import { verifyToken } from '../../auth.js';
import { createDb } from '../../db.js';
import { getEnemies } from '../../game/dataLoader.js';
import { getPlayerRealmQuality } from '../../game/equipmentGen.js';
import { intVal, randiRange, nowSec, countItemInInventory, consumeItemFromInventory } from '../../game/onlineUtils.js';

const SECT_TASK_SLOTS = 7;
const SECT_TASK_REFRESH_SECONDS = 600;
const SECT_TASK_DAILY_LIMIT = 15;
const SECT_TASK_MANUAL_REFRESH_COST = 100;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function _intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

// 生成单个宗门任务（击杀敌人；无合适敌人返回空任务）
function generateOneSectTask(playerQuality, levelMax) {
  const enemies = getEnemies() || [];
  const enemyCandidates = enemies.filter(e => {
    const lv = intVal(e.level, 1);
    const eq = getPlayerRealmQuality(lv);
    return lv >= 10 && lv <= levelMax && eq <= playerQuality;
  });
  if (enemyCandidates.length > 0) {
    const enemy = enemyCandidates[Math.floor(Math.random() * enemyCandidates.length)];
    const enemyLevel = intVal(enemy.level, 1);
    const count = randiRange(15, 38);
    const reward = enemyLevel * count;
    return {
      type: 'kill_enemy',
      target_id: intVal(enemy.id, 0),
      count,
      reward,
      accepted: false,
      progress: 0,
      display_name: String(enemy.name || '未知'),
      target_level: enemyLevel
    };
  }
  return { type: '', target_id: 0, count: 0, reward: 0, accepted: false, progress: 0, display_name: '空', target_level: 0 };
}

// 刷新任务：首次填满所有槽位；之后仅替换未接取槽位
function refreshSectTasks(player, taskSlots) {
  const pq = getPlayerRealmQuality(intVal(player.level, 1));
  const levelMax = pq <= 1 ? 120 : (pq <= 2 ? 160 : (pq <= 3 ? 200 : 240));
  if (!Array.isArray(player.sect_tasks) || player.sect_tasks.length !== taskSlots) {
    player.sect_tasks = [];
    for (let i = 0; i < taskSlots; i += 1) player.sect_tasks.push(generateOneSectTask(pq, levelMax));
    return;
  }
  for (let i = 0; i < player.sect_tasks.length; i += 1) {
    const t = player.sect_tasks[i] || {};
    if (!Boolean(t.accepted)) player.sect_tasks[i] = generateOneSectTask(pq, levelMax);
  }
}

// 击杀敌人时推进已接取的击杀任务进度（供战斗结算调用）
export function settleKillTaskProgress(player, enemyId) {
  const tasks = Array.isArray(player?.sect_tasks) ? player.sect_tasks : [];
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i] || {};
    if (String(t.type || '') !== 'kill_enemy') continue;
    if (!Boolean(t.accepted)) continue;
    if (_intVal(t.target_id, 0) !== _intVal(enemyId, 0)) continue;
    t.progress = _intVal(t.progress, 0) + 1;
    tasks[i] = t;
  }
  if (player && typeof player === 'object') {
    player.sect_tasks = tasks;
  }
}

export async function handleSectTaskRoute(request, env, route) {
  const method = request.method;
  const url = new URL(request.url);
  const subPath = route.replace(/^\/sect/, '') || '/';

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = intVal(auth.accountId || auth.sub || 0, 0);

  const db = createDb(env);

  if (subPath === '/tasks' && method === 'GET') return handleTaskList(db, accountId);
  if (subPath === '/tasks/refresh' && method === 'POST') return handleTaskRefresh(db, accountId);
  if (subPath === '/tasks/accept' && method === 'POST') return handleTaskAccept(db, accountId, request);
  if (subPath === '/tasks/abandon' && method === 'POST') return handleTaskAbandon(db, accountId, request);
  if (subPath === '/tasks/complete' && method === 'POST') return handleTaskComplete(db, accountId, request);

  return null;
}

// 任务列表（超时/槽位不足时自动刷新）
async function handleTaskList(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  if (intVal(player.sect_id, 0) === 0) return json({ ok: false, error: '未加入宗门' });
  const cur = nowSec();
  const nextRefresh = intVal(player.sect_task_refresh_time, 0);
  if (nextRefresh <= 0 || cur >= nextRefresh || !Array.isArray(player.sect_tasks) || player.sect_tasks.length !== SECT_TASK_SLOTS) {
    refreshSectTasks(player, SECT_TASK_SLOTS);
    player.sect_task_refresh_time = cur + SECT_TASK_REFRESH_SECONDS;
    await db.savePlayer(accountId, 1, player);
  }
  const completionsToday = await db.getSectTaskCompletionsToday(accountId);
  return json({
    ok: true,
    tasks: player.sect_tasks,
    player,
    next_refresh_at: intVal(player.sect_task_refresh_time, 0),
    sect_task_completions_today: completionsToday,
    sect_task_daily_limit: SECT_TASK_DAILY_LIMIT
  });
}

// 手动刷新宗门任务（消耗 100 灵石，不限次数）
async function handleTaskRefresh(db, accountId) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  if (intVal(player.sect_id, 0) === 0) return json({ ok: false, error: '未加入宗门' });
  const COST = SECT_TASK_MANUAL_REFRESH_COST;
  const stones = intVal(player.spirit_stones, 0);
  if (stones < COST) return json({ ok: false, error: `灵石不足（需要${COST}）` });
  player.spirit_stones = stones - COST;
  refreshSectTasks(player, SECT_TASK_SLOTS);
  const cur = nowSec();
  player.sect_task_refresh_time = cur + SECT_TASK_REFRESH_SECONDS;
  await db.savePlayer(accountId, 1, player);
  return json({
    ok: true,
    tasks: player.sect_tasks,
    player,
    next_refresh_at: player.sect_task_refresh_time,
    cost: COST
  });
}

// 接取任务
async function handleTaskAccept(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  if (intVal(player.sect_id, 0) === 0) return json({ ok: false, error: '未加入宗门' });
  const body = await request.json().catch(() => ({}));
  const idx = intVal(body?.slot_index, -1);
  if (!Array.isArray(player.sect_tasks) || idx < 0 || idx >= player.sect_tasks.length) return json({ ok: false, error: '任务槽位无效' });
  const task = player.sect_tasks[idx] || {};
  if (String(task.type || '') === '') return json({ ok: false, error: '该槽位无任务，请等待刷新' });
  if (Boolean(task.accepted)) return json({ ok: false, error: '该任务已接取' });
  task.accepted = true;
  task.progress = 0;
  player.sect_tasks[idx] = task;
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, tasks: player.sect_tasks, player });
}

// 放弃任务
async function handleTaskAbandon(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  if (intVal(player.sect_id, 0) === 0) return json({ ok: false, error: '未加入宗门' });
  const body = await request.json().catch(() => ({}));
  const idx = intVal(body?.slot_index, -1);
  if (!Array.isArray(player.sect_tasks) || idx < 0 || idx >= player.sect_tasks.length) return json({ ok: false, error: '任务槽位无效' });
  const task = player.sect_tasks[idx] || {};
  if (!Boolean(task.accepted)) return json({ ok: false, error: '该任务未接取，无需放弃' });
  task.accepted = false;
  task.progress = 0;
  task.type = '';
  player.sect_tasks[idx] = task;
  await db.savePlayer(accountId, 1, player);
  return json({ ok: true, tasks: player.sect_tasks, player });
}

// 提交任务（kill_enemy 击杀足够 或 submit_material 提交材料）
async function handleTaskComplete(db, accountId, request) {
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色' });
  if (intVal(player.sect_id, 0) === 0) return json({ ok: false, error: '未加入宗门' });
  const completionsToday = await db.getSectTaskCompletionsToday(accountId);
  if (completionsToday >= SECT_TASK_DAILY_LIMIT) {
    return json({ ok: false, error: `今日宗门任务已完成 ${SECT_TASK_DAILY_LIMIT} 次，明日再来` });
  }
  const body = await request.json().catch(() => ({}));
  const idx = intVal(body?.slot_index, -1);
  if (!Array.isArray(player.sect_tasks) || idx < 0 || idx >= player.sect_tasks.length) return json({ ok: false, error: '任务槽位无效' });
  const task = player.sect_tasks[idx] || {};
  if (!Boolean(task.accepted)) return json({ ok: false, error: '请先接取任务' });
  if (String(task.type || '') === 'submit_material') {
    const itemId = intVal(task.target_id, 0);
    const count = intVal(task.count, 1);
    if (countItemInInventory(player, itemId) < count) return json({ ok: false, error: `材料不足（需要 ${task.display_name || '未知'} x${count}）` });
    consumeItemFromInventory(player, itemId, count);
  } else if (String(task.type || '') === 'kill_enemy') {
    const progress = intVal(task.progress, 0);
    const count = intVal(task.count, 1);
    if (progress < count) return json({ ok: false, error: `击杀数量不足（${progress}/${count}）` });
  } else {
    return json({ ok: false, error: '该槽位无有效任务' });
  }
  player.sect_contribution = intVal(player.sect_contribution, 0) + intVal(task.reward, 0);
  task.accepted = false;
  task.progress = 0;
  task.type = '';
  player.sect_tasks[idx] = task;
  await db.savePlayerImmediate(accountId, 1, player);
  await db.incrementSectTaskCompletions(accountId);
  const completionsNow = completionsToday + 1;
  return json({
    ok: true,
    tasks: player.sect_tasks,
    player,
    sect_task_completions_today: completionsNow,
    sect_task_daily_limit: SECT_TASK_DAILY_LIMIT
  });
}
