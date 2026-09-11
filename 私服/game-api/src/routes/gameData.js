/**
 * /game-data 静态数据接口（前端 getGameData 使用）
 * 迁移自 server/index.js，数据从打包的 dataLoader 读取。
 */
import * as dataLoader from '../game/dataLoader.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

let _cache = null;

export function handleGameData() {
  if (!_cache) {
    _cache = {
      items: safeData('items', () => dataLoader.getItems()),
      skills: safeData('skills', () => dataLoader.getSkills()),
      techniques: safeData('techniques', () => dataLoader.getTechniques()),
      maps: safeData('maps', () => dataLoader.getMaps()),
      enemies: safeData('enemies', () => dataLoader.getEnemies()),
      enemy_prefixes: safeData('enemy_prefixes', () => dataLoader.getEnemyPrefixes()),
      sects: safeData('sects', () => dataLoader.getSects()),
      alchemy_recipes: safeData('alchemy_recipes', () => dataLoader.getAlchemyRecipes()),
      craft_recipes: safeData('craft_recipes', () => dataLoader.getCraftRecipes()),
      array_shapes: safeData('array_shapes', () => dataLoader.getArrayShapes()),
      array_runes: safeData('array_runes', () => dataLoader.getArrayRunes()),
      dungeons: safeData('dungeons', () => dataLoader.getDungeons())
    };
  }
  return new Response(JSON.stringify({ ok: true, data: _cache }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function safeData(key, fn, fallback = []) {
  try {
    if (typeof fn !== 'function') return fallback;
    const r = fn();
    return r != null ? r : fallback;
  } catch (e) {
    console.warn('[game-data]', key, '加载失败:', e?.message);
    return fallback;
  }
}