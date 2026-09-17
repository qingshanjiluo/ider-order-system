/**
 * 轮110 追加锁：技能库的**境界分布可用性**。
 *
 * ## 存在理由
 *
 * 表格要求技能 >500 门。但"总数"是错的判据 —— 轮110 审计发现真正的缺陷是
 * **分布断层**：总数 320 时，炼气期可触达 100 条、筑基期 84 条，而**金丹期只有 3 条、
 * 元婴期 5 条**（Lv21~40 两个大境界、游戏中期最长的成长段）。
 *
 * 成因是两个扩展段各做一端：`skill-expansion` 做炼气+筑基，`skill-highrealm`
 * 做化神以上 —— 中间两个境界的缝没人补。主文件里金丹/元婴那 21 条全是
 * 天阶/仙阶隐藏技（带前置链），普通玩家触达率 27%/50%，而炼气期是 100%。
 *
 * 若只盯总数，这种断层会一直存在且门禁全绿（既有 236 条内容断言没有一条查分布）。
 *
 * ## 判据
 *
 * ① 每个境界的**可触达**技能数 ≥ 下限（不能出现玩家无技可学的境界）
 * ② 相邻境界之间不出现"断崖"（下一境界不能比上一境界少太多）
 * ③ 战力天花板不被补内容抬高（damage_mult 全局上限）
 */
const assert = require('assert');
const path = require('path');
const { SKILLS_DATA } = require(path.join(__dirname, '..', 'src', 'services', 'skill'));

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.log('  ❌ ' + name + '：' + e.message); fail++; }
};

const REALMS = ['炼气期', '筑基期', '金丹期', '元婴期', '化神期', '炼虚期', '合体期', '大乘期', '渡劫期', '飞升期'];
/** 玩家真能触达的 source（hidden 是主文件顶级技的隐藏条件，需前置链，单列） */
const REACHABLE = new Set(['shop', 'guild', 'sect', 'dungeon', 'quest', 'inheritance', 'fortune', 'forge']);

const reachableIn = (realm) => SKILLS_DATA.filter(
  (s) => (s.required_realm || '') === realm && REACHABLE.has(s.source)
).length;

console.log('== G14 · 技能境界分布可用性 ==');
console.log(`技能总数 ${SKILLS_DATA.length}，境界 ${REALMS.length} 个`);
console.log('  ' + REALMS.map((r) => `${r}=${reachableIn(r)}`).join('  '));
console.log('');

t('每个境界都至少有 10 门玩家可触达的技能（无"无技可学"的境界）', () => {
  const bad = REALMS.filter((r) => reachableIn(r) < 10);
  if (bad.length) {
    throw new Error(bad.map((r) => `${r} 只有 ${reachableIn(r)} 门可触达`).join('；')
      + '（轮110 的断层就是这样：金丹 3 / 元婴 5，而炼气 100）');
  }
});

t('相邻境界不出现断崖：可触达数不得骤降 70% 以上', () => {
  const bad = [];
  for (let i = 1; i < REALMS.length; i++) {
    const prev = reachableIn(REALMS[i - 1]);
    const cur = reachableIn(REALMS[i]);
    if (prev > 0 && cur / prev < 0.3) {
      bad.push(`${REALMS[i - 1]}(${prev}) → ${REALMS[i]}(${cur})`);
    }
  }
  if (bad.length) throw new Error('出现断崖：' + bad.join('，'));
});

t('金丹期与元婴期各自 ≥30 门可触达（这两段是游戏中期最长的成长带）', () => {
  for (const r of ['金丹期', '元婴期']) {
    const n = reachableIn(r);
    if (n < 30) throw new Error(`${r} 只有 ${n} 门可触达（轮110 补洞后应 ≥30）`);
  }
});

t('战力天花板不被补内容抬高：damage_mult 全局 ≤10', () => {
  const over = SKILLS_DATA.filter((s) => Number(s.damage_mult) > 10);
  if (over.length) {
    throw new Error(over.slice(0, 5).map((s) => `${s.id}=${s.damage_mult}`).join('；')
      + '（既有天花板是 primordial_chaos 的 10.0）');
  }
});

t('声明的 effect_type 都在战斗认识的词表内（不许"文案有、打起来没有"）', () => {
  // 与 combat.js 的 switch / 既有技能库交集对齐
  const KNOWN = new Set([
    'damage', 'aoe', 'dot', 'hot', 'buff', 'debuff', 'heal', 'stun', 'shield', 'crit',
    'thorns', 'lifesteal', 'drain', 'dodge', 'taunt',
    // 非战斗类（生活/成长）
    'heal_amp', 'craft_amp', 'alchemy_amp', 'discount', 'gather_amp'
  ]);
  const bad = SKILLS_DATA.filter((s) => s.effect_type && !KNOWN.has(s.effect_type));
  if (bad.length) {
    throw new Error(bad.slice(0, 6).map((s) => `${s.id}(${s.effect_type})`).join('；'));
  }
});

t('无重复 id、无重复技能名（补内容最容易撞的两件事）', () => {
  const ids = new Map(), names = new Map();
  for (const s of SKILLS_DATA) {
    ids.set(s.id, (ids.get(s.id) || 0) + 1);
    names.set(s.name, (names.get(s.name) || 0) + 1);
  }
  const dupIds = [...ids].filter(([, n]) => n > 1).map(([k]) => k);
  const dupNames = [...names].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupIds.length) throw new Error('重复 id：' + dupIds.slice(0, 5).join('、'));
  if (dupNames.length) throw new Error('重复技能名：' + dupNames.slice(0, 5).join('、'));
});

t('前置链可达：每个技能的前置要么为空，要么指向真实存在的技能（禁死锁门）', () => {
  const byId = new Map(SKILLS_DATA.map((s) => [s.id, s]));
  const bad = [];
  for (const s of SKILLS_DATA) {
    for (const p of s.prerequisites || []) {
      if (!byId.has(p)) bad.push(`${s.id} → ${p}（不存在）`);
    }
  }
  if (bad.length) throw new Error(bad.slice(0, 6).join('；'));
  // 环检测
  const state = new Map();
  const dfs = (id, stack) => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return stack.slice(stack.indexOf(id)).concat(id);
    state.set(id, 'visiting');
    for (const p of (byId.get(id) || {}).prerequisites || []) {
      const cyc = dfs(p, stack.concat(id));
      if (cyc) return cyc;
    }
    state.set(id, 'done');
    return null;
  };
  for (const s of SKILLS_DATA) {
    const cyc = dfs(s.id, []);
    if (cyc) throw new Error('前置成环：' + cyc.join(' → '));
  }
});

console.log('');
console.log(`技能分布: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
