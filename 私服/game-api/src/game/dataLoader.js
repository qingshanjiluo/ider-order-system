/**
 * 游戏静态数据加载（ESM 版）
 * 迁移自 server/game/dataLoader.js：原用 fs 读 JSON 文件，此处改为静态 import
 * （data/*.js 由 scripts/build-game-static.mjs 从 源代码/data/*.json 生成）
 */
import { isLingjieMap } from './lingjie.js';
import items from '../data/items.js';
import enemies from '../data/enemies.js';
import maps from '../data/maps.js';
import skills from '../data/skills.js';
import techniques from '../data/techniques.js';
import dungeonEnemies from '../data/dungeonEnemies.js';
import dungeons from '../data/dungeons.js';
import alchemyRecipes from '../data/alchemyRecipes.js';
import craftRecipes from '../data/craftRecipes.js';
import arrayShapes from '../data/arrayShapes.js';
import arrayRunes from '../data/arrayRunes.js';
import sects from '../data/sects.js';
import enemyPrefixes from '../data/enemyPrefixes.js';

const NIGHTMARE_MAP_ID_OFFSET = 10000;

let _items, _enemies, _maps, _skills, _techniques, _dungeonEnemies, _dungeons, _sects, _alchemyRecipes, _craftRecipes, _enemyPrefixes, _arrayShapes, _arrayRunes;
let _itemsById, _enemiesById, _mapsById, _skillsById, _techniquesById, _dungeonEnemiesById, _dungeonsById, _sectsById;

function buildNightmareMap(baseMap) {
  if (!baseMap || typeof baseMap !== 'object') return null;
  if (isLingjieMap(baseMap)) return null;
  const baseId = Number(baseMap.id) || 0;
  if (baseId <= 0) return null;
  const mirror = JSON.parse(JSON.stringify(baseMap));
  mirror.id = baseId + NIGHTMARE_MAP_ID_OFFSET;
  mirror.base_map_id = baseId;
  mirror.is_nightmare = true;
  mirror.name = `魇化${String(baseMap.name || '未知地图')}`;
  mirror.description = `${String(baseMap.description || '')}（魇界：怪物属性x4，掉率x3.5）`;
  return mirror;
}

function _buildIdMap(arr, key = 'id') {
  const m = new Map();
  for (const o of arr || []) {
    const k = Number(o && o[key]);
    if (Number.isFinite(k)) m.set(k, o);
  }
  return m;
}

export function getItems() { if (!_items) { _items = items; _itemsById = _buildIdMap(_items); } return _items; }
export function getEnemies() { if (!_enemies) { _enemies = enemies; _enemiesById = _buildIdMap(_enemies); } return _enemies; }
export function getMaps() {
  if (!_maps) {
    const baseMaps = maps;
    const nightmareMaps = (baseMaps || []).map(buildNightmareMap).filter(Boolean);
    _maps = [...baseMaps, ...nightmareMaps];
    _mapsById = _buildIdMap(_maps);
  }
  return _maps;
}
export function getSkills() { if (!_skills) { _skills = skills; _skillsById = _buildIdMap(_skills); } return _skills; }
export function getTechniques() { if (!_techniques) { _techniques = techniques; _techniquesById = _buildIdMap(_techniques); } return _techniques; }

export function getItemById(id) { if (!_itemsById) getItems(); return _itemsById.get(Number(id)) || {}; }
export function getEnemyById(id) { if (!_enemiesById) getEnemies(); return _enemiesById.get(Number(id)) || {}; }
export function getMapById(id) { if (!_mapsById) getMaps(); return _mapsById.get(Number(id)) || {}; }

export function getEnemiesInLevelRange(minLv, maxLv) {
  return getEnemies().filter(e => { const lv = Number(e.level) || 1; return lv >= minLv && lv <= maxLv; });
}

export function getDungeonEnemies() { if (!_dungeonEnemies) { _dungeonEnemies = dungeonEnemies; _dungeonEnemiesById = _buildIdMap(_dungeonEnemies); } return _dungeonEnemies; }
export function getDungeons() { if (!_dungeons) { _dungeons = dungeons; _dungeonsById = _buildIdMap(_dungeons); } return _dungeons; }
export function getAlchemyRecipes() { if (!_alchemyRecipes) _alchemyRecipes = alchemyRecipes; return _alchemyRecipes; }
export function getCraftRecipes() { if (!_craftRecipes) _craftRecipes = craftRecipes; return _craftRecipes; }
export function getArrayShapes() { if (!_arrayShapes) _arrayShapes = arrayShapes; return _arrayShapes; }
export function getArrayRunes() { if (!_arrayRunes) _arrayRunes = arrayRunes; return _arrayRunes; }

export function getDungeonEnemyById(id) { if (!_dungeonEnemiesById) getDungeonEnemies(); return _dungeonEnemiesById.get(Number(id)) || {}; }
export function getDungeonById(id) { if (!_dungeonsById) getDungeons(); return _dungeonsById.get(Number(id)) || {}; }
export function getSects() { if (!_sects) { _sects = sects; _sectsById = _buildIdMap(_sects); } return _sects || []; }
export function getSectById(id) { if (!_sectsById) getSects(); return _sectsById.get(Number(id)) || {}; }
export function getSkillById(id) { if (!_skillsById) getSkills(); return _skillsById.get(Number(id)) || {}; }
export function getTechniqueById(id) { if (!_techniquesById) getTechniques(); return _techniquesById.get(Number(id)) || {}; }
export function getEnemyPrefixes() { if (!_enemyPrefixes) _enemyPrefixes = enemyPrefixes; return _enemyPrefixes || []; }