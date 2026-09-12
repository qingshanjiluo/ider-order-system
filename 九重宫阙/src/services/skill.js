const { loadDatabase, saveDatabase, getNextId } = require('../database');
const elements = require('./elements');

// 元素元数据（阶段2：委托单一事实源，7 系金木水火土光明黑暗）
const ELEMENTS = elements.displayMeta();

const REALM_ORDER = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'];

const SLOT_LIMITS = { main: 3, sub: 3, ultimate: 1 };

const QUALITY_ORDER = ['黄阶', '玄阶', '地阶', '天阶', '仙阶'];
const RARITY_WEIGHTS = { common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 1 };

const SKILLS_DATA = [
  { id: 'fire_strike', name: '烈焰斩', element: 'fire', type: 'active', slot: 'main', quality: '黄阶', rarity: 'common', mana_cost: 15, cooldown: 0, damage_mult: 1.2, effect: '有30%概率附加灼烧', effect_type: 'dot', effect_value: 0.3, source: 'quest', learn_cost: 50, upgrade_cost: 30, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'fireball', name: '火球术', element: 'fire', type: 'active', slot: 'main', quality: '玄阶', rarity: 'uncommon', mana_cost: 25, cooldown: 1, damage_mult: 1.8, effect: '对目标及相邻敌人造成伤害', effect_type: 'aoe', effect_value: 0.5, source: 'shop', learn_cost: 200, upgrade_cost: 80, max_level: 10, required_realm: '炼气期', prerequisites: ['fire_strike'], is_hidden: false },
  { id: 'inferno', name: '焚天烈焰', element: 'fire', type: 'active', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 50, cooldown: 3, damage_mult: 3.0, effect: '全体敌人受到伤害', effect_type: 'aoe', effect_value: 1.0, source: 'quest', learn_cost: 800, upgrade_cost: 300, max_level: 10, required_realm: '筑基期', prerequisites: ['fireball'], is_hidden: false },
  { id: 'phoenix_wrath', name: '凤凰涅槃', element: 'fire', type: 'active', slot: 'ultimate', quality: '天阶', rarity: 'epic', mana_cost: 120, cooldown: 5, damage_mult: 5.0, effect: '全体敌人受到毁灭伤害', effect_type: 'aoe', effect_value: 2.0, source: 'hidden', learn_cost: 5000, upgrade_cost: 1500, max_level: 5, required_realm: '金丹期', prerequisites: ['inferno'], is_hidden: true, hidden_condition: '在火焰秘境中以生命值低于10%的状态击败BOSS' },
  { id: 'flame_shield', name: '焰灵护体', element: 'fire', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 20, cooldown: 2, damage_mult: 0, effect: '获得护盾', effect_type: 'buff', effect_value: 0.5, source: 'guild', learn_cost: 300, upgrade_cost: 120, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'flame_arena', name: '赤炎领域', element: 'fire', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 35, cooldown: 3, damage_mult: 0, effect: '持续3回合每回合造成伤害', effect_type: 'dot', effect_value: 0.5, source: 'forge', learn_cost: 600, upgrade_cost: 200, max_level: 8, required_realm: '筑基期', prerequisites: ['flame_shield'], is_hidden: false },
  { id: 'fire_breath', name: '龙息烈焰', element: 'fire', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 40, cooldown: 2, damage_mult: 2.5, effect: '无视目标20%防御', effect_type: 'damage', effect_value: 0.2, source: 'quest', learn_cost: 700, upgrade_cost: 250, max_level: 10, required_realm: '筑基期', prerequisites: ['fireball'], is_hidden: false },
  { id: 'magma_flow', name: '熔岩奔流', element: 'fire', type: 'active', slot: 'main', quality: '玄阶', rarity: 'uncommon', mana_cost: 30, cooldown: 2, damage_mult: 1.5, effect: '灼烧2回合', effect_type: 'dot', effect_value: 0.4, source: 'shop', learn_cost: 250, upgrade_cost: 100, max_level: 10, required_realm: '炼气期', prerequisites: ['fire_strike'], is_hidden: false },
  { id: 'water_arrow', name: '水箭术', element: 'water', type: 'active', slot: 'main', quality: '黄阶', rarity: 'common', mana_cost: 12, cooldown: 0, damage_mult: 1.1, effect: '无视目标10%防御', effect_type: 'damage', effect_value: 0.1, source: 'quest', learn_cost: 40, upgrade_cost: 25, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'tidal_wave', name: '怒涛冲击', element: 'water', type: 'active', slot: 'main', quality: '玄阶', rarity: 'uncommon', mana_cost: 28, cooldown: 2, damage_mult: 1.6, effect: '降低目标速度', effect_type: 'debuff', effect_value: 0.2, source: 'shop', learn_cost: 220, upgrade_cost: 90, max_level: 10, required_realm: '炼气期', prerequisites: ['water_arrow'], is_hidden: false },
  { id: 'healing_rain', name: '甘霖术', element: 'water', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 25, cooldown: 2, damage_mult: 0, effect: '回复自身最大生命值15%', effect_type: 'heal', effect_value: 0.15, source: 'guild', learn_cost: 200, upgrade_cost: 80, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'frost_prison', name: '冰封牢笼', element: 'water', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 35, cooldown: 3, damage_mult: 0.8, effect: '冻结目标1回合', effect_type: 'debuff', effect_value: 0.3, source: 'quest', learn_cost: 650, upgrade_cost: 230, max_level: 8, required_realm: '筑基期', prerequisites: ['tidal_wave'], is_hidden: false },
  { id: 'ocean_domain', name: '沧海领域', element: 'water', type: 'active', slot: 'ultimate', quality: '天阶', rarity: 'epic', mana_cost: 100, cooldown: 5, damage_mult: 3.5, effect: '每回合回复10%生命值', effect_type: 'aoe', effect_value: 0.8, source: 'hidden', learn_cost: 4500, upgrade_cost: 1400, max_level: 5, required_realm: '金丹期', prerequisites: ['frost_prison'], is_hidden: true, hidden_condition: '在海底遗迹中收集全部3颗潮汐之珠' },
  { id: 'water_shield', name: '水幕天华', element: 'water', type: 'active', slot: 'sub', quality: '黄阶', rarity: 'common', mana_cost: 15, cooldown: 2, damage_mult: 0, effect: '每回合回复5%最大生命值', effect_type: 'heal', effect_value: 0.05, source: 'shop', learn_cost: 80, upgrade_cost: 35, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'vortex_strike', name: '漩涡斩', element: 'water', type: 'active', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 40, cooldown: 2, damage_mult: 2.2, effect: '攻击3次', effect_type: 'damage', effect_value: 0.7, source: 'forge', learn_cost: 750, upgrade_cost: 280, max_level: 10, required_realm: '筑基期', prerequisites: ['water_arrow', 'tidal_wave'], is_hidden: false },
  { id: 'tsunami', name: '海啸天崩', element: 'water', type: 'active', slot: 'main', quality: '天阶', rarity: 'epic', mana_cost: 80, cooldown: 4, damage_mult: 4.0, effect: '全体敌人受到伤害', effect_type: 'aoe', effect_value: 1.5, source: 'quest', learn_cost: 3000, upgrade_cost: 1000, max_level: 5, required_realm: '金丹期', prerequisites: ['vortex_strike'], is_hidden: false },
  { id: 'rock_strike', name: '岩崩击', element: 'earth', type: 'active', slot: 'main', quality: '黄阶', rarity: 'common', mana_cost: 14, cooldown: 0, damage_mult: 1.15, effect: '有20%概率眩晕', effect_type: 'damage', effect_value: 0.2, source: 'quest', learn_cost: 45, upgrade_cost: 28, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'stone_wall', name: '磐石壁垒', element: 'earth', type: 'active', slot: 'sub', quality: '黄阶', rarity: 'common', mana_cost: 18, cooldown: 2, damage_mult: 0, effect: '防御力提升50%', effect_type: 'buff', effect_value: 0.5, source: 'shop', learn_cost: 100, upgrade_cost: 40, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'earthquake', name: '大地震颤', element: 'earth', type: 'active', slot: 'main', quality: '玄阶', rarity: 'uncommon', mana_cost: 30, cooldown: 2, damage_mult: 1.7, effect: '全体敌人命中率降低15%', effect_type: 'debuff', effect_value: 0.15, source: 'quest', learn_cost: 280, upgrade_cost: 110, max_level: 10, required_realm: '炼气期', prerequisites: ['rock_strike'], is_hidden: false },
  { id: 'crystal_armor', name: '玄晶甲胄', element: 'earth', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 40, cooldown: 3, damage_mult: 0, effect: '防御力提升80%', effect_type: 'buff', effect_value: 0.8, source: 'forge', learn_cost: 600, upgrade_cost: 220, max_level: 8, required_realm: '筑基期', prerequisites: ['stone_wall'], is_hidden: false },
  { id: 'mountain_god', name: '山神降临', element: 'earth', type: 'active', slot: 'ultimate', quality: '天阶', rarity: 'epic', mana_cost: 110, cooldown: 5, damage_mult: 4.5, effect: '全体敌人受到伤害', effect_type: 'aoe', effect_value: 1.8, source: 'hidden', learn_cost: 4800, upgrade_cost: 1450, max_level: 5, required_realm: '金丹期', prerequisites: ['earthquake', 'crystal_armor'], is_hidden: true, hidden_condition: '收集齐五岳碎片后在山神庙中参拜' },
  { id: 'stone_skin', name: '石肤术', element: 'earth', type: 'passive', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '永久减少物理伤害10%', effect_type: 'buff', effect_value: 0.1, source: 'guild', learn_cost: 350, upgrade_cost: 130, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'mud_burial', name: '泥沼埋葬', element: 'earth', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 22, cooldown: 2, damage_mult: 0.5, effect: '降低目标速度40%', effect_type: 'debuff', effect_value: 0.4, source: 'shop', learn_cost: 180, upgrade_cost: 75, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'titan_strike', name: '泰坦之拳', element: 'earth', type: 'active', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 45, cooldown: 2, damage_mult: 2.8, effect: '无视目标15%防御', effect_type: 'damage', effect_value: 0.15, source: 'quest', learn_cost: 850, upgrade_cost: 310, max_level: 10, required_realm: '筑基期', prerequisites: ['rock_strike', 'earthquake'], is_hidden: false },
  { id: 'lightning_bolt', name: '雷击术', element: 'metal', type: 'active', slot: 'main', quality: '黄阶', rarity: 'common', mana_cost: 13, cooldown: 0, damage_mult: 1.2, effect: '有25%概率麻痹', effect_type: 'damage', effect_value: 0.25, source: 'quest', learn_cost: 42, upgrade_cost: 26, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'thunder_chain', name: '雷霆锁链', element: 'metal', type: 'active', slot: 'main', quality: '玄阶', rarity: 'uncommon', mana_cost: 26, cooldown: 1, damage_mult: 1.5, effect: '最多弹射3个目标', effect_type: 'aoe', effect_value: 0.2, source: 'shop', learn_cost: 210, upgrade_cost: 85, max_level: 10, required_realm: '炼气期', prerequisites: ['lightning_bolt'], is_hidden: false },
  { id: 'storm_call', name: '召雷风暴', element: 'metal', type: 'active', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 55, cooldown: 3, damage_mult: 2.5, effect: '全体敌人受到伤害', effect_type: 'aoe', effect_value: 0.8, source: 'quest', learn_cost: 900, upgrade_cost: 340, max_level: 10, required_realm: '筑基期', prerequisites: ['thunder_chain'], is_hidden: false },
  { id: 'lightning_fury', name: '天雷灭世', element: 'metal', type: 'active', slot: 'ultimate', quality: '天阶', rarity: 'epic', mana_cost: 130, cooldown: 5, damage_mult: 5.5, effect: '全体敌人受到巨额伤害', effect_type: 'aoe', effect_value: 2.5, source: 'hidden', learn_cost: 5500, upgrade_cost: 1600, max_level: 5, required_realm: '金丹期', prerequisites: ['storm_call'], is_hidden: true, hidden_condition: '在雷劫中存活并引动九重天雷' },
  { id: 'static_field', name: '静电场', element: 'metal', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 22, cooldown: 2, damage_mult: 0, effect: '持续麻痹敌人', effect_type: 'debuff', effect_value: 0.3, source: 'guild', learn_cost: 230, upgrade_cost: 95, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'overclock', name: '雷电加速', element: 'metal', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 20, cooldown: 3, damage_mult: 0, effect: '速度提升60%', effect_type: 'buff', effect_value: 0.6, source: 'shop', learn_cost: 200, upgrade_cost: 80, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'voltage_surge', name: '电压激增', element: 'metal', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '每3次攻击后伤害提升80%', effect_type: 'buff', effect_value: 0.8, source: 'forge', learn_cost: 700, upgrade_cost: 260, max_level: 5, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'chain_lightning', name: '连锁闪电', element: 'metal', type: 'active', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 45, cooldown: 2, damage_mult: 2.0, effect: '弹射5个目标', effect_type: 'aoe', effect_value: 0.15, source: 'quest', learn_cost: 780, upgrade_cost: 290, max_level: 10, required_realm: '筑基期', prerequisites: ['thunder_chain'], is_hidden: false },
  { id: 'wind_slash', name: '风刃术', element: 'wood', type: 'active', slot: 'main', quality: '黄阶', rarity: 'common', mana_cost: 11, cooldown: 0, damage_mult: 1.1, effect: '有20%概率暴击', effect_type: 'damage', effect_value: 0.2, source: 'quest', learn_cost: 38, upgrade_cost: 22, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'gale_force', name: '狂风骤起', element: 'wood', type: 'active', slot: 'main', quality: '玄阶', rarity: 'uncommon', mana_cost: 24, cooldown: 1, damage_mult: 1.6, effect: '击退并减速', effect_type: 'debuff', effect_value: 0.2, source: 'shop', learn_cost: 190, upgrade_cost: 78, max_level: 10, required_realm: '炼气期', prerequisites: ['wind_slash'], is_hidden: false },
  { id: 'tornado', name: '龙卷风暴', element: 'wood', type: 'active', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 50, cooldown: 3, damage_mult: 2.3, effect: '全体敌人受到伤害', effect_type: 'aoe', effect_value: 0.7, source: 'quest', learn_cost: 820, upgrade_cost: 300, max_level: 10, required_realm: '筑基期', prerequisites: ['gale_force'], is_hidden: false },
  { id: 'sky_dominator', name: '风神天降', element: 'wood', type: 'active', slot: 'ultimate', quality: '天阶', rarity: 'epic', mana_cost: 105, cooldown: 5, damage_mult: 4.8, effect: '全体敌人受到伤害', effect_type: 'aoe', effect_value: 2.2, source: 'hidden', learn_cost: 5200, upgrade_cost: 1500, max_level: 5, required_realm: '金丹期', prerequisites: ['tornado'], is_hidden: true, hidden_condition: '在风暴之巅的试炼中保持全程不被击中' },
  { id: 'wind_walk', name: '御风而行', element: 'wood', type: 'passive', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '永久提升闪避率12%', effect_type: 'buff', effect_value: 0.12, source: 'guild', learn_cost: 250, upgrade_cost: 100, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'air_surge', name: '气流涌动', element: 'wood', type: 'active', slot: 'sub', quality: '黄阶', rarity: 'common', mana_cost: 15, cooldown: 2, damage_mult: 0, effect: '攻击力提升25%', effect_type: 'buff', effect_value: 0.25, source: 'shop', learn_cost: 70, upgrade_cost: 30, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'blade_storm', name: '风刃风暴', element: 'wood', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 42, cooldown: 2, damage_mult: 2.4, effect: '攻击5次', effect_type: 'damage', effect_value: 0.5, source: 'forge', learn_cost: 680, upgrade_cost: 240, max_level: 10, required_realm: '筑基期', prerequisites: ['wind_slash', 'gale_force'], is_hidden: false },
  { id: 'cyclone_shield', name: '旋风护盾', element: 'wood', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 20, cooldown: 2, damage_mult: 0, effect: '反弹30%远程伤害', effect_type: 'buff', effect_value: 0.3, source: 'quest', learn_cost: 170, upgrade_cost: 70, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'shadow_strike', name: '暗影突袭', element: 'dark', type: 'active', slot: 'main', quality: '玄阶', rarity: 'uncommon', mana_cost: 20, cooldown: 1, damage_mult: 1.5, effect: '必定暴击', effect_type: 'damage', effect_value: 0.3, source: 'quest', learn_cost: 180, upgrade_cost: 75, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'curse_of_darkness', name: '黑暗诅咒', element: 'dark', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 38, cooldown: 3, damage_mult: 0, effect: '每回合吸取生命', effect_type: 'dot', effect_value: 0.08, source: 'quest', learn_cost: 620, upgrade_cost: 210, max_level: 8, required_realm: '筑基期', prerequisites: ['shadow_strike'], is_hidden: false },
  { id: 'void_blast', name: '虚空爆破', element: 'dark', type: 'active', slot: 'main', quality: '天阶', rarity: 'epic', mana_cost: 75, cooldown: 3, damage_mult: 3.5, effect: '无视全部防御', effect_type: 'damage', effect_value: 1.0, source: 'hidden', learn_cost: 3500, upgrade_cost: 1200, max_level: 5, required_realm: '金丹期', prerequisites: ['shadow_strike'], is_hidden: true, hidden_condition: '在暗影深渊中连续击败10个暗影守卫' },
  { id: 'soul_drain', name: '噬魂术', element: 'dark', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 18, cooldown: 2, damage_mult: 0.8, effect: '造成伤害后回复灵力', effect_type: 'damage', effect_value: 0.15, source: 'shop', learn_cost: 200, upgrade_cost: 80, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'dark_aura', name: '暗黑领域', element: 'dark', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 45, cooldown: 3, damage_mult: 0, effect: '全体敌人攻击力降低25%', effect_type: 'debuff', effect_value: 0.25, source: 'guild', learn_cost: 750, upgrade_cost: 270, max_level: 5, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'eclipse', name: '日蚀终焉', element: 'dark', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'legendary', mana_cost: 150, cooldown: 6, damage_mult: 7.0, effect: '全体敌人受到毁灭伤害', effect_type: 'aoe', effect_value: 3.0, source: 'hidden', learn_cost: 10000, upgrade_cost: 3000, max_level: 3, required_realm: '元婴期', prerequisites: ['void_blast', 'dark_aura'], is_hidden: true, hidden_condition: '在日蚀之时击败暗影帝王' },
  { id: 'holy_smite', name: '圣光打击', element: 'light', type: 'active', slot: 'main', quality: '黄阶', rarity: 'common', mana_cost: 14, cooldown: 0, damage_mult: 1.15, effect: '对暗属性额外伤害', effect_type: 'damage', effect_value: 0.5, source: 'quest', learn_cost: 40, upgrade_cost: 24, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'divine_heal', name: '神圣治愈', element: 'light', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 28, cooldown: 2, damage_mult: 0, effect: '回复最大生命值25%', effect_type: 'heal', effect_value: 0.25, source: 'guild', learn_cost: 240, upgrade_cost: 100, max_level: 10, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'judgment', name: '天罚审判', element: 'light', type: 'active', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 48, cooldown: 2, damage_mult: 2.6, effect: '对暗属性伤害翻倍', effect_type: 'damage', effect_value: 1.0, source: 'quest', learn_cost: 880, upgrade_cost: 330, max_level: 10, required_realm: '筑基期', prerequisites: ['holy_smite'], is_hidden: false },
  { id: 'resurrection', name: '复活术', element: 'light', type: 'active', slot: 'sub', quality: '天阶', rarity: 'epic', mana_cost: 80, cooldown: 5, damage_mult: 0, effect: '复活后回复50%生命', effect_type: 'heal', effect_value: 0.5, source: 'hidden', learn_cost: 4000, upgrade_cost: 1300, max_level: 3, required_realm: '金丹期', prerequisites: ['divine_heal'], is_hidden: true, hidden_condition: '在圣光试炼中以0次死亡通关' },
  { id: 'holy_shield', name: '圣盾术', element: 'light', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 30, cooldown: 4, damage_mult: 0, effect: '抵消下一次伤害', effect_type: 'buff', effect_value: 1.0, source: 'shop', learn_cost: 300, upgrade_cost: 120, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'divine_judgment', name: '神罚天降', element: 'light', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'legendary', mana_cost: 140, cooldown: 6, damage_mult: 6.5, effect: '全体敌人受到毁灭伤害', effect_type: 'aoe', effect_value: 2.8, source: 'hidden', learn_cost: 9000, upgrade_cost: 2800, max_level: 3, required_realm: '元婴期', prerequisites: ['judgment', 'resurrection'], is_hidden: true, hidden_condition: '集齐六枚圣光徽章' },
  { id: 'basic_attack', name: '普通攻击', element: 'none', type: 'active', slot: 'main', quality: '黄阶', rarity: 'common', mana_cost: 0, cooldown: 0, damage_mult: 1.0, effect: '无特殊效果', effect_type: 'damage', effect_value: 0, source: 'quest', learn_cost: 0, upgrade_cost: 10, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'meditation', name: '吐纳术', element: 'none', type: 'active', slot: 'sub', quality: '黄阶', rarity: 'common', mana_cost: 0, cooldown: 3, damage_mult: 0, effect: '回复20%灵力值', effect_type: 'heal', effect_value: 0.2, source: 'quest', learn_cost: 0, upgrade_cost: 15, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'fortify', name: '固元术', element: 'none', type: 'active', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 20, cooldown: 3, damage_mult: 0, effect: '全属性提升15%', effect_type: 'buff', effect_value: 0.15, source: 'shop', learn_cost: 150, upgrade_cost: 60, max_level: 8, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'guild_blessing', name: '仙盟庇佑', element: 'none', type: 'passive', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '永久提升全属性5%', effect_type: 'buff', effect_value: 0.05, source: 'guild', learn_cost: 500, upgrade_cost: 200, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'guild_tactics', name: '仙盟战术', element: 'none', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '组队时全队伤害提升8%', effect_type: 'buff', effect_value: 0.08, source: 'guild', learn_cost: 1200, upgrade_cost: 400, max_level: 5, required_realm: '筑基期', prerequisites: ['guild_blessing'], is_hidden: false },
  { id: 'guild_fortification', name: '仙盟结界', element: 'light', type: 'active', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 40, cooldown: 4, damage_mult: 0, effect: '全体友方获得护盾', effect_type: 'buff', effect_value: 0.2, source: 'guild', learn_cost: 1500, upgrade_cost: 500, max_level: 5, required_realm: '筑基期', prerequisites: ['guild_blessing'], is_hidden: false },
  { id: 'forbidden_seal', name: '禁忌封印', element: 'dark', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'legendary', mana_cost: 0, cooldown: 8, damage_mult: 8.0, effect: '消耗生命值和灵力造成巨额伤害', effect_type: 'damage', effect_value: 1.0, source: 'hidden', learn_cost: 0, upgrade_cost: 5000, max_level: 1, required_realm: '元婴期', prerequisites: ['void_blast'], is_hidden: true, hidden_condition: '生命值降至1%以下时自动解锁' },
  { id: 'primordial_chaos', name: '混沌初开', element: 'none', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'legendary', mana_cost: 200, cooldown: 10, damage_mult: 10.0, effect: '全体受到无差别毁灭打击', effect_type: 'aoe', effect_value: 5.0, source: 'hidden', learn_cost: 0, upgrade_cost: 8000, max_level: 1, required_realm: '化神期', prerequisites: ['eclipse', 'divine_judgment'], is_hidden: true, hidden_condition: '通关全部隐藏副本' },

  { id: 'fire_rage_key', name: '焚天怒焰', element: 'fire', type: 'key', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 60, cooldown: 0, damage_mult: 3.5, effect: '5回合后自动释放，对全体敌人造成火焰伤害', effect_type: 'aoe', effect_value: 1.2, source: 'quest', learn_cost: 1000, upgrade_cost: 400, max_level: 10, required_realm: '筑基期', prerequisites: ['fireball'], is_hidden: false, key_rounds: 5 },
  { id: 'water_tide_key', name: '潮汐涌动', element: 'water', type: 'key', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 55, cooldown: 0, damage_mult: 3.0, effect: '4回合后自动释放，全体水系伤害并减速', effect_type: 'aoe', effect_value: 1.0, source: 'quest', learn_cost: 900, upgrade_cost: 380, max_level: 10, required_realm: '筑基期', prerequisites: ['tidal_wave'], is_hidden: false, key_rounds: 4 },
  { id: 'earthquake_key', name: '大地崩裂', element: 'earth', type: 'key', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 50, cooldown: 0, damage_mult: 2.8, effect: '6回合后自动释放，全体土系伤害并眩晕', effect_type: 'aoe', effect_value: 0.9, source: 'quest', learn_cost: 850, upgrade_cost: 350, max_level: 10, required_realm: '筑基期', prerequisites: ['earthquake'], is_hidden: false, key_rounds: 6 },
  { id: 'thunder_wrath_key', name: '雷神之怒', element: 'metal', type: 'key', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 65, cooldown: 0, damage_mult: 3.8, effect: '5回合后自动释放，全体雷系伤害并麻痹', effect_type: 'aoe', effect_value: 1.3, source: 'quest', learn_cost: 1100, upgrade_cost: 420, max_level: 10, required_realm: '筑基期', prerequisites: ['storm_call'], is_hidden: false, key_rounds: 5 },
  { id: 'wind_blade_key', name: '万刃风暴', element: 'wood', type: 'key', slot: 'main', quality: '地阶', rarity: 'rare', mana_cost: 45, cooldown: 0, damage_mult: 2.5, effect: '3回合后自动释放，全体风系多段伤害', effect_type: 'aoe', effect_value: 0.8, source: 'quest', learn_cost: 800, upgrade_cost: 320, max_level: 10, required_realm: '筑基期', prerequisites: ['wind_walk'], is_hidden: false, key_rounds: 3 },
  { id: 'holy_wrath_key', name: '圣光制裁', element: 'light', type: 'key', slot: 'main', quality: '天阶', rarity: 'epic', mana_cost: 80, cooldown: 0, damage_mult: 4.5, effect: '7回合后自动释放，全体圣系伤害并净化', effect_type: 'aoe', effect_value: 1.8, source: 'quest', learn_cost: 2000, upgrade_cost: 800, max_level: 5, required_realm: '金丹期', prerequisites: ['divine_judgment'], is_hidden: false, key_rounds: 7 },
  { id: 'dark_devour_key', name: '深渊吞噬', element: 'dark', type: 'key', slot: 'main', quality: '天阶', rarity: 'epic', mana_cost: 75, cooldown: 0, damage_mult: 4.0, effect: '6回合后自动释放，全体暗系伤害并吸收生命', effect_type: 'aoe', effect_value: 1.5, source: 'quest', learn_cost: 1800, upgrade_cost: 750, max_level: 5, required_realm: '金丹期', prerequisites: ['void_blast'], is_hidden: false, key_rounds: 6 },

  // ============ 内容扩充（阶段内富集）：七系被动 ============
  { id: 'metal_body_arts', name: '金身诀', element: 'metal', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '永久减少所受物理伤害12%', effect_type: 'buff', effect_value: 0.12, source: 'forge', learn_cost: 900, upgrade_cost: 300, max_level: 5, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'wood_rebirth', name: '生生不息', element: 'wood', type: 'passive', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '每回合回复最大生命2%', effect_type: 'hot', effect_value: 0.02, source: 'quest', learn_cost: 300, upgrade_cost: 110, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'water_supreme', name: '上善若水', element: 'water', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '以柔克刚，所受技能伤害降低12%', effect_type: 'buff', effect_value: 0.12, source: 'guild', learn_cost: 850, upgrade_cost: 290, max_level: 5, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'fire_burn_back', name: '焚身以火', element: 'fire', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '近身反击，受击时反弹15%伤害', effect_type: 'thorns', effect_value: 0.15, source: 'forge', learn_cost: 950, upgrade_cost: 320, max_level: 5, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'earth_mountain_guard', name: '大地之护', element: 'earth', type: 'passive', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '永久提升最大生命10%', effect_type: 'buff', effect_value: 0.1, source: 'shop', learn_cost: 400, upgrade_cost: 150, max_level: 5, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'light_grace', name: '圣光垂怜', element: 'light', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '治疗效果提升20%', effect_type: 'heal_amp', effect_value: 0.2, source: 'quest', learn_cost: 880, upgrade_cost: 300, max_level: 5, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'dark_shadow_step', name: '暗影潜行', element: 'dark', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '永久提升闪避15%，夜间翻倍', effect_type: 'buff', effect_value: 0.15, source: 'hidden', learn_cost: 1000, upgrade_cost: 340, max_level: 5, required_realm: '筑基期', prerequisites: [], is_hidden: false },

  // ============ 七系圣阶主动 ============
  { id: 'gengmetal_sky_rend', name: '庚金裂空斩', element: 'metal', type: 'active', slot: 'main', quality: '圣阶', rarity: 'legendary', mana_cost: 150, cooldown: 6, damage_mult: 6.0, effect: '贯穿天地，无视目标30%防御', effect_type: 'damage', effect_value: 0.3, source: 'quest', learn_cost: 15000, upgrade_cost: 5000, max_level: 3, required_realm: '元婴期', prerequisites: ['voltage_surge'], is_hidden: false },
  { id: 'greenwood_bind', name: '青木缠身', element: 'wood', type: 'active', slot: 'sub', quality: '圣阶', rarity: 'legendary', mana_cost: 120, cooldown: 5, damage_mult: 2.0, effect: '藤蔓束缚3回合，每回合造成60%持续伤害', effect_type: 'dot', effect_value: 0.6, source: 'quest', learn_cost: 14000, upgrade_cost: 4600, max_level: 3, required_realm: '元婴期', prerequisites: ['wind_walk'], is_hidden: false },
  { id: 'beiming_void', name: '北溟归墟', element: 'water', type: 'active', slot: 'ultimate', quality: '圣阶', rarity: 'legendary', mana_cost: 180, cooldown: 8, damage_mult: 7.5, effect: '归墟吞天，全体水系毁灭打击并吸元', effect_type: 'aoe', effect_value: 2.5, source: 'hidden', learn_cost: 20000, upgrade_cost: 6500, max_level: 3, required_realm: '元婴期', prerequisites: ['tidal_wave'], is_hidden: false, hidden_condition: '北溟秘境深处击杀玄龟' },
  { id: 'lihuo_thunder', name: '离火神雷', element: 'fire', type: 'active', slot: 'main', quality: '圣阶', rarity: 'legendary', mana_cost: 155, cooldown: 6, damage_mult: 6.2, effect: '火雷合击，50%概率点燃2回合', effect_type: 'dot', effect_value: 0.5, source: 'quest', learn_cost: 15500, upgrade_cost: 5200, max_level: 3, required_realm: '元婴期', prerequisites: ['inferno'], is_hidden: false },
  { id: 'mountain_suppress', name: '山镇八荒', element: 'earth', type: 'active', slot: 'main', quality: '圣阶', rarity: 'legendary', mana_cost: 140, cooldown: 7, damage_mult: 5.8, effect: '镇压八荒，命中后眩晕1回合', effect_type: 'stun', effect_value: 0.35, source: 'guild', learn_cost: 14800, upgrade_cost: 4900, max_level: 3, required_realm: '元婴期', prerequisites: ['stone_skin'], is_hidden: false },
  { id: 'judgment_spear', name: '审判之枪', element: 'light', type: 'active', slot: 'main', quality: '圣阶', rarity: 'legendary', mana_cost: 160, cooldown: 6, damage_mult: 6.5, effect: '对黑暗系目标伤害翻倍', effect_type: 'damage', effect_value: 0.5, source: 'quest', learn_cost: 16000, upgrade_cost: 5400, max_level: 3, required_realm: '元婴期', prerequisites: ['divine_judgment'], is_hidden: false },
  { id: 'soul_devour_claw', name: '噬魂之爪', element: 'dark', type: 'active', slot: 'main', quality: '圣阶', rarity: 'legendary', mana_cost: 150, cooldown: 5, damage_mult: 6.0, effect: '吞噬精魄，将伤害的40%化为自身生命', effect_type: 'lifesteal', effect_value: 0.4, source: 'hidden', learn_cost: 15800, upgrade_cost: 5300, max_level: 3, required_realm: '元婴期', prerequisites: ['void_blast'], is_hidden: false, hidden_condition: '万魂窟存活三十回合' },

  // ============ 七系仙阶隐藏终极 ============
  { id: 'ten_thousand_swords', name: '万剑归宗', element: 'metal', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'mythic', mana_cost: 250, cooldown: 12, damage_mult: 9.0, effect: '万剑齐鸣，全体金系毁灭伤害并破甲', effect_type: 'aoe', effect_value: 3.0, source: 'hidden', learn_cost: 50000, upgrade_cost: 12000, max_level: 1, required_realm: '化神期', prerequisites: ['gengmetal_sky_rend'], is_hidden: true, hidden_condition: '剑冢顿悟' },
  { id: 'jianmu_sky', name: '建木通天', element: 'wood', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'mythic', mana_cost: 230, cooldown: 12, damage_mult: 8.5, effect: '建木擎天，全体伤害并为全队续航回春', effect_type: 'aoe', effect_value: 2.8, source: 'hidden', learn_cost: 48000, upgrade_cost: 11500, max_level: 1, required_realm: '化神期', prerequisites: ['greenwood_bind'], is_hidden: true, hidden_condition: '建木遗迹得建木之灵认可' },
  { id: 'four_seas_bowl', name: '四海倾覆', element: 'water', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'mythic', mana_cost: 240, cooldown: 13, damage_mult: 8.8, effect: '四海之水倾覆，全体毁灭并冻结2回合', effect_type: 'aoe', effect_value: 3.0, source: 'hidden', learn_cost: 49000, upgrade_cost: 11800, max_level: 1, required_realm: '化神期', prerequisites: ['beiming_void'], is_hidden: true, hidden_condition: '四海龙宫 complete' },
  { id: 'sun_true_fire', name: '太阳真火', element: 'fire', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'mythic', mana_cost: 260, cooldown: 12, damage_mult: 9.5, effect: '太阳真火焚世，全体毁灭灼烧3回合', effect_type: 'aoe', effect_value: 3.5, source: 'hidden', learn_cost: 52000, upgrade_cost: 12500, max_level: 1, required_realm: '化神期', prerequisites: ['lihuo_thunder'], is_hidden: true, hidden_condition: '太阳火源淬体不死' },
  { id: 'houtu_mountain', name: '后土化岳', element: 'earth', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'mythic', mana_cost: 250, cooldown: 14, damage_mult: 9.2, effect: '身化山岳，全体毁灭并获得巨额护盾', effect_type: 'aoe', effect_value: 3.2, source: 'hidden', learn_cost: 50000, upgrade_cost: 12000, max_level: 1, required_realm: '化神期', prerequisites: ['mountain_suppress'], is_hidden: true, hidden_condition: '后土心法大成' },
  { id: 'heaven_gate', name: '天堂之门', element: 'light', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'mythic', mana_cost: 260, cooldown: 13, damage_mult: 9.8, effect: '圣光洗礼，全体毁灭并净化一切负面', effect_type: 'aoe', effect_value: 3.5, source: 'hidden', learn_cost: 53000, upgrade_cost: 12800, max_level: 1, required_realm: '化神期', prerequisites: ['judgment_spear'], is_hidden: true, hidden_condition: '渡劫不昧本心' },
  { id: 'eternal_night', name: '永夜降临', element: 'dark', type: 'active', slot: 'ultimate', quality: '仙阶', rarity: 'mythic', mana_cost: 270, cooldown: 14, damage_mult: 9.9, effect: '永夜蔽世，全体毁灭并窃取生命', effect_type: 'aoe', effect_value: 3.6, source: 'hidden', learn_cost: 54000, upgrade_cost: 13000, max_level: 1, required_realm: '化神期', prerequisites: ['soul_devour_claw'], is_hidden: true, hidden_condition: '永夜渊主传承' },

  // ============ 生产联动被动（none 系） ============
  { id: 'forge_master', name: '锻造大师', element: 'none', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '锻造成功率永久提升8%', effect_type: 'craft_amp', effect_value: 0.08, source: 'forge', learn_cost: 1200, upgrade_cost: 400, max_level: 3, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'dan_heart', name: '丹心通明', element: 'none', type: 'passive', slot: 'sub', quality: '地阶', rarity: 'rare', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '炼丹成功率永久提升8%', effect_type: 'alchemy_amp', effect_value: 0.08, source: 'shop', learn_cost: 1200, upgrade_cost: 400, max_level: 3, required_realm: '筑基期', prerequisites: [], is_hidden: false },
  { id: 'wealth_luck', name: '财源广进', element: 'none', type: 'passive', slot: 'sub', quality: '玄阶', rarity: 'uncommon', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '坊市购买价格永久降低5%', effect_type: 'discount', effect_value: 0.05, source: 'shop', learn_cost: 600, upgrade_cost: 220, max_level: 3, required_realm: '炼气期', prerequisites: [], is_hidden: false },
  { id: 'tianji_sense', name: '天机感应', element: 'none', type: 'passive', slot: 'sub', quality: '天阶', rarity: 'epic', mana_cost: 0, cooldown: 0, damage_mult: 0, effect: '采集时稀有材料出现率提升25%', effect_type: 'gather_amp', effect_value: 0.25, source: 'hidden', learn_cost: 6000, upgrade_cost: 2000, max_level: 1, required_realm: '金丹期', prerequisites: [], is_hidden: true, hidden_condition: '单日采集触发十次天机' }
];

