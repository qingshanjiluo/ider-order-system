// aiScheduler.js — AI玩家调度和执行系统
// 负责创建AI玩家、执行AI决策、管理AI状态

import { createDb } from '../db.js';
import { createInitialPlayerData } from '../player.js';
import { recalcAndAssignCombatStats } from './combatUtils.js';
import { AI_CONFIG, AI_PERSONALITIES, AI_NAMES, AI_LEVEL_DISTRIBUTION } from './aiConfig.js';
import { makeDecision, learnFromExperience, getAIStats } from './aiBrain.js';

// ── AI玩家缓存 ──
let _aiPlayersCache = null;
let _lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 生成随机灵根
 */
function generateRandomSpiritRoots() {
  const qualityRoll = Math.random();
  let quality, roots;
  
  if (qualityRoll < AI_CONFIG.SPIRIT_ROOT_QUALITY.variant) {
    quality = 'variant';
    const elements = ['metal', 'wood', 'water', 'fire', 'earth'];
    const mainElement = elements[Math.floor(Math.random() * 5)];
    const variants = ['thunder', 'ice', 'wind', 'dark', 'light'];
    const variant = variants[Math.floor(Math.random() * 5)];
    roots = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
    roots[mainElement] = 85 + Math.floor(Math.random() * 16);
    return { roots, quality, variant };
  } else if (qualityRoll < AI_CONFIG.SPIRIT_ROOT_QUALITY.variant + AI_CONFIG.SPIRIT_ROOT_QUALITY.tian) {
    quality = 'tian';
    const elements = ['metal', 'wood', 'water', 'fire', 'earth'];
    const mainElement = elements[Math.floor(Math.random() * 5)];
    roots = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
    roots[mainElement] = 90 + Math.floor(Math.random() * 11);
    return { roots, quality, variant: '' };
  } else if (qualityRoll < AI_CONFIG.SPIRIT_ROOT_QUALITY.variant + AI_CONFIG.SPIRIT_ROOT_QUALITY.tian + AI_CONFIG.SPIRIT_ROOT_QUALITY.zhen) {
    quality = 'zhen';
    roots = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
    const elements = ['metal', 'wood', 'water', 'fire', 'earth'];
    const count = 2 + Math.floor(Math.random() * 2); // 2-3系
    const shuffled = elements.sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      roots[shuffled[i]] = 60 + Math.floor(Math.random() * 31);
    }
    return { roots, quality, variant: '' };
  } else {
    quality = 'wei';
    roots = {
      metal: 30 + Math.floor(Math.random() * 31),
      wood: 30 + Math.floor(Math.random() * 31),
      water: 30 + Math.floor(Math.random() * 31),
      fire: 30 + Math.floor(Math.random() * 31),
      earth: 30 + Math.floor(Math.random() * 31),
    };
    return { roots, quality, variant: '' };
  }
}

/**
 * 生成AI玩家初始数据
 */
