/**
 * 剧情 / 编年史（阶段9 · 原始设定 Sheet1 联动）
 *  - 编年史：lifespan_events 按游戏年排序，年龄换算（24h=10年 → 事件时年龄）
 *  - 开局传记：程序化 name 传（出身词库 × 灵根体质，按 character_id 确定性播种）
 *  - AI 增强：purpose='lore' 生成，approve 后落到 character.biography_ai
 */
const store = require('../db/store');
const { loadDatabase } = require('../database');
const gameTime = require('./gameTime');

const EVENT_TITLES = {
  birth: '降世', breakthrough: '突破', heavy_injury: '重伤', pass_away: '坐化',
  reincarnate: '转世', ascension: '飞升', epiphany: '顿悟', fortune: '机缘',
  tribulation: '劫数', sect: '宗门', custom: '记事'
};

const ORIGINS = [
  { name: '山野药农', text: '生于青云山下的药农之家，幼时常采药于云雾之间，偶得残卷一部，自此踏上修行路。' },
  { name: '没落世家', text: '出身百年前显赫一时的修行世家，家道中落，只余半卷祖传功诀与一枚旧玉佩。' },
  { name: '市井孤儿', text: '长于市井瓦肆之间，靠替人跑腿糊口，因一次意外救下一位受伤散修，被收为记名弟子。' },
  { name: '渔村少年', text: '东海渔村的孩子，十岁那年风暴夜在滩涂上拾到一块温热的「卵石」，灵根自此觉醒。' },
  { name: '宗门杂役', text: '自幼被送入宗门做杂役，洒扫丹房十余年，耳濡目染，竟无师自通。' }
];

const SPECIAL_CONSTITUTIONS = {
  sword: { name: '剑心通明', text: '万法不侵，唯剑独行——凡兵到手皆可通灵。' },
  dan: { name: '药灵之体', text: '百毒不侵，丹药入腹化作精纯灵力，炼丹一道天生亲近。' },
  desire: { name: '七窍玲珑', text: '七窍玲珑，人心鬼蜮一眼即穿，谈笑间化敌为友。' },
  wealth: { name: '聚财之相', text: '天生聚财之相，行走世间总能于无宝处觅得宝气。' },
  supreme: { name: '道骨天成', text: '道骨天成，乃万年难遇的修行圣体，诸法皆可通。' },
  cauldron: { name: '天地炉鼎', text: '身若炉鼎，可容诸气淬炼，物性灵性一点即透。' }
};

/** 确定性种子随机（同一角色同一传记） */
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 开局传记（name 传）：程序化生成，特殊灵根 → 特殊体质 */
function getBiography(character) {
  const rnd = seededRandom(Number(character.id) || 1);
  const origin = ORIGINS[Math.floor(rnd() * ORIGINS.length)];
  const roots = character.spirit_roots || [];
  const baseRoots = roots.filter(r => !r.special);
  const special = roots.find(r => r.special && SPECIAL_CONSTITUTIONS[r.type]);
  const rootText = baseRoots.length
    ? baseRoots.map(r => `${r.type}灵根${r.purity || 50}%`).join('、')
    : '五行驳杂';
  const constitution = special
    ? `更兼天生异禀——【${SPECIAL_CONSTITUTIONS[special.type].name}】：${SPECIAL_CONSTITUTIONS[special.type].text}`
    : '';
  const paragraphs = [
    `${character.name}，${origin.name}也。`,
    origin.text,
    `灵根品鉴：${rootText}。${constitution}`,
    `年方十六，初入修行界。此后种种，皆由记年如实录之。`
  ];
  return {
    origin: origin.name,
    paragraphs,
    constitution: special ? SPECIAL_CONSTITUTIONS[special.type].name : null,
    aiEnhanced: Boolean(character.biography_ai)
  };
}

/** 编年史：按游戏年排序 + 年龄显示 */
function getChronicle(character) {
  const rows = store.queryRel('lifespan_events', { character_id: character.id }, 'rowid');
  const events = rows
    .map(r => ({
      id: r.id,
      gameYear: Number((r.game_year || 0).toFixed(2)),
      age: Math.floor(gameTime.STARTING_AGE + (r.game_year || 0)),
      type: r.type,
      typeTitle: EVENT_TITLES[r.type] || '记事',
      title: r.title,
      content: r.content,
      at: r.created_at
    }))
    .sort((a, b) => a.gameYear - b.gameYear || a.id - b.id);
  return {
    character: { id: character.id, name: character.name, reincarnationCount: character.reincarnation_count || 0 },
    currentAge: Math.floor(gameTime.STARTING_AGE + (character.age_years || 0)),
    events
  };
}

module.exports = { getChronicle, getBiography, EVENT_TITLES, ORIGINS, SPECIAL_CONSTITUTIONS };
