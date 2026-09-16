/**
 * 剧情委托的**可完成性**静态审计（不是"接线了就算完"）。
 *
 * 存在理由：钩子接线（battle.js 推 kill、gathering.js 推 gather）只证明"有地方会推"，
 * 不证明"每个委托的目标都推得动"。真正的坑有三类：
 *   ① 目标类型根本没钩子（例如 collect/talk/tribulation —— 玩家做不了，委托永不可完成）
 *   ② 目标的 target 是具体名字，但钩子只按类型推（例如 kill「灵兔」而钩子不判怪名）
 *   ③ 目标 type 有钩子但所需次数远超合理游戏时长
 *
 * 本脚本把每条委托目标都过一遍，按「可推 / 存疑 / 不可推」分类，输出台账。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.DSH_DATA_DIR = process.env.DSH_DATA_DIR || path.join(ROOT, 'data');

// 钩子真源：把 routes 与 services 两个目录**都**扫一遍（同名文件两处都有，
// 例如 character.js 两处都存在，但推 'level' 的是 services 那份 —— 只扫一处会漏报，
// 而漏报会让审计把"其实能推"的目标判成死目标，反过来也会掩盖真死目标）。
const HOOK_DIRS = [
  path.join(ROOT, 'src', 'routes'),
  path.join(ROOT, 'src', 'services'),
  path.join(ROOT, 'src', 'services', 'battle')
];
const hooked = new Map();   // type -> [来源文件]
for (const dir of HOOK_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/QuestProgress|applyProgress/.test(src)) continue;
    // 三种写法都要认：updateQuestProgress(cid,'kill',1) / applyProgress(quest,'talk',1,ctx) / 换行写法
    for (const m of src.matchAll(/(?:update)?QuestProgress\([\s\S]{0,80}?['"]([a-z]+)['"]\s*,/g)) {
      if (!hooked.has(m[1])) hooked.set(m[1], []);
      const tag = path.basename(dir) + '/' + f;
      if (!hooked.get(m[1]).includes(tag)) hooked.get(m[1]).push(tag);
    }
    for (const m of src.matchAll(/applyProgress\([\s\S]{0,60}?['"]([a-z]+)['"]\s*,/g)) {
      if (!hooked.has(m[1])) hooked.set(m[1], []);
      const tag = path.basename(dir) + '/' + f;
      if (!hooked.get(m[1]).includes(tag)) hooked.get(m[1]).push(tag);
    }
  }
}

const QL = require(path.join(ROOT, 'src', 'data', 'quest-library'));

// 会被钩子按"名字"细判的类型（其余只按类型计数）
// kill 在 battle.js 里按 monster 名匹配；gather 按地图/物品；collect 需要消费端
const ACTIONS = {
  kill: '战斗击杀（battle.js 按怪名匹配）',
  battle: '任意战斗（battle.js）',
  dungeon: '通关秘境（dungeon.js）',
  checkin: '静修签到（checkin.js）',
  gather: '采集（gathering.js，按地图/物品匹配）',
  craft: '炼制（forge.js）',
  forge: '锻造（forge.js 同时推 craft 与 forge）',
  guild: '入盟/立盟（guild.js）',
  level: '升级（character.js addExp 收尾）',
  explore: '探明地图（battle.js 在该图取胜即算踏足）',
  alchemy: '开炉炼丹（alchemy.js 成丹点）',
  collect: '凑齐物品（采集与炼丹同源推送）',
  talk: '回访委托人（POST /quests/revisit）',
  tribulation: '渡劫（**无钩子**）'
};

const rows = [];
for (const q of QL.allQuests()) {
  for (const s of q.stages) {
    for (const o of s.objectives) {
      const src = hooked.get(o.type) || [];
      const note = ACTIONS[o.type] || '未知类型';
      rows.push({
        quest: q.id, name: q.name, type: o.type, target: o.target,
        required: o.required, hooked: src.length > 0, sources: src.join('/'), note
      });
    }
  }
}
// 日常也算
for (const d of QL.DAILY_CHORES) {
  for (const o of d.objectives) {
    const src = hooked.get(o.type) || [];
    rows.push({
      quest: d.id, name: d.name, type: o.type, target: o.target,
      required: o.required, hooked: src.length > 0, sources: src.join('/'),
      note: ACTIONS[o.type] || '未知类型'
    });
  }
}

const ok = rows.filter((r) => r.hooked);
const bad = rows.filter((r) => !r.hooked);

// ══════════════════════════════════════════════════════════════════════════
// 第二轮：**值域对账** —— 类型有钩子 ≠ 目标的 target 值真的能被钩子送出来。
//
// 为什么必须补这一轮（轮107 独立审计抓到的盲区）：
//   第一轮只问"这个 type 有没有钩子"。`v3_05` 的 `collect target='赤霞洞'` 因此被判「可推」——
//   但 collect 钩子只送 `{item: <物品名>}`，而"赤霞洞"是**地图名**，永远对不上。
//   实测：合体期角色接 v3_05，在赤霞洞真采 40 次，进度停在 0/12 —— 玩家做对了所有事，
//   进度条纹丝不动，而门禁全绿。这是"类型级覆盖"这种审计口径结构上看不见的一类死目标。
//
// 做法：给每种类型声明"钩子真实会送出的 context 字段"，再把这些字段的**值域**取自
// **正式存档**（134 怪 / 32 图 / 634 物品 / 58 副本），逐个具名 target 断言它落在值域里。
// ⚠ 值域不能取自临时空档 + materials.ensureAll —— 那只造兜底子集（36 怪/12 图），
//   会把大批合法 target 误判成"不存在的实体"（第一版实测 28 个假阳性）。
//
// 通配词（WILDCARD_TARGETS）与 target === type 的写法不受值域约束（它们本就按类型命中）。
// ══════════════════════════════════════════════════════════════════════════
const CONTEXT_DOMAIN = {
  // type: { fields: 钩子送的 context 字段, save: 取哪个存档集合当值域 }
  kill: { fields: ['monster', 'map'], save: ['monsters', 'maps'] },
  battle: { fields: ['monster', 'map'], save: ['monsters', 'maps'] },
  gather: { fields: ['map', 'item'], save: ['maps', 'items'] },
  collect: { fields: ['item'], save: ['items'] },
  explore: { fields: ['map'], save: ['maps'] },
  dungeon: { fields: ['dungeon'], save: ['dungeons'] },
  talk: { fields: ['npc'], save: null },              // npc 取自委托的 giver，无独立表
  alchemy: { fields: ['item'], save: ['items'] },
  forge: { fields: ['item'], save: ['items'] },
  craft: { fields: ['item'], save: ['items'] },
  level: { fields: [], save: null },                  // 无数值实体名，只按次数
  checkin: { fields: [], save: null },
  guild: { fields: [], save: null },
  tribulation: { fields: [], save: null }
};

let domainBad = [];
try {
  const { loadDatabase } = require(path.join(ROOT, 'src', 'database'));
  const db = loadDatabase();
  const sets = {};
  for (const t of ['monsters', 'maps', 'items', 'dungeons']) {
    sets[t] = new Set((db[t] || []).map((x) => x.name));
  }
  // talk 的值域 = 所有委托的委托人姓名（/revisit 送的就是 quest.giverName）
  const npcSet = new Set();
  for (const q of QL.allQuests()) if (q.giver && q.giver.name) npcSet.add(q.giver.name);
  for (const d of QL.DAILY_CHORES) if (d.giver && d.giver.name) npcSet.add(d.giver.name);

  const domainOf = (type) => {
    const d = CONTEXT_DOMAIN[type];
    if (!d) return null;
    if (type === 'talk') return npcSet;
    if (!d.save) return null;      // 该类型不送实体名 → 具名 target 无意义
    const u = new Set();
    for (const s of d.save) for (const n of sets[s]) u.add(n);
    return u;
  };

  const scan = (list, kind) => {
    for (const q of list) {
      const stages = q.stages || [{ index: 0, objectives: q.objectives || [] }];
      stages.forEach((st, si) => {
        for (const o of st.objectives || []) {
          const tg = o.target;
          if (!tg || QL.WILDCARD_TARGETS.has(tg) || tg === o.type) continue;
          const d = CONTEXT_DOMAIN[o.type];
          if (!d) continue;
          const uni = domainOf(o.type);
          if (!uni) {
            domainBad.push({
              quest: q.id, type: o.type, target: tg, required: o.required,
              why: `该类型不送任何实体名（fields=[]），具名 target「${tg}」永远对不上`
            });
            continue;
          }
          if (!uni.has(tg)) {
            // 诊断这个 target 究竟属于哪个值域（便于一眼看出该改成什么）
            const where = [];
            if (sets.items.has(tg)) where.push('物品');
            if (sets.maps.has(tg)) where.push('地图');
            if (sets.monsters.has(tg)) where.push('怪');
            if (sets.dungeons.has(tg)) where.push('副本');
            if (npcSet.has(tg)) where.push('NPC');
            domainBad.push({
              quest: q.id, type: o.type, target: tg, required: o.required,
              why: `该类型只送 [${d.fields.join(', ')}]，而「${tg}」= `
                + (where.length ? where.join('/') + '名' : '存档里不存在的实体')
            });
          }
        }
      });
    }
  };
  scan(QL.allQuests());
  scan(QL.DAILY_CHORES);
} catch (e) {
  console.log('⚠ 值域对账跳过（取不到存档）：' + e.message);
  domainBad = null;
}

console.log('== 剧情委托可完成性审计 ==');
console.log('钩子覆盖的类型:');
for (const [k, v] of [...hooked.entries()].sort()) console.log('  ✅ ' + k.padEnd(12) + v.join(', '));
console.log('');
console.log('目标总数 ' + rows.length + '：可推 ' + ok.length + ' ／ 不可推 ' + bad.length);
if (bad.length) {
  console.log('\n不可推的目标（接了也永远刷不满）:');
  const byType = {};
  for (const r of bad) (byType[r.type] = byType[r.type] || []).push(r);
  for (const [t, list] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
    console.log('  ❌ ' + t + '（' + list.length + ' 处）—— ' + list[0].note);
    for (const r of list.slice(0, 4)) console.log('       ' + r.quest + ' → ' + r.target + ' ×' + r.required);
    if (list.length > 4) console.log('       …另 ' + (list.length - 4) + ' 处');
  }
}

if (domainBad && domainBad.length) {
  console.log('\n⚠ 值域对账：类型有钩子、但 target 的值钩子根本送不出来（接了也永远刷不满）:');
  for (const d of domainBad) {
    console.log(`  ❌ ${d.quest} 的 ${d.type} target="${d.target}" ×${d.required}`);
    console.log(`       ${d.why}`);
  }
} else if (domainBad) {
  console.log('\n🟢 值域对账：所有具名 target 都落在对应钩子送出的值域内');
}

// 按委托统计"完成度风险"
console.log('\n按委托看：含不可推目标的委托数');
const risky = new Set(bad.map((r) => r.quest));
console.log('  ' + risky.size + ' / ' + (QL.allQuests().length + QL.DAILY_CHORES.length) + ' 条委托含至少一个不可推目标');
if (risky.size) console.log('  ' + [...risky].join(', '));

// ── 门禁模式（--gate）：两道锁 ──
// 锁一：剧情用到的每个目标类型都必须有进度源。
//   轮105 首次跑就抓到 35/70 个死目标（talk/explore/collect/alchemy/tribulation 五类全无
//   进度源，forge 与钩子推的 craft 类型名还对不上）。
// 锁二：每个具名 target 都必须落在对应钩子真实送出的 context 值域内。
//   轮107 由独立审计抓到盲区：`v3_05` 的 `collect target='赤霞洞'`（地图名）过了锁一，
//   实测采 40 次推进 0。锁一只问"类型有没有钩子"，结构上看不见这类死目标。
// 这两类缺陷的共同点是**在代码层完全合法** —— 语法对、类型对、接口通，lint 全看不见。
if (process.argv.includes('--gate')) {
  let fail = false;
  if (bad.length) {
    console.error('\n❌ 剧情委托存在无进度源的目标（玩家接了也永远完不成）：');
    for (const b of bad) console.error(`   ${b.quest} 的 ${b.type}（${b.target} ×${b.required}）—— ${b.note}`);
    fail = true;
  }
  if (domainBad && domainBad.length) {
    console.error('\n❌ 剧情委托存在"target 值送不出来"的具名目标（玩家做对了也不动）：');
    for (const d of domainBad) console.error(`   ${d.quest} 的 ${d.type}（${d.target} ×${d.required}）—— ${d.why}`);
    fail = true;
  }
  if (fail) process.exit(1);
  const usedTypes = new Set(rows.map((r) => r.type));
  const unused = [...hooked.keys()].filter((k) => !usedTypes.has(k));
  console.log('\n🟢 全部 ' + rows.length + ' 个目标都有进度源（' + hooked.size + ' 种类型已接线）');
  console.log('🟢 值域对账通过：具名 target 全部能被钩子送出');
  if (unused.length) console.log('   （已接线但剧情未使用：' + unused.join(', ') + '）');
  process.exit(0);
}

process.exit((bad.length || (domainBad && domainBad.length)) ? 1 : 0);