function generateAIPlayerData(index) {
  const originalIndex = index;
  const personalityTypes = Object.keys(AI_PERSONALITIES);
  const personality = personalityTypes[originalIndex % personalityTypes.length];
  
  // 确定等级（注意：下面的循环会修改 index，所以要用 originalIndex 保存原始值）
  let targetLevel = 1;
  let levelIndex = originalIndex;
  for (const [min, max, count] of AI_LEVEL_DISTRIBUTION.levels) {
    if (levelIndex < count) {
      targetLevel = min + Math.floor(Math.random() * (max - min));
      break;
    }
    levelIndex -= count;
  }
  
  // 生成灵根
  const { roots, quality, variant } = generateRandomSpiritRoots();
  
  // 创建玩家数据
  const player = createInitialPlayerData(AI_NAMES[originalIndex % AI_NAMES.length]);
  
  // 设置AI标识
  player.account_id = AI_CONFIG.ACCOUNT_ID_START + originalIndex;
  player.ai_personality = personality;
  player.is_ai = true;
  
  // 设置灵根
  player.spirit_roots = { ...roots };
  player.base_spirit_roots = { ...roots };
  player.original_spirit_roots = { ...roots };
  player.spirit_root_quality = quality;
  player.spirit_root_variant = variant;
  
  // 设置等级（快速提升到目标等级）
  player.level = targetLevel;
  player.exp = 0;
  
  // 根据等级设置基础属性
  const baseAttr = 10 + Math.floor(targetLevel * 1.5);
  player.strength = baseAttr + Math.floor(Math.random() * 20);
  player.constitution = baseAttr + Math.floor(Math.random() * 20);
  player.bone = baseAttr + Math.floor(Math.random() * 20);
  player.agility = baseAttr + Math.floor(Math.random() * 20);
  player.zhenyuan = baseAttr + Math.floor(Math.random() * 20);
  player.lingli = baseAttr + Math.floor(Math.random() * 20);
  
  // 设置灵石
  player.spirit_stones = targetLevel * 500 + Math.floor(Math.random() * targetLevel * 100);
  
  // 设置自动战斗
  player.auto_battle_enabled = true;
  player.auto_battle_map_id = Math.min(targetLevel, 10);
  
  // 计算战斗属性
  recalcAndAssignCombatStats(player);
  
  return player;
}

/**
 * 初始化所有AI玩家到数据库
 */
export async function initializeAIPlayers(env) {
  const db = createDb(env);
  const results = { created: 0, existing: 0, errors: 0 };
  
  for (let i = 0; i < AI_CONFIG.TOTAL_AI_PLAYERS; i++) {
    try {
      const accountId = AI_CONFIG.ACCOUNT_ID_START + i;
      
      // 检查是否已存在
      const existing = await db.getPlayerByAccountId(accountId);
      if (existing) {
        results.existing++;
        continue;
      }
      
      // 先在 accounts 表创建假账号（players 表有 FOREIGN KEY REFERENCES accounts(id)）
      // 必须显式指定 id，让 accounts.id = accountId，否则 AUTOINCREMENT 会分配不同的 id
      const username = `ai_${accountId}`;
      const passwordHash = 'ai_no_password';
      await env.DB.prepare(
        `INSERT OR IGNORE INTO accounts (id, username, password_hash, email, register_ip, machine_id, created_at)
         VALUES (?, ?, ?, 'ai@bot', '127.0.0.1', 'ai_bot', strftime('%s','now'))`
      ).bind(accountId, username, passwordHash).run().catch(() => {});
      
      // 创建新AI玩家
      const playerData = generateAIPlayerData(i);
      await db.savePlayerImmediate(accountId, 1, playerData);
      results.created++;
      
    } catch (e) {
      console.error(`AI player ${i + 1} creation failed:`, e.message);
      results.errors++;
    }
  }
  
  console.log(`AI Players initialized: ${results.created} created, ${results.existing} existing, ${results.errors} errors`);
  return results;
}

/**
 * 获取所有AI玩家列表
 */
export async function getAIPlayers(env, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _aiPlayersCache && now - _lastCacheTime < CACHE_TTL) {
    return _aiPlayersCache;
  }
  
  const db = createDb(env);
  const players = [];
  
  for (let i = 0; i < AI_CONFIG.TOTAL_AI_PLAYERS; i++) {
    try {
      const accountId = AI_CONFIG.ACCOUNT_ID_START + i;
      const player = await db.getPlayerByAccountId(accountId);
      if (player) {
        players.push(player);
      }
    } catch (e) {
      console.error(`Failed to load AI player ${i + 1}:`, e.message);
    }
  }
  
  _aiPlayersCache = players;
  _lastCacheTime = now;
  
  return players;
}

/**
 * 执行AI玩家的一个行为tick
 */
