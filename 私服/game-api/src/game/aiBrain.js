// aiBrain.js — AI决策引擎 + 机器学习模块
// 基于Q-Learning的简单强化学习，让AI玩家随时间优化策略

import { AI_CONFIG, AI_PERSONALITIES, AI_CHAT_MESSAGES } from './aiConfig.js';

// ── Q-Learning 表 ──
// 状态-动作值函数：Q(state, action) → value
const _qTable = new Map();

// ── AI记忆（最近N次战斗结果）──
const _aiMemory = new Map(); // accountId → [{state, action, reward, next_state}]

/**
 * 获取Q值
 */
function getQ(state, action) {
  const key = `${state}::${action}`;
  return _qTable.get(key) || 0;
}

/**
 * 更新Q值（Q-Learning更新规则）
 * Q(s,a) = Q(s,a) + α * (r + γ * max(Q(s',a')) - Q(s,a))
 */
function updateQ(state, action, reward, nextState) {
  const key = `${state}::${action}`;
  const currentQ = getQ(state, action);
  const maxNextQ = nextState ? getMaxQ(nextState) : 0;
  const newQ = currentQ + AI_CONFIG.ML.LEARNING_RATE * (
    reward + AI_CONFIG.ML.DECAY_FACTOR * maxNextQ - currentQ
  );
  _qTable.set(key, newQ);
}

/**
 * 获取某状态的最大Q值对应的动作
 */
function getMaxQ(state) {
  let maxVal = -Infinity;
  for (const [key, val] of _qTable) {
    if (key.startsWith(state + '::') && val > maxVal) {
      maxVal = val;
    }
  }
  return maxVal === -Infinity ? 0 : maxVal;
}

/**
 * 获取当前状态下的最佳动作（带探索）
 */
function getBestAction(state, availableActions, explorationRate) {
  // ε-greedy策略
  if (Math.random() < explorationRate) {
    // 探索：随机选择
    return availableActions[Math.floor(Math.random() * availableActions.length)];
  }
  
  // 利用：选择Q值最高的动作
  let bestAction = availableActions[0];
  let bestQ = -Infinity;
  
  for (const action of availableActions) {
    const q = getQ(state, action);
    if (q > bestQ) {
      bestQ = q;
      bestAction = action;
    }
  }
  
  return bestAction;
}

/**
 * 记录AI行为结果
 */
function recordExperience(accountId, state, action, reward, nextState) {
  if (!_aiMemory.has(accountId)) {
    _aiMemory.set(accountId, []);
  }
  const memory = _aiMemory.get(accountId);
  memory.push({ state, action, reward, next_state: nextState, timestamp: Date.now() });
  
  // 限制记忆容量
  if (memory.length > AI_CONFIG.ML.MEMORY_SIZE) {
    memory.shift();
  }
  
  // 更新Q表
  updateQ(state, action, reward, nextState);
}

/**
 * 获取AI状态摘要（用于决策）
 */
function getAIState(player, env) {
  const level = player.level || 1;
  const exp = player.exp || 0;
  const expNeeded = player.max_exp || 100;
  const hp = player.hp || 0;
  const maxHp = player.max_hp || 1;
  const mp = player.mp || 0;
  const maxMp = player.max_mp || 1;
  const spiritStones = player.spirit_stones || 0;
  const equipCount = Object.keys(player.equipment || {}).filter(k => player.equipment[k]).length;
  const skillCount = Object.keys(player.skill_levels || {}).length;
  const beastCount = (player.beasts?.roster || []).length;
  
  // 状态分类
  const hpRatio = hp / maxHp;
  const mpRatio = mp / maxMp;
  const equipRatio = equipCount / 10; // 10个装备栏位
  
  // 简化状态表示
  let state = 'lv' + Math.floor(level / 20); // 每20级一个状态
  state += '_hp' + (hpRatio > 0.8 ? 'high' : hpRatio > 0.4 ? 'mid' : 'low');
  state += '_eq' + (equipRatio > 0.7 ? 'good' : equipRatio > 0.4 ? 'mid' : 'poor');
  state += '_gold' + (spiritStones > 10000 ? 'rich' : spiritStones > 1000 ? 'mid' : 'poor');
  
  return {
    state,
    level,
    hpRatio,
    mpRatio,
    equipRatio,
    spiritStones,
    equipCount,
    skillCount,
    beastCount,
    hasSect: !!player.sect_id,
    hasAlliance: !!player.alliance_id,
  };
}

/**
 * AI战斗决策
 */
function decideBattleAction(playerState, availableSkills) {
  const actions = ['attack', ...availableSkills];
  
  // 根据HP决定策略
  if (playerState.hpRatio < 0.3) {
    // 低血量：优先防御/治疗
    return Math.random() < 0.6 ? 'defend' : 'attack';
  }
  
  if (playerState.hpRatio < 0.6) {
    // 中等血量：50%攻击，50%技能
    return Math.random() < 0.5 ? 'attack' : (availableSkills[0] || 'attack');
  }
  
  // 高血量：优先技能
  if (availableSkills.length > 0 && Math.random() < 0.7) {
    return availableSkills[Math.floor(Math.random() * availableSkills.length)];
  }
  
  return 'attack';
}

