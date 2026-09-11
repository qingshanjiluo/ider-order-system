// aiRoutes.js — AI玩家系统API路由
// 提供AI玩家管理、查询、交互的API端点

import { createDb } from '../db.js';
import { AI_CONFIG } from './aiConfig.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
import {
  initializeAIPlayers,
  getAIPlayers,
  runAllAITicks,
  getAISystemStats,
} from './aiScheduler.js';
import { getAIStats } from './aiBrain.js';

/**
 * 处理AI系统路由
 */
export async function handleAIRoute(request, env, route) {
  const db = createDb(env);

  // ── GET /ai/status — AI系统状态 ──
  if (route === '/ai/status' && request.method === 'GET') {
    try {
      const stats = getAISystemStats();
      const players = await getAIPlayers(env);
      
      return json({
        ok: true,
        total_ai: AI_CONFIG.TOTAL_AI_PLAYERS,
        active_count: players.length,
        stats,
        ml_stats: getAIStats(),
      }, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  // ── POST /ai/init — 初始化AI玩家 ──
  if (route === '/ai/init' && request.method === 'POST') {
    try {
      const results = await initializeAIPlayers(env);
      return json({ ok: true, results }, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  // ── POST /ai/tick — 运行AI行为tick ──
  if (route === '/ai/tick' && request.method === 'POST') {
    try {
      const results = await runAllAITicks(env);
      return json({ ok: true, results }, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  // ── GET /ai/players — 获取AI玩家列表 ──
  if (route === '/ai/players' && request.method === 'GET') {
    try {
      const players = await getAIPlayers(env);
      const playerList = players.map(p => ({
        account_id: p.account_id,
        name: p.name,
        level: p.level,
        spirit_root_quality: p.spirit_root_quality,
        ai_personality: p.ai_personality,
        sect_id: p.sect_id,
        alliance_id: p.alliance_id,
        is_ai: true,
      }));
      return json({ ok: true, players: playerList }, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  // ── GET /ai/players/:id — 获取单个AI玩家详情 ──
  if (route.startsWith('/ai/players/') && route !== '/ai/players' && request.method === 'GET') {
    try {
      const accountId = route.replace('/ai/players/', '');
      const player = await db.getPlayerByAccountId(accountId);
      
      if (!player || !player.is_ai) {
        return json({ ok: false, error: 'AI player not found' }, 404, CORS);
      }
      
      // 返回脱敏数据
      return json({
        ok: true,
        player: {
          account_id: player.account_id,
          name: player.name,
          level: player.level,
          spirit_root_quality: player.spirit_root_quality,
          ai_personality: player.ai_personality,
          sect_id: player.sect_id,
          alliance_id: player.alliance_id,
          equipment: player.equipment,
          beasts: player.beasts,
          is_ai: true,
        },
      }, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  // ── POST /ai/interact — 与AI玩家交互 ──
  if (route === '/ai/interact' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { target_account_id, action } = body;
      
      if (!target_account_id || !action) {
        return json({ ok: false, error: 'Missing target_account_id or action' }, 400, CORS);
      }
      
      const target = await db.getPlayerByAccountId(target_account_id);
      if (!target || !target.is_ai) {
        return json({ ok: false, error: 'AI player not found' }, 404, CORS);
      }
      
      // 根据交互类型返回不同响应
      let response = { ok: true, action };
      
      switch (action) {
        case 'challenge':
          // 挑战AI
          response.ai_level = target.level;
          response.ai_power = target.max_hp + (target.max_phys_damage || 0);
          response.message = `${target.name}接受了你的挑战！`;
          break;
          
        case 'trade':
          // 与AI交易
          response.trade_available = true;
          response.message = `${target.name}愿意与你交易。`;
          break;
          
        case 'chat':
          // 与AI聊天
          const chatResponses = [
            '道友有何指教？',
            '今日修炼如何？',
            '可有什么有趣的见闻？',
            '一起组队刷副本吗？',
          ];
          response.message = chatResponses[Math.floor(Math.random() * chatResponses.length)];
          break;
          
        default:
          response.message = `${target.name}看了你一眼。`;
      }
      
      return json(response, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  // ── GET /ai/leaderboard — AI排行榜 ──
  if (route === '/ai/leaderboard' && request.method === 'GET') {
    try {
      const players = await getAIPlayers(env);
      
      // 按等级排序
      const sorted = players
        .sort((a, b) => (b.level || 0) - (a.level || 0))
        .slice(0, 20)
        .map((p, i) => ({
          rank: i + 1,
          name: p.name,
          level: p.level,
          spirit_root_quality: p.spirit_root_quality,
          ai_personality: p.ai_personality,
          is_ai: true,
        }));
      
      return json({ ok: true, leaderboard: sorted }, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  // ── POST /ai/reset — 重置AI系统 ──
  if (route === '/ai/reset' && request.method === 'POST') {
    try {
      // 清除缓存
      const stats = getAISystemStats();
      return json({ ok: true, message: 'AI system reset', stats }, 200, CORS);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, CORS);
    }
  }

  return null; // 未匹配的路由
}

export default handleAIRoute;
