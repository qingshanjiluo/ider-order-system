/**
 * 地图图鉴（P1 T1-2 · 轮45：地图 20 -> 32）
 *
 * 落点选择：与 dungeon-library / monster-library 同构的"目录 + 幂等 ensure"形态，
 * 由 services/materials.js 的 ensureAll 在 boot 时统一执行（也可 npm run content:ensure 显式跑）。
 * 每条地图字段齐备，因为消费方各取一字段：
 *   cultivation.js      -> exp_per_second / spirit_stone_per_second（挂机修炼）
 *   routes/gathering.js -> gather_nodes（节点名必须是真实存在的材料，否则十边审计直接红）
 *   monster-library     -> monsters（见下方"为什么只引用既有怪"）
 *   battle/pet/skill    -> element（必须落在 MAP_ELEMENT 的 11 个键：木/火/冰/雷/暗/光/土/混沌/五行/仙/无；
 *                          注意词表里没有"金"，早期种子用过 金 属另一处历史债，本目录不新增）
 *
 * 为什么只引用既有怪，而不是让 ensureMonsters 合成新怪（轮45 实测后改的）：
 * 我第一版给每张新图配了 1 只未定义怪名，由 monster-library 自动合成 —— 结果 12 只合成怪相对
 * 各自境界池的既有中位只有 0.23~0.97 倍（无相心魔 4435 hp vs 飞升池中位 19061），因为它们走的是
 * monsterStatsFor 的线性式 (25 + lv*9) * difficulty，而存档既有怪是陡得多的曲线（要到 19061 得
 * difficulty≈22）。往小池（炼虚只有 6 只）里塞 2 只软怪还会把**中位数拉低**，使既有硬怪被动超出
 * "池内 ≤2 倍中位"的闸 —— 门禁就是这么红的。合成曲线偏软已登记给 P4（攻击模拟/sim-balance）；
 * 在它修好之前，本目录一律引用存档已有的怪，等级带与 hp 都按实测挑（引用既有怪不会改变池的 hp 多重集，
 * 所以那条锁不可能被本轮内容位移）。
 *
 * 幂等：以 name 为键，已存在则不改写（玩家可能正在用的地图参数不动）。
 */

