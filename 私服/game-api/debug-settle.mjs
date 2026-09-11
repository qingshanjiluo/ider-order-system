// 调试：直接调 finalizeBattle 验证战败调息逻辑
import { finalizeBattle } from './src/game/battleSettlementService.js';
import { setSettlementDb } from './src/game/battleSettlementService.js';
import { createDb } from './src/db.js';
import { createInitialPlayerData } from './src/player.js';

// Mock D1 最小版
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
    const sql = this.sql, args = this.args;
    if (sql.includes('FROM players')) {
      for (const [k, v] of store) if (k.startsWith('p:') && v.account_id === Number(args[0])) results.push({ data: typeof v.data === 'string' ? v.data : JSON.stringify(v.data) });
    }
    return { results };
  }
  async run() {
    const sql = this.sql, args = this.args;
    if (sql.includes('INSERT INTO players') || sql.includes('ON CONFLICT')) {
      store.set('p:' + Number(args[0]), { account_id: Number(args[0]), data: args[2] });
    }
    return { meta: { last_row_id: seq++ } };
  }
}
const env = {
  DB: { prepare(sql) { return new Stmt(sql); } },
  JWT_SECRET: 'x', PASSWORD_PEPPER: 'x'
};
const db = createDb(env);
setSettlementDb(db);

const p = await createInitialPlayerData('测试', [1, 2, 3], env);
p.exp = 100000;
await db.savePlayer(1, 1, p);

const session = {
  account_id: 1,
  map_id: 1,
  enemy_id: 1,
  started_at: Math.floor(Date.now() / 1000) - 60,
  last_seq: 10,
  state: { enemy_source: 'wild' }
};
const state = {
  round: 5,
  player: { hp: 0, mp: 10, skill_cooldowns: {} },
  server_driven: true
};
const r = await finalizeBattle(session, state, { victory: false, draw: false });
console.log('finalize ok:', r && r.ok, 'rest_remaining:', r && r.rest_remaining_sec);
const p2 = await db.getPlayerByAccountId(1);
console.log('player rest_until:', p2.rest_until, 'hp:', p2.hp, 'exp:', p2.exp);
process.exit(0);