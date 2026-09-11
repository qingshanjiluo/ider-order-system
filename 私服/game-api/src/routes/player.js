/**
 * 玩家核心玩法路由（Worker 版）
 * 复用原 server/game/playerOps.js 的纯逻辑，配合 D1 封装层持久化。
 *
 * 模式：loadPlayer → ops.xxx(player)（原地修改）→ recalcAndAssignCombatStats → savePlayer
 */

import * as ops from '../game/playerOps.js';
import { recalcAndAssignCombatStats } from '../game/combatUtils.js';
import { createDb } from '../db.js';
import { enrichPlayer } from '../player.js';
import { verifyToken } from '../auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T',
  'Access-Control-Max-Age': '86400'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

async function getAuthAccount(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  return verifyToken(token, env);
}

/**
 * 处理一个「读-改-存」类型的玩家操作路由。
 * @param {Function} mutate 同步修改函数 (player, body) => { ok, ... } 
 */
async function handlePlayerMutate(request, env, mutate, opts = {}) {
  const auth = await getAuthAccount(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = auth.accountId || auth.sub || 0;

  const db = createDb(env);
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });

  const body = await request.json().catch(() => ({}));
  const result = mutate(player, body);
  if (!result || result.ok === false) {
    return json(result || { ok: false, error: '操作失败' });
  }

  if (result.player && opts.recalc !== false) {
    try { recalcAndAssignCombatStats(result.player, true); } catch (e) { console.error('[recalc]', e?.message); }
  }

  await db.savePlayerImmediate(accountId, 1, result.player);
  if (result.player) enrichPlayer(result.player);
  return json(result);
}

// 便捷：读取 player（不需要写回）
async function handlePlayerRead(request, env, fn) {
  const auth = await getAuthAccount(request, env);
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = auth.accountId || auth.sub || 0;
  const db = createDb(env);
  const player = await db.getPlayerByAccountId(accountId);
  if (!player) return json({ ok: false, error: '无角色数据' });
  const result = fn(player);
  return json(result);
}

