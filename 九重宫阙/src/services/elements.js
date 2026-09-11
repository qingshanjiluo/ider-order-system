/**
 * 元素体系单一事实源（阶段2 · 决议 D2）
 *
 * 7 系战斗元素：金木水火土 + 光明黑暗（+ 无属性 none）
 * 特殊灵根（剑丹欲财至尊炉鼎）不参与基础克制（见角色灵根生成）
 *
 * 克制：相克 1.3 / 被克 0.7 / 光暗互克 1.3 / 其余 1.0（决议 D2 系数）
 * 五行循环：金克木 → 木克土 → 土克水 → 水克火 → 火克金
 *
 * normalize() 兼容全部历史命名（中文旧体系：金木水火土雷风光暗混沌五行仙星辰阴阳空间造化；
 * 英文旧体系：fire/water/earth/lightning/wind/holy/dark），存量数据无需迁移即可参战。
 */
const ELEMENTS = {
  metal: { name: '金' },
  wood: { name: '木' },
  water: { name: '水' },
  fire: { name: '火' },
  earth: { name: '土' },
  light: { name: '光明' },
  dark: { name: '黑暗' },
  none: { name: '无' }
};

const STRONG_AGAINST = {
  metal: ['wood'],
  wood: ['earth'],
  earth: ['water'],
  water: ['fire'],
  fire: ['metal'],
  light: ['dark'],
  dark: ['light']
};

const EFFECT = { strong: 1.3, weak: 0.7, normal: 1.0 };

const LEGACY_MAP = {
  // 中文旧体系（怪物/地图/物品数据）
  '金': 'metal', '雷': 'metal', '木': 'wood', '风': 'wood',
  '水': 'water', '火': 'fire', '土': 'earth',
  '光': 'light', '圣': 'light', '仙': 'light', '星辰': 'light', '阳': 'light',
  '暗': 'dark', '阴': 'dark', '魔': 'dark',
  '混沌': 'none', '五行': 'none', '阴阳': 'none', '空间': 'none', '造化': 'none', '无': 'none',
  // 英文旧体系（技能/代码历史键）
  fire: 'fire', water: 'water', earth: 'earth',
  lightning: 'metal', wind: 'wood', holy: 'light',
  light: 'light', metal: 'metal', wood: 'wood', dark: 'dark', none: 'none'
};

/** 任意历史/中文/规范命名 → 规范键 */
function normalize(raw) {
  if (raw === undefined || raw === null || raw === '') return 'none';
  if (LEGACY_MAP[raw]) return LEGACY_MAP[raw];
  return ELEMENTS[raw] ? raw : 'none';
}

/** 攻击方对防御方的克制系数 */
function effectiveness(attackerElement, defenderElement) {
  const a = normalize(attackerElement);
  const d = normalize(defenderElement);
  if (a === 'none' || d === 'none') return EFFECT.normal;
  if ((STRONG_AGAINST[a] || []).includes(d)) return EFFECT.strong;
  if ((STRONG_AGAINST[d] || []).includes(a)) return EFFECT.weak;
  return EFFECT.normal;
}

/** 展示用元数据（/skill/elements 等端点） */
function displayMeta() {
  const meta = {};
  for (const [key, el] of Object.entries(ELEMENTS)) {
    meta[key] = {
      name: el.name,
      strong: STRONG_AGAINST[key] || [],
      weak: Object.keys(STRONG_AGAINST).filter((k) => STRONG_AGAINST[k].includes(key)),
      strong_names: (STRONG_AGAINST[key] || []).map((k) => ELEMENTS[k].name),
      weak_names: Object.keys(STRONG_AGAINST)
        .filter((k) => STRONG_AGAINST[k].includes(key))
        .map((k) => ELEMENTS[k].name)
    };
  }
  return meta;
}

module.exports = { ELEMENTS, STRONG_AGAINST, EFFECT, normalize, effectiveness, displayMeta };
