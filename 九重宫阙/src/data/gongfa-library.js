/**
 * 功法藏书阁库（内容富集三期 · P1 T1-2 轮46 扩充）
 * 18 NPC 宗门 × 4 门宗门功法（2修炼+2战斗，可升级/不可升级混合）= 72
 * + 10 门传承/副本/机遇功法 + 48 门藏经阁/秘境/传承/机遇/仙源典籍 = **130 门**（P1 目标 82->130）
 * 每门功法：适用境界 realm/realm_level、可升级 upgradeable、元素亲和、品阶数值。
 * 可达性口径（轮46 定的，别改回去）：sect_key 非空 -> 由 sect-library.ensureGongfaShelves 铺进
 * 该宗门藏书阁，弟子以贡献 learn() 换得；sect_key 为空 -> 同一道工序物化成 items 并挂坊市具名货架。
 * 两条路都是"具名"路径，因此 scripts/ref-integrity.js 的获取路经覆盖得到；只是"生成随机功法"
 * （itemService.generateGongfa）不算：它造的是另一批临时名字，覆盖不到这里的任何一条定义。
 */

const REALM_LEVELS = ['炼气期', '筑基期', '金丹期', '元婴期', '化神期', '炼虚期', '合体期', '大乘期', '渡劫期'];
const realmLevel = (r) => Math.max(0, REALM_LEVELS.indexOf(r));

const SECT_FOCUS_ELEMENT = {
  feiyu: 'metal', lingxiao: 'light', changqing: 'wood', jiqiao: 'metal',
  xuanwu: 'earth', qingzhu: 'wood', tongxuan: 'none', hehuan: 'dark',
  xuesha: 'dark', bailian: 'fire', diyuan: 'earth', anye: 'metal',
  youming: 'dark', wandu: 'water', wanjie: 'none', feisheng: 'wood',
  wuxing: 'earth', tianchao: 'light'
};

