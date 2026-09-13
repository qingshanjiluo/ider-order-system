#!/usr/bin/env node
/**
 * 第 25 套 · 战斗技能链（轮64）
 *
 * 修的是四处"看起来在工作、实际各说各话"的断链（全部经实读源码 + 副本探针确认）：
 *  ① GET /api/battle/skills 读的是 db.gongfa（实测 0 行），而战斗池读 player_skills.equipped_slot
 *     ⇒ 界面「选择技能」永不渲染，currentBattleSkill 恒 0；
 *  ② routes/skill.js 用 s.equipped 计数（该键不存在，真键 equipped_slot）
 *     ⇒ 章程总闸 min(2+境界序号,8) 恒不触发，而 cdPenalty 恒 1 却在界面当「冷却×N」展示；
 *  ③ equipSkill 不校验技能自身槽位与 passive ⇒ sub 技可进 main、被动技占槽零收益；
 *  ④ 前端对每张卡固定给「主/副」按钮 ⇒ 19 门终极技没有入口。
 * 另两处空转：combat 的 skillDamageMultiplier（战斗功法乘区）无人消费；forge 器灵往 player_skills
 * push 一行既无 equipped_slot、skill_id 又不在 SKILLS_DATA 的孤儿。
 *
 * 隔离：DSH_DATA_DIR 指临时副本 + 高位端口；正式存档逐字节不得动（末尾双检）。
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
let crashed = false;   // 崩溃标记：见 .catch 注释
const t = (name, fn) => {
  const out = (() => { try { return fn(); } catch (e) { return e; } })();
  if (out && typeof out.then === 'function') throw new Error('t() 只接受同步断言：' + name);
  if (out instanceof Error) { console.log('  ❌ ' + name + ': ' + String(out.message).split('\n').slice(0, 10).join('\n      ')); fail++; }
  else { console.log('  ✅ ' + name); pass++; }
};

const req = (port, method, urlPath, body, token) => new Promise((resolve) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const headers = Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': Buffer.byteLength(data) } : {});
  if (token) headers.authorization = 'Bearer ' + token;
  const r = http.request({ hostname: '127.0.0.1', port, path: urlPath, method, headers, timeout: 15000 }, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { buf += c; });
    res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ status: res.statusCode, json: j, text: buf }); });
  });
  r.on('error', (e) => resolve({ status: 0, json: null, text: e.message }));
  r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null, text: 'timeout' }); });
  if (data) r.write(data);
  r.end();
});

let CHILD = null;      // 全局持有：崩溃路径也必须杀掉子进程，否则僵尸服务会占住端口毒害后续运行
let ERRF = null;
const spawnServer = () => {
  ERRF = path.join(TMP, 'server.err');
  const eo = fs.openSync(ERRF, 'a');
  CHILD = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { DSH_DATA_DIR: TMP, PORT: String(PORT), NODE_ENV: 'test' }),
    stdio: ['ignore', 'ignore', eo]     // stderr 落文件：'ignore' 会把"为什么起不来"整个吞掉
  });
  CHILD.on('exit', () => { try { fs.appendFileSync(ERRF, ''); } catch (e) { } });
  return CHILD;
};
// 轮65：/api/character 的灵石字段名在不同视图里叫过 spirit_stone / stones，容错读取，读不到就交回原文炸断言
const readStones = (res) => {
  const j = (res && res.json) || {};
  const c = j.character || j;
  for (const k of ['spirit_stone', 'stones', 'spiritStone']) if (typeof c[k] === 'number') return c[k];
  return -1;
};

const waitHealth = async () => {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const h = await req(PORT, 'GET', '/api/health');
    if (h.status === 200) return true;
  }
  return false;
};
// 起不来就换端口重来（最多 4 次），并把 stderr 尾巴打出来 —— 不再出现无证据的"服务起不来"
async function startServer(tag) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = spawnServer();
    if (await waitHealth()) return c;
    let why = '(stderr 空)';
    try { if (ERRF && fs.existsSync(ERRF)) why = fs.readFileSync(ERRF, 'utf8').trim().split('\n').slice(-8).join(' ⏎ '); } catch (e) { }
    console.log('  · ' + tag + ' 第 ' + (attempt + 1) + ' 次起服务失败（端口 ' + PORT + '）：' + why.slice(0, 400));
    await killServer(c);
    CHILD = null;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}
const killServer = (c) => new Promise((res) => {
  const target = c || CHILD;
  if (!target || target.exitCode !== null) { CHILD = null; return res(); }
  target.on('exit', () => { CHILD = null; res(); });
  try { target.kill('SIGTERM'); } catch (e) { CHILD = null; return res(); }
  setTimeout(() => { CHILD = null; res(); }, 4000);
});
const liveDb = fs.readFileSync(path.join(ROOT, 'data', 'game.db'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-chain-'));
fs.copyFileSync(path.join(ROOT, 'data', 'game.db'), path.join(TMP, 'game.db'));
process.env.DSH_DATA_DIR = TMP;   // 本进程后续走服务层，也必须落在副本上

const PORT = 31700 + (process.pid % 250);
const USER = 'chain' + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 90 + 10);
const PASSWD = 'chain-pw-123';

console.log('== 第 25 套 · 战斗技能链（临时数据目录 ' + path.basename(TMP) + '）==');

(async () => {
  // ---- A · 起服务，注册一个干净账号（注册即送角色，实测于容器演练）----
  let c1 = await startServer('A 段');
  if (!c1) { console.log('  ❌ A 段：服务起不来（上面已打出 stderr 尾巴），后续全部作废'); fail++; return finish(null); }
  const reg = await req(PORT, 'POST', '/api/auth/register', { username: USER, password: PASSWD, nickname: '链' + USER.slice(-4), faction: 'martial' });
  const tok1 = reg.json && (reg.json.token || (reg.json.user && reg.json.user.token));
  const me = tok1 ? await req(PORT, 'GET', '/api/character', undefined, tok1) : { json: null };
  const CHAR = me.json && (me.json.id || (me.json.character && me.json.character.id));
  const REALM = me.json && me.json.realm;
  t('① 前置：新账号能注册并自动获得角色（否则下面全是空断言）', () => {
    assert.strictEqual(reg.status, 200, '注册失败 ' + reg.status + ' ' + reg.text.slice(0, 120));
    assert.ok(tok1, '没拿到 token');
    assert.ok(Number(CHAR) > 0, '拿不到角色 id：' + String(reg.text).slice(0, 120));
  });
  // ★ 轮65（规划 ⑦）：不白送技能 —— 只验"起步资金确实够走到有可出战技能"，走不通就是新手第一步死路
  const SK0 = require(path.join(ROOT, 'src', 'services', 'skill.js')).SKILLS_DATA;
  const STARTER = SK0.filter((d) => d.slot === 'main' && d.type === 'active' && !d.is_hidden && d.required_realm === '炼气期' && !(d.prerequisites || []).length)
    .sort((x, y) => (x.learn_cost || 0) - (y.learn_cost || 0))[0];
  const stones0 = await req(PORT, 'GET', '/api/character', undefined, tok1);
  const st0 = readStones(stones0);
  const lr = await req(PORT, 'POST', '/api/skill/learn', { skillId: STARTER && STARTER.id }, tok1);
  const lst0 = await req(PORT, 'GET', '/api/skill/list', undefined, tok1);
  const row0 = ((lst0.json && lst0.json.skills) || []).find((s) => s.skill_id === (STARTER && STARTER.id));
  const eq0 = await req(PORT, 'POST', '/api/skill/equip', { playerSkillId: row0 && row0.id, slot: 'main' }, tok1);
  const poolA = await req(PORT, 'GET', '/api/battle/skills', undefined, tok1);
  const un0 = await req(PORT, 'POST', '/api/skill/unequip', { playerSkillId: row0 && row0.id }, tok1);
  const poolB = await req(PORT, 'GET', '/api/battle/skills', undefined, tok1);
  t('★ 新号起步闭环：' + (STARTER ? STARTER.id : '无样本') + '（最便宜的炼气主技）在起步资金内可 学→装→进池→卸下回空', () => {
    assert.ok(STARTER, '抽不到 炼气期/无前置/非隐藏 的主技，样本失效');
    assert.ok(st0 >= STARTER.learn_cost, `起步灵石 ${st0} 学不起 ${STARTER.id}（${STARTER.learn_cost}）⇒ 新手第一步是死路：` + stones0.text.slice(0, 140));
    assert.strictEqual(lr.status, 200, 'HTTP 学技能失败 ' + lr.status + ' ' + lr.text.slice(0, 140));
    assert.ok(row0, '列表里找不到刚学的行：' + lst0.text.slice(0, 140));
    assert.strictEqual(eq0.status, 200, 'HTTP 装备失败 ' + eq0.status + ' ' + eq0.text.slice(0, 140));
    assert.strictEqual(poolA.json.length, 1, '选招池没出现它：' + JSON.stringify(poolA.json).slice(0, 140));
    assert.strictEqual(un0.status, 200, '卸下失败 ' + un0.status + ' ' + un0.text.slice(0, 120));
    assert.strictEqual(poolB.json.length, 0, '卸下后池未清空（槽位泄漏）：' + JSON.stringify(poolB.json).slice(0, 120));
  });
  await killServer(c1);

  // ---- B · 服务层准备数据：补足灵石并学 4 门技能（主/副/终极/被动各一）----
  const svc = require(path.join(ROOT, 'src', 'services', 'skill.js'));
  const dbApi = require(path.join(ROOT, 'src', 'database.js'));
  const DATA = svc.SKILLS_DATA || [];
  const pick = (slot, kind) => DATA.find((d) => (!kind || d.type === kind) && d.slot === slot);
  const DEF_MAIN = pick('main', 'active');
  const DEF_SUB = pick('sub', 'active');
  // 轮64：非隐藏的终极技一律要元婴期（beiming_void），炼气号被"境界 + 机缘"双闸挡着学不到 ——
  // 这是产品规则，不能为了让套件变绿去放宽。终极槽要验的是**装备链路**，所以下面直接铺一行已学记录当夹具。
  const DEF_ULT = DATA.find((d) => d.slot === 'ultimate' && !d.is_hidden) || DATA.find((d) => d.slot === 'ultimate');
  const DEF_PASS = DATA.find((d) => d.type === 'passive' && d.required_realm === '炼气期') || DATA.find((d) => d.type === 'passive');
  const defOk = (() => { try { return !!(DEF_MAIN && DEF_SUB && DEF_ULT && DEF_PASS); } catch (e) { return false; } })();
  t('② 定义层前提：主/副/终极/被动各至少一门（缺任何一类，本套件的断言就失去意义）', () => {
    assert.ok(defOk, 'SKILLS_DATA 里缺类别：main=' + !!DEF_MAIN + ' sub=' + !!DEF_SUB + ' ultimate=' + !!DEF_ULT + ' passive=' + !!DEF_PASS + '（共 ' + DATA.length + ' 条）');
  });
  const learnErrs = [];   // 作用域：断言在 if 块外，声明也必须在块外
  const learnIds = {};
let SHOP_ITEM = 0;
let SHOP_PRICE = 0;
let DISC_VALUE = 0;

  if (defOk) {
    const db = dbApi.loadDatabase();
    const ch = db.characters.find((c) => Number(c.id) === Number(CHAR));
    ch.spirit_stone = 500000;      // 学艺要花钱：本套件验的是链路，不是经济（经济另有第 22 套守恒锁）
      for (const d of [DEF_MAIN, DEF_SUB, DEF_PASS]) {
        const r = svc.learnSkill(Number(CHAR), d.id);   // 导出即单例，不是类
        if (!r || !r.success) learnErrs.push((d.slot || d.type) + ':' + d.id + '=' + ((r && r.error) || '无返回'));
        else {
          const row = dbApi.loadDatabase().player_skills.find((ps) => Number(ps.character_id) === Number(CHAR) && ps.skill_id === d.id);
          learnIds[d.id] = row && row.id;
        }
      }
      // 终极技夹具：绕开领悟门槛（境界+机缘是产品规则），但行形状必须与真实行一致 ——
      // 带 equipped_slot 键，否则就正是轮64 刚清掉的那种器灵孤儿行。
      const db2 = dbApi.loadDatabase();
      const ultRow = {
        id: dbApi.getNextId('player_skills'), character_id: Number(CHAR), skill_id: DEF_ULT.id,
        level: 1, exp: 0, equipped_slot: null, learned_at: new Date().toISOString()
      };
      db2.player_skills.push(ultRow);
      dbApi.saveDatabase(db2);
      learnIds[DEF_ULT.id] = ultRow.id;
    // 说明：learnSkill 内部已 saveDatabase，这里只需关连接让 WAL 落盘（门面没有 flushAll 这个导出）
      // 轮65：再学一门 discount 被动（财源广进），用于下面的确定性 HTTP 行为锁；并挑一件明码标价的货架
      const discDef = DATA.find((d) => d.type === 'passive' && d.effect_type === 'discount');
      if (discDef) { const r3 = svc.learnSkill(Number(CHAR), discDef.id); if (!r3 || !r3.success) learnErrs.push('discount:' + discDef.id + '=' + ((r3 && r3.error) || '无返回')); else DISC_VALUE = Number(discDef.effect_value) || 0; }
      const dbS = dbApi.loadDatabase();
      const shopRow = (dbS.shop || []).find((s) => Number(s.price) >= 40 && (s.stock === -1 || Number(s.stock) > 2));
      if (shopRow) { SHOP_ITEM = shopRow.id; SHOP_PRICE = Number(shopRow.price); }

    dbApi.closeDatabase();
  }
  t('③ 三门可学技能进 player_skills、终极技以夹具补齐，且每行都带 equipped_slot 键', () => {
    const n = [DEF_MAIN, DEF_SUB, DEF_PASS].map((d) => learnIds[d.id]).filter(Boolean).length;
    assert.strictEqual(n, 3, '只学到 ' + n + '/3 门：' + learnErrs.join(' | ') + '（新号是炼气，境界类前置会挡高阶技 ⇒ 取样按实际境界，别放宽校验）');
    assert.ok(learnIds[DEF_ULT.id], '终极技夹具行没建出来');
    const rows = dbApi.loadDatabase().player_skills.filter((ps) => Number(ps.character_id) === Number(CHAR));
    for (const r of rows) {
      assert.ok('equipped_slot' in r, '行缺 equipped_slot 键：' + JSON.stringify(r).slice(0, 120));
      assert.ok(DATA.some((d) => d.id === r.skill_id), '行的 skill_id 不在 SKILLS_DATA：' + r.skill_id);
    }
  });  // ---- C · 再起服务，全部走真 HTTP（玩家视角）----
  c1 = await startServer('C 段');
  if (!c1) { console.log('  ❌ C 段：服务起不来（上面已打出 stderr 尾巴）'); fail++; return finish(null); }
  const lg = await req(PORT, 'POST', '/api/auth/login', { username: USER, password: PASSWD });
  const TOK = lg.json && lg.json.token;
  const emptyPool = await req(PORT, 'GET', '/api/battle/skills', undefined, TOK);
  t('④ 未装备任何技能时，选招端点给出空池（旧实现在这里返回功法，实测 0 行且与战斗无关）', () => {
    assert.strictEqual(lg.status, 200, '登录失败 ' + lg.status + ' ' + lg.text.slice(0, 120));
    assert.ok(TOK, '登录没拿到 token');
    assert.strictEqual(emptyPool.status, 200, '选招端点 ' + emptyPool.status + ' ' + emptyPool.text.slice(0, 120));
    assert.ok(Array.isArray(emptyPool.json), '响应不是数组：' + emptyPool.text.slice(0, 120));
    assert.strictEqual(emptyPool.json.length, 0, '未装备却有可出战技能：' + JSON.stringify(emptyPool.json).slice(0, 160));
  });
  const eMain = await req(PORT, 'POST', '/api/skill/equip', { playerSkillId: learnIds[DEF_MAIN.id], slot: 'main' }, TOK);
  const pool1 = await req(PORT, 'GET', '/api/battle/skills', undefined, TOK);
  t('⑤ 选招端点与战斗池同源：装一门主技后，端点恰好列出它（名字逐字一致）', () => {
    assert.strictEqual(eMain.status, 200, '装备主技失败 ' + eMain.status + ' ' + eMain.text.slice(0, 140));
    assert.strictEqual(pool1.json.length, 1, '池长度不是 1：' + JSON.stringify(pool1.json).slice(0, 160));
    assert.strictEqual(pool1.json[0].name, DEF_MAIN.name, '端点给出的技能名与定义不符：' + pool1.json[0].name);
    assert.strictEqual(pool1.json[0].slot, 'main', '槽位不对：' + pool1.json[0].slot);
  });
  const eSubWrong = await req(PORT, 'POST', '/api/skill/equip', { playerSkillId: learnIds[DEF_SUB.id], slot: 'main' }, TOK);
  t('⑥ 副技能不得装进主槽（旧实现不校验技能自身槽位，sub 技可进 main）', () => {
    assert.strictEqual(eSubWrong.status, 400, '居然放行了：' + eSubWrong.status + ' ' + eSubWrong.text.slice(0, 140));
    assert.ok(/不能装进/.test(eSubWrong.text), '文案未说明槽位不匹配：' + eSubWrong.text.slice(0, 140));
  });
  const ePass = await req(PORT, 'POST', '/api/skill/equip', { playerSkillId: learnIds[DEF_PASS.id], slot: 'main' }, TOK);
  t('⑦ 被动技不得装备（旧实现让它占槽，战斗侧再静默丢弃 = 玩家零收益）', () => {
    assert.strictEqual(ePass.status, 400, '被动技被放行进槽：' + ePass.status + ' ' + ePass.text.slice(0, 140));
    assert.ok(/被动/.test(ePass.text), '文案没提被动：' + ePass.text.slice(0, 140));
  });
  const eUlt = await req(PORT, 'POST', '/api/skill/equip', { playerSkillId: learnIds[DEF_ULT.id], slot: 'ultimate' }, TOK);
  const pool2 = await req(PORT, 'GET', '/api/battle/skills', undefined, TOK);
  t('⑧ 终极技有入口且按 main < ultimate 定序（前端 skillIndex=0 恒等于主技）', () => {
    assert.strictEqual(eUlt.status, 200, '终极技装不上：' + eUlt.status + ' ' + eUlt.text.slice(0, 140));
    assert.deepStrictEqual(pool2.json.map((s) => s.slot), ['main', 'ultimate'], '池顺序不对：' + JSON.stringify(pool2.json.map((s) => s.slot)));
  });
  const eSubRight = await req(PORT, 'POST', '/api/skill/equip', { playerSkillId: learnIds[DEF_SUB.id], slot: 'sub' }, TOK);
  t('⑨ 境界总闸真生效：' + REALM + ' 的上限是 min(2+境界序号,8)，装到上限后第 3 门必须被拒', () => {
    // ② 修好后这条闸门第一次真的会拦人（此前 equippedCount 恒 0 ⇒ 实测炼气号连装 6 门全 200）
    assert.strictEqual(eSubRight.status, 400, '总闸仍不生效：第 3 门返回 ' + eSubRight.status + ' ' + eSubRight.text.slice(0, 140));
    assert.ok(/技能槽已满/.test(eSubRight.text), '文案不是满槽：' + eSubRight.text.slice(0, 140));
  });
  const list = await req(PORT, 'GET', '/api/skill/list', undefined, TOK);
  t('⑩ 响应里不再有 cdPenalty（它由恒 0 的错误计数算出、战斗侧无消费点，却在界面当冷却倍数展示）', () => {
    assert.strictEqual(list.status, 200, '技能列表 ' + list.status);
    assert.ok(!('cdPenalty' in (list.json || {})), 'cdPenalty 又出现：' + JSON.stringify(list.json && Object.keys(list.json)));
    assert.ok(typeof list.json.maxSlots === 'number' && list.json.maxSlots >= 1, 'maxSlots 缺失：' + JSON.stringify(list.json && Object.keys(list.json)));
    assert.ok((list.json.skills || []).every((s) => 'skill_slot' in s), '列表行缺 skill_slot，前端无法按自身槽位给出入口');
  });

  const stonesPre = await req(PORT, 'GET', '/api/character', undefined, TOK);
  const buyRes = await req(PORT, 'POST', '/api/shop/buy', { itemId: SHOP_ITEM, quantity: 1 }, TOK);
  const stonesPost = await req(PORT, 'GET', '/api/character', undefined, TOK);
  t('⑮ 被动技常驻生效（确定性 HTTP 行为锁）：学了财源广进后坊市实付按 discount 打折', () => {
    assert.ok(SHOP_PRICE > 0, '没挑到货架项，样本失效');
    assert.ok(DISC_VALUE > 0, 'discount 被动没学上（见 ③ 的原因采集）');
    assert.strictEqual(buyRes.status, 200, '购买失败 ' + buyRes.status + ' ' + buyRes.text.slice(0, 160));
    const spent = readStones(stonesPre) - readStones(stonesPost);
    const want = Math.max(1, Math.round(SHOP_PRICE * (1 - Math.min(0.5, DISC_VALUE))));
    assert.strictEqual(spent, want, `实付 ${spent} ≠ 打折后应付 ${want}（原价 ${SHOP_PRICE}）⇒ 被动没生效或口径变了`);
    assert.ok(spent < SHOP_PRICE, '打折没体现：' + spent + ' vs 原价 ' + SHOP_PRICE);
  });

  // ---- 轮67 · 隐藏技的服务端机缘记录（㉑㉒㉓）----
  const OPP67 = require(path.join(ROOT, 'src', 'services', 'opportunity.js'));
  const dbH = dbApi.loadDatabase();
  const charH = dbH.characters.find((c) => String(c.id) === String(CHAR));
  charH.realm = '元婴';   // 口径：角色身上的 realm 用 REALM_ORDER（不带期），技能定义的 required_realm 带期且只在要求侧去期（services/skill.js:151）
  charH.opportunities = [];   // 显式清空 ⇒ 此刻境界/前置/灵石全都够、只差机缘，㉑ 的第一条断言才是真敏感（轮67 负向对照校正）
  dbH.player_skills.push({ id: 950001, character_id: Number(CHAR), skill_id: 'void_blast', level: 1, exp: 0, equipped_slot: null });
  dbApi.saveDatabase(dbH);
  const learnHidNoRecord = svc.learnSkill(Number(CHAR), 'forbidden_seal');
  const rec67 = OPP67.record(charH, OPP67.KEYS.NEAR_DEATH_VICTORY, { hp_left: 1, hp_max: 400 });
  dbApi.saveDatabase(dbH);
  const learnHidWithRecord = svc.learnSkill(Number(CHAR), 'forbidden_seal');
  const selfReport = await req(PORT, 'POST', '/api/skill/unlock-hidden', { skillId: 'primordial_chaos', condition: '我已通关全部隐藏副本' }, TOK);
  const afterSelf = await req(PORT, 'GET', '/api/skill/list', undefined, TOK);
  t('㉑ 没有服务端机缘记录时隐藏技仍然学不到（轮47 的防白嫖闸门不许被本轮实装顶掉）', () => {
    assert.notStrictEqual(learnHidNoRecord.success, true, '无机缘也能学隐藏技 ⇒ 仙阶大招白嫖复现：' + JSON.stringify(learnHidNoRecord).slice(0, 140));
    assert.ok(/机缘/.test(String(learnHidNoRecord.error || '')), '拒绝语没提机缘，玩家不知道差什么：' + JSON.stringify(learnHidNoRecord).slice(0, 140));
  });
  t('㉒ 记上 near_death_victory 后 forbidden_seal 可学且真的落库（仍要过元婴与前置）', () => {
    assert.strictEqual(rec67.recorded, true, 'record 没写进去：' + JSON.stringify(rec67));
    assert.strictEqual(learnHidWithRecord.success, true, '有记录仍学不到：' + JSON.stringify(learnHidWithRecord).slice(0, 180));
    const hasRow = dbApi.loadDatabase().player_skills.some((r) => String(r.character_id) === String(CHAR) && r.skill_id === 'forbidden_seal');
    assert.ok(hasRow, 'learnSkill 报成功却没在 player_skills 落行');
  });
  t('㉓ 客户端自报条件依然无效：/unlock-hidden 只查不写，也不把未达成说成已达成', () => {
    assert.strictEqual(selfReport.status, 409, '无机缘时该回 409 却回了 ' + selfReport.status + '：' + selfReport.text.slice(0, 140));
    const j = selfReport.json || {};
    assert.strictEqual(j.success, undefined, '响应带 success ⇒ 没办成事却告诉前端成功了：' + JSON.stringify(j).slice(0, 140));
    assert.ok(j.required_opportunity === null, 'primordial_chaos 的条件今天无服务端判据，required_opportunity 应为 null：' + JSON.stringify(j).slice(0, 160));
    const learned = JSON.stringify((afterSelf.json && afterSelf.json.skills) || []);
    assert.ok(learned.indexOf('primordial_chaos') < 0, '自报条件把隐藏技写进了技能列表：' + learned.slice(0, 160));
  });
  // ---- D · 静态与乘区（无需服务）----
  t('⑪ 战斗功法乘区真被消费（skillDamageMultiplier 不再是空转字段）', () => {
    const dmg = require(path.join(ROOT, 'src', 'services', 'battle', 'damage.js'));
    const atk = { attack: 100, defense: 50, crit_rate: 0, element: 'metal' };
    const def = { defense: 0, crit_rate: 0, element: 'metal' };
    const plain = dmg.calculateFinalDamage(atk, def, null).damage;
    const withMul = dmg.calculateFinalDamage(Object.assign({}, atk, { skillDamageMultiplier: 1.5 }), def, null).damage;
    assert.ok(plain > 0, '基线伤害为 0，样本无效');
    assert.ok(withMul > plain, '乘区没生效：' + plain + ' → ' + withMul);
    const src = fs.readFileSync(path.join(ROOT, 'src', 'services', 'battle', 'damage.js'), 'utf8');
    assert.ok(/skillDamageMultiplier/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'damage.js 里没有消费点（大概只是注释提了一句）');
  });
  t('⑫ 静态锁：选招端点不再以功法为技能源；forge 不再往 player_skills push 孤儿行', () => {
    const b = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'battle.js'), 'utf8');
    assert.ok(/getCharacterSkills\(/.test(b), 'battle.js 没读战斗池：选招与战斗又要各说各话');
    // 先剥注释再判：我自己在替换代码里写的注释提到旧实现读 db.gongfa，不剥就会把自己的锁打红（轮61 backup.js 同坑）
    const body = b.slice(b.indexOf("router.get('/skills'"), b.indexOf("router.post('/skills/upgrade'")).replace(/\/\/[^\n]*/g, '');
    assert.ok(!/db\.gongfa/.test(body), 'GET /skills 仍从 db.gongfa 造技能列表（剥注释后仍在 ⇒ 是真代码）');
    const fg = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'forge.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/player_skills\.push\(/.test(fg), 'forge 又往 player_skills 写非定义技能（历史孤儿行来源）');
    assert.ok(!/logInfo/.test(fg), 'forge 里出现了未声明的 logInfo（?. 救不了 ReferenceError，--check 也抓不到）');
  });
  t('⑬ 前端卡片不再硬编码「主/副」两个按钮，而是按技能自身槽位给入口', () => {
    const s = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
    assert.ok(!/handleEquipSkillUI\('\$\{s\.id\}', 'main'\)/.test(s), '卡片仍对每个技能固定给主槽按钮');
    assert.ok(/s\.skill_slot/.test(s), '卡片没消费服务端透出的 skill_slot');
    assert.ok(!/data\.cdPenalty/.test(s), '界面还在读已删除的 cdPenalty');
  });
  t('⑯ getPassiveBonus 只认"学没学"、不认装备，且按等级放大、跨门累加', () => {
    const svcS = require(path.join(ROOT, 'src', 'services', 'skill.js'));
    const dbX = dbApi.loadDatabase();
    const cid = 900001;
    // 夹具只存在于内存对象上（不调 saveDatabase ⇒ 不落盘），跑完即摘
    dbX.player_skills.push(
      { id: 900001, character_id: cid, skill_id: 'forge_master', level: 1, exp: 0, equipped_slot: null },
      { id: 900002, character_id: cid, skill_id: 'dan_heart', level: 1, exp: 0, equipped_slot: null },
      { id: 900003, character_id: cid, skill_id: 'wealth_luck', level: 3, exp: 0, equipped_slot: 'sub' }
    );
    const craft1 = svcS.getPassiveBonus(cid, 'craft_amp');
    const alch1 = svcS.getPassiveBonus(cid, 'alchemy_amp');
    assert.ok(craft1 > 0 && alch1 > 0, '未装备的两门被动算出 0（常驻生效没做到）：craft=' + craft1 + ' alch=' + alch1);
    assert.strictEqual(svcS.getPassiveBonus(cid, 'gather_amp'), 0, '没学过 gather_amp 却给收益');
    const defW = svcS.SKILLS_DATA.find((d) => d.id === 'wealth_luck');
    const disc = svcS.getPassiveBonus(cid, 'discount');
    assert.ok(Math.abs(disc - defW.effect_value * (1 + 2 * 0.03)) < 1e-9, '等级放大口径不是 1+(level-1)*0.03：' + disc);
    assert.strictEqual(svcS.getPassiveBonus(cid, 'not_a_type'), 0, '未知 effect_type 必须给 0');
    assert.strictEqual(svcS.getPassiveBonus(0, 'craft_amp'), 0, '无角色 id 必须给 0');
    for (const id of [900001, 900002, 900003]) { const k = dbX.player_skills.findIndex((r) => r.id === id); if (k >= 0) dbX.player_skills.splice(k, 1); }
  });
  t('⑰ 四处消费点都真接上了（剥注释后仍在 ⇒ 不是注释里的空话）', () => {
    const sites = [['src/routes/gathering.js', 'gather_amp'], ['src/routes/forge.js', 'craft_amp'], ['src/routes/alchemy.js', 'alchemy_amp'], ['src/routes/shop.js', 'discount']];
    for (const pair of sites) {
      const src = fs.readFileSync(path.join(ROOT, pair[0]), 'utf8').replace(/\/\/[^\n]*/g, '');
      // 不用正则：多层 here-string 叠转义极易写出坏模式（本轮就写出了 Unterminated group）
      const q = String.fromCharCode(39);
      const declNeedle = 'const skillSvc = require(' + q + '../services/skill';
      assert.ok(src.indexOf(declNeedle) >= 0, pair[0] + ' 调用了 skillSvc.getPassiveBonus 却没有声明 skillSvc（上一版就是这样 500 的）');
      const callAt = src.indexOf('skillSvc.getPassiveBonus(');
      assert.ok(callAt >= 0 && src.slice(callAt, callAt + 90).indexOf(pair[1]) >= 0, pair[0] + ' 的 ' + pair[1] + ' 调用形状不对');
    }
    const shopSrc = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'shop.js'), 'utf8');
    const sellSide = shopSrc.slice(shopSrc.indexOf('router.post(' + String.fromCharCode(39) + '/sell'));
    assert.ok(sellSide.length === 0 || sellSide.indexOf('buyDiscount') < 0, '折扣串到了出售价（双向套利风险）');
  });

  t('⑳ player_skills 是战斗技能唯一真源（死模块已删，不得再长出第二个同名实现）', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'services', 'battle', 'skill.js')),
      'src/services/battle/skill.js 又回来了 —— 它拿 db.gongfa 当技能源，与路由侧的 player_skills 池构成双真源（轮64 就是被这条歧路带偏的）');
    const defs = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.js')) continue;
        const src = fs.readFileSync(p, 'utf8').replace(/^\s*\/\/.*$/gm, '');
        if (/getCharacterSkills\s*\([^)]*\)\s*\{/.test(src)) defs.push({ rel: path.relative(ROOT, p), src });
      }
    };
    walk(path.join(ROOT, 'src'));
    assert.strictEqual(defs.length, 1, 'getCharacterSkills 的定义出现在 ' + defs.length + ' 个文件（应为 1）：' + defs.map((x) => x.rel).join(', '));
    const at = defs[0].src.search(/getCharacterSkills\s*\([^)]*\)\s*\{/);
    const body = defs[0].src.slice(at, at + 1200);
    assert.ok(/player_skills/.test(body), defs[0].rel + ' 的取技实现不读 player_skills');
    assert.ok(!/db\.gongfa/.test(body), defs[0].rel + ' 的取技实现又去读 db.gongfa 了');
    console.log('  · 取技实现唯一：' + defs[0].rel);
  });

  t('㉔ 生产者真在活路径上调用 record（断因不断果）', () => {
    const pairs = [['src/routes/battle.js', 'opportunityFromBattle'], ['src/routes/tribulation.js', 'TRIBULATION_SURVIVED']];
    for (const pair of pairs) {
      const src = fs.readFileSync(path.join(ROOT, pair[0]), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      assert.ok(src.indexOf('require(' + String.fromCharCode(39) + '../services/opportunity') >= 0, pair[0] + ' 没声明 opportunity 模块');
      assert.ok(src.indexOf('opportunity.record(') >= 0, pair[0] + ' 没调用 record ⇒ 机缘只能靠夹具，玩家永远拿不到');
      assert.ok(src.indexOf(pair[1]) >= 0, pair[0] + ' 缺少 ' + pair[1] + ' 这条判定入口');
    }
  });
  t('㉕ 机缘键只认 KEYS 白名单，且濒死判定不吃脏数据', () => {
    const fake = { opportunities: [] };
    assert.strictEqual(OPP67.record(fake, 'i_want_it_all', null).recorded, false, '任意字符串都能写入 ⇒ 记录机制可被滥用');
    assert.strictEqual(OPP67.record(fake, OPP67.KEYS.NEAR_DEATH_VICTORY, null).recorded, true, '合法键写不进去');
    assert.strictEqual(OPP67.record(fake, OPP67.KEYS.NEAR_DEATH_VICTORY, null).repeated, true, '同键重复写应累加而不是造第二条');
    assert.ok(OPP67.has(fake, OPP67.KEYS.NEAR_DEATH_VICTORY), 'has 认不出刚写的记录');
    assert.strictEqual(OPP67.has({}, OPP67.KEYS.NEAR_DEATH_VICTORY), false, '空角色应为 false');
    assert.strictEqual(OPP67.opportunityFromBattle({ winner: 'attacker', attackerMaxHp: 0, attackerFinalHp: 0 }), null, 'maxHp 为 0 不该判成濒死');
    assert.strictEqual(OPP67.opportunityFromBattle({ winner: 'defender', attackerMaxHp: 100, attackerFinalHp: 1 }), null, '败战不该记机缘');
    assert.strictEqual(OPP67.opportunityFromBattle({ winner: 'attacker', attackerMaxHp: 100, attackerFinalHp: 1 }), OPP67.KEYS.NEAR_DEATH_VICTORY, '1% 血量取胜应记为濒死');
    assert.strictEqual(OPP67.opportunityFromBattle({ winner: 'attacker', attackerMaxHp: 100, attackerFinalHp: 10 }), null, '10% 不该算 1% 以下');
  });
  t('⑭ 临时副本里每一行 player_skills 都是可解析的技能（skill_id ∈ SKILLS_DATA）', () => {
    const rows = dbApi.loadDatabase().player_skills || [];
    const bad = rows.filter((r) => !DATA.some((d) => d.id === r.skill_id));
    assert.deepStrictEqual(bad.map((r) => r.skill_id), [], '存在孤儿 skill_id：' + bad.map((r) => r.skill_id).join(','));
    assert.ok(rows.length >= 4, '副本行数异常：' + rows.length);
  });
  await killServer(c1);
  finish(null);
})().catch((e) => {
  console.log('  💥 套件异常：' + (e && e.stack ? e.stack : e));
  fail++;   // 必须计失败：finish() 用 process.exit(fail ? 1 : 0)，只设 exitCode 会被覆盖
  crashed = true;
  process.exitCode = 1;
  finish(null);
});

function finish(child) {
  for (const c of [child, CHILD]) { if (c) { try { c.kill(); } catch (e) { } } }   // 崩溃路径也杀：不留僵尸端口
  try { dbApiClose(); } catch (e) { }
  const after = fs.readFileSync(path.join(ROOT, 'data', 'game.db'));
  t('⑲ 正式存档 data/game.db 逐字节未被本套件动过', () => {
    assert.strictEqual(crypto.createHash('md5').update(after).digest('hex'), crypto.createHash('md5').update(liveDb).digest('hex'),
      '正式存档被改写：' + liveDb.length + 'B → ' + after.length + 'B');
  });
  console.log('');
  console.log(`战斗技能链: ${pass} 通过, ${fail} 失败`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  const rc = (fail || crashed) ? 1 : 0;
  setTimeout(() => process.exit(rc), 300).unref();
  process.exit(rc);
}
function dbApiClose() { try { require(path.join(ROOT, 'src', 'database.js')).closeDatabase(); } catch (e) { } }