export async function executeAITick(player, env) {
  const db = createDb(env);
  const accountId = player.account_id;
  
  try {
    // 获取决策
    const decision = makeDecision(player, env);
    
    if (decision.action === 'idle') {
      return { ok: true, action: 'idle', reason: decision.reason };
    }
    
    // 执行动作
    let result = { ok: false, error: 'unknown_action' };
    
    switch (decision.action) {
      case 'battle':
        result = await executeAIBattle(player, env);
        break;
        
      case 'level_up':
        result = executeAILevelUp(player);
        break;
        
      case 'equip':
        result = executeAIEquip(player);
        break;
        
      case 'skill':
        result = executeAISkill(player);
        break;
        
      case 'sect_task':
        result = await executeAISectTask(player, env);
        break;
        
      case 'alliance':
        result = await executeAIAlliance(player, env);
        break;
        
      case 'beast_care':
        result = executeAIBeastCare(player);
        break;
        
      case 'breakthrough':
        result = executeAIBreakthrough(player);
        break;
        
      case 'trade':
        result = executeAITrade(player);
        break;
        
      case 'chat':
        result = { ok: true, action: 'chat', message: decision.chatMessage };
        break;
    }
    
    // 保存玩家数据
    if (result.ok && result.modified) {
      recalcAndAssignCombatStats(player);
      await db.savePlayerImmediate(accountId, 1, player);
    }
    
    // 学习反馈
    if (result.ok && result.battleResult) {
      const nextState = getAIStateKey(player);
      learnFromExperience(accountId, decision.playerState?.state, decision.action, result.battleResult, nextState);
    }
    
    return result;
    
  } catch (e) {
    console.error(`AI tick failed for ${accountId}:`, e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * AI战斗执行
 */
async function executeAIBattle(player, env) {
  // 模拟战斗胜利（简化版）
  const expGain = Math.floor(player.level * 10 * (0.8 + Math.random() * 0.4));
  const stoneGain = Math.floor(player.level * 5 * (0.5 + Math.random() * 0.5));
  
  player.exp += expGain;
  player.spirit_stones += stoneGain;
  
  // 检查是否升级
  const maxExp = player.max_exp || (player.level * 100);
  if (player.exp >= maxExp) {
    player.exp -= maxExp;
    player.level++;
    return { ok: true, action: 'battle_levelup', battleResult: 'win', expGain, stoneGain, modified: true };
  }
  
  return { ok: true, action: 'battle', battleResult: 'win', expGain, stoneGain, modified: true };
}

/**
 * AI升级执行
 */
function executeAILevelUp(player) {
  const cost = player.level * 100;
  if (player.spirit_stones < cost) {
    return { ok: false, error: 'insufficient_stones', needed: cost, have: player.spirit_stones };
  }
  
  player.spirit_stones -= cost;
  player.level++;
  player.exp = 0;
  
  return { ok: true, action: 'level_up', modified: true };
}

/**
 * AI装备执行
 */
function executeAIEquip(player) {
  // 简化：随机调整装备
  const slots = ['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back'];
  const emptySlot = slots.find(s => !player.equipment[s]);
  
  if (emptySlot && player.inventory?.flat()?.length > 0) {
    // 尝试装备
    const item = player.inventory.flat().find(slot => slot?.item);
    if (item) {
      return { ok: true, action: 'equip', modified: false };
    }
  }
  
  return { ok: true, action: 'equip', modified: false };
}

/**
 * AI技能执行
 */
function executeAISkill(player) {
  // 简化：随机学习技能
  return { ok: true, action: 'skill', modified: false };
}

/**
 * AI宗门任务执行
 */
async function executeAISectTask(player, env) {
  if (!player.sect_id) {
    return { ok: false, error: 'no_sect' };
  }
  
  // 简化：增加宗门贡献
  player.sect_contribution = (player.sect_contribution || 0) + 10;
  return { ok: true, action: 'sect_task', modified: true };
}

/**
 * AI仙盟活动执行
 */
async function executeAIAlliance(player, env) {
  if (!player.alliance_id) {
    return { ok: false, error: 'no_alliance' };
  }
  
  // 简化：增加仙盟贡献
  player.alliance_contribution = (player.alliance_contribution || 0) + 5;
  return { ok: true, action: 'alliance', modified: true };
}

/**
 * AI灵宠培养执行
 */
function executeAIBeastCare(player) {
  const roster = player.beasts?.roster || [];
  if (roster.length === 0) {
    return { ok: false, error: 'no_beasts' };
  }
  
  // 简化：随机喂养一只灵宠
  const beast = roster[Math.floor(Math.random() * roster.length)];
  beast.exp = (beast.exp || 0) + 50;
  
  return { ok: true, action: 'beast_care', beastId: beast.id, modified: true };
}

/**
 * AI突破执行
 */
function executeAIBreakthrough(player) {
  const breakthroughLevels = [120, 160, 200, 240, 280];
  if (!breakthroughLevels.includes(player.level)) {
    return { ok: false, error: 'not_breakthrough_level' };
  }
  
  // 简化：50%成功率
  if (Math.random() < 0.5) {
    player.level++;
    return { ok: true, action: 'breakthrough', success: true, modified: true };
  }
  
  return { ok: true, action: 'breakthrough', success: false, modified: false };
}

/**
 * AI交易执行
 */
function executeAITrade(player) {
  // 简化：随机买卖
  const isBuy = Math.random() < 0.5;
  const amount = Math.floor(player.level * 10 * Math.random());
  
  if (isBuy) {
    player.spirit_stones -= amount;
  } else {
    player.spirit_stones += amount;
  }
  
  return { ok: true, action: 'trade', isBuy, amount, modified: true };
}

/**
 * 获取AI状态key（用于Q-Learning）
 */
function getAIStateKey(player) {
  const level = player.level || 1;
  const hpRatio = (player.hp || 0) / (player.max_hp || 1);
  const equipCount = Object.keys(player.equipment || {}).filter(k => player.equipment[k]).length;
  
  let state = 'lv' + Math.floor(level / 20);
  state += '_hp' + (hpRatio > 0.8 ? 'high' : hpRatio > 0.4 ? 'mid' : 'low');
  state += '_eq' + (equipCount > 7 ? 'good' : equipCount > 4 ? 'mid' : 'poor');
  
  return state;
}

/**
 * 运行所有AI玩家的行为tick
 */
export async function runAllAITicks(env) {
  const players = await getAIPlayers(env);
  const results = { success: 0, failed: 0, idle: 0 };
  
  for (const player of players) {
    // 检查活跃时段
    if (!isAIActive(player)) {
      results.idle++;
      continue;
    }
    
    try {
      const result = await executeAITick(player, env);
      if (result.ok) {
        results.success++;
      } else {
        results.failed++;
      }
    } catch (e) {
      results.failed++;
    }
  }
  
  return results;
}

/**
 * 检查AI是否在活跃时段
 */
function isAIActive(player) {
  const now = new Date();
  const hour = now.getHours();
  
  // 基础概率
  let activity = 0.2;
  
  // 根据时段调整
  if (hour >= 8 && hour < 10) activity = 0.8;
  else if (hour >= 12 && hour < 14) activity = 0.6;
  else if (hour >= 19 && hour < 23) activity = 1.0;
  else if (hour >= 0 && hour < 2) activity = 0.3;
  
  // 根据个性调整
  const personality = AI_PERSONALITIES[player.ai_personality];
  if (personality) {
    activity *= (personality.weight?.battle || 1) / 1.5;
  }
  
  return Math.random() < activity;
}

/**
 * 获取AI系统统计
 */
export function getAISystemStats() {
  return {
    ...getAIStats(),
    cacheSize: _aiPlayersCache?.length || 0,
    lastCacheTime: _lastCacheTime,
  };
}

export default {
  initializeAIPlayers,
  getAIPlayers,
  executeAITick,
  runAllAITicks,
  getAISystemStats,
};
