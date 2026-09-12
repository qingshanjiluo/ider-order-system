/**
 * 丹药图鉴（内容富集八期）
 * 五品阶丹药，效果全部走 buff 管线（type: exp/attack/defense/speed/all），保证每种丹药可真实使用。
 * category：恢复/增益/突破/特殊 —— 恢复类另有 item.stats.effect_type 供后续战斗内使用。
 */

const PILLS = [
  // ---- 凡品（新手可用，短效小额） ----
  { name: '养气丹', quality: '凡品', category: '恢复', buff: { type: 'exp', value: 1.1, duration: 1800000 }, price: 60, desc: '温养灵气，修炼效率+10%（30分钟）' },
  { name: '壮血丹', quality: '凡品', category: '恢复', buff: { type: 'defense', value: 1.08, duration: 1800000 }, price: 70, desc: '壮大气血，防御+8%（30分钟）' },
  { name: '轻身丹', quality: '凡品', category: '增益', buff: { type: 'speed', value: 1.1, duration: 1800000 }, price: 70, desc: '身轻如燕，速度+10%（30分钟）' },
  { name: '锐锋丹', quality: '凡品', category: '增益', buff: { type: 'attack', value: 1.1, duration: 1800000 }, price: 80, desc: '兵刃加锐，攻击+10%（30分钟）' },
  // ---- 灵品 ----
  { name: '固本丹', quality: '灵品', category: '恢复', buff: { type: 'defense', value: 1.12, duration: 3600000 }, price: 400, desc: '固本培元，防御+12%（60分钟）' },
  { name: '通脉丹', quality: '灵品', category: '增益', buff: { type: 'exp', value: 1.18, duration: 3600000 }, price: 420, desc: '疏通经脉，修炼效率+18%（60分钟）' },
  { name: '疾影丹', quality: '灵品', category: '增益', buff: { type: 'speed', value: 1.2, duration: 3600000 }, price: 400, desc: '疾影随行，速度+20%（60分钟）' },
  { name: '破军丹', quality: '灵品', category: '增益', buff: { type: 'attack', value: 1.2, duration: 3600000 }, price: 450, desc: '破军之势，攻击+20%（60分钟）' },
  { name: '静心丹', quality: '灵品', category: '特殊', buff: { type: 'all', value: 1.05, duration: 3600000 }, price: 500, desc: '静心凝神，全属性+5%（60分钟）' },
  // ---- 宝品 ----
  // 契机丹：唯一真正影响突破概率的丹药（其余「突破」类只加修炼速度）
  { name: '破境丹', quality: '宝品', category: '突破', buff: { type: 'exp', value: 1.15, duration: 1800000 }, price: 5000, desc: '冲关护命之药：持有则下次突破成功率 +15%，每次判定消耗一枚（一次性）' },
  { name: '玄元丹', quality: '宝品', category: '突破', buff: { type: 'exp', value: 1.35, duration: 7200000 }, price: 2000, desc: '玄元灌体，修炼效率+35%（120分钟）' },
  { name: '金刚丹', quality: '宝品', category: '恢复', buff: { type: 'defense', value: 1.3, duration: 7200000 }, price: 2000, desc: '金刚不坏，防御+30%（120分钟）' },
  { name: '焚天丹', quality: '宝品', category: '增益', buff: { type: 'attack', value: 1.4, duration: 3600000 }, price: 2200, desc: '焚天战意，攻击+40%（60分钟）' },
  { name: '缩地丹', quality: '宝品', category: '增益', buff: { type: 'speed', value: 1.4, duration: 3600000 }, price: 2200, desc: '缩地成寸，速度+40%（60分钟）' },
  { name: '五行丹', quality: '宝品', category: '特殊', buff: { type: 'all', value: 1.1, duration: 7200000 }, price: 2600, desc: '五行调和，全属性+10%（120分钟）' },
  // ---- 仙品 ----
  { name: '太清丹', quality: '仙品', category: '突破', buff: { type: 'exp', value: 1.6, duration: 14400000 }, price: 9000, desc: '太清道韵，修炼效率+60%（240分钟）' },
  { name: '不灭丹', quality: '仙品', category: '恢复', buff: { type: 'defense', value: 1.5, duration: 14400000 }, price: 9000, desc: '不灭金身，防御+50%（240分钟）' },
  { name: '戮仙丹', quality: '仙品', category: '增益', buff: { type: 'attack', value: 1.6, duration: 7200000 }, price: 9500, desc: '戮仙之威，攻击+60%（120分钟）' },
  { name: '御风丹', quality: '仙品', category: '增益', buff: { type: 'speed', value: 1.6, duration: 7200000 }, price: 9500, desc: '御风而行，速度+60%（120分钟）' },
  { name: '混元丹', quality: '仙品', category: '特殊', buff: { type: 'all', value: 1.2, duration: 14400000 }, price: 12000, desc: '混元一气，全属性+20%（240分钟）' },
  // ---- 道品（顶阶，极长时效/最强） ----
  { name: '道韵丹', quality: '道品', category: '突破', buff: { type: 'exp', value: 2.0, duration: 28800000 }, price: 30000, desc: '道韵加身，修炼效率翻倍（480分钟）' },
  { name: '鸿蒙丹', quality: '道品', category: '恢复', buff: { type: 'defense', value: 1.8, duration: 28800000 }, price: 30000, desc: '鸿蒙护体，防御+80%（480分钟）' },
  { name: '弑神丹', quality: '道品', category: '增益', buff: { type: 'attack', value: 2.0, duration: 14400000 }, price: 32000, desc: '弑神之力，攻击翻倍（240分钟）' },
  { name: '大道丹', quality: '道品', category: '特殊', buff: { type: 'all', value: 1.35, duration: 28800000 }, price: 40000, desc: '大道归一，全属性+35%（480分钟）' }
];

/** 上架坊市的品阶（高阶靠炼制/秘境产出） */
const PILL_SHOP_QUALITIES = ['凡品', '灵品'];

/** buff 定义表：名称 → {type,value,duration}（单一数据源，buff.js 直接引用） */
const PILL_BUFFS = PILLS.reduce((acc, p) => {
  acc[p.name] = p.buff;
  return acc;
}, {});

const QUALITY_ORDER = ['凡品', '灵品', '宝品', '仙品', '道品'];

module.exports = { PILLS, PILL_BUFFS, PILL_SHOP_QUALITIES, QUALITY_ORDER };
