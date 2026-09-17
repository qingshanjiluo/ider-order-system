/**
 * G12 · 剧情钩子端到端（轮105 P7 玩法验证）。
 *
 * ## 为什么需要这一套（静态审计不够）
 *
 * `audit-quest-completability.js` 只能证明"每个目标类型都有个钩子调用点"，
 * 证明不了"钩子真的按名字把进度记到对的目标上"。这个差距里藏着一整类假修：
 * 钩子接上了、参数传了、测试也绿了，但玩家杀别的怪照样把委托刷满。
 *
 * 本套真起一个进程内 Express，真注册角色、真打战斗，然后断言四件事：
 *   ① 战斗结果里带怪名与地图名（钩子按名字匹配的前提）
 *   ② 讨伐【实际遇到的怪】的委托被推进
 *   ③ 讨伐【绝不会遇到的怪】的干扰委托**保持为 0** ← 这条才是重点
 *   ④ 探明【实际地图】的委托被推进（explore 钩子）
 *
 * ## 两条踩过的坑（留作后人之鉴）
 *
 * · 第一版假设 mapId=1 会出「灵兔」，实际出的是「岩石巨人」在「黄土坡」——
 *   于是断言恒为 0 却看不出错。**改成先用探路战问真数据，再据此建委托**。
 * · 进程内直挂路由 `db.monsters` 为空（真服务器的 boot 钩子 materials.ensureAll 才回填），
 *   战斗直接回"战斗单位不存在"。所以下面必须补 boot 平价（决策日志 r87/r88 同款教训）。
 *
 * 隔离：临时 DSH_DATA_DIR，正式档只读比对。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-g12-quest-'));
process.env.DSH_DATA_DIR = TMP;


// 轮108 boot 平价（scripts/lib/boot-parity.js）：空档只跑 materials.ensureAll 是**兜底回填**，
// 它假设 db.items 已有基础数据 —— 实测跑完只有 327 件物品，而正式档 634 件。带着瘦档跑
// 测试会得出不可信的结论（可能假绿）。这里先按台账播种并自检规模。
// 位置要求：必须在任何 require('../src/database') 之前 —— store.js 的 DATA_DIR 在模块加载时固化。
require('./lib/boot-parity').bootParity({ quiet: true });
const LIVE_DB = path.join(__dirname, '..', 'data', 'game.db');
const liveBefore = fs.existsSync(LIVE_DB) ? fs.readFileSync(LIVE_DB) : null;

const express = require('express');
const { loadDatabase, saveDatabase } = require('../src/database');
const materials = require('../src/services/materials');

// boot 平价：真服务器起动时会跑 materials.ensureAll 回填怪/副本/货架（server.js 的 boot 钩子）。
// 进程内直挂路由看不见这一步 —— 不补的话 db.monsters 为空，战斗直接回"战斗单位不存在"。
{
  const db = loadDatabase();
  materials.ensureAll(db);
  saveDatabase(db);
}

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + ': ' + e.message); fail++; }
};

(async () => {
  console.log('== G12 · 剧情钩子端到端（临时数据目录）==');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/character', require('../src/routes/character'));
  app.use('/api/battle', require('../src/routes/battle'));
  app.use('/api/quests', require('../src/routes/quests'));
  const srv = app.listen(0);
  const port = srv.address().port;
  const call = async (method, p, body, token) => {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let j; const txt = await res.text(); try { j = JSON.parse(txt); } catch { j = txt; }
    return { code: res.status, body: j };
  };

  const u = 'e2e' + Date.now().toString(36).slice(-6);
  const reg = await call('POST', '/api/auth/register', { username: u, password: 'pw-dummy-123', nickname: u, faction: 'martial' });
  console.log('注册:', reg.code);
  const TOKEN = reg.body.token;
  const db0 = loadDatabase();
  const CID = db0.characters.find((c) => c.user_id === reg.body.userId).id;

  // 把角色练到能打赢低阶图的怪：灌经验 + 补血，否则每场都"伤势过重"打不动
  require('../src/services/character').addExp(CID, 200000);
  const heal = () => {
    const db = loadDatabase();
    const c = db.characters.find((x) => x.id === CID);
    c.hp = 99999; c.injury = 0; c.heavy_injury = null; c.auto_recover = false;
    saveDatabase(db);
  };
  heal();

  // ── 探路战：先用真实数据问出"这里出什么怪、这是哪张图" ──
  // 不假设 mapId=1 会出灵兔（第一版就栽在这个假设上：实际出的是岩石巨人/黄土坡，
  // 于是断言恒为 0 却看不出错 —— 假绿）。
  const probe = await call('POST', '/api/battle/battle', { mapId: 1 }, TOKEN);
  heal();
  const realMonster = probe.body && probe.body.enemy ? probe.body.enemy.name : null;
  const realMap = probe.body ? probe.body.map : null;

  await t('探路战能拿到怪名与地图名（钩子按名字匹配的前提）', async () => {
    if (!probe.body || probe.body.success === false) throw new Error('探路战失败：' + JSON.stringify(probe.body).slice(0, 160));
    if (!realMonster) throw new Error('战斗结果里没有 enemy.name');
    if (!realMap) throw new Error('战斗结果里没有 map（defender.map_id → db.maps 反查失败）');
  });

  // ── 三条委托：命中的怪 / 绝不会遇到的怪（干扰）/ 实际地图 ──
  const decoy = (db0.monsters || []).map((m) => m.name).find((n) => n !== realMonster) || '不存在的怪';
  const mkQuest = (defId, type, target) => {
    const db = loadDatabase();
    const objs = [{ type, target, current: 0, required: 3 }];
    db.quests = db.quests || [];
    db.quests.push({
      id: (db.quests.length || 0) + 9000, character_id: CID, quest_id: defId, name: defId,
      type: 'side', chapter: '验证', volume: 1, order: 1, giver: '验证人',
      stages: [{ index: 0, text: '验证', objectives: objs }],
      stageIndex: 0, objectives: objs,
      rewards: { exp: 0, spirit_stone: 0, items: [] }, status: 'active', accepted_at: Date.now()
    });
    saveDatabase(db);
  };
  if (realMonster) mkQuest('q_hit', 'kill', realMonster);
  mkQuest('q_miss', 'kill', decoy);
  if (realMap) mkQuest('q_exp', 'explore', realMap);

  const readProgress = () => {
    const db = loadDatabase();
    const g = (qid) => {
      const q = db.quests.find((x) => x.character_id === CID && x.quest_id === qid);
      return q ? q.stages[0].objectives[0].current : null;
    };
    return { hit: g('q_hit'), miss: g('q_miss'), exp: g('q_exp') };
  };

  // ── 连打 12 场，每场前补血（只验钩子，不验战斗平衡）──
  const seen = { monsters: new Set(), maps: new Set(), winners: 0, errors: 0 };
  for (let i = 0; i < 12; i++) {
    heal();
    const r = await call('POST', '/api/battle/battle', { mapId: 1 }, TOKEN);
    if (r.code !== 200) { seen.errors++; continue; }
    if (r.body.enemy) seen.monsters.add(r.body.enemy.name);
    seen.maps.add(String(r.body.map));
    if (r.body.winner === 'attacker') seen.winners++;
  }

  await t('真打 12 场后，讨伐【实际遇到的怪】的委托被推进', async () => {
    if (!realMonster) throw new Error('无探路数据');
    const p = readProgress();
    if (seen.winners === 0) throw new Error('12 场一场没赢（' + seen.errors + ' 场 400），断言前提不成立');
    if (!(p.hit > 0)) throw new Error(`讨伐「${realMonster}」的委托进度还是 0（击杀 ${seen.winners} 场）—— 钩子没按怪名匹配`);
    if (p.hit > 3) throw new Error(`进度 ${p.hit} 越过 required=3 —— 封顶失效`);
  });

  // ★ 本套最重要的一条：精确匹配的反证
  await t('反证：杀别的怪【不会】推进具名委托（讨伐「' + decoy + '」保持 0）', async () => {
    const p = readProgress();
    if (p.miss !== 0) throw new Error(`干扰委托被推进到 ${p.miss} —— 杀「${realMonster}」竟能刷满「${decoy}」的委托，具名匹配失效`);
  });

  await t('探明【实际地图】的委托被推进（explore 钩子经 battle 落地）', async () => {
    if (!realMap) throw new Error('无探路数据');
    const p = readProgress();
    if (!(p.exp > 0)) throw new Error(`探明「${realMap}」的委托进度还是 0 —— explore 钩子没拿到地图名`);
    if (p.exp > 3) throw new Error(`进度 ${p.exp} 越过 required=3`);
  });

  await t('正式存档 data/game.db 未被本套件写动（只写临时目录）', async () => {
    const liveNow = fs.existsSync(LIVE_DB) ? fs.readFileSync(LIVE_DB) : null;
    if (String(liveBefore) !== String(liveNow)) throw new Error('正式存档被改了！');
  });

  srv.close();
  console.log('\nG12 剧情钩子端到端: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