// [key, 门派简称, [ [功法名, 类型, 品阶, 适用境界, 可升级] × 4 ] ]
const SECT_TABLE = [
  ['feiyu', '飞羽', [['青锋引灵诀', '修炼', '黄阶', '炼气期', true], ['飞羽剑罡', '战斗', '玄阶', '炼气期', true], ['百步飞剑典', '战斗', '地阶', '筑基期', true], ['羽化登锋诀', '战斗', '天阶', '金丹期', false]]],
  ['lingxiao', '凌霄', [['凌霄聚气诀', '修炼', '黄阶', '炼气期', true], ['霄汉法言', '战斗', '玄阶', '炼气期', true], ['九霄雷引', '战斗', '地阶', '筑基期', true], ['凌霄宝箓', '修炼', '天阶', '金丹期', false]]],
  ['changqing', '长青', [['长青木养诀', '修炼', '黄阶', '炼气期', true], ['青藤缠丝手', '战斗', '玄阶', '炼气期', true], ['万木回春功', '修炼', '地阶', '筑基期', true], ['长青不老典', '修炼', '天阶', '金丹期', false]]],
  ['jiqiao', '机巧', [['机枢淬体篇', '修炼', '黄阶', '炼气期', true], ['巧匠千机手', '战斗', '玄阶', '炼气期', true], ['自影傀儡术', '战斗', '地阶', '筑基期', true], ['天工造物典', '修炼', '天阶', '金丹期', false]]],
  ['xuanwu', '玄武', [['玄武镇岳功', '修炼', '黄阶', '炼气期', true], ['玄龟负山劲', '战斗', '玄阶', '炼气期', true], ['不动如山诀', '修炼', '地阶', '筑基期', true], ['玄武霸体', '战斗', '天阶', '金丹期', false]]],
  ['qingzhu', '青竹', [['驭兽通灵诀', '修炼', '黄阶', '炼气期', true], ['竹影兽牙击', '战斗', '玄阶', '炼气期', true], ['万兽朝宗', '战斗', '地阶', '筑基期', true], ['青竹化实篇', '修炼', '天阶', '金丹期', false]]],
  ['tongxuan', '通玄', [['通玄坐忘篇', '修炼', '黄阶', '炼气期', true], ['玄光道引', '战斗', '玄阶', '炼气期', true], ['大道推演术', '修炼', '地阶', '筑基期', true], ['通玄化境典', '修炼', '天阶', '金丹期', false]]],
  ['hehuan', '合欢', [['合欢凝魄诀', '修炼', '黄阶', '炼气期', true], ['摄魂夺魄指', '战斗', '玄阶', '炼气期', true], ['醉梦迷仙曲', '战斗', '地阶', '筑基期', true], ['合欢大治篇', '修炼', '天阶', '金丹期', false]]],
  ['xuesha', '血煞', [['血煞炼身诀', '修炼', '黄阶', '炼气期', true], ['血影噬魂爪', '战斗', '玄阶', '炼气期', true], ['煞血焚天功', '战斗', '地阶', '筑基期', true], ['血神解体典', '战斗', '天阶', '金丹期', false]]],
  ['bailian', '百炼', [['百炼淬金诀', '修炼', '黄阶', '炼气期', true], ['炼狱火莲印', '战斗', '玄阶', '炼气期', true], ['千锤百炼身', '修炼', '地阶', '筑基期', true], ['百炼焚世典', '战斗', '天阶', '金丹期', false]]],
  ['diyuan', '地渊', [['地渊负重诀', '修炼', '黄阶', '炼气期', true], ['渊魔裂地拳', '战斗', '玄阶', '炼气期', true], ['厚土魔功', '修炼', '地阶', '筑基期', true], ['地渊镇魔体', '战斗', '天阶', '金丹期', false]]],
  ['anye', '暗夜', [['暗夜藏锋诀', '修炼', '黄阶', '炼气期', true], ['夜刃斩魄刀', '战斗', '玄阶', '炼气期', true], ['影杀七绝斩', '战斗', '地阶', '筑基期', true], ['暗夜无声典', '战斗', '天阶', '金丹期', false]]],
  ['youming', '幽冥', [['幽冥潜行篇', '修炼', '黄阶', '炼气期', true], ['冥河刺', '战斗', '玄阶', '炼气期', true], ['幽泉鬼爪功', '战斗', '地阶', '筑基期', true], ['幽冥度魂典', '修炼', '天阶', '金丹期', false]]],
  ['wandu', '万毒', [['万毒凝功诀', '修炼', '黄阶', '炼气期', true], ['腐骨毒烟瘴', '战斗', '玄阶', '炼气期', true], ['百毒噬心功', '战斗', '地阶', '筑基期', true], ['万毒真经', '修炼', '天阶', '金丹期', false]]],
  ['wanjie', '万界', [['万界通商诀', '修炼', '黄阶', '炼气期', true], ['锱铢必较掌', '战斗', '玄阶', '炼气期', true], ['万宝聚财功', '修炼', '地阶', '筑基期', true], ['万界行商典', '修炼', '天阶', '金丹期', false]]],
  ['feisheng', '飞升', [['飞升蓄灵诀', '修炼', '黄阶', '炼气期', true], ['蛊引缠身术', '战斗', '玄阶', '炼气期', true], ['万蛊噬天阵', '战斗', '地阶', '筑基期', true], ['飞升蝉蜕篇', '修炼', '天阶', '金丹期', false]]],
  ['wuxing', '五行', [['五行周天诀', '修炼', '黄阶', '炼气期', true], ['五行轮转印', '战斗', '玄阶', '炼气期', true], ['相生相克功', '修炼', '地阶', '筑基期', true], ['五行大遁典', '战斗', '天阶', '金丹期', false]]],
  ['tianchao', '天朝', [['天朝气魄诀', '修炼', '黄阶', '炼气期', true], ['圣威天压掌', '战斗', '玄阶', '炼气期', true], ['人道皇极功', '修炼', '地阶', '筑基期', true], ['天朝镇国典', '战斗', '天阶', '金丹期', false]]]
];

// 传承/副本/机遇功法（非宗门来源，作为掉落与机缘产物）
const LEGACY_TABLE = [
  ['上古传承·太初引气诀', '传承', '修炼', '玄阶', '炼气期', true, 'wood'],
  ['上古传承·战神图录', '传承', '战斗', '地阶', '筑基期', true, 'metal'],
  ['剑冢遗篇·万剑朝宗', '传承', '战斗', '圣阶', '元婴期', false, 'metal'],
  ['副本秘藏·幽泉冰髓功', '副本', '修炼', '地阶', '筑基期', true, 'water'],
  ['副本秘藏·焚世魔功', '副本', '战斗', '天阶', '金丹期', true, 'fire'],
  ['机遇·天雷淬体篇', '机遇', '修炼', '地阶', '筑基期', true, 'metal'],
  ['机遇·造化玄光', '机遇', '战斗', '天阶', '金丹期', false, 'light'],
  ['传承·周天星斗大阵诀', '传承', '战斗', '圣阶', '元婴期', true, 'none'],
  ['机遇·混沌养神篇', '机遇', '修炼', '天阶', '金丹期', true, 'none'],
  ['传承·太上忘情录', '传承', '修炼', '仙阶', '化神期', false, 'none']
];

