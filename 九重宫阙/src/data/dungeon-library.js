/**
 * 副本图鉴（内容富集八期）
 * 新增 17 个副本（公共/宗门/秘境/天劫四类），奖励随难度与等级阶梯自洽。
 * 与既有 15 个副本并存，幂等按名称播种。
 */

const DUNGEONS = [
  { name: '青云试剑台', type: '公共副本', min_level: 5, max_level: 15, difficulty: 1.2, desc: '青云宗外门试剑之处，傀儡守关' },
  { name: '荒古矿洞', type: '公共副本', min_level: 12, max_level: 22, difficulty: 1.4, desc: '废弃矿洞深处矿脉与矿妖共生' },
  { name: '妖狼谷', type: '公共副本', min_level: 18, max_level: 28, difficulty: 1.6, desc: '妖狼成群，狼王据谷称霸' },
  { name: '落霞古墓', type: '公共副本', min_level: 25, max_level: 35, difficulty: 1.8, desc: '前朝修士墓冢，机关与阴魂并存' },
  { name: '雷鸣泽', type: '公共副本', min_level: 32, max_level: 42, difficulty: 2.0, desc: '沼澤雷暴不歇，雷兽游弋' },
  { name: '万药园', type: '宗门副本', min_level: 20, max_level: 30, difficulty: 1.5, desc: '宗门药园，灵植守卫与偷药贼' },
  { name: '藏经阁试炼', type: '宗门副本', min_level: 28, max_level: 40, difficulty: 1.9, desc: '典籍幻境，考验道心与悟性' },
  { name: '宗门演武场', type: '宗门副本', min_level: 35, max_level: 48, difficulty: 2.1, desc: '与历代天骄残影论剑' },
  { name: '灵脉深处', type: '宗门副本', min_level: 45, max_level: 58, difficulty: 2.4, desc: '镇宗灵脉之下，灵兽守护本源' },
  { name: '万魂窟', type: '秘境', min_level: 40, max_level: 55, difficulty: 2.3, desc: '万魂哀嚎，暗系修士试炼之地' },
  { name: '北溟海眼', type: '秘境', min_level: 50, max_level: 65, difficulty: 2.6, desc: '海眼归墟，玄龟与潮汐巨兽' },
  { name: '建木遗迹', type: '秘境', min_level: 58, max_level: 72, difficulty: 2.8, desc: '通天建木残根，木灵盘踞' },
  { name: '太阳火源', type: '秘境', min_level: 66, max_level: 80, difficulty: 3.0, desc: '日之火源，真火淬体可炼仙躯' },
  { name: '后土心渊', type: '秘境', min_level: 74, max_level: 88, difficulty: 3.3, desc: '大地之心，厚土神兽镇守' },
  { name: '永夜渊', type: '天劫', min_level: 82, max_level: 95, difficulty: 3.6, desc: '永夜降临之地，暗主传承所在' },
  { name: '九重天梯', type: '天劫', min_level: 88, max_level: 98, difficulty: 4.0, desc: '九重天梯，登顶可窥仙门' },
  { name: '天道试炼场', type: '天劫', min_level: 95, max_level: 100, difficulty: 5.0, desc: '天道亲自设局，试炼飞升之资' },
  // ---- P1 T1-2 · 轮45：副本 32 -> 50（差口 +18）。前 5 条是轮42 查明的"代码里有、存档里没有"的
  //      孤儿副本（五行试炼/魔道巢穴/远古战场/天劫降临/仙界试炼），当初它们在种子链里被按 id 覆盖掉，
  //      本轮把它们连同奖励与物品产出一起接回真源，而不是继续留在无人引用的状态。
  //      条目字段与既有一致：type/min_level/max_level/difficulty/desc；rewards 由 rewardsFor 按等级与难度算出，
  //      少数几条额外给 items 产出（id 必须是存档里存在的物品，否则十边审计的副本奖励边会红）。----
  { name: '五行试炼', type: '公共副本', min_level: 25, max_level: 35, difficulty: 2.0, items: [30, 38], desc: '五行轮转布阵，考校五行功法是否齐备' },
  { name: '魔道巢穴', type: '公共副本', min_level: 45, max_level: 55, difficulty: 2.6, items: [31, 59], desc: '魔修聚集之地，清剿可得魔道缴获' },
  { name: '远古战场', type: '公共副本', min_level: 55, max_level: 65, difficulty: 3.0, items: [32, 64], desc: '上古大战遗址，战魂与残器共存' },
  { name: '天劫降临', type: '天劫', min_level: 65, max_level: 75, difficulty: 3.8, items: [14, 15], desc: '雷云压顶的应劫之地，渡劫前置试炼' },
  { name: '仙界试炼', type: '飞升副本', min_level: 80, max_level: 90, difficulty: 4.4, items: [32, 69], desc: '飞升前最后一关，验道行亦验道心' },
  { name: '灵药园试炼', type: '宗门副本', min_level: 22, max_level: 32, difficulty: 1.7, desc: '宗门药园考核，识药辨性方能过关' },
  { name: '铁脊山矿难', type: '公共副本', min_level: 15, max_level: 25, difficulty: 1.5, desc: '矿脉塌方后妖物盘踞，夺回矿道即胜' },
  { name: '剑冢深处', type: '公共副本', min_level: 28, max_level: 38, difficulty: 2.1, desc: '剑冢最下一层，残剑成灵守关' },
  { name: '药王谷禁地', type: '宗门副本', min_level: 30, max_level: 40, difficulty: 2.2, desc: '谷中禁地，药奴与护山灵植同守' },
  { name: '血魔洞府', type: '秘境', min_level: 42, max_level: 52, difficulty: 2.4, desc: '血修洞府，以活人精血养出的魔器藏于此' },
  { name: '万蛊母巢', type: '秘境', min_level: 46, max_level: 56, difficulty: 2.7, desc: '蛊母产蛊之地，破巢可绝一方蛊灾' },
  { name: '幽冥渡口', type: '秘境', min_level: 50, max_level: 60, difficulty: 2.8, desc: '阴阳交割的渡口，摆渡人索的不是灵石' },
  { name: '玄武潭心', type: '秘境', min_level: 52, max_level: 62, difficulty: 3.0, desc: '寒潭之底另有天地，玄武遗蜕沉眠其中' },
  { name: '金光塔九层', type: '公共副本', min_level: 58, max_level: 70, difficulty: 3.4, desc: '自下而上连破九层，塔顶封存炼器真解' },
  { name: '星槎渡红尘', type: '秘境', min_level: 60, max_level: 70, difficulty: 3.1, desc: '坠落星槎化出的红尘幻境，历情劫方得渡' },
  { name: '雷泽渊底', type: '天劫', min_level: 70, max_level: 82, difficulty: 4.2, desc: '万雷归渊，渊底雷君以形炼神' },
  { name: '无相心劫', type: '天劫', min_level: 86, max_level: 96, difficulty: 4.8, desc: '心魔化作自身模样，胜己方能胜天' },
  { name: '大罗天试炼', type: '飞升副本', min_level: 92, max_level: 100, difficulty: 5.4, items: [69], desc: '大罗天门外最后一试，过后即可飞升' }
];

