/**
 * 游戏时间引擎（阶段2 · 决议 D1/D5）
 *
 * 核心法则：现实 24 小时 = 游戏 10 年（在线与离线均 100% 折算）
 * 寿元曲线（D5 修订版，映射到现役 10 境界）：
 *   凡人100 → 炼气200 → 筑基500 → 金丹1500 → 元婴5000 → 化神2万
 *   → 炼虚5万 → 合体10万 → 大乘30万 → 渡劫100万（不飞升上限）
 *   飞升 → 超脱寿数（寿命机制退场）
 * 境界内每升 1 级 +1% 当前境界基础寿元（character.js addExp 挂钩）
 * 延寿丹药/功法 → lifespan_bonus_years（总上限锁定 100 万，边际递减）
 * 寿元耗尽 → 坐化转世（保留清单见 passAway）
 */
const store = require('../db/store');
const B = require('../config/balance'); // 新常量只进 balance.js（不变量 5）

const GAME_YEARS_PER_REAL_HOUR = 10 / 24;
const LIFESPAN_CAP = 1000000;
const ASCENDED_REALM = '飞升';
const STARTING_AGE = 16;

const LIFESPAN_BY_REALM = {
  凡人: 100,
  炼气: 200,
  筑基: 500,
  金丹: 1500,
  元婴: 5000,
  化神: 20000,
  炼虚: 50000,
  合体: 100000,
  大乘: 300000,
  渡劫: 1000000,
  飞升: null
};

/** 推进角色游戏年龄（在线/离线统一 100% 折算）。应在角色被加载/操作时调用。 */
function settleTime(character, now = Date.now()) {
  if (!character.time_settled_at) {
    character.time_settled_at = now;
    return { advancedYears: 0 };
  }
  const elapsedHours = Math.max(0, (now - character.time_settled_at) / 3600000);
  const advanced = elapsedHours * GAME_YEARS_PER_REAL_HOUR;
  character.time_settled_at = now;
  if (advanced > 0) {
    character.age_years = (character.age_years || 0) + advanced;
  }
  return { advancedYears: advanced };
}

/** 当前境界基础寿元（飞升为 null=超脱） */
function getLifespanBase(character) {
  const base = LIFESPAN_BY_REALM[character.realm];
  return base === undefined ? 100 : base;
}

function isAscended(character) {
  return Boolean(character.ascended) || character.realm === ASCENDED_REALM;
}

/** 延寿收益硬闸：不超过当前境界基础寿元的 35%（不变量 1，此前全仓零消费） */
function longevityCeiling(base) {
  return Math.floor(base * B.LONGEVITY_BONUS_CAP_RATIO);
}

/**
 * 有效寿元上限 = min(境界基础 + 境界内成长 + 延寿收益(封顶) - 惩罚, 100万)；飞升为 null
 * 两个桶分开记账：lifespan_bonus_years 属"升级带来的境界内成长"（不占延寿闸），
 * longevity_years 属"丹/灵植/赏赐/度劫续命等外部延寿"（受 35% 闸）。
 * 合并记账会让高等级角色的延寿丹完全失效，并变相压缩境界阶梯。
 */
function effectiveLifespan(character) {
  if (isAscended(character)) return null;
  const base = getLifespanBase(character) || 0;
  const bonus = character.lifespan_bonus_years || 0;
  const longevity = Math.min(character.longevity_years || 0, longevityCeiling(base));
  const penalty = character.lifespan_penalty_years || 0;
  return Math.max(1, Math.min(base + bonus + longevity - penalty, LIFESPAN_CAP));
}

/** 寿命面板数据（含真实时间直译，供 UI 显示） */
function lifespanInfo(character) {
  const age = character.age_years || 0;
  const cap = effectiveLifespan(character);
  if (cap === null) {
    return { ascended: true, age, lifespan: null, remaining: null, pct: 0, realTimeHint: '超脱寿数' };
  }
  const remaining = Math.max(0, cap - age);
  const realDays = remaining / 10; // 10游戏年=1现实天
  return {
    ascended: false,
    age,
    lifespan: cap,
    remaining,
    pct: Math.min(100, (age / cap) * 100),
    realTimeHint: remaining <= 0 ? '寿元已尽' : `约合现实 ${realDays < 1 ? realDays.toFixed(1) : Math.round(realDays)} 天`
  };
}

/** 延寿（丹药/功法/灵植/赏赐/度劫续命）。走 longevity_years 桶并受 35% 硬闸；封顶后实际增加量为 0。 */
function addLifespanBonus(character, years) {
  if (isAscended(character) || !(years > 0)) return 0;
  const before = effectiveLifespan(character);
  const base = getLifespanBase(character) || 0;
  const ceiling = longevityCeiling(base);
  const cur = character.longevity_years || 0;
  // 只涨不回退：历史数据已超闸时不削减既有寿元，只是不再增长
  character.longevity_years = Math.max(cur, Math.min(cur + years, ceiling));
  return effectiveLifespan(character) - before;
}