function getSkillDef(skillId) {
  return SKILLS_DATA.find(s => s.id === skillId) || null;
}

function getRealmIndex(realm) {
  return REALM_ORDER.indexOf(realm);
}

function meetsRealmRequirement(currentRealm, requiredRealm) {
  const requiredStr = requiredRealm.replace('期', '');
  const currentIdx = getRealmIndex(currentRealm);
  const requiredIdx = getRealmIndex(requiredStr);
  return currentIdx >= 0 && requiredIdx >= 0 && currentIdx >= requiredIdx;
}

function getUpgradeCost(skillDef, currentLevel) {
  return Math.floor(skillDef.upgrade_cost * (1 + currentLevel * 0.3));
}

function getSkillStatsAtLevel(skillDef, level) {
  const ratio = Math.max(0, (level - 1) / Math.max(1, skillDef.max_level - 1));
  return {
    mana_cost: Math.floor(skillDef.mana_cost * (1 + ratio * 0.3)),
    damage_mult: parseFloat((skillDef.damage_mult * (1 + ratio * 0.5)).toFixed(2)),
    effect_value: parseFloat((skillDef.effect_value * (1 + ratio * 0.4)).toFixed(3))
  };
}

class SkillService {
  getSkills(characterId) {
    const db = loadDatabase();
    const playerSkills = (db.player_skills || []).filter(ps => ps.character_id === characterId);
    return playerSkills.map(ps => {
      const skillDef = getSkillDef(ps.skill_id);
      const stats = skillDef ? getSkillStatsAtLevel(skillDef, ps.level) : {};
      return {
        ...ps,
        skill_name: skillDef ? skillDef.name : '未知技能',
        skill_element: skillDef ? skillDef.element : 'none',
        skill_type: skillDef ? skillDef.type : 'active',
        skill_quality: skillDef ? skillDef.quality : '黄阶',
        skill_rarity: skillDef ? skillDef.rarity : 'common',
        skill_description: skillDef ? skillDef.effect : '',
        current_stats: stats,
        upgrade_cost: skillDef ? getUpgradeCost(skillDef, ps.level) : 0
      };
    });
  }

