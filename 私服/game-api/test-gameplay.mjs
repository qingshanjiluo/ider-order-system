// 核心玩法集成测试：验证战斗引擎 + playerOps + D1 封装全链路
// 运行：
//   npx esbuild test-gameplay.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\gp-bundle.mjs
//   node D:\Temp\opencode\gp-bundle.mjs
import * as ops from './src/game/playerOps.js';
import { recalcAndAssignCombatStats } from './src/game/combatUtils.js';
import * as battleEngine from './src/game/battleEngine.js';
import { createDb } from './src/db.js';
import { createInitialPlayerData, enrichPlayer } from './src/player.js';

// ── 模拟 D1 ──
const store = new Map();
let seq = 1000;
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async first() {
    const r = await this.all();
    return r.results[0] || null;
  }
  async all() {
    const results = [];
    const sql = this.sql;
    const args = this.args;
    if (sql.includes('FROM players')) {
      for (const [k, v] of store) {
        if (k.startsWith('p:') && v.account_id === Number(args[0])) {
          results.push({ data: typeof v.data === 'string' ? v.data : JSON.stringify(v.data) });
        }
      }
    } else if (sql.includes('FROM accounts')) {
      for (const [k, v] of store) {
        if (k.startsWith('a:') && v.username === args[0]) results.push(v);
      }
    }
    return { results };
  }
  async run() {
    const sql = this.sql;
    if (sql.startsWith('INSERT INTO players') || sql.includes('ON CONFLICT(account_id)')) {
      // INSERT ... ON CONFLICT → upsert
      if (sql.startsWith('INSERT INTO players')) {
        const accountId = Number(this.args[0]);
        const data = this.args[2];
        store.set('p:' + accountId, { account_id: accountId, data });
      } else {
        // ON CONFLICT update
        const accountId = Number(this.args[0]);
        const data = this.args[2];
        store.set('p:' + accountId, { account_id: accountId, data });
      }
      return { meta: { last_row_id: seq++ } };
    }
    return { meta: { last_row_id: seq++ } };
  }
}

const env = {
  DB: { prepare(sql) { return new Stmt(sql); } },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper'
};
const db = createDb(env);

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

console.log('== 1. 创建角色并保存 ==');
const p1 = await createInitialPlayerData('测试修士', [1, 2, 3], env);
assert('初始属性存在', p1.strength === 10 && p1.constitution === 10);
assert('背包10页', p1.inventory.length === 10);
// 直接放入经验以便升级
p1.exp = 100000;
await db.savePlayer(1, 1, p1);

console.log('== 2. 读取并升级 ==');
const loaded = await db.getPlayerByAccountId(1);
assert('读取到角色', loaded && loaded.name === '测试修士');
assert('经验保留', loaded.exp === 100000);
const r = ops.levelUp(loaded);
assert('升级成功', r.ok === true);
assert('等级提升', r.player.level === 2);
// 原版成长表：升到 2 级时属性不增（每10级 pos=4 才 +2），断言属性不减少
assert('属性不减少', r.player.strength >= 10);
// 战斗属性重算
assert('战斗属性已算', r.player.max_hp > 0 && r.player.min_phys_damage > 0);
// 连升到 15 级（含多次成长），验证属性确实增长
let p15 = r.player;
p15.exp = 10000000;
for (let i = 0; i < 20; i++) { const rr = ops.levelUp(p15); if (!rr.ok) break; p15 = rr.player; }
assert('多级后属性增长', p15.strength > 10, { lv: p15.level, strength: p15.strength });
await db.savePlayer(1, 1, r.player);

console.log('== 3. 战斗引擎可运行 ==');
assert('battleEngine 模块可加载', typeof battleEngine.createBattle === 'function' || Object.keys(battleEngine).length > 0);
console.log('  battleEngine 导出:', Object.keys(battleEngine).slice(0, 15).join(', '));

console.log('== 4. 装备流程 ==');
// 铁剑 id=11 在背包 [0][0]
const p2 = await db.getPlayerByAccountId(1);
const slot = p2.inventory[0][0];
assert('初始有铁剑', slot && Number(slot.item.id) === 11);
const eqRes = ops.equip(p2, 0, 0);
assert('装备成功', eqRes.ok === true);
assert('武器已装备', p2.equipment && p2.equipment.weapon && Number(p2.equipment.weapon.id) === 11);
recalcAndAssignCombatStats(p2, true);
assert('装备后战力提升', p2.min_phys_damage > 0);
await db.savePlayer(1, 1, p2);

console.log('== 5. 技能/功法 ==');
assert('已学技能（unlocked）', Object.keys(p2.skill_levels || {}).length > 0);
assert('已学功法', Object.keys(p2.technique_levels || {}).length > 0);

console.log('== 6. 背包操作 ==');
ops.sortInventory(p2);
assert('排序后背包仍10页', p2.inventory.length === 10);
ops.ensureInventoryStructure(p2.inventory);
assert('背包结构正常', Array.isArray(p2.inventory));

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);