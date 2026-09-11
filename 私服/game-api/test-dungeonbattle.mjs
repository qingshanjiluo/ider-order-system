// 副本战斗 / 城池斗法路由集成测试（Worker 版）
// 运行:
//   npx esbuild test-dungeonbattle.mjs --bundle --format=esm --platform=node --outfile=D:\Temp\opencode\dungeonbattle-bundle.mjs
//   node D:\Temp\opencode\dungeonbattle-bundle.mjs
import { handleDungeonBattleRoute } from './src/routes/dungeonBattle.js';
import { createDb } from './src/db.js';
import { signToken } from './src/auth.js';
import { createInitialPlayerData } from './src/player.js';
import * as dungeonBattleCache from './src/game/dungeonBattleCache.js';
import { createDuelRankSeason, getNextSettlementTs, getCurrentPeriodIndex } from './src/game/duelRankSeason.js';

const store = new Map();
let seq = 1000;
function rows(keyPrefix) {
  const out = [];
  for (const [k, v] of store) if (k.startsWith(keyPrefix)) out.push(v);
  return out;
}
function setRow(k, v) { store.set(k, v); return { meta: { last_row_id: seq++ } }; }

class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { const s = new Stmt(this.sql); s.args = a; return s; }
  async first() { const r = await this.all(); return r.results[0] || null; }
  async all() {
    const sql = this.sql, args = this.args;
    const results = [];
    if (sql.includes('FROM dungeon_completions')) {
      const key = 'dc:' + Number(args[0]) + ':' + Number(args[1]) + ':' + args[2];
      const rec = store.get(key);
      if (rec) results.push(rec);
    } else if (sql.includes('FROM city_duel_challenges')) {
      const aid = Number(args[0]);
      let c = 0;
      for (const r of rows('cdc:')) {
        if (Number(r.challenger_account_id) !== aid) continue;
        if (sql.includes('target_account_id = ?')) {
          if (Number(r.target_account_id) === Number(args[1]) && Number(r.created_at) >= Number(args[2]) && Number(r.created_at) < Number(args[3])) c++;
        } else {
          if (Number(r.created_at) >= Number(args[1]) && Number(r.created_at) < Number(args[2])) c++;
        }
      }
      results.push({ c });
    } else if (sql.includes('FROM city_duel_logs')) {
      const aid = Number(args[0]);
      let arr = rows('cdl:').filter(r => Number(r.challenger_account_id) === aid || Number(r.target_account_id) === aid);
      if (sql.includes('AND challenger_account_id = ?')) arr = arr.filter(r => Number(r.challenger_account_id) === aid);
      if (sql.includes('AND target_account_id = ?')) arr = arr.filter(r => Number(r.target_account_id) === aid);
      if (sql.includes('COUNT(1)')) {
        results.push({ c: arr.length });
      } else {
        arr = arr.slice().sort((a, b) => (Number(b.created_at) - Number(a.created_at)) || (Number(b.id) - Number(a.id)));
        const ps = Number(args[args.length - 2]);
        const offset = Number(args[args.length - 1]);
        results.push(...arr.slice(offset, offset + ps));
      }
    } else if (sql.includes('FROM duel_rank_state')) {
      const rec = store.get('drs:last_settled_period');
      if (rec) results.push(rec);
    } else if (sql.includes('FROM dungeon_team_members')) {
      const arr = rows('dtm:').filter(v => Number(v.account_id) === Number(args[0]));
      results.push(...arr);
    } else if (sql.includes('FROM dungeon_teams')) {
      const arr = rows('dt:').filter(v => v.team_code === args[0] && Number(v.expires_at) > Math.floor(Date.now() / 1000));
      if (arr[0]) results.push(arr[0]);
    } else if (sql.includes('FROM dungeon_battle_sessions')) {
      const rec = store.get('dbs:' + String(args[0]));
      if (rec) results.push(rec);
    } else if (sql.includes('SELECT data FROM players')) {
      const p = store.get('p:' + Number(args[0]));
      if (p) results.push({ data: typeof p.data === 'string' ? p.data : JSON.stringify(p.data) });
    } else if (sql.includes('FROM players')) {
      if (sql.includes('ORDER BY') && sql.includes('LIMIT 1')) {
        // getTopDuelRankAccount
        const arr = rows('p:').map(v => {
          const o = typeof v.data === 'string' ? JSON.parse(v.data) : (v.data || {});
          return { account_id: Number(v.account_id), duel_rank_score: o.duel_rank_score != null ? Number(o.duel_rank_score) : 1000 };
        }).sort((a, b) => (b.duel_rank_score - a.duel_rank_score) || (a.account_id - b.account_id));
        if (arr[0]) results.push(arr[0]);
      } else {
        // listPlayerBriefAll（name 模拟 json_extract 的带引号 JSON 文本）
        for (const v of rows('p:')) {
          const o = typeof v.data === 'string' ? JSON.parse(v.data) : (v.data || {});
          results.push({
            account_id: Number(v.account_id),
            name: JSON.stringify(String(o.name || '')),
            level: Number(o.level) || 1,
            sect_id: Number(o.sect_id) || 0,
            duel_rank_score: o.duel_rank_score != null ? Number(o.duel_rank_score) : null
          });
        }
      }
    } else if (sql.includes('FROM mailbox_messages')) {
      // dedupe 检查：本测试流程不使用 dedupe_key，恒返回无
    }
    return { results };
  }
  async run() {
    const sql = this.sql, args = this.args;
    if (sql.includes('INSERT INTO players')) {
      return setRow('p:' + Number(args[0]), { account_id: Number(args[0]), slot: Number(args[1]), data: args[2] });
    }
    if (sql.includes('UPDATE players')) {
      // resetAllDuelRankScores：json_set data.duel_rank_score
      const score = Number(args[0]);
      for (const v of rows('p:')) {
        const o = typeof v.data === 'string' ? JSON.parse(v.data) : (v.data || {});
        o.duel_rank_score = score;
        v.data = JSON.stringify(o);
      }
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.includes('INSERT OR REPLACE INTO dungeon_battle_sessions')) {
      return setRow('dbs:' + String(args[0]), { id: String(args[0]), account_id: Number(args[1]), dungeon_id: Number(args[2]), state_json: args[3], created_at: Number(args[4]) });
    }
    if (sql.includes('DELETE FROM dungeon_battle_sessions')) {
      if (sql.includes('account_id = ?')) {
        const aid = Number(args[0]);
        for (const k of [...store.keys()]) {
          if (k.startsWith('dbs:') && Number(store.get(k).account_id) === aid) store.delete(k);
        }
      } else {
        store.delete('dbs:' + String(args[0]));
      }
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.includes('INSERT INTO city_duel_challenges')) {
      const id = seq++;
      store.set('cdc:' + id, { id, challenger_account_id: Number(args[0]), target_account_id: Number(args[1]), created_at: Number(args[2]) });
      return { meta: { last_row_id: id } };
    }
    if (sql.includes('INSERT INTO city_duel_logs')) {
      const id = seq++;
      store.set('cdl:' + id, {
        id, challenger_account_id: Number(args[0]), target_account_id: Number(args[1]), winner_account_id: Number(args[2]),
        challenger_name: String(args[3]), target_name: String(args[4]),
        challenger_level: Number(args[5]), target_level: Number(args[6]),
        challenger_sect_name: String(args[7]), target_sect_name: String(args[8]), created_at: Number(args[9])
      });
      return { meta: { last_row_id: id } };
    }
    if (sql.includes('INSERT OR REPLACE INTO duel_rank_state')) {
      store.set('drs:last_settled_period', { value: Number(args[0]) });
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.includes('INSERT INTO mailbox_messages')) {
      const id = seq++;
      store.set('mm:' + id, {
        id, account_id: Number(args[0]), type: String(args[1]), title: String(args[2]), content: String(args[3]),
        attachments_json: String(args[4]), status: 'unread', created_at: Number(args[5]), claimed_at: 0, expires_at: Number(args[6])
      });
      return { meta: { last_row_id: id } };
    }
    if (sql.includes('INSERT INTO dungeon_completions')) {
      const key = 'dc:' + Number(args[0]) + ':' + Number(args[1]) + ':' + args[2];
      store.set(key, { account_id: Number(args[0]), dungeon_id: Number(args[1]), date: args[2], completions: Number(args[3]) || 1 });
      return { meta: { last_row_id: seq++ } };
    }
    if (sql.includes('UPDATE dungeon_completions')) {
      const key = 'dc:' + Number(args[0]) + ':' + Number(args[1]) + ':' + args[2];
      const ex = store.get(key);
      if (ex) ex.completions = (Number(ex.completions) || 0) + 1;
      return { meta: { last_row_id: seq++ } };
    }
    return { meta: { last_row_id: seq++ } };
  }
}