  learnSkill(characterId, skillId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const skillDef = getSkillDef(skillId);
    if (!skillDef) return { success: false, error: '技能不存在' };

    if (!meetsRealmRequirement(character.realm || '炼气', skillDef.required_realm)) {
      return { success: false, error: `需要境界: ${skillDef.required_realm}` };
    }

    const playerSkills = db.player_skills || [];
    if (playerSkills.some(ps => ps.character_id === characterId && ps.skill_id === skillId)) {
      return { success: false, error: '已学习该技能' };
    }

    if (!db.player_skills) db.player_skills = [];

    if (skillDef.prerequisites && skillDef.prerequisites.length > 0) {
      const learnedIds = playerSkills.filter(ps => ps.character_id === characterId).map(ps => ps.skill_id);
      for (const pre of skillDef.prerequisites) {
        if (!learnedIds.includes(pre)) {
          return { success: false, error: `需要先学习前置技能: ${pre}` };
        }
      }
    }

    const cost = skillDef.learn_cost || 0;
    if (cost > 0 && (character.spirit_stone || 0) < cost) {
      return { success: false, error: '灵石不足', required: cost, current: character.spirit_stone || 0 };
    }

    if (cost > 0) character.spirit_stone -= cost;

    const newPlayerSkill = {
      id: getNextId('player_skills'),
      character_id: characterId,
      skill_id: skillId,
      level: 1,
      equipped_slot: null,
      exp: 0,
      element: skillDef.element,
      source: skillDef.source,
      learned_at: Date.now()
    };
    db.player_skills.push(newPlayerSkill);

    saveDatabase(db);
    return { success: true, playerSkill: newPlayerSkill, spiritStone: character.spirit_stone };
  }

