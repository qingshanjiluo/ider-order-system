/**
 * 服务端机缘记录（轮67）
 *
 * 为什么要有这个模块：`learnSkill` 对隐藏技一律拒绝（轮47 的成果 —— 列表接口不列隐藏技，
 * 但服务层当时不校验，知道 id 就能用灵石白嫖 7.0/9.9 倍率的仙阶大招），而 `POST /api/skill/unlock-hidden`
 * 当年被客户端自报的 condition 字段糊过（truthy 即放行 ⇒ 白拿大招），修法是"整个入口拒绝"。
 * 拒绝是安全的，但 19 门隐藏技的 `hidden_condition` 于是永远只是散文 —— 玩家真打出了条件也没有地方记住。
 * 本模块补的就是"记住"这一半：**由服务端事件写入，查询接口只读不写**。
 *
 * 记录落在角色的 `character.opportunities` 数组上，而不是新建集合，理由有二：
 *   1) 与仓内既有做法一致（`character.blueprints`、`character.unlocked_codex` 都是角色上的数组）；
 *   2) 新建集合要动存档快照的行数核对与全表引用扫描（不变量 3），收益不值当 —— 机缘本来就是角色属性。
 * 注意 `src/services/chronicle.js` 不是事件日志：它是**从既有状态反推叙事**的生成器，
 * 里面那个 `fortune: '机缘'` 只是标题字典，没有可写入的存储 ⇒ 别把它当记录用（轮66 我差点这么干）。
 *
 * 铁律：本模块只做两件事 —— 判定"某个服务端事件是否构成机缘"与"角色有没有这条记录"。
 * 它**不接受**来自 HTTP 的条件自报，也不代表任何技能一定可学（境界/前置/灵石仍由 learnSkill 判）。
 */

const KEYS = {
  NEAR_DEATH_VICTORY: 'near_death_victory',   // 以濒死状态赢下一场战斗
  TRIBULATION_SURVIVED: 'tribulation_survived', // 大限劫应劫而生（渡劫不昧本心）
  SWORD_TOMB_ENLIGHTENMENT: 'sword_tomb_enlightenment', // 剑冢顿悟：通关"剑冢深处"（轮69 设计解读，见 DUNGEON_OPPORTUNITIES）
  JIANMU_SPIRIT_ACKNOWLEDGED: 'jianmu_spirit_acknowledged' // 建木之灵认可：通关"建木遗迹"（轮69 设计解读）
};

const KNOWN_KEYS = Object.keys(KEYS).map((k) => KEYS[k]);

// 濒死口径逐字对着 forbidden_seal 的 hidden_condition："生命值降至1%以下时自动解锁"
const NEAR_DEATH_HP_RATIO = 0.01;

/**
 * 隐藏技 → 解锁所需机缘键。
 * **只登记今天能被服务端机械判定的那些**。其余隐藏技的条件要么依赖不存在的地点
 * （如 phoenix_wrath 的"火焰秘境"——地图库里火属性地图叫"赤霞洞"，没有"火焰秘境"，
 * 而 BOSS 概念只存在于副本路径 dungeon.js:197，野外战斗没有 boss 标志），要么是
 * "集齐 N 枚某物/通关全部隐藏副本"这类尚无服务端进度的说法。
 * 不登记 = 继续拒绝。宁可少给玩家技能，也不造一条含混的判定把审计引到假路径上。
 */
const SKILL_REQUIREMENT = {
  forbidden_seal: KEYS.NEAR_DEATH_VICTORY,   // "生命值降至1%以下时自动解锁"
  heaven_gate: KEYS.TRIBULATION_SURVIVED,    // "渡劫不昧本心"
  ten_thousand_swords: KEYS.SWORD_TOMB_ENLIGHTENMENT,   // "剑冢顿悟" ⇒ 通关剑冢深处（轮69 设计解读）
  jianmu_sky: KEYS.JIANMU_SPIRIT_ACKNOWLEDGED           // "得建木之灵认可" ⇒ 通关建木遗迹（轮69 设计解读）
};

