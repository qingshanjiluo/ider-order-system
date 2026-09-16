/**
 * 世界观锚点（P7 批2）
 *
 * 存在理由：传记与编年史此前只用「出身词库 × 灵根」，与游戏里的宗门/地图/境界
 * 毫无关系 —— 玩家读到的是通用鸡汤，不是**这个世界**的故事。
 * 本文件把世界锚点落成数据，供 chronicle 取用：
 *   REALMS_LORE   九境风物（每境的天地气象、修行体感）
 *   SECTS_LORE    宗门史（与 db.sect 的具名宗门对账）
 *   ERAS          纪元表（编年史按游戏年落纪元，让"第几年"有意义）
 *   WORLD_EVENTS  寰宇大事（与玩家境界/年份挂钩的机器可判定事件）
 *
 * 纪律：纯数据 + 纯函数；不写库、不依赖网络。所有文案不含现代词。
 */

/** 九境风物：境界名 → 该境的天地气象与修行体感 */
const REALMS_LORE = {
  '炼气': { air: '灵气如溪，初可引气入体', body: '骨节轻响，五感渐明', danger: '山野精怪亦能伤人' },
  '筑基': { air: '灵气如河，可自循环不息', body: '气沉丹田，夜可视物', danger: '散修劫道者渐多' },
  '金丹': { air: '灵气如潮，一呼一吸皆有灵韵', body: '内视丹田，可见金丹旋转', danger: '同阶相争，动辄伤及根本' },
  '元婴': { air: '灵气如海，举手投足引动风云', body: '元婴出窍，神游百里', danger: '金丹修士见之如见天堑' },
  '化神': { air: '天地灵气随念而动', body: '神识化形，可隔山感知敌意', danger: '寿元将尽者为此境厮杀最烈' },
  '炼虚': { air: '虚空之中亦有灵机可采', body: '身合虚空，瞬息千里', danger: '虚空乱流可撕碎元婴' },
  '合体': { air: '天地与我相合，一念可改一地气候', body: '法体合一，神与形不复分', danger: '出手即是天灾，凡人城池顷刻覆灭' },
  '大乘': { air: '灵气已不足供养，须自辟灵源', body: '举手投足皆合天道', danger: '天妒之，劫云常随其身' },
  '渡劫': { air: '天地已不容此身，处处皆是劫数', body: '每进一步，天雷加身', danger: '一步踏错，形神俱灭' }
};

/** 宗门史：与 db.sect 具名宗门对账（未建宗门前用通用史） */
const SECTS_LORE = {
  '青云宗': { era: '开派于中古·青元纪', creed: '剑气冲霄，宁折不弯', land: '青云山', trial: '入门需在问剑崖接下三剑' },
  '丹霞谷': { era: '开派于上古·丹元纪', creed: '一炉火，养天下人', land: '丹霞谷', trial: '入门需辨百草而不误' },
  '万兽门': { era: '开派于中古·荒元纪', creed: '与兽同契，不以力屈之', land: '万兽岭', trial: '入门需得一头灵兽自愿跟随' },
  '幽冥殿': { era: '开派于近古·幽元纪', creed: '生死之间，自有大道', land: '幽冥渊', trial: '入门需在尸山静坐七日' },
  '天机阁': { era: '开派于上古·天元纪', creed: '窥天一线，不敢尽言', land: '天机台', trial: '入门需推演自身死期而不惧' },
  '太虚剑派': { era: '开派于上古·太初纪', creed: '剑非凶器，乃天地之骨', land: '太虚峰', trial: '入门需一剑斩断自身执念' },
  '合欢宗': { era: '开派于中古·情元纪', creed: '情之所至，道之所生', land: '合欢林', trial: '入门需明心见性，不为情困' },
  '散修盟': { era: '结盟于近古·乱元纪', creed: '无门无派，亦可问道', land: '各地坊市', trial: '交一枚盟石即可' }
};

