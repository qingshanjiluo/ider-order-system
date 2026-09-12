const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/game.db');
const rows = (t) => db.prepare(`SELECT data FROM col_${t}`).all().map(r => JSON.parse(r.data));

const maps = rows('maps');
const monsters = rows('monsters');
const items = rows('items');
const dungeons = rows('dungeons');
const blueprints = rows('blueprints');

const monNames = new Set(monsters.map(m => m.name));
const referenced = new Map();
for (const m of maps) for (const n of (m.monsters || [])) referenced.set(n, (referenced.get(n) || []).concat(m.name));
const missingMon = [...referenced.keys()].filter(n => !monNames.has(n));
console.log(`地图引用怪物名 ${referenced.size} 个，已定义 ${monNames.size} 只，缺失 ${missingMon.length} 个`);
console.log('缺失样例:', missingMon.slice(0, 25).join('、'));

// 装备现状
const eq = items.filter(i => i.type === '装备' || i.type === '法器');
const sub = {};
for (const e of eq) sub[e.subtype || '(无)'] = (sub[e.subtype || '(无)'] || 0) + 1;
console.log('\n装备/法器 subtype 分布:', JSON.stringify(sub));
console.log('装备品质分布:', JSON.stringify(eq.reduce((a, e) => (a[e.quality] = (a[e.quality] || 0) + 1, a), {})));

// 副本引用
console.log('\n副本数:', dungeons.length, '| 样例:', dungeons.map(d => d.name).join('、'));
// 图纸/丹方材料可解析性
const itemNames = new Set(items.map(i => i.name));
const bpMissing = new Set();
for (const b of blueprints) for (const m of (b.materials || [])) if (!itemNames.has(m.name)) bpMissing.add(m.name);
console.log('\n图纸材料缺失:', [...bpMissing].join('、') || '（无）');
// 商店货架结构
const shop = rows('shop');
console.log('货架条目:', shop.length, '| 价格区间:', Math.min(...shop.map(s => s.price)), '-', Math.max(...shop.map(s => s.price)));
db.close();