/**
 * 副本名 → 机缘键（轮69）。
 * **键在副本名而不是数字 id**：ensureDungeons 按 name 幂等去重（dungeon-library.js:65），数字 id 是
 * 种子时按插入顺序生成的（max+1），跨环境不稳定 —— cleared_dungeons 里存的是什么 id 无所谓，判定只认名。
 * **设计解读记录（这是设计决策，不是机械事实，故明写）**：
 *   · "剑冢顿悟"（ten_thousand_swords）：散文里的"顿悟"没有对应机制，而"剑冢深处"副本真实存在
 *     （公共副本 28-38 级，BOSS"残剑成灵守关"）⇒ 解读为"通关剑冢深处"。
 *   · "建木遗迹得建木之灵认可"（jianmu_sky）："建木遗迹"秘境真实存在（58-72 级）⇒ 解读为"通关建木遗迹"。
 * 与 heaven_gate（"渡劫不昧本心"⇒应劫而生）同型：地点存在、通关是真实状态（character.cleared_dungeons），
 * 差的只是机制命名。其余地名（火焰秘境/暗影深渊/风暴之巅/圣光试炼/日蚀/四海龙宫/永夜渊/海底遗迹/山神庙）
 * 在地图库与副本库里都是 0 处（轮69 交叉验证），那些门继续拒绝。
 */
const DUNGEON_OPPORTUNITIES = {
  '剑冢深处': KEYS.SWORD_TOMB_ENLIGHTENMENT,
  '建木遗迹': KEYS.JIANMU_SPIRIT_ACKNOWLEDGED
};

/** 该隐藏技需要哪条机缘；返回 null 表示"这扇门今天仍未实装判据"，调用方必须继续拒绝。 */
function requiredOpportunityOf(skillId) {
  return SKILL_REQUIREMENT[skillId] || null;
}

/** 某机缘键是否已记录在角色身上。 */
function has(character, key) {
  if (!character || !Array.isArray(character.opportunities)) return false;
  return character.opportunities.some((o) => o && o.key === key);
}

/**
 * 写入一条机缘（就地改角色对象，落库由调用方的 saveDatabase 负责 —— 与路由里其它
 * character 字段改动的时序一致）。同键不重复建行，只累加次数并更新 last_at，所以反复触发是幂等的。
 */
function record(character, key, meta) {
  if (!character || typeof character !== 'object') return { recorded: false, reason: 'no_character' };
  if (KNOWN_KEYS.indexOf(key) < 0) return { recorded: false, reason: 'unknown_key', key };
  if (!Array.isArray(character.opportunities)) character.opportunities = [];
  const now = new Date().toISOString();
  const hit = character.opportunities.find((o) => o && o.key === key);
  if (hit) {
    hit.count = (Number(hit.count) || 1) + 1;
    hit.last_at = now;
    if (meta) hit.meta = meta;
    return { recorded: true, repeated: true, key };
  }
  character.opportunities.push({ key, count: 1, at: now, last_at: now, meta: meta || null });
  return { recorded: true, repeated: false, key };
}

/**
 * 战斗事件 → 是否构成"濒死取胜"。只吃 combat.js 已经回传的字段，不另算一套血量口径。
 * maxHp 缺失或为 0 时一律判否（宁可漏记，不可误记）。
 */
function opportunityFromBattle(battleResult) {
  if (!battleResult || battleResult.winner !== 'attacker') return null;
  const max = Number(battleResult.attackerMaxHp);
  const left = Number(battleResult.attackerFinalHp);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(left) || left < 0) return null;
  if (left / max > NEAR_DEATH_HP_RATIO) return null;
  return KEYS.NEAR_DEATH_VICTORY;
}

/** 副本通关事件 → 是否构成机缘。只认副本名（跨环境稳定的标识），脏数据一律判否（宁可漏记，不可误记）。 */
function opportunityFromDungeonClear(dungeon) {
  if (!dungeon || typeof dungeon.name !== 'string') return null;
  return DUNGEON_OPPORTUNITIES[dungeon.name] || null;
}

/** 给玩家看的缺什么话术（错误信息里说清是哪一条机缘，不让人对着散文猜）。 */
function describeRequirement(skillDef, character) {
  const need = requiredOpportunityOf(skillDef && skillDef.id);
  if (!need) return { required: null, achieved: false };
  return {
    required: need,
    achieved: has(character, need),
    condition: (skillDef && skillDef.hidden_condition) || need
  };
}

module.exports = {
  KEYS,
  KNOWN_KEYS,
  NEAR_DEATH_HP_RATIO,
  DUNGEON_OPPORTUNITIES,
  requiredOpportunityOf,
  has,
  record,
  opportunityFromBattle,
  opportunityFromDungeonClear,
  describeRequirement
};
