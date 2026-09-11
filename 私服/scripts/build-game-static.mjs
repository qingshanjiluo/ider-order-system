// scripts/build-game-static.mjs — 将 源代码/data/*.json 转为 ESM 模块
// 输出到 game-api/src/data/*.js（`export default [...]`），供 Worker 直接 import
// 运行：node scripts/build-game-static.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_SRC = path.join(ROOT, '..', '源代码', 'data');
const OUT_DIR = path.join(ROOT, 'game-api', 'src', 'data');

const FILE_MAP = {
  'items.json': 'items',
  'enemies.json': 'enemies',
  'maps.json': 'maps',
  'skills.json': 'skills',
  'techniques.json': 'techniques',
  'dungeon_enemies.json': 'dungeonEnemies',
  'dungeons.json': 'dungeons',
  'alchemy_recipes.json': 'alchemyRecipes',
  'craft_recipes.json': 'craftRecipes',
  'array_shapes.json': 'arrayShapes',
  'array_runes.json': 'arrayRunes',
  'sects.json': 'sects',
  'enemy_prefixes.json': 'enemyPrefixes',
  'skillsDiscipleBattle.json': 'skillsDiscipleBattle',
  'beasts.json': 'beasts'
};

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let count = 0;
for (const [file, key] of Object.entries(FILE_MAP)) {
  const src = path.join(DATA_SRC, file);
  if (!fs.existsSync(src)) { console.warn('skip (missing):', file); continue; }
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  const js = `// 自动生成：${file}（勿手改，重跑 scripts/build-game-static.mjs 更新）\nexport default ${JSON.stringify(raw)};\n`;
  fs.writeFileSync(path.join(OUT_DIR, key + '.js'), js, 'utf8');
  count++;
  console.log('OK', key, `(${(fs.statSync(src).size / 1024).toFixed(1)}KB)`);
}
console.log(`\n生成 ${count} 个静态数据模块 → ${OUT_DIR}`);