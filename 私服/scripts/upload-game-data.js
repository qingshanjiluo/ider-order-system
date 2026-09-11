/**
 * scripts/upload-game-data.js — 将 源代码/data/*.json 上传到 Cloudflare KV
 * 用法：
 *   1. wrangler kv namespace create ideer-game-data   → 记下 id 填入 game-api/wrangler.toml
 *   2. 设置 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID 环境变量
 *   3. node scripts/upload-game-data.js --namespace-id <KV_ID>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_SRC = path.join(ROOT, '..', '源代码', 'data');

const FILE_MAP = {
  'alchemy_recipes.json': 'alchemy_recipes',
  'array_runes.json': 'array_runes',
  'array_shapes.json': 'array_shapes',
  'craft_recipes.json': 'craft_recipes',
  'dungeon_enemies.json': 'dungeon_enemies',
  'dungeons.json': 'dungeons',
  'enemies.json': 'enemies',
  'enemy_prefixes.json': 'enemy_prefixes',
  'items.json': 'items',
  'maps.json': 'maps',
  'sects.json': 'sects',
  'skills.json': 'skills',
  'skillsDiscipleBattle.json': 'skills_disciple_battle',
  'techniques.json': 'techniques'
};

function main() {
  const args = process.argv.slice(2);
  const nsArg = args.find(a => a.startsWith('--namespace-id='));
  if (!nsArg) {
    console.error('用法: node upload-game-data.js --namespace-id=<KV_NAMESPACE_ID>');
    process.exit(1);
  }
  const namespaceId = nsArg.split('=')[1];

  const files = fs.readdirSync(DATA_SRC).filter(f => f.endsWith('.json'));
  console.log('待上传文件:');
  for (const f of files) {
    const key = FILE_MAP[f];
    const sz = fs.statSync(path.join(DATA_SRC, f)).size;
    console.log(`  ${key || f}  (${(sz / 1024).toFixed(1)}KB)  [${f}]`);
  }

  // 使用 wrangler CLI 批量上传（比 REST API 简单）
  // 逐文件执行: wrangler kv key put --binding=GAME_DATA_KV --namespace-id=...
  console.log('\n执行以下命令上传每个文件：');
  for (const f of files) {
    const key = FILE_MAP[f] || f.replace(/\.json$/, '');
    console.log(`  npx wrangler kv key put ${key} --namespace-id=${namespaceId} --path="${path.join(DATA_SRC, f).replace(/\\/g, '/')}"`);
  }
}

main();