const QUALITY_NUM = { 黄阶: 0, 玄阶: 1, 地阶: 2, 天阶: 3, 圣阶: 4, 仙阶: 5 };

// ---- P1 T1-2 · 轮46：功法 82 -> 130（+48）----
// 全部为非宗门典籍（sect_key=null），由 services/sect-library.js 的 ensureGongfaShelves 物化成
// items(type='功法') 并挂上坊市具名货架 —— 因为 POST /gongfa/equip 只认"背包里一件 type='功法' 的物品"，
// 定义不落成可获得物品，db.gongfa 就永远是 0 行（轮46 实测：扩口径审计显示 功法 3/69 有获取路径）。
// 形状与 LEGACY_TABLE 同构：[名称, 来源, 类型, 品阶, 适用境界, 可升级, 元素]
const SHELF_TABLE = [
  // 黄阶 9：坊市常备的入门典籍
  ['引气归元诀', '藏经阁', '修炼', '黄阶', '炼气期', true, 'wood'],
  ['吐纳大略', '藏经阁', '修炼', '黄阶', '炼气期', true, 'water'],
  ['周天坐忘功', '藏经阁', '修炼', '黄阶', '炼气期', false, 'none'],
  ['淬体十三式', '藏经阁', '战斗', '黄阶', '炼气期', true, 'earth'],
  ['青萍剑理', '藏经阁', '战斗', '黄阶', '筑基期', true, 'metal'],
  ['断水刀法', '藏经阁', '战斗', '黄阶', '筑基期', true, 'water'],
  ['伏虎拳经', '藏经阁', '战斗', '黄阶', '筑基期', false, 'earth'],
  ['萍踪步', '藏经阁', '战斗', '黄阶', '炼气期', true, 'wood'],
  ['清明安神篇', '藏经阁', '修炼', '黄阶', '筑基期', true, 'light'],
  // 玄阶 9
  ['紫霄御剑篇', '藏经阁', '战斗', '玄阶', '筑基期', true, 'metal'],
  ['寒潭映月功', '藏经阁', '修炼', '玄阶', '筑基期', true, 'water'],
  ['赤霄焚诀', '藏经阁', '战斗', '玄阶', '金丹期', true, 'fire'],
  ['厚土扛山势', '藏经阁', '战斗', '玄阶', '金丹期', false, 'earth'],
  ['听雷辨器术', '藏经阁', '战斗', '玄阶', '金丹期', true, 'metal'],
  ['流云幻身法', '藏经阁', '战斗', '玄阶', '筑基期', true, 'wood'],
  ['百禽语', '藏经阁', '修炼', '玄阶', '金丹期', true, 'wood'],
  ['玄冰护体神功', '藏经阁', '修炼', '玄阶', '元婴期', true, 'water'],
  ['星夜行气篇', '藏经阁', '修炼', '玄阶', '元婴期', false, 'dark'],
  // 地阶 9
  ['大衍神诀', '传承', '修炼', '地阶', '元婴期', true, 'none'],
  ['青莲剑歌', '传承', '战斗', '地阶', '元婴期', true, 'wood'],
  ['太阳真火经', '传承', '战斗', '地阶', '化神期', true, 'fire'],
  ['太阴炼形诀', '传承', '修炼', '地阶', '化神期', true, 'water'],
  ['山河社稷功', '秘境', '修炼', '地阶', '化神期', false, 'earth'],
  ['天魔幻剑诀', '秘境', '战斗', '地阶', '炼虚期', true, 'dark'],
  ['五岳真形图', '秘境', '修炼', '地阶', '炼虚期', true, 'earth'],
  ['沧海回澜手', '机遇', '战斗', '地阶', '炼虚期', true, 'water'],
  ['九霄云外身', '机遇', '战斗', '地阶', '合体期', false, 'metal'],
  // 天阶 9
  ['太乙青索剑典', '传承', '战斗', '天阶', '合体期', true, 'metal'],
  ['两仪微尘功', '传承', '修炼', '天阶', '合体期', true, 'none'],
  ['八荒归元经', '传承', '修炼', '天阶', '大乘期', true, 'earth'],
  ['九天十地伏魔篇', '秘境', '战斗', '天阶', '大乘期', true, 'light'],
  ['洛书天章', '秘境', '修炼', '天阶', '大乘期', false, 'water'],
  ['昆仑镇狱劲', '秘境', '战斗', '天阶', '渡劫期', true, 'earth'],
  ['北冥吞海诀', '机遇', '修炼', '天阶', '渡劫期', true, 'water'],
  ['南明离火真解', '机遇', '战斗', '天阶', '渡劫期', true, 'fire'],
  ['太虚御空经', '机遇', '战斗', '天阶', '渡劫期', false, 'none'],
  // 圣阶 6
  ['时间逆鳞功', '秘境', '修炼', '圣阶', '渡劫期', true, 'none'],
  ['虚空藏身法', '秘境', '战斗', '圣阶', '渡劫期', true, 'dark'],
  ['盘古精血淬身', '传承', '修炼', '圣阶', '渡劫期', true, 'earth'],
  ['女娲造化学经', '传承', '修炼', '圣阶', '渡劫期', false, 'wood'],
  ['一气化三清', '传承', '战斗', '圣阶', '渡劫期', true, 'none'],
  ['鸿蒙紫气篇', '机遇', '修炼', '圣阶', '渡劫期', true, 'light'],
  // 仙阶 6
  ['无极归墟经', '仙源', '修炼', '仙阶', '渡劫期', true, 'water'],
  ['造化天书', '仙源', '修炼', '仙阶', '渡劫期', false, 'none'],
  ['混洞金章', '仙源', '战斗', '仙阶', '渡劫期', true, 'metal'],
  ['长生久视篇', '仙源', '修炼', '仙阶', '渡劫期', true, 'wood'],
  ['道藏真解', '仙源', '战斗', '仙阶', '渡劫期', true, 'light'],
  ['太上丹经', '仙源', '修炼', '仙阶', '渡劫期', false, 'fire']
];

