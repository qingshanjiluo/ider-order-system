// aiConfig.js — AI玩家配置和个性定义
// 40个AI玩家，各有不同个性、活跃时段、行为偏好

export const AI_CONFIG = {
  // AI玩家总数
  TOTAL_AI_PLAYERS: 40,

  // AI账号ID范围（使用数字ID，避免与真人玩家冲突）
  // 真人玩家ID通常从1开始递增，AI使用90001-90040
  ACCOUNT_ID_START: 90001,
  ACCOUNT_ID_END: 90040,

  // AI行为tick间隔（毫秒）
  BEHAVIOR_TICK_MS: 5 * 60 * 1000, // 5分钟

  // 机器学习参数
  ML: {
    LEARNING_RATE: 0.1,        // 学习率
    DECAY_FACTOR: 0.95,        // 衰减因子（策略随时间调整）
    EXPLORATION_RATE: 0.2,     // 探索率（随机尝试新策略）
    MEMORY_SIZE: 100,          // 记忆容量（最近N次战斗）
    WIN_STREAK_BONUS: 0.05,    // 连胜奖励加成
    LOSE_STREAK_PENALTY: 0.03, // 连败惩罚
  },

  // AI行为概率（每tick）
  PROBABILITIES: {
    BATTLE: 0.7,           // 战斗概率
    LEVEL_UP: 0.3,         // 升级概率
    EQUIP: 0.2,            // 装备调整概率
    SKILL: 0.15,           // 技能调整概率
    TRADE: 0.1,            // 交易概率
    CHAT: 0.05,            // 聊天概率
    SECT_TASK: 0.2,        // 宗门任务概率
    ALLIANCE: 0.1,         // 仙盟活动概率
    BEAST_CARE: 0.15,      // 灵宠培养概率
    BREAKTHROUGH: 0.05,    // 突破尝试概率
  },

  // 灵根品质概率分布（与真人一致）
  SPIRIT_ROOT_QUALITY: {
    variant: 0.05,  // 变异灵根
    tian: 0.08,     // 天灵根
    zhen: 0.30,     // 真灵根
    wei: 0.57,      // 伪灵根
  },
};

// AI个性类型
export const AI_PERSONALITIES = {
  // 战斗型：偏好战斗，积极升级
  AGGRESSIVE: {
    name: '好斗',
    weight: { battle: 1.5, level_up: 1.3, trade: 0.7, chat: 0.5 },
    chat_freq: 0.03,
    preferred_maps: 'high_level', // 偏好高级地图
  },

  // 防御型：偏好防御，稳扎稳打
  DEFENSIVE: {
    name: '稳健',
    weight: { battle: 0.8, level_up: 1.2, equip: 1.5, chat: 0.8 },
    chat_freq: 0.05,
    preferred_maps: 'safe', // 偏好安全地图
  },

  // 社交型：偏好聊天和交易
  SOCIAL: {
    name: '社交',
    weight: { battle: 0.6, trade: 1.8, chat: 2.0, alliance: 1.5 },
    chat_freq: 0.15,
    preferred_maps: 'any',
  },

  // 经济型：偏好交易和制造
  ECONOMIC: {
    name: '商人',
    weight: { trade: 2.0, equip: 1.5, battle: 0.5, chat: 0.6 },
    chat_freq: 0.04,
    preferred_maps: 'low_level', // 偏好低级地图刷材料
  },

  // 修炼型：偏好修炼和突破
  CULTIVATOR: {
    name: '苦修',
    weight: { level_up: 1.8, breakthrough: 2.0, battle: 0.7, sect_task: 1.3 },
    chat_freq: 0.02,
    preferred_maps: 'any',
  },

  // 全能型：均衡发展
  BALANCED: {
    name: '全能',
    weight: { battle: 1.0, level_up: 1.0, equip: 1.0, trade: 1.0, chat: 1.0 },
    chat_freq: 0.06,
    preferred_maps: 'any',
  },

  // 新手型：刚入游戏，需要引导
  NEWBIE: {
    name: '萌新',
    weight: { battle: 0.5, level_up: 1.5, equip: 0.8, chat: 1.2 },
    chat_freq: 0.1,
    preferred_maps: 'low_level',
  },

  // 大佬型：高等级，活跃
  VETERAN: {
    name: '大佬',
    weight: { battle: 1.2, trade: 1.3, chat: 1.5, sect_task: 1.2 },
    chat_freq: 0.08,
    preferred_maps: 'high_level',
  },
};