export async function handlePlayerRoute(request, env, route) {
  const method = request.method;

  // 读操作
  if (route === '/player/state' && method === 'GET') {
    return handlePlayerRead(request, env, (p) => {
      enrichPlayer(p);
      return { ok: true, player: p };
    });
  }

  // 写操作：level_up / breakthrough / equip / unequip / use_item 等
  const mutations = {
    '/player/level_up': (p) => ops.levelUp(p),
    '/player/breakthrough': (p) => ops.breakthrough(p),
    '/player/equip': (p, b) => {
      const r = ops.equip(p, intVal(b.page), intVal(b.slot_index, -1));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/unequip': (p, b) => {
      const r = ops.unequip(p, String(b.slot_type || b.slot || ''));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/use_item': (p, b) => ops.useItem(p, intVal(b.page), intVal(b.slot_index, -1), intVal(b.count, 1), b.use_options || null),
    '/player/inventory/sort': (p) => { ops.sortInventory(p); return { ok: true, player: p }; },
    '/player/inventory/lock': (p, b) => {
      const r = ops.setEquipmentLock(p, intVal(b.page), intVal(b.slot_index, -1), b.locked === null ? null : !!b.locked);
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/sell_item': (p, b) => ops.sellItem(p, intVal(b.page), intVal(b.slot_index, -1), intVal(b.count, 1)),
    '/player/decompose_equipment': (p, b) => ops.decomposeEquipment(p, intVal(b.page), intVal(b.slot_index, -1)),
    '/player/equip_skill': (p, b) => {
      const r = ops.equipSkill(p, intVal(b.skill_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/unequip_skill': (p, b) => {
      const r = ops.unequipSkill(p, intVal(b.skill_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/set_key_skill': (p, b) => {
      const r = ops.setKeySkill(p, intVal(b.skill_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/set_talisman': (p, b) => {
      const r = ops.setTalisman(p, intVal(b.item_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/set_technique': (p, b) => {
      const r = ops.setTechnique(p, String(b.slot || 'main'), intVal(b.technique_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/save_skill_preset': (p, b) => {
      const r = ops.saveSkillPreset(p, String(b.preset || ''), b.equipped_skills || [], intVal(b.key_skill_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/apply_skill_preset': (p, b) => {
      const r = ops.applySkillPreset(p, String(b.preset || ''));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/preset_equip_skill': (p, b) => {
      const r = ops.presetEquipSkill(p, String(b.preset || ''), intVal(b.skill_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/preset_unequip_skill': (p, b) => {
      const r = ops.presetUnequipSkill(p, String(b.preset || ''), intVal(b.skill_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/preset_set_key_skill': (p, b) => {
      const r = ops.presetSetKeySkill(p, String(b.preset || ''), intVal(b.skill_id));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/agreement_seen': (p) => { p.agreement_seen = true; return { ok: true, player: p }; },
    '/player/talent/unlock': (p, b) => {
      const r = ops.unlockTalentNode(p, String(b.node_id || ''));
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    },
    '/player/talent/reset': (p) => {
      const r = ops.resetTalentNodes(p);
      if (r && r.ok === false) return r;
      return { ok: true, player: p };
    }
  };

  const mutateFn = mutations[route];
  if (mutateFn && method === 'POST') {
    return handlePlayerMutate(request, env, mutateFn);
  }

  // 特殊：save（原 server 固定返回成功，不写入客户端数据）/ rename / wipe / set_map
  if (route === '/player/save' && method === 'POST') {
    return json({ ok: true });
  }
  if (route === '/player/rename' && method === 'POST') {
    return handlePlayerMutate(request, env, (p, b) => {
      const name = String(b.name || '').trim();
      if (name.length < 2 || name.length > 12) return { ok: false, error: '角色名 2-12 字符' };
      p.name = name;
      return { ok: true, player: p };
    });
  }
  if (route === '/player/set_map' && method === 'POST') {
    return handlePlayerMutate(request, env, (p, b) => {
      p.current_map_id = Math.max(1, intVal(b.map_id, 1));
      return { ok: true, player: p };
    });
  }
  if (route === '/player/wipe' && method === 'POST') {
    const auth = await getAuthAccount(request, env);
    if (!auth) return json({ ok: false, error: '未登录' }, 401);
    const db = createDb(env);
    await db.wipeAccountData(auth.accountId || auth.sub || 0);
    return json({ ok: true });
  }

  // 旧材料转灵石迁移
  if (route === '/player/migrate_materials' && method === 'POST') {
    return handlePlayerMutate(request, env, (p) => {
      const OLD_MAX_ID = 399;
      const RATE = { 1: 10, 2: 50, 3: 200, 4: 1000, 5: 5000, 6: 25000, 7: 100000, 8: 500000 };
      const OLD_TYPES = new Set(['material', 'herb', 'medicine', 'consumable']);
      let converted = 0;
      let stonesGained = 0;
      const inv = Array.isArray(p.inventory) ? p.inventory : [];
      for (let page = 0; page < inv.length; page++) {
        const slots = inv[page];
        if (!Array.isArray(slots)) continue;
        for (let s = 0; s < slots.length; s++) {
          const slot = slots[s];
          if (!slot || !slot.item || !slot.item.id) continue;
          const itemId = Number(slot.item.id) || 0;
          const itemType = String(slot.item.type || '');
          if (itemId > 0 && itemId <= OLD_MAX_ID && OLD_TYPES.has(itemType) && !slot.item.isGenerated) {
            const q = Number(slot.item.quality) || 1;
            const count = Math.max(1, Number(slot.count) || 1);
            const stones = (RATE[q] || 10) * count;
            stonesGained += stones;
            converted += count;
            slots[s] = { item: null, count: 0 };
          }
        }
      }
      if (stonesGained > 0) {
        p.spirit_stones = (Number(p.spirit_stones) || 0) + stonesGained;
      }
      // 重置旧炼丹解锁配方（旧ID已不存在）
      if (p.alchemy && Array.isArray(p.alchemy.unlocked_recipes)) {
        p.alchemy.unlocked_recipes = [];
      }
      return { ok: true, player: p, converted, stonesGained, msg: `转换${converted}个旧物品，获得${stonesGained}灵石` };
    });
  }

  // 一键升级到最高级（突破不可跳过）
  if (route === '/player/level_max' && method === 'POST') {
    return handlePlayerMutate(request, env, (p) => {
      const BREAKTHROUGH_LEVELS = [120, 136, 152, 168, 184, 200, 216, 232, 248, 264, 280, 296];
      let levelsGained = 0;
      const MAX_ITER = 500;
      for (let i = 0; i < MAX_ITER; i++) {
        const curLv = Number(p.level) || 1;
        if (curLv >= 300) break;
        if (BREAKTHROUGH_LEVELS.includes(curLv)) break;
        const r = ops.levelUp(p);
        if (!r || r.ok === false) break;
        levelsGained++;
      }
      return { ok: true, player: p, levelsGained, msg: levelsGained > 0 ? `升级${levelsGained}级！` : '已达上限或需要突破' };
    });
  }

  return null; // 不匹配，交由上层 404
}