// 12 张新地图：怪物三件套的 level_range 与地图等级带重叠，hp 落在同段既有怪的区间内
const MAPS = [
  {
    name: '黄土坡', element: '土', min_level: 8, max_level: 16, difficulty: 1.3, drop_rate: 1.1,
    exp_per_second: 12, spirit_stone_per_second: 3,
    monsters: ['岩石巨人', '蘑菇怪', '竹妖'],
    gather_nodes: ['碎石', '粗铁矿', '云母片'],
    description: '坡土深厚，散修常在此蹲守第一件法器'
  },
  {
    name: '药王谷', element: '木', min_level: 15, max_level: 24, difficulty: 1.5, drop_rate: 1.2,
    exp_per_second: 22, spirit_stone_per_second: 5,
    monsters: ['木灵', '树精', '花妖'],
    gather_nodes: ['灵草', '清心草', '碧灵藤', '龙须草'],
    description: '谷底药气蒸腾，是丹修采药的第一去处'
  },
  {
    name: '幽冥旧道', element: '暗', min_level: 15, max_level: 24, difficulty: 1.6, drop_rate: 1.2,
    exp_per_second: 20, spirit_stone_per_second: 4,
    monsters: ['幽冥鬼', '怨灵', '僵尸'],
    gather_nodes: ['紫猴花', '妖兽内丹', '玉髓芝'],
    description: '通往幽冥地府的旧道，白日亦有阴风'
  },
  {
    name: '剑冢', element: '土', min_level: 20, max_level: 26, difficulty: 1.8, drop_rate: 1.3,
    exp_per_second: 28, spirit_stone_per_second: 6,
    monsters: ['火焰蜥蜴王', '寒冰蝎', '岩浆巨人'],
    gather_nodes: ['赤铜矿', '寒铁矿', '玄铁'],
    description: '历代折剑埋骨之处，土中偶可掘出残锋'
  },
  {
    name: '赤霞洞', element: '火', min_level: 26, max_level: 38, difficulty: 2.1, drop_rate: 1.4,
    exp_per_second: 38, spirit_stone_per_second: 8,
    monsters: ['熔岩蛟龙', '岩浆兽', '火元素'],
    gather_nodes: ['火焰结晶', '火灵草', '朱砂', '炎阳花'],
    description: '洞口霞光赤红，火系材料与灵草并生'
  },
  {
    name: '玄武寒潭', element: '冰', min_level: 35, max_level: 44, difficulty: 2.5, drop_rate: 1.5,
    exp_per_second: 60, spirit_stone_per_second: 12,
    monsters: ['玄武幼崽', '寒冰蝎王', '冰晶鸟王'],
    gather_nodes: ['寒冰结晶', '冰晶矿', '太阴玄冰', '冰晶石'],
    description: '潭水压着千年寒髓，取冰晶者须耐得住冷'
  },
  {
    name: '雷鸣泽渊', element: '雷', min_level: 41, max_level: 50, difficulty: 2.8, drop_rate: 1.6,
    exp_per_second: 95, spirit_stone_per_second: 19,
    monsters: ['雷鳗', '雷鸟', '雷兽'],
    gather_nodes: ['雷电结晶', '雷霆结晶', '雷银', '精铁矿'],
    description: '泽底藏渊，雷暴日夜不歇，是炼雷器的唯一去处'
  },
  {
    name: '金光塔', element: '光', min_level: 55, max_level: 64, difficulty: 3.2, drop_rate: 1.8,
    exp_per_second: 150, spirit_stone_per_second: 30,
    monsters: ['天使', '光明精灵', '神圣巨龙'],
    gather_nodes: ['光明结晶', '星辰矿', '紫晶砂', '星陨砂'],
    description: '九层金塔，塔身每一级都刻着炼器方'
  },
  {
    name: '五行轮台', element: '五行', min_level: 60, max_level: 66, difficulty: 3.5, drop_rate: 1.9,
    exp_per_second: 200, spirit_stone_per_second: 40,
    monsters: ['闪电精灵', '五行精灵', '五行圣兽'],
    gather_nodes: ['五行草', '五行结晶', '大地结晶', '风灵结晶'],
    description: '五行轮转之台，五色材料随节气更替而出'
  },
  {
    name: '星宫遗墟', element: '混沌', min_level: 65, max_level: 74, difficulty: 4.0, drop_rate: 2.0,
    exp_per_second: 320, spirit_stone_per_second: 64,
    monsters: ['深渊恶魔', '暗影刺客', '虚空行者'],
    gather_nodes: ['混沌矿', '混沌结晶', '天外陨铁', '地髓乳'],
    description: '坠落星宫的残骸，混沌之气浸透矿脉'
  },
  {
    name: '仙人跳涧', element: '仙', min_level: 80, max_level: 90, difficulty: 4.6, drop_rate: 2.1,
    exp_per_second: 900, spirit_stone_per_second: 180,
    monsters: ['仙界守卫', '仙界使者', '时空守卫'],
    gather_nodes: ['仙灵草', '万年血参', '九幽寒髓', '涅槃火精'],
    description: '一涧之隔便是仙界，仙料在涧壁石缝里'
  },
  {
    name: '无相幻境', element: '无', min_level: 85, max_level: 94, difficulty: 5.0, drop_rate: 2.2,
    exp_per_second: 1400, spirit_stone_per_second: 280,
    monsters: ['时间旅者', '空间扭曲者', '虚空精灵'],
    gather_nodes: ['混沌土', '仙兽内丹', '远古妖丹'],
    description: '境无所相，所遇皆是修士自己的心魔与旧劫'
  }
];

function ensureMaps(db) {
  if (!db.maps) db.maps = [];
  const existing = new Set(db.maps.map((m) => String(m.name)));
  let added = 0;
  for (const def of MAPS) {
    if (existing.has(def.name)) continue;
    const id = db.maps.length ? Math.max(...db.maps.map((m) => Number(m.id) || 0)) + 1 : 1;
    db.maps.push({
      id,
      name: def.name,
      min_level: def.min_level,
      max_level: def.max_level,
      difficulty: def.difficulty,
      drop_rate: def.drop_rate,
      description: def.description,
      monsters: [...def.monsters],
      gather_nodes: [...def.gather_nodes],
      exp_per_second: def.exp_per_second,
      spirit_stone_per_second: def.spirit_stone_per_second,
      element: def.element
    });
    existing.add(def.name);
    added++;
  }
  return added;
}

module.exports = { MAPS, ensureMaps };
