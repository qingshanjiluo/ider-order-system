/**
 * 灵兽捕捉（内容富集六期）
 * 野外遇兽 → 消耗驯兽符 → 按境界差与地图凶险度结算成功率 → 捕获入兽栏/失败留念想经验
 */

const QUALITY_BY_DIFFICULTY = [
  { max: 1.2, pool: ['凡兽', '灵兽'] },
  { max: 2.0, pool: ['灵兽', '玄兽'] },
  { max: 3.0, pool: ['玄兽', '地兽'] },
  { max: 4.0, pool: ['地兽', '天兽'] },
  { max: 99, pool: ['天兽', '圣兽'] }
];

const REALM_BY_MIN_LEVEL = [
  { max: 10, realm: '炼气' }, { max: 20, realm: '筑基' }, { max: 30, realm: '金丹' },
  { max: 40, realm: '元婴' }, { max: 55, realm: '化神' }, { max: 70, realm: '炼虚' },
  { max: 85, realm: '合体' }, { max: 95, realm: '大乘' }, { max: 999, realm: '渡劫' }
];

function pickQuality(difficulty, rng = Math.random) {
  const band = QUALITY_BY_DIFFICULTY.find(b => (difficulty || 1) <= b.max) || QUALITY_BY_DIFFICULTY[QUALITY_BY_DIFFICULTY.length - 1];
  return band.pool[Math.floor(rng() * band.pool.length)];
}

function realmForMap(minLevel) {
  const band = REALM_BY_MIN_LEVEL.find(b => (minLevel || 1) <= b.max) || REALM_BY_MIN_LEVEL[REALM_BY_MIN_LEVEL.length - 1];
  return band.realm;
}

/** 捕捉成功率：基础 0.35 + 等级超出地图门槛的加成 − 凶险度惩罚，钳制 [0.05, 0.9] */
function captureChance(characterLevel, map) {
  const lv = characterLevel || 1;
  const minLv = map.min_level || 1;
  const diff = map.difficulty || 1;
  const raw = 0.35 + Math.min(0.3, (lv - minLv) * 0.01) - (diff - 1) * 0.12;
  return Math.max(0.05, Math.min(0.9, Number(raw.toFixed(3))));
}

module.exports = { pickQuality, realmForMap, captureChance, QUALITY_BY_DIFFICULTY, REALM_BY_MIN_LEVEL };
