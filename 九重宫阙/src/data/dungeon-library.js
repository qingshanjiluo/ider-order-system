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
  { name: '天道试炼场', type: '天劫', min_level: 95, max_level: 100, difficulty: 5.0, desc: '天道亲自设局，试炼飞升之资' }
];

function rewardsFor(d) {
  const lv = d.max_level || d.min_level || 1;
  const diff = d.difficulty || 1;
  return {
    exp: Math.floor(lv * 12 * diff),
    spiritStone: Math.floor(lv * 3 * diff)
  };
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
