/**
 * online 路由模块入口（Worker 版）
 * 迁移自 server/routes/online.js：保留兑换码奖励配置与对外导出。
 */
import { rollEquipmentFromTemplateItem, getPlayerAffixQualityCap } from '../game/equipmentGen.js';

// 兑换码奖励：key=兑换码，value=奖励数组。每项为 { itemId, count } 或 { generateSet, quality }
export const REWARDS_BY_CODE = {
  '重生之我在艾德尔修仙669': [
    { generateSet: '劫灭-斗战乾坤', quality: 7 }
  ],
  '我们妙音宗数值就是这么填的': [
    { itemId: -1, count: 100 },
    { itemId: 17, count: 10 }
  ]
};

function _intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

// 迁移自 server/routes/online/sectTaskRoutes.js：宗门任务击杀进度结算。
// 副本/斗法结算通关时对每个怪物 id 调用，推进已接取的 kill_enemy 任务进度。
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

export { rollEquipmentFromTemplateItem, getPlayerAffixQualityCap };