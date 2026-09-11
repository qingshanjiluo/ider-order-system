/**
 * 在线玩法通用工具（纯函数版，迁移自 server/game/onlineUtils.js）
 * 原 getSectMemberCounts 依赖 db 查询宗门人数，此处改为由外部注入
 * （不注入时返回空对象，调用方需自行处理）。
 */
import { ensureInventoryStructure } from './inventoryUtils.js';

let _ops = null;
function _getOps() { if (!_ops) { _ops = require('./playerOps'); } return _ops; }

export function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}
export function floatVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
export function clampi(v, minV, maxV) {
  return Math.max(minV, Math.min(maxV, intVal(v)));
}
export function clampf(v, minV, maxV) {
  return Math.max(minV, Math.min(maxV, floatVal(v)));
}
export function randf() { return Math.random(); }
export function randiRange(minV, maxV) {
  const a = intVal(minV);
  const b = intVal(maxV);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
export function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}
export const deepClone = typeof structuredClone === 'function'
  ? (v) => structuredClone(v)
  : (v) => JSON.parse(JSON.stringify(v));
export function nowSec() { return Math.floor(Date.now() / 1000); }

export function ensurePlayerInventory(player) {
  player.inventory = ensureInventoryStructure(player.inventory || []);
}
export function countItemInInventory(player, itemId) {
  ensurePlayerInventory(player);
  let total = 0;
  for (const page of player.inventory) {
    if (!Array.isArray(page)) continue;
    for (const slot of page) {
      if (!slot || !slot.item) continue;
      if (intVal(slot.item.id) === intVal(itemId)) total += Math.max(1, intVal(slot.count, 1));
    }
  }
  return total;
}
export function consumeItemFromInventory(player, itemId, count) {
  ensurePlayerInventory(player);
  return _getOps().consumeItemFromInventory(player.inventory, intVal(itemId, 0), Math.max(0, intVal(count, 0)));
}
export function hasEmptyInventorySlot(player) {
  ensurePlayerInventory(player);
  for (const page of player.inventory) {
    if (!Array.isArray(page)) continue;
    for (const slot of page) { if (slot == null) return true; }
  }
  return false;
}
export function inventoryHasItem(player, itemId) {
  ensurePlayerInventory(player);
  for (const page of player.inventory) {
    if (!Array.isArray(page)) continue;
    for (const slot of page) {
      if (!slot || !slot.item) continue;
      if (intVal(slot.item.id) === intVal(itemId)) return true;
    }
  }
  return false;
}

// 宗门人数：由外部注入（game-api 可接 D1 countPlayersBySect）
let _sectCountsLoader = null;
export function setSectCountsLoader(fn) { _sectCountsLoader = fn; }
export async function getSectMemberCounts() {
  if (_sectCountsLoader) return _sectCountsLoader();
  return {};
}

export function getSlot(player, page, slotIdx) {
  ensurePlayerInventory(player);
  const p = intVal(page, -1);
  const s = intVal(slotIdx, -1);
  if (p < 0 || p >= player.inventory.length) return null;
  if (!Array.isArray(player.inventory[p]) || s < 0 || s >= player.inventory[p].length) return null;
  return player.inventory[p][s];
}

export function calculateItemValue(item) {
  if (!item || typeof item !== 'object') return 0;
  if (Object.prototype.hasOwnProperty.call(item, 'value')) return intVal(item.value, 0);
  const quality = intVal(item.quality, 1);
  const t = String(item.type || '');
  let baseValue = 0;
  if (quality === 1) baseValue = 10;
  else if (quality === 2) baseValue = 30;
  else if (quality === 3) baseValue = 100;
  else if (quality === 4) baseValue = 400;
  else if (quality === 5) baseValue = 2000;
  else if (quality === 6) baseValue = 3000;
  else if (quality === 7) baseValue = 5000;
  if (String(item.material || '') === '令牌') return baseValue * 5;
  if (['herb', 'medicine', 'material'].includes(t)) return baseValue;
  if (['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back', 'consumable'].includes(t)) return baseValue * 3;
  if (t === 'book') return baseValue * 5;
  return baseValue;
}

export function readPositiveIntByKeys(obj, keys, fallback) {
  if (obj && typeof obj === 'object' && Array.isArray(keys)) {
    for (const key of keys) {
      const v = intVal(obj[key], 0);
      if (v > 0) return v;
    }
  }
  return Math.max(0, intVal(fallback, 0));
}

export function calcEquipCombatPower(item) {
  if (!item || typeof item !== 'object') return 0;
  const s = item.stats || {};
  let power = 0;
  power += ((intVal(s.minAttack, 0) + intVal(s.maxAttack, 0)) / 2) * 1.0;
  power += ((intVal(s.minSpellAttack, 0) + intVal(s.maxSpellAttack, 0)) / 2) * 1.0;
  power += (intVal(s.maxHp, 0) || intVal(s.hp, 0)) * 0.15;
  power += (intVal(s.physDefense, 0) || intVal(s.defense, 0)) * 1.0;
  power += intVal(s.spellDefense, 0) * 1.0;
  power += intVal(s.strength, 0) * 2.0;
  power += intVal(s.constitution, 0) * 2.0;
  power += intVal(s.bone, 0) * 2.0;
  power += intVal(s.agility, 0) * 2.0;
  power += intVal(s.zhenyuan, 0) * 1.5;
  power += intVal(s.lingli, 0) * 1.5;
  power += intVal(s.turn_end_mp, 0) * 3.0;
  power += intVal(s.phys_crit_rate_bonus, 0) * 20;
  power += intVal(s.spell_crit_rate_bonus, 0) * 20;
  power += intVal(s.phys_crit_damage_bonus, 0) * 15;
  power += intVal(s.spell_crit_damage_bonus, 0) * 15;
  power += intVal(s.phys_lifesteal_pct, 0) * 5;
  power += intVal(s.spell_lifesteal_pct, 0) * 5;
  power += intVal(s.phys_damage_pct, 0) * 5;
  power += intVal(s.spell_damage_pct, 0) * 5;
  power += intVal(s.phys_flat_damage, 0) * 1.2;
  power += intVal(s.spell_flat_damage, 0) * 1.2;
  power += intVal(s.phys_defense_pct, 0) * 5;
  power += intVal(s.spell_defense_pct, 0) * 5;
  power += intVal(s.phys_defense_flat, 0) * 1.0;
  power += intVal(s.spell_defense_flat, 0) * 1.0;
  power += intVal(s.phys_splash_pct, 0) * 4;
  power += intVal(s.spell_splash_pct, 0) * 4;
  if (item.isEx) power *= 1.15;
  return Math.floor(power);
}

export function calcTotalEquipCombatPower(player) {
  const eq = player?.equipment;
  if (!eq || typeof eq !== 'object') return 0;
  let total = 0;
  for (const slot of ['weapon', 'head', 'shoulder', 'chest', 'legs', 'hands', 'ring', 'amulet', 'back']) {
    total += calcEquipCombatPower(eq[slot]);
  }
  return total;
}