// navigation.js - 新模块化导航系统
// 将25+个平级标签重组为6大模块

export const MODULES = [
  {
    id: 'cultivation',
    label: '修行',
    icon: '🧘',
    description: '角色养成',
    subTabs: [
      { id: 'cultivation', label: '修炼', icon: '📈' },
      { id: 'techniques', label: '功法', icon: '📜' },
      { id: 'skills', label: '技能', icon: '⚔️' },
      { id: 'beast', label: '灵宠', icon: '🐉' },
    ]
  },
  {
    id: 'combat',
    label: '战斗',
    icon: '⚔️',
    description: '所有战斗',
    subTabs: [
      { id: 'map', label: '地图', icon: '🗺️' },
      { id: 'dungeon', label: '副本', icon: '🏰' },
      { id: 'trial', label: '试炼', icon: '⚡' },
      { id: 'duel', label: '斗法', icon: '👊' },
      { id: 'league', label: '联赛', icon: '🏆' },
      { id: 'sectwar', label: '宗门战', icon: '🏴' },
    ]
  },
  {
    id: 'social',
    label: '社交',
    icon: '👥',
    description: '互动交流',
    subTabs: [
      { id: 'chat', label: '聊天', icon: '💬' },
      { id: 'sect', label: '宗门', icon: '🏯' },
      { id: 'alliance', label: '仙盟', icon: '🤝' },
      { id: 'mail', label: '邮件', icon: '✉️' },
    ]
  },
  {
    id: 'crafting',
    label: '制造',
    icon: '🔨',
    description: '生产制作',
    subTabs: [
      { id: 'bailian', label: '百炼', icon: '🔥' },
      { id: 'inventory', label: '背包', icon: '🎒' },
      { id: 'equipment', label: '装备', icon: '🛡️' },
      { id: 'exchange', label: '坊市', icon: '🏪' },
    ]
  },
  {
    id: 'world',
    label: '世界',
    icon: '🌍',
    description: '探索资源',
    subTabs: [
      { id: 'cave', label: '洞府', icon: '🏠' },
      { id: 'disciple', label: '传人', icon: '👤' },
      { id: 'shijieshu', label: '世界书', icon: '📖' },
    ]
  },
  {
    id: 'more',
    label: '更多',
    icon: '⚙️',
    description: '系统设置',
    subTabs: [
      { id: 'settings', label: '设置', icon: '⚙️' },
      { id: 'dictionary', label: '词典', icon: '📚' },
      { id: 'announcement', label: '公告', icon: '📢' },
    ]
  }
];

// 获取模块ID（根据子面板ID）
export function getModuleByTab(tabId) {
  for (const mod of MODULES) {
    if (mod.subTabs.some(t => t.id === tabId)) {
      return mod;
    }
  }
  return MODULES[0]; // 默认返回修行模块
}

// 获取模块内的子面板索引
export function getSubTabIndex(moduleId, tabId) {
  const mod = MODULES.find(m => m.id === moduleId);
  if (!mod) return 0;
  return mod.subTabs.findIndex(t => t.id === tabId);
}

// 根据tabId获取所属模块和子面板信息
export function getTabInfo(tabId) {
  for (const mod of MODULES) {
    const subTab = mod.subTabs.find(t => t.id === tabId);
    if (subTab) {
      return { module: mod, subTab };
    }
  }
  return { module: MODULES[0], subTab: MODULES[0].subTabs[0] };
}