  upgradeSkill(characterId, playerSkillId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const psId = Number(playerSkillId);
    const playerSkill = (db.player_skills || []).find(
      ps => ps.id === psId && ps.character_id === characterId
    );
    if (!playerSkill) return { success: false, error: '技能不存在' };

    const skillDef = getSkillDef(playerSkill.skill_id);
    if (!skillDef) return { success: false, error: '技能数据不存在' };

    if (playerSkill.level >= skillDef.max_level) {
      return { success: false, error: '已达最大等级' };
    }

    const cost = getUpgradeCost(skillDef, playerSkill.level);
    if ((character.spirit_stone || 0) < cost) {
      return { success: false, error: '灵石不足', required: cost, current: character.spirit_stone || 0 };
    }

    character.spirit_stone -= cost;
    playerSkill.level += 1;

    saveDatabase(db);
    return { success: true, level: playerSkill.level, spiritStone: character.spirit_stone, upgradeCost: cost };
  }

  equipSkill(characterId, playerSkillId, slot) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    if (!['main', 'sub', 'ultimate'].includes(slot)) {
      return { success: false, error: '无效的槽位' };
    }

    const psId = Number(playerSkillId);
    const playerSkill = (db.player_skills || []).find(
      ps => ps.id === psId && ps.character_id === characterId
    );
    if (!playerSkill) return { success: false, error: '技能不存在' };