/** 扣寿（重伤/渡劫失败等）。返回实际扣除量。 */
function subtractLifespan(character, years) {
  if (isAscended(character) || !(years > 0)) return 0;
  const before = effectiveLifespan(character);
  character.lifespan_penalty_years = (character.lifespan_penalty_years || 0) + years;
  return before - effectiveLifespan(character);
}

function logEvent(character, type, title, content) {
  try {
    store.insertRel('lifespan_events', {
      character_id: character.id,
      game_year: Number((character.age_years || 0).toFixed(2)),
      type,
      title: title || null,
      content: content || null,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[gameTime] 编年史写入失败:', e.message);
  }
}

/**
 * 坐化转世（决议 D1 保留清单·建议稿）：
 *   保留：成就/图鉴/称号、VIP 与点券、熟练度（阶段3 落地后自动保留）、
 *         仓库 50% 随机折损、灵石 30% 带入、前世记忆（转世计数）
 *   清空：境界/修为/等级/装备/功法/技能/灵宠/寿元加成与惩罚
 */
function passAway(character, db) {
  const summary = { retained: [], lost: [] };

  logEvent(character, 'pass_away', '坐化', `寿元耗尽，享年 ${Math.floor(character.age_years || 0)} 岁`);

  // 保留：VIP / 点券 / 成就等引用 character_id 的记录天然保留（不换 id）
  summary.retained.push('成就图鉴', 'VIP与点券', '转世记忆');

  // 灵石 70% 折损
  character.spirit_stone = Math.floor((character.spirit_stone || 0) * 0.3);
  summary.retained.push('灵石30%');

  // 仓库 50% 随机折损
  const inv = (db.inventory || []).filter((i) => i.character_id === character.id);
  const kept = inv.filter(() => Math.random() < 0.5);
  db.inventory = (db.inventory || []).filter((i) => i.character_id !== character.id || kept.includes(i));
  summary.retained.push(`仓库 ${kept.length}/${inv.length}`);

  // 清空战斗积累
  for (const key of ['equipments', 'gongfa', 'pets', 'player_skills', 'character_buffs']) {
    const before = (db[key] || []).length;
    db[key] = (db[key] || []).filter((x) => x.character_id !== character.id);
    if (before > (db[key] || []).length) summary.lost.push(key);
  }

  // 重置修为至出厂状态
  character.realm = '炼气';
  character.realm_stage = 1;
  character.level = 1;
  character.exp = 0;
  // 出厂 exp_to_next 必须来自经验曲线真源，不能再硬编码（轮54 之前这里是 100，与新曲线 1.3e5 量级分叉）
  character.exp_to_next = require('./exp-curve').needForLevel(
    (db.realms || []).find((r) => r.name === '炼气'), 1) || 100;
  character.max_hp = 100;
  character.max_mp = 50;
  character.hp = 100;
  character.mp = 50;
  character.attack = 10;
  character.defense = 5;
  character.speed = 5;
  character.age_years = STARTING_AGE;
  character.lifespan_bonus_years = 0;
  character.longevity_years = 0;      // 延寿收益不外世继承（否则转世失去意义）
  character.lifespan_penalty_years = 0;
  character.tribulation = null;       // 大限劫状态随前世一并清空
  character.injury = 0;
  character.injury_status = 'none';
  character.time_settled_at = Date.now();
  character.reincarnation_count = (character.reincarnation_count || 0) + 1;
  character.breakthrough_failures = 0;

  logEvent(character, 'reincarnate', '转世', `第 ${character.reincarnation_count} 世重修`);

  db.dirty = true;
  return summary;
}

/* ==================== E5 / T0-1 大限劫 ====================
 * 设计要点（决议 D5 + 章程 E5）：
 *   1. 寿元耗尽**不再静默坐化**——化神及以上先给一个应劫窗口，玩家可出手度劫；
 *   2. 判死仍然只有 shouldPassAway 一处（不得新增第二处寿元判定，避免双写漂移）；
 *   3. 续命一律按当时寿元上限的**比例**（不变量 2），且经 addLifespanBonus 走 35% 延寿闸；
 *   4. 度劫成功不置死亡、失败/逾期才落到 passAway 这个唯一转世出口。
 */

/** 该境界是否有资格应劫（飞升超脱、低境界直接坐化） */
function tribulationEligible(character) {
  if (isAscended(character)) return false;
  const list = (B.TRIBULATION && B.TRIBULATION.eligibleRealms) || [];
  return list.indexOf(character.realm) >= 0;
}

/**
 * 开应劫窗口（幂等）：已有 pending 时原样返回，绝不刷新窗口起点——
 * 否则每次读角色都会把 deadline 往后推，等于无限延寿。
 */
function openTribulationWindow(character) {
  const cur = character.tribulation;
  // 已有任何阶段一律原样返回：pending 保持起点；failed 是终局（重开=死而复生）；
  // survived 要再开一轮由 shouldPassAway 显式清空后再调，此处绝不擅自复活。
  if (cur && cur.stage) return cur;
  const trib = {
    stage: 'pending',
    started_at_year: Number(character.age_years) || 0,
    window_years: (B.TRIBULATION && B.TRIBULATION.windowYears) || 3,
    attempts: (cur && Number(cur.attempts)) || 0
  };
  character.tribulation = trib;
  logEvent(character, 'tribulation', '大限劫至',
    `寿元将尽，天劫降临：${trib.window_years} 游戏年内须应劫，胜则续命，败则坐化转世`);
  return trib;
}

/** 窗口剩余（游戏年）；无 pending 返回 null。供 UI/路由显示倒计时。 */
function tribulationRemaining(character) {
  const trib = character.tribulation;
  if (!trib || trib.stage !== 'pending') return null;
  const deadline = (Number(trib.started_at_year) || 0) + (Number(trib.window_years) || 0);
  return Math.max(0, deadline - (Number(character.age_years) || 0));
}

/** 应劫成功：按当时上限比例续命（受 35% 延寿闸天然封顶，边际递减） */
function resolveTribulationVictory(character) {
  if (isAscended(character)) return { success: false, error: '已超脱寿数，无需应劫' };
  const trib = character.tribulation;
  if (!trib || trib.stage !== 'pending') return { success: false, error: '当前无待应之劫' };
  const capBefore = effectiveLifespan(character) || 0;
  const want = capBefore * ((B.TRIBULATION && B.TRIBULATION.renewRatio) || 0);
  const gained = addLifespanBonus(character, want);
  character.tribulation = {
    stage: 'survived',
    survived_at_year: Number(character.age_years) || 0,
    attempts: (Number(trib.attempts) || 0) + 1,
    last_renew_years: gained
  };
  logEvent(character, 'tribulation', '度劫成功',
    `硬抗天劫，寿元上限续 ${Math.floor(gained)} 载（+${Math.round(((B.TRIBULATION && B.TRIBULATION.renewRatio) || 0) * 100)}%）`);
  return { success: true, gainedYears: gained, capBefore, capAfter: effectiveLifespan(character) };
}

/** 应劫失败：只标记状态，判死仍统一交给 shouldPassAway → passAway */
function resolveTribulationDefeat(character, reason) {
  const trib = character.tribulation && character.tribulation.stage === 'pending'
    ? character.tribulation
    : { attempts: 0 };
  trib.stage = 'failed';
  trib.failed_at_year = Number(character.age_years) || 0;
  trib.attempts = (Number(trib.attempts) || 0) + 1;
  character.tribulation = trib;
  logEvent(character, 'tribulation', '度劫陨落', reason || '天劫之下道基崩碎，转世重修');
  return trib;
}

/** 是否寿元已尽（需转世）——全仓唯一判定点 */
function shouldPassAway(character) {
  if (isAscended(character)) return false;
  const cap = effectiveLifespan(character);
  if ((character.age_years || 0) < cap) return false;
  if (tribulationEligible(character)) {
    const trib = openTribulationWindow(character);   // 幂等：pending 不会被刷新
    if (trib.stage === 'pending') {
      const deadline = (Number(trib.started_at_year) || 0) + (Number(trib.window_years) || 0);
      if ((character.age_years || 0) <= deadline) return false; // 窗口内不判死
      resolveTribulationDefeat(character, '应劫窗口耗尽，未曾出手，天劫碾落');
    } else if (trib.stage === 'survived') {
      // 上次度劫续的寿元又用尽：允许再开一轮（一世之内可多次应劫）
      character.tribulation = null;
      openTribulationWindow(character);
      return false;
    }
    // stage === 'failed' → 落回判死
  }
  return true;
}

module.exports = {
  GAME_YEARS_PER_REAL_HOUR,
  LIFESPAN_CAP,
  LIFESPAN_BY_REALM,
  ASCENDED_REALM,
  STARTING_AGE,
  settleTime,
  getLifespanBase,
  isAscended,
  effectiveLifespan,
  longevityCeiling,
  lifespanInfo,
  addLifespanBonus,
  subtractLifespan,
  logEvent,
  passAway,
  shouldPassAway,
  tribulationEligible,
  openTribulationWindow,
  tribulationRemaining,
  resolveTribulationVictory,
  resolveTribulationDefeat
};

/**
 * 境界内成长（升级）的寿元加成——全仓唯一允许写 lifespan_bonus_years 的入口。
 * 之前由 character.js 自己 `lifespan_bonus_years += realmBase * 0.01`，既绕过 balance
 * 又把寿元算术散落到第二个 owner（不变量 5 + 判定点唯一的实质要求）。
 */
function addRealmGrowth(character) {
  if (isAscended(character)) return 0;
  const base = getLifespanBase(character) || 0;
  if (!base) return 0;
  const ratio = Number(B.LEVEL_LIFESPAN_GAIN) || 0;
  const before = effectiveLifespan(character);
  character.lifespan_bonus_years = (character.lifespan_bonus_years || 0) + base * ratio;
  return effectiveLifespan(character) - before;
}
module.exports.addRealmGrowth = addRealmGrowth;