/** 纪元表：游戏年 → 纪元（24h = 10 游戏年，故一年 ≈ 2.4 真实小时） */
const ERAS = [
  { from: 0, name: '太初纪', note: '天地初开，灵气最盛，飞升者众' },
  { from: 300, name: '天元纪', note: '天机阁立，始有推演之法传世' },
  { from: 900, name: '丹元纪', note: '丹霞谷开派，丹道大兴，人寿得延' },
  { from: 1500, name: '荒元纪', note: '万兽岭群兽出山，人与兽约法三章' },
  { from: 2400, name: '幽元纪', note: '幽冥渊开，死者不入轮回，生者始惧死' },
  { from: 3600, name: '乱元纪', note: '宗门倾轧，散修结盟自保' },
  { from: 5200, name: '末法之兆', note: '天地灵气渐薄，渡劫者十不存一' }
];

/** 寰宇大事：可机器判定的世界事件（按境界/年份触发，编年史自动落条目） */
const WORLD_EVENTS = [
  { key: 'first_qi', realmAtLeast: 0, yearAtLeast: 1, title: '引气入体', text: '于{place}静坐三日，忽觉一缕清凉自百会而下——自此，凡骨初通灵。' },
  { key: 'sect_join', realmAtLeast: 1, yearAtLeast: 3, title: '宗门初立', text: '{sect}于{era}立下门规，广收门徒。你以{trial}入门，得赐道号。' },
  { key: 'beast_tide', realmAtLeast: 2, yearAtLeast: 1200, title: '兽潮过境', text: '万兽岭兽潮南侵，沿途七城尽毁。你于乱军中救下三名凡人孩童。' },
  { key: 'spirit_fade', realmAtLeast: 3, yearAtLeast: 3600, title: '灵气转薄', text: '天地灵气较三百年前淡了一分。老一辈修士说：末法之兆，已在眼前。' },
  { key: 'old_friend', realmAtLeast: 4, yearAtLeast: 2600, title: '故人凋零', text: '同年入门的三位道友，两人已坐化，一人不知所踪。你独自饮了一夜的酒。' },
  { key: 'void_crack', realmAtLeast: 5, yearAtLeast: 5200, title: '虚空裂缝', text: '天穹裂开一道细缝，其中传出不属于此界的低语。有修士探入，再未归来。' },
  { key: 'heaven_gate', realmAtLeast: 8, yearAtLeast: 8000, title: '天门将启', text: '劫云自九霄垂下，遮天蔽日。你知天门将启，而此身已不容于天地。' }
];

/** 取某境界的风物（未收录时给通用描述，不返回 undefined） */
function loreForRealm(realmName) {
  return REALMS_LORE[realmName] || { air: '天地灵气流转不息', body: '气息绵长，已非凡俗', danger: '修行路上，处处是关' };
}

/** 取宗门史（未收录给通用史） */
function loreForSect(sectName) {
  return SECTS_LORE[sectName] || { era: '立派年月已不可考', creed: '道法自然，各修其道', land: '山门深处', trial: '行三拜九叩之礼' };
}

/** 游戏年 → 纪元 */
function eraForYear(gameYear) {
  let cur = ERAS[0];
  for (const e of ERAS) if (gameYear >= e.from) cur = e;
  return cur;
}

/** 玩家当前该出现的世界事件（按境界与年份筛选，供编年史挂载） */
function worldEventsFor(realmIndex, gameYear) {
  return WORLD_EVENTS.filter((e) => realmIndex >= e.realmAtLeast && gameYear >= e.yearAtLeast);
}

/** 渲染世界事件文案（占位符替换为真实世界状态，缺项用兜底） */
function renderWorldEvent(ev, ctx = {}) {
  return (ev.text || '')
    .replace(/\{place\}/g, ctx.place || '无名山谷')
    .replace(/\{sect\}/g, ctx.sect || '一处无名宗门')
    .replace(/\{era\}/g, ctx.era || '某个纪元')
    .replace(/\{trial\}/g, ctx.trial || '一桩试炼');
}

module.exports = {
  REALMS_LORE, SECTS_LORE, ERAS, WORLD_EVENTS,
  loreForRealm, loreForSect, eraForYear, worldEventsFor, renderWorldEvent
};