/**
 * AI养成决策
 */
function decideCultivation(playerState, personality) {
  const decisions = [];
  const weights = personality.weight;
  
  // 升级决策
  if (playerState.spiritStones > playerState.level * 100) {
    decisions.push({ action: 'level_up', weight: weights.level_up || 1 });
  }
  
  // 装备调整决策
  if (playerState.equipRatio < 0.7) {
    decisions.push({ action: 'equip', weight: weights.equip || 1 });
  }
  
  // 突破决策
  const breakthroughLevels = [120, 160, 200, 240, 280];
  if (breakthroughLevels.includes(playerState.level)) {
    decisions.push({ action: 'breakthrough', weight: weights.breakthrough || 1 });
  }
  
  // 灵宠培养决策
  if (playerState.beastCount > 0) {
    decisions.push({ action: 'beast_care', weight: 1 });
  }
  
  // 宗门任务决策
  if (playerState.hasSect) {
    decisions.push({ action: 'sect_task', weight: weights.sect_task || 1 });
  }
  
  // 仙盟活动决策
  if (playerState.hasAlliance) {
    decisions.push({ action: 'alliance', weight: weights.alliance || 1 });
  }
  
  if (decisions.length === 0) return null;
  
  // 加权随机选择
  const totalWeight = decisions.reduce((sum, d) => sum + d.weight, 0);
  let r = Math.random() * totalWeight;
  for (const d of decisions) {
    r -= d.weight;
    if (r <= 0) return d.action;
  }
  
  return decisions[decisions.length - 1].action;
}

/**
 * AI聊天决策
 */
function decideChat(playerState, personality) {
  const freq = personality.chat_freq || 0.05;
  if (Math.random() > freq) return null;
  
  // 根据最近事件选择聊天内容
  const categories = Object.keys(AI_CHAT_MESSAGES);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const messages = AI_CHAT_MESSAGES[category];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * 计算战斗奖励
 */
function calculateBattleReward(result, playerState) {
  let reward = 0;
  
  if (result === 'win') {
    reward = 1.0;
    // 连胜奖励
    const streak = _aiMemory.get(playerState.accountId)?.filter(m => m.action === 'battle' && m.reward > 0).length || 0;
    if (streak >= 3) {
      reward += AI_CONFIG.ML.WIN_STREAK_BONUS * Math.min(streak - 2, 5);
    }
  } else if (result === 'lose') {
    reward = -0.5;
    // 连败补偿
    reward -= AI_CONFIG.ML.LOSE_STREAK_PENALTY;
  } else {
    reward = 0.1; // 平局
  }
  
  return reward;
}

/**
 * 主决策函数：根据当前状态决定下一个动作
 */
export function makeDecision(player, env) {
  const playerState = getAIState(player, env);
  const personality = AI_PERSONALITIES[player.ai_personality] || AI_PERSONALITIES.BALANCED;
  const explorationRate = AI_CONFIG.ML.EXPLORATION_RATE;
  
  // 可用动作列表
  const availableActions = ['battle', 'level_up', 'equip', 'skill', 'trade', 'chat', 'sect_task', 'alliance', 'beast_care', 'breakthrough'];
  
  // 使用Q-Learning选择动作
  const action = getBestAction(playerState.state, availableActions, explorationRate);
  
  // 根据个性调整概率
  const actionProb = AI_CONFIG.PROBABILITIES[action.toUpperCase()] || 0.1;
  const personalityWeight = personality.weight[action] || 1;
  
  // 最终概率 = 基础概率 × 个性权重
  const finalProb = Math.min(1, actionProb * personalityWeight);
  
  // 概率判定
  if (Math.random() > finalProb) {
    return { action: 'idle', reason: 'probability_check_failed' };
  }
  
  // 执行动作
  return {
    action,
    playerState,
    personality,
    chatMessage: action === 'chat' ? decideChat(playerState, personality) : null,
    battleAction: action === 'battle' ? decideBattleAction(playerState, player.equipped_skills || []) : null,
    cultivationAction: action !== 'battle' && action !== 'chat' ? decideCultivation(playerState, personality) : null,
  };
}

/**
 * 反馈学习：根据执行结果更新策略
 */
export function learnFromExperience(accountId, state, action, result, nextState) {
  const reward = calculateBattleReward(result, { accountId });
  recordExperience(accountId, state, action, reward, nextState);
}

/**
 * 获取AI统计信息
 */
export function getAIStats() {
  return {
    qTableSize: _qTable.size,
    memorySize: _aiMemory.size,
    topQValues: Array.from(_qTable.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => ({ key: k, value: v.toFixed(4) })),
  };
}

export default {
  makeDecision,
  learnFromExperience,
  getAIStats,
  getQ,
  updateQ,
};