function rewardsFor(d) {
  const lv = d.max_level || d.min_level || 1;
  const diff = d.difficulty || 1;
  const out = {
    exp: Math.floor(lv * 12 * diff),
    spiritStone: Math.floor(lv * 3 * diff)
  };
  // 轮45：少数副本给实物产出（items 为存档内物品 id），让"补定义"同时接上获取路径 ——
  // 材料只有采集/掉落/坊市/副本奖励等来源，才不算造出拿不到的死内容。
  if (Array.isArray(d.items) && d.items.length) out.items = d.items.slice();
  return out;
}

function ensureDungeons(db) {
  if (!db.dungeons) db.dungeons = [];
  const existing = new Set(db.dungeons.map(d => d.name));
  let added = 0;
  for (const def of DUNGEONS) {
    if (existing.has(def.name)) continue;
    const id = db.dungeons.length ? Math.max(...db.dungeons.map(d => Number(d.id) || 0)) + 1 : 1;
    db.dungeons.push({
      id, name: def.name, type: def.type, min_level: def.min_level, max_level: def.max_level,
      difficulty: def.difficulty, rewards: JSON.stringify(rewardsFor(def)), description: def.desc
    });
    added++;
  }
  return added;
}

module.exports = { DUNGEONS, ensureDungeons, rewardsFor };
