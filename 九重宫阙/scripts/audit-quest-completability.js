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

// 按委托统计"完成度风险"
console.log('\n按委托看：含不可推目标的委托数');
const risky = new Set(bad.map((r) => r.quest));
console.log('  ' + risky.size + ' / ' + (QL.allQuests().length + QL.DAILY_CHORES.length) + ' 条委托含至少一个不可推目标');
if (risky.size) console.log('  ' + [...risky].join(', '));

// ── 门禁模式（--gate）：把"剧情用到的每个目标类型都必须有进度源"钉成锁 ──
// 为什么值得钉：这类缺陷（"接了永远完不成"）**在代码层完全合法** —— 语法对、类型对、
// 接口通，任何 lint 都看不见。只有把"剧情里用到的类型"与"钩子实际推的类型"两张表
// 对起来才暴露。轮105 首次跑就抓到 35/70 个死目标（talk/explore/collect/alchemy/
// tribulation 五类全无进度源，forge 与钩子推的 craft 类型名还对不上）。
if (process.argv.includes('--gate')) {
  if (bad.length) {
    console.error('\n❌ 剧情委托存在无进度源的目标（玩家接了也永远完不成）：');
    for (const b of bad) console.error(`   ${b.quest} 的 ${b.type}（${b.target} ×${b.required}）—— ${b.note}`);
    process.exit(1);
  }
  const usedTypes = new Set(rows.map((r) => r.type));
  const unused = [...hooked.keys()].filter((k) => !usedTypes.has(k));
  console.log('\n🟢 全部 ' + rows.length + ' 个目标都有进度源（' + hooked.size + ' 种类型已接线）');
  if (unused.length) console.log('   （已接线但剧情未使用：' + unused.join(', ') + '）');
  process.exit(0);
}

process.exit(bad.length ? 1 : 0);