const env = {
  DB: {
    prepare(sql) { return new Stmt(sql); },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; }
  },
  JWT_SECRET: 'test-secret',
  PASSWORD_PEPPER: 'test-pepper'
};

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label, JSON.stringify(detail)); }
}

function makeReq(method, path, body, token) {
  const headers = token
    ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
  return {
    method,
    url: 'http://test/api' + path,
    headers: { get: (name) => headers[name] || null },
    json: async () => body || {}
  };
}

async function call(method, path, body, token) {
  const res = await handleDungeonBattleRoute(makeReq(method, path, body, token), env, path.split('?')[0]);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ── 预置账号与角色 ──────────────────────────────
const db = createDb(env);
const tokenA = await signToken(11, 'playerA', env);
const tokenD = await signToken(21, 'playerD', env);
const tokenE = await signToken(22, 'playerE', env);

async function makePlayer(name, level, score) {
  const p = await createInitialPlayerData(name, [1, 2, 3], env);
  p.level = level;
  p.max_hp = 5000; p.hp = 5000;
  p.max_mp = 1000; p.mp = 1000;
  p.strength = 300; p.constitution = 250; p.zhenyuan = 280; p.bone = 150; p.lingli = 120; p.agility = 100;
  if (score != null) p.duel_rank_score = score;
  return p;
}

const pa = await makePlayer('甲修士', 30, 1000);
const pb = await makePlayer('乙修士', 30, 1200);
const pc = await makePlayer('丙修士', 15, 1000);
const pd = await makePlayer('丁修士', 30, 1000);
const pe = await makePlayer('戊修士', 30, 1000);
await db.savePlayer(11, 1, pa);
await db.savePlayer(12, 1, pb);
await db.savePlayer(13, 1, pc);
await db.savePlayer(21, 1, pd);
await db.savePlayer(22, 1, pe);

// 预置赛季状态：已结算到当前期-1，避免 rank 惰性结算提前触发（干扰本节流程）
const setupPeriod = getCurrentPeriodIndex(Math.floor(Date.now() / 1000));
store.set('drs:last_settled_period', { value: setupPeriod - 1 });

console.log('== 1. 鉴权 ==');
let r = await call('POST', '/dungeon-battle/start', { dungeon_id: 1 }, null);
assert('未登录 401', r.status === 401, { status: r.status });

console.log('== 2. 副本战斗 start/advance（账号21） ==');
r = await call('POST', '/dungeon-battle/start', { dungeon_id: 1 }, tokenD);
assert('副本 start 成功返回 battle_id', r.data && r.data.ok === true && typeof r.data.battle_id === 'string' && r.data.battle_id.length > 0, r.data);
assert('状态含 1 队友 + 2 敌人', r.data && r.data.ok === true && Array.isArray(r.data.state.allies) && r.data.state.allies.length === 1 && Array.isArray(r.data.state.enemies) && r.data.state.enemies.length === 2, r.data && r.data.state && { a: r.data.state.allies.length, e: r.data.state.enemies.length });
const battleId21 = r.data && r.data.battle_id;
assert('会话已落库', rows('dbs:').length >= 1, rows('dbs:').length);

r = await call('POST', '/dungeon-battle/advance', {}, tokenD);
assert('advance 缺 battle_id 报错', r.data && r.data.ok === false && /battle_id/.test(r.data.error || ''), r.data);

r = await call('POST', '/dungeon-battle/advance', { battle_id: battleId21 }, tokenD);
assert('连续快速 advance 被节流', r.data && r.data.ok === true && r.data.throttled === true && Number(r.data.retry_after_ms) > 0, r.data);

console.log('== 3. 副本合法推进（账号22） ==');
r = await call('POST', '/dungeon-battle/start', { dungeon_id: 1 }, tokenE);
assert('账号22 start 成功', r.data && r.data.ok === true && r.data.battle_id, r.data);
const battleId22 = r.data && r.data.battle_id;
r = await call('POST', '/dungeon-battle/advance', { battle_id: battleId22 }, tokenE);
assert('合法 advance 成功', r.data && r.data.ok === true && r.data.ended === false, { ok: r.data && r.data.ok, ended: r.data && r.data.ended });
assert('返回事件数组', r.data && Array.isArray(r.data.events), { events: r.data && r.data.events && r.data.events.length });

console.log('== 4. 城池斗法 目标列表/查看 ==');
r = await call('GET', '/dungeon-battle/city_duel/list', null, tokenA);
assert('斗法列表排除自己且包含目标', r.data && r.data.ok === true && Array.isArray(r.data.list) && r.data.list.length >= 4 && r.data.list.every(e => e.account_id !== 11) && r.data.list.some(e => e.account_id === 12), { n: r.data && r.data.list && r.data.list.length });
assert('列表按等级降序', r.data && r.data.list.length >= 2 && r.data.list[0].level >= r.data.list[r.data.list.length - 1].level, { first: r.data && r.data.list[0] && r.data.list[0].level, last: r.data && r.data.list[r.data.list.length - 1] && r.data.list[r.data.list.length - 1].level });
r = await call('GET', '/dungeon-battle/city_duel/list?keyword=%E4%B9%99', null, tokenA);
assert('关键字过滤', r.data && r.data.ok === true && r.data.list.length === 1 && r.data.list[0].name === '乙修士', r.data.list);

r = await call('GET', '/dungeon-battle/city_duel/inspect?target_account_id=12', null, tokenA);
assert('查看目标属性', r.data && r.data.ok === true && r.data.name === '乙修士' && r.data.level === 30 && r.data.combat && typeof r.data.combat.max_hp === 'number', r.data);
r = await call('GET', '/dungeon-battle/city_duel/inspect?target_account_id=999', null, tokenA);
assert('目标不存在报错', r.data && r.data.ok === false && /不存在/.test(r.data.error || ''), r.data);

console.log('== 5. 城池斗法 发起斗法（账号11） ==');
r = await call('POST', '/dungeon-battle/city_duel/start', { target_account_id: 11 }, tokenA);
assert('不能挑战自己', r.data && r.data.ok === false && /自己/.test(r.data.error || ''), r.data);
r = await call('POST', '/dungeon-battle/city_duel/start', { target_account_id: 13 }, tokenA);
assert('不能挑战低10级以上', r.data && r.data.ok === false && /低10级/.test(r.data.error || ''), r.data);
r = await call('POST', '/dungeon-battle/city_duel/start', { target_account_id: 12 }, tokenA);
assert('发起斗法成功（1次）', r.data && r.data.ok === true && r.data.battle_id && r.data.state && r.data.state.battle_mode === 'city_duel', r.data);
for (let i = 2; i <= 3; i++) {
  r = await call('POST', '/dungeon-battle/city_duel/start', { target_account_id: 12 }, tokenA);
  assert('发起斗法成功（' + i + '次）', r.data && r.data.ok === true, r.data);
}
r = await call('POST', '/dungeon-battle/city_duel/start', { target_account_id: 12 }, tokenA);
assert('同目标第4次达上限', r.data && r.data.ok === false && /上限/.test(r.data.error || ''), r.data);

console.log('== 6. 战神榜 ==');
r = await call('GET', '/dungeon-battle/city_duel/rank', null, tokenA);
assert('战神榜含榜一（乙1200分）', r.data && r.data.ok === true && Array.isArray(r.data.leaderboard) && r.data.leaderboard.length >= 4 && r.data.leaderboard[0].account_id === 12, r.data && r.data.leaderboard);
assert('我的排名与分数', r.data && r.data.ok === true && r.data.my_rank === 2 && r.data.my_score === 1000, { rank: r.data && r.data.my_rank, score: r.data && r.data.my_score });
assert('挑战次数统计与奖励展示', r.data && r.data.ok === true && r.data.challenges_today === 3 && r.data.rank_effective_remaining === 2 && typeof r.data.period_reward.name === 'string' && r.data.settlement_countdown_sec > 0, r.data);

console.log('== 7. 斗法战报 ==');
await db.createCityDuelLog({
  challenger_account_id: 11, target_account_id: 12, winner_account_id: 11,
  challenger_name: '甲修士', target_name: '乙修士',
  challenger_level: 30, target_level: 30, challenger_sect_name: '青云剑宗', target_sect_name: '散修'
});
await db.createCityDuelLog({
  challenger_account_id: 12, target_account_id: 11, winner_account_id: 12,
  challenger_name: '乙修士', target_name: '甲修士',
  challenger_level: 30, target_level: 30, challenger_sect_name: '散修', target_sect_name: '青云剑宗'
});
r = await call('GET', '/dungeon-battle/city_duel/logs', null, tokenA);
assert('战报列表全部', r.data && r.data.ok === true && Array.isArray(r.data.list) && r.data.list.length === 2 && r.data.total === 2 && r.data.role === 'all', r.data);
r = await call('GET', '/dungeon-battle/city_duel/logs?role=challenger', null, tokenA);
assert('战报 role=challenger 过滤', r.data && r.data.ok === true && r.data.list.length === 1 && r.data.list[0].role === 'challenger' && r.data.list[0].self_win === true, r.data);
r = await call('GET', '/dungeon-battle/city_duel/logs?role=target', null, tokenA);
assert('战报 role=target 过滤', r.data && r.data.ok === true && r.data.list.length === 1 && r.data.list[0].role === 'target' && r.data.list[0].self_win === false, r.data);

console.log('== 8. 赛季结算推进 ==');
const season = createDuelRankSeason(env);
const baseNow = Math.floor(Date.now() / 1000);
const basePeriod = getCurrentPeriodIndex(baseNow);
const futureNow = getNextSettlementTs(baseNow) + 5;
r = await season.trySettleIfDue(futureNow);
assert('进入新区间触发结算', r && r.settled === true && r.winnerId === 12 && r.periodIndex === basePeriod, r);
const p12 = await db.getPlayerByAccountId(12);
assert('冠军分数已重置为1000', p12 && Number(p12.duel_rank_score) === 1000, p12 && p12.duel_rank_score);
const mails = rows('mm:').filter(m => Number(m.account_id) === 12 && String(m.type) === 'system');
assert('冠军奖励邮件已发送', mails.length === 1 && /战神榜/.test(String(mails[0].title || '')), mails);
const lastSettled = await db.getDuelRankLastSettledPeriod();
assert('last_settled_period 已推进', lastSettled === basePeriod, { lastSettled, basePeriod });

// 强制落盘缓存中的战斗状态，避免 5s 定时器挂住进程
await dungeonBattleCache.flushAllAsync();

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