    const skillDef = getSkillDef(playerSkill.skill_id);
    if (!skillDef) return { success: false, error: '技能数据不存在' };

    const allSkills = (db.player_skills || []).filter(ps => ps.character_id === characterId);
    const slotCount = allSkills.filter(ps => ps.equipped_slot === slot).length;
    if (slotCount >= SLOT_LIMITS[slot]) {
      return { success: false, error: `${slot}槽位已满 (上限: ${SLOT_LIMITS[slot]})` };
    }

    playerSkill.equipped_slot = slot;

    saveDatabase(db);
    return { success: true, playerSkill };
  }

  unequipSkill(characterId, playerSkillId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const psId = Number(playerSkillId);
    const playerSkill = (db.player_skills || []).find(
      ps => ps.id === psId && ps.character_id === characterId
    );
    if (!playerSkill) return { success: false, error: '技能不存在' };

    if (!playerSkill.equipped_slot) {
      return { success: false, error: '该技能未装备' };
    }

    playerSkill.equipped_slot = null;

    saveDatabase(db);
    return { success: true, playerSkill };
  }

  forgetSkill(characterId, playerSkillId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const psId = Number(playerSkillId);
    const idx = (db.player_skills || []).findIndex(
      ps => ps.id === psId && ps.character_id === characterId
    );
    if (idx === -1) return { success: false, error: '技能不存在' };

    const removed = db.player_skills.splice(idx, 1)[0];

    saveDatabase(db);
    return { success: true, forgotten: removed };
  }

  synthesizeSkills(characterId, skillId1, skillId2) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const playerSkills = db.player_skills || [];
    const ps1 = playerSkills.find(ps => ps.id === skillId1 && ps.character_id === characterId);
    const ps2 = playerSkills.find(ps => ps.id === skillId2 && ps.character_id === characterId);

    if (!ps1) return { success: false, error: '技能1不存在' };
    if (!ps2) return { success: false, error: '技能2不存在' };
    if (ps1.id === ps2.id) return { success: false, error: '不能合成同一个技能' };
    if (ps1.skill_id !== ps2.skill_id) return { success: false, error: '只能合成相同类型的技能' };

    const skillDef = getSkillDef(ps1.skill_id);
    if (!skillDef) return { success: false, error: '技能数据不存在' };

    if (ps1.level >= skillDef.max_level) {
      return { success: false, error: '技能已达最大等级' };
    }

    const synthCost = Math.floor(skillDef.upgrade_cost * 2);
    if ((character.spirit_stone || 0) < synthCost) {
      return { success: false, error: '灵石不足', required: synthCost, current: character.spirit_stone || 0 };
    }

    character.spirit_stone -= synthCost;

    const expGain = ps1.exp + ps2.exp + Math.floor(ps1.level * 50 + ps2.level * 50);
    const idx2 = playerSkills.findIndex(ps => ps.id === skillId2);
    playerSkills.splice(idx2, 1);

    let levelGain = Math.floor((ps1.level + ps2.level) / 4);
    if (levelGain < 1) levelGain = 1;
    ps1.level = Math.min(ps1.level + levelGain, skillDef.max_level);
    ps1.exp = expGain;

    saveDatabase(db);
    return {
      success: true,
      playerSkill: ps1,
      levelsGained: levelGain,
      spiritStone: character.spirit_stone
    };
  }

  getSkillBookShop() {
    const shopSkills = SKILLS_DATA.filter(s => s.source === 'shop' && !s.is_hidden);
    return shopSkills.map(s => ({
      skill_id: s.id,
      name: s.name,
      element: s.element,
      quality: s.quality,
      rarity: s.rarity,
      slot: s.slot,
      price: s.learn_cost,
      effect: s.effect,
      required_realm: s.required_realm,
      description: `${s.name} - ${s.effect}`
    }));
  }

  buySkillBook(characterId, skillId) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const skillDef = getSkillDef(skillId);
    if (!skillDef) return { success: false, error: '技能不存在' };

    if (skillDef.source !== 'shop') {
      return { success: false, error: '该技能不在商店中' };
    }

    if (!meetsRealmRequirement(character.realm || '炼气', skillDef.required_realm)) {
      return { success: false, error: `需要境界: ${skillDef.required_realm}` };
    }

    const playerSkills = db.player_skills || [];
    if (playerSkills.some(ps => ps.character_id === characterId && ps.skill_id === skillId)) {
      return { success: false, error: '已学习该技能' };
    }

    const cost = skillDef.learn_cost || 0;
    if ((character.spirit_stone || 0) < cost) {
      return { success: false, error: '灵石不足', required: cost, current: character.spirit_stone || 0 };
    }

    character.spirit_stone -= cost;

    if (!db.player_skills) db.player_skills = [];
    const newPlayerSkill = {
      id: getNextId('player_skills'),
      character_id: characterId,
      skill_id: skillId,
      level: 1,
      equipped_slot: null,
      exp: 0,
      element: skillDef.element,
      source: 'shop',
      learned_at: Date.now()
    };
    db.player_skills.push(newPlayerSkill);

    saveDatabase(db);
    return { success: true, playerSkill: newPlayerSkill, spiritStone: character.spirit_stone };
  }

  getGuildSkills(characterId) {
    const guildSkills = SKILLS_DATA.filter(s => s.source === 'guild');
    return guildSkills.map(s => ({
      skill_id: s.id,
      name: s.name,
      element: s.element,
      quality: s.quality,
      rarity: s.rarity,
      slot: s.slot,
      learn_cost: s.learn_cost,
      effect: s.effect,
      required_realm: s.required_realm
    }));
  }

  unlockHiddenSkill(characterId, skillId, condition) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return { success: false, error: '角色不存在' };

    const skillDef = getSkillDef(skillId);
    if (!skillDef) return { success: false, error: '技能不存在' };

    if (!skillDef.is_hidden) {
      return { success: false, error: '该技能不是隐藏技能' };
    }

    const playerSkills = db.player_skills || [];
    if (playerSkills.some(ps => ps.character_id === characterId && ps.skill_id === skillId)) {
      return { success: false, error: '已学习该技能' };
    }

    if (!condition) {
      return { success: false, error: '需要满足解锁条件' };
    }

    const playerSkillIdx = playerSkills.findIndex(
      ps => ps.character_id === characterId && ps.skill_id === skillId
    );
    if (playerSkillIdx >= 0) {
      return { success: false, error: '已尝试解锁' };
    }

    if (!db.player_skills) db.player_skills = [];
    const newPlayerSkill = {
      id: getNextId('player_skills'),
      character_id: characterId,
      skill_id: skillId,
      level: 1,
      equipped_slot: null,
      exp: 0,
      element: skillDef.element,
      source: 'hidden',
      learned_at: Date.now()
    };
    db.player_skills.push(newPlayerSkill);

    saveDatabase(db);
    return { success: true, playerSkill: newPlayerSkill, message: '隐藏技能解锁成功' };
  }

  dropSkill(characterId, enemyLevel, mapElement) {
    const db = loadDatabase();
    const character = db.characters.find(c => c.id === characterId);
    if (!character) return null;

    const droppable = SKILLS_DATA.filter(s => s.source !== 'hidden' && s.source !== 'quest' && !s.is_hidden);
    if (droppable.length === 0) return null;

    const levelDiff = Math.abs(enemyLevel - (character.level || 1));
    let dropRate = Math.max(0.05, 0.3 - levelDiff * 0.01);
    if (mapElement) {
      const elementDrop = droppable.filter(s => s.element === mapElement);
      if (elementDrop.length > 0) {
        dropRate *= 1.5;
      }
    }

    if (Math.random() > dropRate) return null;

    const weighted = droppable.map(s => ({
      skill: s,
      weight: RARITY_WEIGHTS[s.rarity] || 10
    }));

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;
    let selected = weighted[0].skill;
    for (const w of weighted) {
      roll -= w.weight;
      if (roll <= 0) {
        selected = w.skill;
        break;
      }
    }

    const playerSkills = db.player_skills || [];
    if (!db.player_skills) db.player_skills = [];

    const existingIdx = playerSkills.findIndex(
      ps => ps.character_id === characterId && ps.skill_id === selected.id
    );

    if (existingIdx >= 0) {
      const ps = playerSkills[existingIdx];
      const skillDef = getSkillDef(ps.skill_id);
      if (ps.level < (skillDef ? skillDef.max_level : 10)) {
        ps.exp += Math.floor(selected.learn_cost * 0.3);
        return { type: 'exp', skill: selected.name, expGained: Math.floor(selected.learn_cost * 0.3) };
      }
      return { type: 'duplicate', skill: selected.name };
    }

    const newPlayerSkill = {
      id: getNextId('player_skills'),
      character_id: characterId,
      skill_id: selected.id,
      level: 1,
      equipped_slot: null,
      exp: 0,
      element: selected.element,
      source: 'drop',
      learned_at: Date.now()
    };
    db.player_skills.push(newPlayerSkill);

    saveDatabase(db);
    return { type: 'new', skill: selected.name, playerSkill: newPlayerSkill };
  }

  getElementAdvantage(attacker, defender) {
    if (attacker === 'none' || defender === 'none') return 1.0;
    const attackerEl = ELEMENTS[attacker];
    if (!attackerEl) return 1.0;
    if (attackerEl.strong.includes(defender)) return 1.2;
    if (attackerEl.weak.includes(defender)) return 0.8;
    return 1.0;
  }
}

module.exports = new SkillService();
module.exports.SKILLS_DATA = SKILLS_DATA;
module.exports.ELEMENTS = ELEMENTS;
module.exports.ELEMENTS_MAP = ELEMENTS;
