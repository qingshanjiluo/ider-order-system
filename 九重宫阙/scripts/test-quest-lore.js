/**
 * 剧情层完整性校验 —— 剧情任务引用的实体必须真实存在。
 *
 * 存在理由：剧情文案里写「讨伐 旱魃幼体」「探明 无相幻境」，这些名字必须能在存档里找到
 * 对应的怪/地图。否则玩家接到的是**指向不存在内容的委托**（进度永远刷不满），
 * 而且这种断链在代码层完全合法、测不出来 —— 只能靠逐条对账。
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

const { loadDatabase } = require(path.join(ROOT, 'src', 'database'));
const Q = require(path.join(ROOT, 'src', 'data', 'quest-library'));
const LORE = require(path.join(ROOT, 'src', 'data', 'world-lore'));

const db = loadDatabase();
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + ': ' + e.message); fail++; }
};

console.log('== P7 剧情故事层 ==');

const mapNames = new Set((db.maps || []).map((m) => m.name));
const monsterNames = new Set((db.monsters || []).map((m) => m.name));
const itemNames = new Set((db.items || []).map((i) => i.name));
const dungeonNames = new Set((db.dungeons || []).map((d) => d.name));
const realmNames = new Set((db.realms || []).map((r) => r.name));

t('任务总量达标（四卷共 20 条；主线 9 + 支线 11 的配比）', () => {
  const all = Q.allQuests();
  assert.ok(all.length >= 20, `只有 ${all.length} 条，要求 ≥20`);
  const main = all.filter((q) => q.type === 'main');
  const side = all.filter((q) => q.type === 'side');
  // 主线 ≥8（每条主线覆盖一条进度带，四卷各至少两节），支线 ≥8（填充玩法维度）
  assert.ok(main.length >= 8, `主线只有 ${main.length} 条，要求 ≥8`);
  assert.ok(side.length >= 8, `支线只有 ${side.length} 条，要求 ≥8`);
  // 每卷都要有主线（不许某一卷只有支线）
  for (const v of [1, 2, 3, 4]) {
    const mv = all.filter((q) => q.chapter.volume === v && q.type === 'main').length;
    assert.ok(mv >= 1, `第 ${v} 卷没有主线任务`);
  }
});

t('每卷都有任务，且卷序连续（1..4）', () => {
  const vols = [...new Set(Q.allQuests().map((q) => q.chapter.volume))].sort((a, b) => a - b);
  assert.deepStrictEqual(vols, [1, 2, 3, 4], `实际卷号 ${vols.join(',')}`);
  for (const v of Q.VOLUMES) {
    const n = Q.allQuests().filter((q) => q.chapter.volume === v.volume).length;
    assert.ok(n >= 3, `第 ${v.volume} 卷只有 ${n} 条任务`);
  }
});

t('任务 id 唯一，且卷内 order 不重复', () => {
  const ids = Q.allQuests().map((q) => q.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id 有重复');
  for (const v of [1, 2, 3, 4]) {
    const orders = Q.allQuests().filter((q) => q.chapter.volume === v).map((q) => q.chapter.order);
    assert.strictEqual(new Set(orders).size, orders.length, `第 ${v} 卷 order 有重复：${orders.join(',')}`);
  }
});

t('每条任务都有委托人、委托辞、交差辞、落幕后记（不许空字段）', () => {
  for (const q of Q.allQuests()) {
    assert.ok(q.giver && q.giver.name && q.giver.title, `${q.id} 缺委托人`);
    assert.ok((q.brief || '').length >= 40, `${q.id} 委托辞太短（${(q.brief || '').length} 字）`);
    assert.ok((q.closing || '').length >= 20, `${q.id} 交差辞太短`);
    assert.ok((q.epilogue || '').length >= 15, `${q.id} 落幕后记太短`);
    assert.ok(/[「」]/.test(q.brief), `${q.id} 委托辞没有对白（应是 NPC 原话）`);
  }
});

t('每条任务至少两阶段（单阶段 = 没有过程，只是待办）', () => {
  for (const q of Q.allQuests()) {
    assert.ok(Array.isArray(q.stages) && q.stages.length >= 2, `${q.id} 只有 ${(q.stages || []).length} 阶段`);
    for (const s of q.stages) {
      assert.ok((s.text || '').length >= 10, `${q.id} 某阶段缺过场文本`);
      assert.ok(Array.isArray(s.objectives) && s.objectives.length >= 1, `${q.id} 某阶段没有目标`);
    }
  }
});

t('目标引用的怪 / 地图 / 物品 / 副本 / NPC 全部真实存在', () => {
  const broken = [];
  const NPC_TYPES = new Set(['talk']);
  const nameLikeTypes = new Set(['kill', 'explore', 'collect']);
  for (const q of Q.allQuests()) {
    for (const s of q.stages) {
      for (const o of s.objectives) {
        const tg = String(o.target || '');
        if (!tg) { broken.push(`${q.id} 目标缺 target`); continue; }
        if (NPC_TYPES.has(o.type)) {
          // talk 的 target 必须是本任务的委托人（不许指向没出场的人）
          if (tg !== q.giver.name) broken.push(`${q.id} 的 talk 目标「${tg}」不是本任务委托人「${q.giver.name}」`);
        } else if (nameLikeTypes.has(o.type)) {
          const ok = mapNames.has(tg) || monsterNames.has(tg) || itemNames.has(tg) || dungeonNames.has(tg);
          if (!ok) broken.push(`${q.id} 的 ${o.type} 目标「${tg}」在存档里找不到`);
        }
      }
    }
  }
  assert.deepStrictEqual(broken, [], broken.join(' | '));
});

t('境界范围合法：from/to 都在境界表里，且难度随卷递增', () => {
  const order = Q.realmOrder();
  const idxOf = (n) => order.indexOf(n);
  for (const q of Q.allQuests()) {
    assert.ok(idxOf(q.realmFrom) >= 0, `${q.id} 的 realmFrom「${q.realmFrom}」不存在`);
    assert.ok(idxOf(q.realmTo) >= 0, `${q.id} 的 realmTo「${q.realmTo}」不存在`);
    assert.ok(idxOf(q.realmFrom) <= idxOf(q.realmTo), `${q.id} 的起止境界倒挂`);
  }
  // 卷号越大，起始境界越靠后（不许卷一出现飞升级委托）
  const avgFrom = {};
  for (const v of [1, 2, 3, 4]) {
    const list = Q.allQuests().filter((q) => q.chapter.volume === v);
    avgFrom[v] = list.reduce((a, q) => a + idxOf(q.realmFrom), 0) / list.length;
  }
  for (let v = 2; v <= 4; v++) {
    assert.ok(avgFrom[v] > avgFrom[v - 1], `第 ${v} 卷的平均起始境界（${avgFrom[v].toFixed(2)}）未高于第 ${v - 1} 卷（${avgFrom[v - 1].toFixed(2)}）`);
  }
});

t('奖励随卷递增（不许后期委托给得比前期还少）', () => {
  const byVol = {};
  for (const v of [1, 2, 3, 4]) {
    const list = Q.allQuests().filter((q) => q.chapter.volume === v);
    byVol[v] = list.reduce((a, q) => a + (q.rewards.exp || 0), 0) / list.length;
  }
  for (let v = 2; v <= 4; v++) {
    assert.ok(byVol[v] > byVol[v - 1] * 1.2, `第 ${v} 卷平均修为（${Math.round(byVol[v])}）未显著高于第 ${v - 1} 卷（${Math.round(byVol[v - 1])}）`);
  }
});

t('奖励物品名全部真实存在（不许奖励一个不存在的道具）', () => {
  const broken = [];
  for (const q of Q.allQuests()) {
    for (const it of (q.rewards.items || [])) {
      if (!itemNames.has(it.name)) broken.push(`${q.id} 奖励「${it.name}」不存在`);
    }
  }
  assert.deepStrictEqual(broken, [], broken.join(' | '));
});

t('文案不含现代词（与 world-lore 同一纪律）', () => {
  const BAD = /任务系统|点击|按钮|界面|副本界面|系统提示|NPC|玩家|登录|账号|刷新|数据|面板/g;
  const hits = [];
  for (const q of Q.allQuests()) {
    const blob = [q.name, q.brief, q.closing, q.epilogue, ...q.stages.map((s) => s.text)].join('\n');
    const m = blob.match(BAD);
    if (m) hits.push(`${q.id}: ${[...new Set(m)].join(',')}`);
  }
  assert.deepStrictEqual(hits, [], hits.join(' | '));
});

t('loreHooks 引用的宗门 / 境界在 world-lore 里有对应条目', () => {
  const broken = [];
  for (const q of Q.allQuests()) {
    const h = q.loreHooks || {};
    if (h.sect && !LORE.SECTS_LORE[h.sect]) broken.push(`${q.id} 引用了未收录宗门「${h.sect}」`);
    if (h.realm && !LORE.REALMS_LORE[h.realm]) broken.push(`${q.id} 引用了未收录境界「${h.realm}」`);
  }
  assert.deepStrictEqual(broken, [], broken.join(' | '));
});

t('qiver 的所在处必须是真实地图（委托人站在存在的地方）', () => {
  const broken = [];
  for (const q of Q.allQuests()) {
    if (q.giver.place && !mapNames.has(q.giver.place)) broken.push(`${q.id} 委托人所在地「${q.giver.place}」不存在`);
  }
  assert.deepStrictEqual(broken, [], broken.join(' | '));
});

t('instantiate 产出的实例结构完整（接任务时落库的形态）', () => {
  for (const q of Q.allQuests()) {
    const inst = Q.instantiate(q, 42, 1);
    assert.strictEqual(inst.character_id, 42);
    assert.strictEqual(inst.quest_id, q.id);
    assert.strictEqual(inst.stageIndex, 0);
    assert.ok(Array.isArray(inst.stages) && inst.stages.length === q.stages.length);
    assert.ok(inst.objectives === inst.stages[0].objectives, '当前阶段目标未同步到 objectives');
    assert.strictEqual(inst.status, 'active');
  }
});

t('不变量：objectives 与 stages[stageIndex].objectives 必须同引用（不是两份副本）', () => {
  // 这条锁防的幽灵 bug：两处各存一份 → 改一处不生效 / 判完成读旧值。
  // 门禁里"升级钩子 cur=1 升=14"就是这么来的（测试改 objectives，推进逻辑读 stages）。
  const q = Q.questById('v1_02_sect_gate');
  const inst = Q.instantiate(q, 1, 1);
  assert.ok(inst.objectives === inst.stages[0].objectives, 'instantiate 未同引用');
  // 推进到阶段 1 后，引用必须跟过去
  Q.applyProgress(inst, 'kill', 99, { map: '妖兽森林' });
  assert.strictEqual(inst.stageIndex, 1);
  assert.ok(inst.objectives === inst.stages[1].objectives,
    'advance 后 objectives 没跟着换引用 —— 前端会一直显示上一节的目标');
  // 通过 objectives 改 required，必须影响推进判定
  inst.objectives[0].required = 1;
  assert.ok(inst.stages[1].objectives[0].required === 1, '两处不同步');
});

t('目标匹配：通配 vs 具名（讨伐灵兔不许被别的怪刷满）', () => {
  const Q2 = Q;
  // 具名目标：只有 context 命中才算
  const named = { type: 'kill', target: '灵兔', current: 0, required: 3 };
  assert.ok(Q2.objectiveMatches(named, 'kill', { monster: '灵兔' }), '命中的怪名未算');
  assert.ok(!Q2.objectiveMatches(named, 'kill', { monster: '旱魃幼体' }), '别的怪把灵兔委托刷了');
  assert.ok(!Q2.objectiveMatches(named, 'kill', {}), '无 context 时不该猜');
  assert.ok(!Q2.objectiveMatches(named, 'kill', undefined), '无 context 时不该猜');
  // 类型不同不算
  assert.ok(!Q2.objectiveMatches(named, 'battle', { monster: '灵兔' }), '类型不同却命中');
  // 通配目标：任何该类型都算
  for (const tg of ['', 'monster', 'battle', 'any']) {
    assert.ok(Q2.objectiveMatches({ type: 'kill', target: tg, required: 1 }, 'kill', undefined),
      `通配写法「${tg}」未命中`);
  }
  // 数组 context（一次击杀可能同时算多张图/多件物品）
  assert.ok(Q2.objectiveMatches(named, 'kill', { monster: ['土拨鼠妖', '灵兔'] }), '数组 context 未匹配');
});

t('具名目标：杀错怪不推进，杀对怪才推进', () => {
  const q = Q.questById('v1_01_first_breath');   // 阶段0：讨伐 灵兔 ×3
  const inst = Q.instantiate(q, 1, 1);
  Q.applyProgress(inst, 'kill', 5, { monster: '土拨鼠妖' });
  assert.strictEqual(inst.stages[0].objectives[0].current, 0, '杀错怪却推进了灵兔委托');
  Q.applyProgress(inst, 'kill', 5, { monster: '灵兔' });
  assert.strictEqual(inst.stages[0].objectives[0].current, 3, '杀对怪没推进/未封顶');
});

t('increment 只加到命中的目标上（不许"总件数 × 多物品名"式误加）', () => {
  // 这条锁防的是采集钩子的一个真实坑：
  //   「凑齐 镜心砂 3 件」当玩家一次采到「灵草 + 灵草」时，
  //   若调用方写成 updateQuestProgress(cid,'collect', 2, {item:['灵草','灵草']})，
  //   increment=2 会加到每个命中目标上 —— 灵草不是镜心砂，本不该推进，却按 2 加了。
  //   正确写法是按物品名聚合：每件物品一次调用、increment = 该件数。
  const obj = { type: 'collect', target: '镜心砂', current: 0, required: 3 };
  assert.ok(!Q.objectiveMatches(obj, 'collect', { item: '灵草' }), '采到别的物品却命中镜心砂目标');
  assert.ok(Q.objectiveMatches(obj, 'collect', { item: '镜心砂' }), '采到镜心砂却没命中');
});

t('采集与炼丹的 collect 调用点按物品名聚合（源码锁）', () => {
  const gsrc = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'gathering.js'), 'utf8');
  assert.ok(/byName\.set\(nm, \(byName\.get\(nm\) \|\| 0\) \+ 1\)/.test(gsrc),
    'gathering 的 collect 未按物品名聚合件数');
  // 反证：不许再出现"一次调用传总件数 + 物品数组"的写法
  assert.ok(!/updateQuestProgress\(character\.id, 'collect', gatherCtx\.item\.length/.test(gsrc),
    'gathering 又变回"总件数 + 物品数组"（会把增量加到无关目标上）');
  const asrc = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'alchemy.js'), 'utf8');
  assert.ok(/updateQuestProgress\(character\.id, 'collect', quantity, \{ item: result \? result\.name/.test(asrc),
    'alchemy 的 collect 增量语义不是"该物品的数量"');
});

t('日常差事的 objectives 与 stages[0].objectives 同引用（接任务落库路径）', () => {
  // 路由 accept 里日常走另一条构造路径（不经 instantiate），同样要守这个不变量。
  const src = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'quests.js'), 'utf8');
  assert.ok(/const objs = def\.objectives\.map/.test(src), '日常构造未抽出共享数组');
  assert.ok(/objectives: objs\b/.test(src) && /objectives: objs,/.test(src),
    '日常构造的 stages[0].objectives 与 objectives 未共用变量 objs');
});

t('applyProgress 只推进当前阶段（不许跨阶段提前刷满）', () => {
  const q = Q.questById('v1_02_sect_gate');
  const inst = Q.instantiate(q, 1, 1);
  // 阶段 0 要"清妖兽森林 8 只"；一次性推 100 只也只该完成阶段 0 并前进到阶段 1
  const r1 = Q.applyProgress(inst, 'kill', 100, { map: '妖兽森林' });
  assert.strictEqual(r1.stageIndex, 1, `推进后应停在阶段 1，实际 ${r1.stageIndex}`);
  assert.strictEqual(inst.stages[1].objectives[0].current, 0,
    '阶段 1（副本目标）不该被 kill 进度影响 —— 说明跨阶段刷满了');
  assert.strictEqual(r1.finished, false, '不该判为整条完成');
});

t('applyProgress 按阶段顺序走完才算完成', () => {
  const q = Q.questById('v1_02_sect_gate');
  const inst = Q.instantiate(q, 1, 1);
  Q.applyProgress(inst, 'kill', 8, { map: '妖兽森林' });
  Q.applyProgress(inst, 'dungeon', 1, { dungeon: '妖兽洞穴' });
  const r = Q.applyProgress(inst, 'level', 10);
  assert.strictEqual(r.finished, true, '三阶段都满足后仍未判完成');
});

t('日常差事的 id 以 d_ 开头，且不与主线撞 id', () => {
  const mainIds = new Set(Q.allQuests().map((q) => q.id));
  for (const d of Q.DAILY_CHORES) {
    assert.ok(d.id.startsWith('d_'), `${d.id} 未以 d_ 开头`);
    assert.ok(!mainIds.has(d.id), `${d.id} 与主线撞 id`);
  }
});

t('renderObjective 能渲染所有出现过的目标类型', () => {
  const types = new Set();
  for (const q of Q.allQuests()) for (const s of q.stages) for (const o of s.objectives) types.add(o.type);
  for (const t2 of types) {
    assert.ok(Q.OBJECTIVE_VERBS[t2], `目标类型 ${t2} 没有动词`);
    assert.ok(Q.OBJECTIVE_UNITS[t2], `目标类型 ${t2} 没有单位`);
  }
  const txt = Q.renderObjective({ type: 'kill', target: '灵兔', required: 3 });
  assert.ok(txt.includes('灵兔') && txt.includes('3'), `渲染结果不对：${txt}`);
});

t('questsForRealm 按境界筛得出来，且不返回空集', () => {
  const order = Q.realmOrder();
  for (const rn of order) {
    const list = Q.questsForRealm(rn, order);
    assert.ok(list.length > 0, `${rn} 期一条任务都看不到`);
  }
});

console.log('\nP7 剧情故事层: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