function statsFor(quality, type, element) {
  const qi = QUALITY_NUM[quality];
  return {
    cultivation_speed: Number((1 + qi * 0.12).toFixed(3)),
    skill_damage: Number((1 + qi * 0.18).toFixed(3)),
    element,
    element_boost: Number((qi * 0.05).toFixed(3))
  };
}

function buildLibrary() {
  const out = [];
  for (const [key, short, list] of SECT_TABLE) {
    const element = SECT_FOCUS_ELEMENT[key];
    list.forEach(([name, type, quality, realm, upgradeable], i) => {
      out.push({
        id: `gongfa_${key}_${i + 1}`,
        sect_key: key,
        name,
        kind: '功法',
        type,
        quality,
        realm,
        realm_level: realmLevel(realm),
        upgradeable,
        element,
        source: 'sect',
        stats: statsFor(quality, type, element),
        desc: `${name}——${type}功法，适用境界：${realm}（${upgradeable ? '可升级' : '不可升级，唯有大机缘方可精进'}）`
      });
    });
  }
  for (const [name, source, type, quality, realm, upgradeable, element] of LEGACY_TABLE) {
    out.push({
      id: `gongfa_legacy_${out.length}`,
      sect_key: null,
      name,
      kind: '功法',
      type,
      quality,
      realm,
      realm_level: realmLevel(realm),
      upgradeable,
      element,
      source: source.toLowerCase(),
      stats: statsFor(quality, type, element),
      desc: `${name}——${source}所得${type}功法，适用境界：${realm}`
    });
  }
  // 轮46：藏经阁/秘境/传承/机遇/仙源典籍 +48（总数 82 -> 130，P1 差口达标）
  for (const [name, source, type, quality, realm, upgradeable, element] of SHELF_TABLE) {
    out.push({
      id: `gongfa_shelf_${out.length}`,
      sect_key: null,
      name,
      kind: '功法',
      type,
      quality,
      realm,
      realm_level: realmLevel(realm),
      upgradeable,
      element,
      source,
      stats: statsFor(quality, type, element),
      desc: `${name}——${source}所得${type}功法，适用境界：${realm}（${upgradeable ? '可升级' : '不可升级'}）`
    });
  }
  return out;
}

const GONGFA_LIBRARY = buildLibrary();

module.exports = { GONGFA_LIBRARY, REALM_LEVELS, realmLevel, SECT_FOCUS_ELEMENT };
