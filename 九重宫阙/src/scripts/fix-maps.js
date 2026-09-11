const fs = require('fs');
const path = require('path');

const GAME_PATH = path.join(__dirname, '..', '..', 'data', 'game.json');
const data = JSON.parse(fs.readFileSync(GAME_PATH, 'utf8'));

// ── 1. Fix maps 1-6 ──────────────────────────────────────────────
const mapFixes = {
  1: { monsters: ["灵兔","灵蛇","山猫","野猪"], gather_nodes: ["灵草","清心草","碎石"], exp_per_second: 5, spirit_stone_per_second: 1, element: "无" },
  2: { monsters: ["树精","花妖","毒蛇","狼妖"], gather_nodes: ["聚灵草","妖兽内丹","木材"], exp_per_second: 15, spirit_stone_per_second: 3, element: "木" },
  3: { monsters: ["火焰蜥蜴","岩浆兽","火元素","炎魔"], gather_nodes: ["火焰结晶","玄铁矿","火灵草"], exp_per_second: 40, spirit_stone_per_second: 8, element: "火" },
  4: { monsters: ["冰狼","雪人","寒冰精灵","冰龙幼崽"], gather_nodes: ["寒冰结晶","雪莲","冰晶矿"], exp_per_second: 80, spirit_stone_per_second: 16, element: "冰" },
  5: { monsters: ["雷兽","闪电精灵","雷龙","雷劫守卫"], gather_nodes: ["雷电结晶","星辰矿","雷灵草"], exp_per_second: 160, spirit_stone_per_second: 32, element: "雷" },
  6: { monsters: ["混沌兽","虚空精灵","深渊领主","混沌巨龙"], gather_nodes: ["混沌矿","混沌结晶","远古妖丹"], exp_per_second: 320, spirit_stone_per_second: 64, element: "混沌" },
};

let mapsFixed = 0;
for (const map of data.maps) {
  if (mapFixes[map.id]) {
    Object.assign(map, mapFixes[map.id]);
    mapsFixed++;
    console.log(`[MAP] id=${map.id} "${map.name}" — added monsters, gather_nodes, exp_per_second, spirit_stone_per_second, element`);
  }
}
console.log(`[MAP] Fixed ${mapsFixed} maps`);

// ── 2. Collect all gather_node names that should exist ────────────
const neededGatherItems = new Set();
for (const f of Object.values(mapFixes)) {
  f.gather_nodes.forEach(n => neededGatherItems.add(n));
}

// Check which are already in items
const existingNames = new Set(data.items.map(i => i.name));
const missingItems = [...neededGatherItems].filter(n => !existingNames.has(n));

if (missingItems.length === 0) {
  console.log('[ITEM] All gather_node items already exist');
} else {
  console.log(`[ITEM] Missing gather items: ${missingItems.join(', ')}`);

  // Determine next ID
  const maxId = Math.max(...data.items.map(i => i.id));
  let nextId = maxId + 1;

  // New item definitions
  const newItemDefs = {
    "碎石":   { type: "材料", quality: "凡品", realm: "炼气", stats: { gather_level: 1, element: "土", sell_price: 2 }, description: "山间碎石，可用于基础炼器" },
    "木材":   { type: "材料", quality: "凡品", realm: "炼气", stats: { gather_level: 1, element: "木", sell_price: 3 }, description: "妖兽森林中的灵木" },
    "火灵草": { type: "材料", quality: "凡品", realm: "炼气", stats: { gather_level: 1, element: "火", sell_price: 5 }, description: "蕴含火属性灵气的灵草" },
    "雪莲":   { type: "材料", quality: "灵品", realm: "筑基", stats: { gather_level: 2, element: "冰", sell_price: 15 }, description: "冰雪原上盛开的稀有雪莲" },
    "冰晶矿": { type: "材料", quality: "灵品", realm: "筑基", stats: { gather_level: 2, element: "冰", sell_price: 14 }, description: "蕴含冰属性灵气的矿石" },
    "雷电结晶": { type: "材料", quality: "凡品", realm: "炼气", stats: { gather_level: 1, element: "雷", sell_price: 6 }, description: "雷电灵气凝结的结晶" },
    "雷灵草": { type: "材料", quality: "宝品", realm: "金丹", stats: { gather_level: 3, element: "雷", sell_price: 42 }, description: "雷劫谷中受雷电淬炼的灵草" },
  };

  for (const name of missingItems) {
    const def = newItemDefs[name];
    if (!def) {
      console.log(`[ITEM] WARNING: no definition for "${name}", skipping`);
      continue;
    }
    const item = {
      id: nextId++,
      name,
      type: def.type,
      quality: def.quality,
      realm: def.realm,
      stats: JSON.stringify(def.stats),
      description: def.description,
    };
    data.items.push(item);
    console.log(`[ITEM] Added: id=${item.id} "${item.name}" (${item.quality})`);
  }
}

// ── 3. Write back ────────────────────────────────────────────────
fs.writeFileSync(GAME_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`\n[DONE] game.json saved (${(fs.statSync(GAME_PATH).size / 1024).toFixed(1)} KB)`);