// AI名字池（中文修仙风格）
export const AI_NAMES = [
  // 男性风格
  '云天明', '风无痕', '剑无心', '墨千尘', '夜无眠',
  '星辰子', '青云子', '紫霞仙', '玄天子', '太虚子',
  '清风道人', '明月真人', '碧落仙人', '九幽魔君', '血煞老祖',
  '天机老人', '地藏菩萨', '龙傲天', '凤傲地', '虎啸山',
  
  // 女性风格
  '花无缺', '月如霜', '雪见愁', '云中燕', '风中蝶',
  '紫萱仙子', '碧瑶仙子', '陆雪琪', '赵灵儿', '林月如',
  
  // 中性/特殊
  '一剑封喉', '二话不说', '三生有幸', '四季如春', '五福临门',
  '六脉神剑', '七星北斗', '八方来财', '九天玄女', '十全十美',
];

// AI聊天消息池
export const AI_CHAT_MESSAGES = {
  // 战斗相关
  BATTLE_VICTORY: [
    '哈哈，轻松获胜！',
    '这也太简单了吧',
    '下次能不能来点强的对手？',
    '实力碾压！',
    '不费吹灰之力',
  ],
  BATTLE_DEFEAT: [
    '可恶，下次一定赢回来！',
    '对手太强了，需要提升实力',
    '失败乃成功之母，继续修炼！',
    '这波亏了，得调整策略',
  ],

  // 升级相关
  LEVEL_UP: [
    '升级了！继续努力',
    '实力又提升了',
    '离目标又近了一步',
    '修炼有成，突破在望',
  ],

  // 交易相关
  TRADE_OFFER: [
    '有人要这个装备吗？',
    '低价出售，先到先得！',
    '求购灵石，价格公道',
    '以物易物，有意向的私聊',
  ],
  TRADE_SUCCESS: [
    '交易成功，合作共赢',
    '感谢惠顾，下次再来',
    '这波不亏',
    '赚到了！',
  ],

  // 社交相关
  GREETING: [
    '大家好！',
    '有人在吗？',
    '今天天气不错',
    '一起组队刷副本吗？',
  ],
  FAREWELL: [
    '先下了，明天见',
    '告辞，后会有期',
    '修炼去也',
    '晚安，各位道友',
  ],

  // 宗门/仙盟相关
  SECT_ACTIVITY: [
    '宗门任务做完了',
    '宗门宝库有好东西',
    '宗门战争加油！',
    '论道殿收获颇丰',
  ],
  ALLIANCE_ACTIVITY: [
    '仙盟祈福去',
    '灵池沐浴真舒服',
    '药园采摘收获满满',
    '仙盟仓库补货了',
  ],

  // 灵宠相关
  BEAST_SHOW: [
    '我的灵宠进化了！',
    '这只妖兽好可爱',
    '灵宠出战，属性加成不少',
    '谁有稀有妖兽蛋？',
  ],

  // 通用
  GENERAL: [
    '修仙之路漫漫',
    '今天运气不错',
    '继续努力修炼',
    '目标是飞升成仙！',
    '这游戏真好玩',
  ],
};

// AI活跃时段配置（24小时制）
export const AI_ACTIVE_HOURS = {
  // 早高峰 8-10点
  MORNING: { start: 8, end: 10, activity: 0.8 },
  // 午休 12-14点
  NOON: { start: 12, end: 14, activity: 0.6 },
  // 晚高峰 19-23点
  EVENING: { start: 19, end: 23, activity: 1.0 },
  // 深夜 0-2点（少数活跃）
  NIGHT: { start: 0, end: 2, activity: 0.3 },
  // 其他时间
  OTHER: { activity: 0.2 },
};

// AI等级分布配置
export const AI_LEVEL_DISTRIBUTION = {
  // 等级范围：[min, max, count]
  levels: [
    [1, 30, 5],      // 新手期 5个
    [30, 80, 8],     // 成长期 8个
    [80, 120, 10],   // 炼气后期 10个
    [120, 160, 7],   // 筑基期 7个
    [160, 200, 5],   // 元婴期 5个
    [200, 250, 3],   // 化神期 3个
    [250, 320, 2],   // 炼虚+ 2个
  ],
};

export default AI_CONFIG;
