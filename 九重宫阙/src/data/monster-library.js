/**
 * 怪物图鉴（内容富集七期）
 * 按地图定义自动补齐缺失怪物（修复：地图引用 65 种怪物而库中仅 36 种 → PVE 缺怪）。
 * 数值/掉落随地图难度与等级阶梯生成，元素由名称关键词 + 地图元素推断。
 */

const MAP_ELEMENT = { 木: 'wood', 火: 'fire', 冰: 'water', 雷: 'metal', 暗: 'dark', 光: 'light', 土: 'earth', 混沌: 'none', 五行: 'earth', 仙: 'light', 无: 'none' };

const ELEMENT_KEYWORDS = [
  [/冰|雪|霜|寒|水|潮/, 'water'],
  [/火|炎|焰|岩浆|熔|赤/, 'fire'],
  [/雷|电|闪|罡/, 'metal'],
  [/树|花|藤|菇|竹|木|草/, 'wood'],
  [/岩|石|沙|土|山|巨兽|龟/, 'earth'],
  [/天|圣|光|仙|天使|光明|神/, 'light'],
  [/鬼|幽|怨|暗|魔|虚|混沌|深渊|冥|尸|僵|魅/, 'dark']
];

// 难度 → 掉落池（按名称，播种时解析为 id）
const LOOT_POOLS = [
  { max: 1.2, pool: ['灵草', '清心草', '碎石', '木材', '粗铁矿'] },
  { max: 1.8, pool: ['聚灵草', '精铁矿', '五行草', '妖兽内丹', '玄铁矿'] },
  { max: 2.6, pool: ['火焰结晶', '寒冰结晶', '雷电结晶', '雪莲', '龙须草', '五色土'] },
  { max: 3.6, pool: ['龙血矿', '星辰矿', '星陨砂', '赤焰髓', '万年血参', '玉髓芝'], },
  { max: 99, pool: ['混沌矿', '混沌结晶', '仙晶矿', '仙灵草', '仙兽内丹', '远古妖丹', '离火精'] }
];

function inferElement(name, mapElement) {
  for (const [re, el] of ELEMENT_KEYWORDS) if (re.test(name)) return el;
  return MAP_ELEMENT[mapElement] || 'none';
}

function monsterStatsFor(name, minLevel, difficulty, idx) {
  const lv = minLevel + idx * 2;
  const d = difficulty || 1;
  return {
    hp: Math.floor((25 + lv * 9) * d),
    attack: Math.floor((4 + lv * 2.4) * d),
    defense: Math.floor((2 + lv * 1.2) * d),
    speed: Math.floor((3 + lv * 0.7) * d)
  };
}

function lootFor(difficulty, rng = Math.random) {
  const band = LOOT_POOLS.find(b => (difficulty || 1) <= b.max) || LOOT_POOLS[LOOT_POOLS.length - 1];
  const picks = [];
  const count = (difficulty || 1) >= 2.5 ? 3 : 2;
  while (picks.length < count && picks.length < band.pool.length) {
    const n = band.pool[Math.floor(rng() * band.pool.length)];
    if (!picks.includes(n)) picks.push(n);
  }
  return picks.map((name, i) => ({ name, rate: Number((0.45 - i * 0.12).toFixed(2)) }));
}

/** 幂等补齐：地图引用的怪物名若未定义则按地图难度生成 */
function ensureMonsters(db) {
  if (!db.monsters) db.monsters = [];
  const byName = new Map(db.monsters.map(m => [m.name, m]));
  const byItemName = new Map((db.items || []).map(i => [i.name, i]));
  let created = 0;
  for (const map of db.maps || []) {
    const names = map.monsters || [];
    names.forEach((name, idx) => {
      if (byName.has(name)) return;
      const loot = lootFor(map.difficulty);
      const drops = loot
        .map(l => ({ item_id: byItemName.get(l.name) ? byItemName.get(l.name).id : null, rate: l.rate, name: l.name }))
        .filter(d => d.item_id !== null);
      const row = {
        name,
        level_range: [map.min_level || 1, Math.min(map.max_level || 10, (map.min_level || 1) + 9)],
        element: inferElement(name, map.element),
        stats: JSON.stringify(monsterStatsFor(name, map.min_level || 1, map.difficulty, idx)),
        drops: JSON.stringify(drops),
        map_id: map.id,
        description: `${map.name}的${inferElement(name, map.element)}系妖兽`
      };
      if (!row.id) row.id = db.monsters.length ? Math.max(...db.monsters.map(m => Number(m.id) || 0)) + 1 : 1;
      db.monsters.push(row);
      byName.set(name, row);
      created++;
    });
  }
  return created;
}

module.exports = { ensureMonsters, inferElement, monsterStatsFor, lootFor, LOOT_POOLS, MAP_ELEMENT };
