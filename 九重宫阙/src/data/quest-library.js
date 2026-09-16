/**
 * 剧情任务库（P7 批4 · 剧情故事层）
 *
 * ## 为什么单独建这个文件
 *
 * 此前 `src/routes/quests.js` 里硬编码 8 条任务，文案是机器模板：
 * 「斩妖除魔 / 击杀10只妖兽」「勤修苦练 / 战斗5次」——
 * 描述里没有世界、没有人物、没有前因后果，玩家读到的是**待办清单**而不是故事。
 *
 * 本文件把任务升级为**剧情单元**，每个任务带：
 *   chapter      所属卷（章节名 + 序），让任务是"某一卷里的一节"而非孤立条目
 *   giver        委托人（NPC 姓名 + 身份 + 所在处），任务有"谁托付的"
 *   brief        委托辞（NPC 原话，交代来龙去脉）
 *   stages[]     多阶段目标（每阶段带自己的过场文本），不再是"击杀 10 只"一锤子
 *   closing      交差辞（NPC 收到结果后的反应）
 *   epilogue     落幕后记（世界因此发生了什么变化 —— 让玩家看见自己的影响）
 *   loreHooks    挂接的世界观锚点（纪元/宗门/风物），由 world-lore.js 渲染
 *
 * ## 纪律
 *
 * 1. **纯数据 + 纯函数**，不写库、不依赖网络。
 * 2. **文案不含现代词**（与 world-lore.js 同一纪律）：不出现"系统/任务/点击/副本"等词，
 *    一律用世界内词汇（试炼、秘境、洞天、差事）。
 * 3. **引用的实体必须真实存在**：`target` 里的地图名/怪名/物品名要能在存档里找到，
 *    由 `scripts/test-quest-lore.js` 逐条对账（引用了不存在的地图就是断链）。
 * 4. **难度与境界对齐**：每个任务带 `realmFrom`/`realmTo`，恰好覆盖一条进度带，
 *    不出现"炼气期接到飞升级委托"。
 *
 * ## 结构总览（四卷 · 每卷五节）
 *
 *   卷一 · 问道（炼气~筑基）  入门、确立道心；教玩家基础循环（打怪、采集、炼器、拜宗）
 *   卷二 · 立身（金丹~元婴）  在宗门与坊市之间站稳；引入势力、丹道、兽契
 *   卷三 · 问心（化神~合体）  面对寿元与选择；引入幽冥、剑冢、虚空等沉重题材
 *   卷四 · 逆天（大乘~飞升）  渡劫与末法；收束全篇，给玩家一个"此界将倾"的终局感
 */

/** 目标类型 → 人类可读的进度单位（前端与后端共用，避免各写一份） */
const OBJECTIVE_UNITS = {
  kill: '头',
  dungeon: '次',
  level: '级',
  checkin: '日',
  battle: '场',
  gather: '次',
  craft: '件',
  guild: '次',
  explore: '处',
  alchemy: '炉',
  forge: '次',
  tribulation: '重',
  talk: '位',
  collect: '件'
};

/** 目标类型 → 动词（前端拼句子用） */
const OBJECTIVE_VERBS = {
  kill: '讨伐',
  dungeon: '通关',
  level: '修至',
  checkin: '静修签到',
  battle: '历练',
  gather: '采集',
  craft: '炼制',
  guild: '宗门',
  explore: '探明',
  alchemy: '开炉',
  forge: '锻造',
  tribulation: '渡',
  talk: '拜访',
  collect: '凑齐'
};

const QUESTS = [
  // ==================== 卷一 · 问道（炼气 ~ 筑基） ====================
  {
    id: 'v1_01_first_breath',
    name: '一缕清风的来处',
    type: 'main',
    chapter: { volume: 1, title: '卷一 · 问道', order: 1 },
    realmFrom: '炼气', realmTo: '炼气',
    giver: { name: '守山老人', title: '青云山麓的看林人', place: '青云山麓' },
    brief: '「你也是来寻那缕风的？」老人把扫帚靠在松树上，「三日前起，山麓的灵兔忽然都往山脊跑，连土拨鼠都弃了洞。活了八十年，我没见过这般光景——你去看看，它们躲的是什么。」',
    stages: [
      { text: '山麓的灵兔跑得反常，先跟着它们的踪迹走一程。', objectives: [{ type: 'kill', target: '灵兔', current: 0, required: 3 }] },
      { text: '土拨鼠弃洞而走，洞边土色发黑——底下似有东西。', objectives: [{ type: 'gather', target: '青云山麓', current: 0, required: 2 }] }
    ],
    closing: '老人捻起草叶下那点黑土，嗅了嗅，脸色变了：「这是尸气。山麓底下压着一座旧墓，怕是松动了。」',
    epilogue: '青云山麓的动物渐渐回巢，但老人每日多绕山走一圈。他说：得看着点。',
    rewards: { exp: 120, spirit_stone: 30, items: [{ name: '回灵丹', count: 3 }] },
    loreHooks: { era: true, realm: '炼气' }
  },
  {
    id: 'v1_02_sect_gate',
    name: '问剑崖下三剑',
    type: 'main',
    chapter: { volume: 1, title: '卷一 · 问道', order: 2 },
    realmFrom: '炼气', realmTo: '筑基',
    giver: { name: '执剑弟子 沈砚', title: '青云宗外门执事', place: '青云山麓' },
    brief: '「宗门收人，不问出身，只问能不能接下三剑。」沈砚把剑往地上一顿，「不过今年不同——青云山麓出了尸气，掌门说先清了三处，再谈入门。你想进门，就先做这件事。」',
    stages: [
      { text: '山麓外沿的妖兽被尸气催得凶躁，先清出一片干净地。', objectives: [{ type: 'kill', target: '妖兽森林', current: 0, required: 8 }] },
      { text: '尸气源头在旧墓方向，入穴探一次。', objectives: [{ type: 'dungeon', target: '妖兽洞穴', current: 0, required: 1 }] },
      { text: '清完三处，回问剑崖受剑。修至可承剑之体。', objectives: [{ type: 'level', target: 'level', current: 0, required: 10 }] }
    ],
    closing: '沈砚收剑入鞘：「三剑你只接了两剑——第三剑，等你哪天想明白为何执剑，再来。」',
    epilogue: '你成了青云宗外门弟子。名册上添了一行，墨迹未干。',
    rewards: { exp: 400, spirit_stone: 80, items: [{ name: '疗伤丹', count: 5 }] },
    loreHooks: { sect: '青云宗', era: true }
  },
  {
    id: 'v1_03_herb_debt',
    name: '药王谷的欠账',
    type: 'side',
    chapter: { volume: 1, title: '卷一 · 问道', order: 3 },
    realmFrom: '炼气', realmTo: '筑基',
    giver: { name: '药童 阿芷', title: '药王谷采药人', place: '药王谷' },
    brief: '「师父说，欠了人家的药得还。」阿芷把竹篓往你怀里一塞，「谷里的缠魂藤妖把药圃占了，我自己进不去。你帮我采够药，我分你一半——不，分你七成。」',
    stages: [
      { text: '药圃被缠魂藤妖盘住，先清出一条路。', objectives: [{ type: 'kill', target: '缠魂藤妖', current: 0, required: 5 }] },
      { text: '清完路，采足一篓药。', objectives: [{ type: 'gather', target: '药王谷', current: 0, required: 6 }] },
      { text: '药材须得成丹才算还清——开一炉。', objectives: [{ type: 'alchemy', target: 'alchemy', current: 0, required: 1 }] }
    ],
    closing: '阿芷数着丹药，忽然抬头：「你手上有茧，是拿剑的。可你肯蹲下来采药——师父说，这种人能走远。」',
    epilogue: '药王谷的药圃重新围上了篱笆。阿芷在篱边种了一株不知名的花。',
    rewards: { exp: 260, spirit_stone: 60, items: [{ name: '培元丹', count: 3 }] },
    loreHooks: { realm: '炼气' }
  },
  {
    id: 'v1_04_first_forge',
    name: '黄土坡的第一件法器',
    type: 'side',
    chapter: { volume: 1, title: '卷一 · 问道', order: 4 },
    realmFrom: '炼气', realmTo: '筑基',
    giver: { name: '散修 石老三', title: '黄土坡的游方匠人', place: '黄土坡' },
    brief: '「散修没宗门供着，第一件法器得自己挣。」石老三拍着铁砧，「黄土坡的沙狼皮厚，坡底石魈的骨硬。你凑齐料，我教你开炉——不收钱，就要你替我挡一挡坡上的旱魃幼体，那东西最近闹得凶。」',
    stages: [
      { text: '石老三开炉时最怕被打断，先清坡上的旱魃幼体。', objectives: [{ type: 'kill', target: '旱魃幼体', current: 0, required: 6 }] },
      { text: '石老三要的是沙狼皮与石魈骨，替他凑齐一份。', objectives: [{ type: 'gather', target: '黄土坡', current: 0, required: 8 }] },
      { text: '亲手开炉，锻出第一件法器。', objectives: [{ type: 'forge', target: 'forge', current: 0, required: 1 }] }
    ],
    closing: '石老三把新锻的器往水里一淬，白气蒸腾：「成了。记住了——器是死的，握器的手是活的。别学那些只认宝贝的。」',
    epilogue: '黄土坡多了个铁匠炉。路过的人都说，那炉火比别处旺。',
    rewards: { exp: 300, spirit_stone: 90, items: [{ name: '回灵丹', count: 5 }] },
    loreHooks: { era: true }
  },
  {
    id: 'v1_05_ghost_road',
    name: '旧道上不该有的脚印',
    type: 'side',
    chapter: { volume: 1, title: '卷一 · 问道', order: 5 },
    realmFrom: '筑基', realmTo: '筑基',
    giver: { name: '引路鬼差', title: '幽冥旧道的摆渡者', place: '幽冥旧道' },
    brief: '鬼差没有脸，声音却像极了你幼时的邻人：「这条道白日也有人走，可他们是死的。活着走上来的，三年里只你一个。」它侧身让开，「往前是幽冥地府。你要是敢去，就替我看看——为什么今年的游魂，不肯下去。」',
    stages: [
      { text: '旧道上的游魂堵了路，先送它们过去。', objectives: [{ type: 'kill', target: '旧道游魂', current: 0, required: 8 }] },
      { text: '往地府方向探一段，看看是什么拦着游魂。', objectives: [{ type: 'explore', target: '幽冥地府', current: 0, required: 1 }] },
      { text: '回到旧道口，把地府里立门的事告诉鬼差。', objectives: [{ type: 'talk', target: '引路鬼差', current: 0, required: 1 }] }
    ],
    closing: '鬼差沉默很久：「原来是有人在下头立了门。多谢你——我记着你的脚步声了，来日你走这条道时，我放你过去。」',
    epilogue: '幽冥旧道的风小了些。偶有夜行人说，见过一个没有脸的人在道口站着，像在等谁。',
    rewards: { exp: 420, spirit_stone: 110, items: [{ name: '传音符', count: 2 }] },
    loreHooks: { era: true, realm: '筑基' }
  },

  // ==================== 卷二 · 立身（金丹 ~ 元婴） ====================
  {
    id: 'v2_01_sword_tomb',
    name: '剑冢里的第七把断剑',
    type: 'main',
    chapter: { volume: 2, title: '卷二 · 立身', order: 1 },
    realmFrom: '金丹', realmTo: '金丹',
    giver: { name: '守墓人 韩七', title: '剑冢看守', place: '剑冢' },
    brief: '「这冢里埋了六把名剑，我守了四十年。」韩七用袖子擦着一块无字碑，「前日夜里，碑底下多出一把断剑——第七把。宗门里没人认，说是邪物。你去把它起出来，我看看是谁的。」',
    stages: [
      { text: '剑冢的守墓傀儡认生人，先制住它们。', objectives: [{ type: 'kill', target: '锈剑傀儡', current: 0, required: 10 }] },
      { text: '断剑认主，须以自身剑意引它出碑。', objectives: [{ type: 'battle', target: 'battle', current: 0, required: 12 }] },
      { text: '断剑已出碑，带回剑冢交给韩七看个明白。', objectives: [{ type: 'talk', target: '守墓人 韩七', current: 0, required: 1 }] }
    ],
    closing: '韩七捧着断剑看了半炷香，忽然跪了下去：「是太虚剑派上一代掌门的剑。他三百年前入虚空，再没回来——如今剑回来了，人没有。」',
    epilogue: '无字碑上多了一行小字：太虚剑派掌门之剑，未知其人。',
    rewards: { exp: 1200, spirit_stone: 320, items: [{ name: '青钢剑', count: 1 }] },
    loreHooks: { sect: '太虚剑派', era: true }
  },
  {
    id: 'v2_02_pill_fire',
    name: '一炉火，养天下人',
    type: 'main',
    chapter: { volume: 2, title: '卷二 · 立身', order: 2 },
    realmFrom: '金丹', realmTo: '元婴',
    giver: { name: '丹霞谷长老 苏九', title: '丹霞谷执炉长老', place: '药王谷' },
    brief: '「丹霞谷开派于丹元纪，门规只一句：一炉火，养天下人。」苏九把三味药摆在你面前，「可这百年，谷里的火一直不旺。我要一味镜心砂——它在玄武寒潭底，取的人十个里回来三个。你去不去？」',
    stages: [
      { text: '玄武寒潭的玄冰龟守着寒髓，先破其护。', objectives: [{ type: 'kill', target: '玄冰龟', current: 0, required: 8 }] },
      { text: '潭底取砂，须耐得住寒。', objectives: [{ type: 'collect', target: '镜心砂', current: 0, required: 3 }] },
      { text: '带回谷里，与苏九合开一炉。', objectives: [{ type: 'alchemy', target: 'alchemy', current: 0, required: 3 }] }
    ],
    closing: '炉火转青的那一夜，苏九没睡。他说：「镜心砂照的是人心。你能从潭底上来，说明心里还没结冰。」',
    epilogue: '丹霞谷的炉火自此常年不熄。谷口立了块新碑，刻着历代取砂者的名字——第十一行是你。',
    rewards: { exp: 1800, spirit_stone: 450, items: [{ name: '大疗伤丹', count: 2 }] },
    loreHooks: { sect: '丹霞谷', era: true }
  },
  {
    id: 'v2_03_beast_pact',
    name: '与兽同契',
    type: 'side',
    chapter: { volume: 2, title: '卷二 · 立身', order: 3 },
    realmFrom: '金丹', realmTo: '元婴',
    giver: { name: '驯兽师 乌娅', title: '万兽门巡山人', place: '神兽平原' },
    brief: '「万兽门的规矩：不以力屈兽。」乌娅按着一头受伤的青龙幼崽，「这头幼崽被猎户下了套，伤在右翼。它不让人靠近——你得先证明你不是猎人。」',
    stages: [
      { text: '猎户在平原边缘设了套，先拆了它们。', objectives: [{ type: 'explore', target: '神兽平原', current: 0, required: 3 }] },
      { text: '套边有护食的妖兽，清掉它们幼崽才敢动。', objectives: [{ type: 'kill', target: '神兽平原', current: 0, required: 15 }] },
      { text: '幼崽已能走动，把它送回万兽岭交给乌娅。', objectives: [{ type: 'talk', target: '驯兽师 乌娅', current: 0, required: 1 }] }
    ],
    closing: '幼崽在你手边睡着了。乌娅说：「它记住你了。万兽门的人不叫这个『契约』——我们叫『认得』。」',
    epilogue: '神兽平原的猎套被清了个干净。那年冬天，有人在岭上看见一头青龙盘旋。',
    rewards: { exp: 1500, spirit_stone: 380, items: [{ name: '妖兽内丹', count: 2 }] },
    loreHooks: { sect: '万兽门' }
  },
  {
    id: 'v2_04_market_ledger',
    name: '坊市里的一本坏账',
    type: 'side',
    chapter: { volume: 2, title: '卷二 · 立身', order: 4 },
    realmFrom: '金丹', realmTo: '元婴',
    giver: { name: '散修盟执事 老麦', title: '散修盟坊市管事', place: '妖兽森林' },
    brief: '「散修盟结盟于乱元纪，图的就是『无门无派也能活』。」老麦摊开一本账簿，「可这个月，坊市里三成的货对不上数。我老了，跑不动——你去各处走一趟，把账对上。」',
    stages: [
      { text: '货从妖兽森林出，先看看林子里出了什么事。', objectives: [{ type: 'kill', target: '妖兽森林', current: 0, required: 15 }] },
      { text: '沿商路把三处货栈都走一遍，记下实数。', objectives: [{ type: 'explore', target: '妖兽森林', current: 0, required: 3 }] },
      { text: '凑齐对账所需的册子与证物。', objectives: [{ type: 'collect', target: '妖兽森林', current: 0, required: 10 }] }
    ],
    closing: '老麦把账合上：「是内部人做的。我不报官——散修盟没有官。我把他的盟石收了，让他自己走。」',
    epilogue: '坊市的秤重新校了一遍。老麦在门口挂了块木牌：散修盟，不欺散修。',
    rewards: { exp: 1400, spirit_stone: 520, items: [{ name: '五行灵石', count: 3 }] },
    loreHooks: { sect: '散修盟', era: true }
  },
  {
    id: 'v2_05_void_whisper',
    name: '虚空里的低语',
    type: 'side',
    chapter: { volume: 2, title: '卷二 · 立身', order: 5 },
    realmFrom: '元婴', realmTo: '元婴',
    giver: { name: '天机阁推演士 柳无咎', title: '天机阁外派推演', place: '时空裂缝' },
    brief: '「天机阁窥天一线，不敢尽言。」柳无咎把一枚龟甲推给你，甲上裂纹正对东南，「三日前虚空裂缝开了道口子，里面有东西在说话。我听不懂——但龟甲裂了，说明它说的不是好话。」',
    stages: [
      { text: '裂缝外沿的时空乱流撕碎了不少修士，先清出一条路。', objectives: [{ type: 'kill', target: '时空裂缝', current: 0, required: 18 }] },
      { text: '贴身入缝，听清那些低语。', objectives: [{ type: 'explore', target: '时空裂缝', current: 0, required: 1 }] },
      { text: '把你在缝中听清的那两个字，带回天机台。', objectives: [{ type: 'talk', target: '天机阁推演士 柳无咎', current: 0, required: 1 }] }
    ],
    closing: '柳无咎听完，把龟甲收了：「你听到的是『末法』两个字。三百年来，阁里推演过七次，七次都是这两个字。」他顿了顿，「此事你不必再问。」',
    epilogue: '时空裂缝被天机阁以三座镇石封住。封石上无名，只有一道刻痕。',
    rewards: { exp: 2200, spirit_stone: 600, items: [{ name: '传音符', count: 3 }] },
    loreHooks: { sect: '天机阁', era: true }
  },

  {
    id: 'v2_06_sworn_kin',
    name: '结一份盟契',
    type: 'side',
    chapter: { volume: 2, title: '卷二 · 立身', order: 6 },
    realmFrom: '金丹', realmTo: '元婴',
    giver: { name: '散修 顾长宁', title: '无门无派的游方修士', place: '幽冥旧道' },
    brief: '「独行的修士死在半道上，连收尸的人都没有。」顾长宁把一枚盟石放在石头上，「我这一路死了三个同伴。如今想寻个去处——散修盟也好，哪处宗门也好。你若已在门中，替我引个路；你若也没有，那我们一道去。」',
    stages: [
      { text: '先替他清掉旧道上的游魂，才走得动。', objectives: [{ type: 'kill', target: '旧道游魂', current: 0, required: 12 }] },
      { text: '带着盟石去寻一处可落脚的门庭。', objectives: [{ type: 'guild', target: 'guild', current: 0, required: 1 }] },
      { text: '安顿下来，与他共饮一回。', objectives: [{ type: 'talk', target: '散修 顾长宁', current: 0, required: 1 }] }
    ],
    closing: '顾长宁把酒喝干：「我记下了。往后你若有难处，在旧道上喊我一声。」',
    epilogue: '旧道上多了一间草屋。屋前挂着块木牌，写着一个「顾」字。',
    rewards: { exp: 1600, spirit_stone: 400, items: [{ name: '五行灵石', count: 2 }] },
    loreHooks: { sect: '散修盟', era: true }
  },

  // ==================== 卷三 · 问心（化神 ~ 合体） ====================
  {
    id: 'v3_01_years_end',
    name: '寿元将尽的人',
    type: 'main',
    chapter: { volume: 3, title: '卷三 · 问心', order: 1 },
    realmFrom: '化神', realmTo: '化神',
    giver: { name: '老修士 陈无涯', title: '化神境散修', place: '雷鸣泽渊' },
    brief: '「我三千二百岁了。」陈无涯坐在泽边，雷暴在头顶滚了三天，「化神这一关，寿元将尽的人厮杀最烈——因为再进一步就能续命，退一步就是坐化。我不抢。我只是想找个人，把话说完。」',
    stages: [
      { text: '泽底雷兽日夜不歇，先镇住它们，泽面才静得下来。', objectives: [{ type: 'kill', target: '雷鸣泽渊', current: 0, required: 20 }] },
      { text: '听陈无涯讲完他三百年的旧事。', objectives: [{ type: 'talk', target: '老修士 陈无涯', current: 0, required: 1 }] },
      { text: '他的话里提了一处旧地，去替他看一眼。', objectives: [{ type: 'explore', target: '幽冥地府', current: 0, required: 1 }] }
    ],
    closing: '陈无涯听完你带回的话，笑了：「原来那棵松树还在。」当晚他坐化了，身周没有雷，只有一层薄薄的光。',
    epilogue: '雷鸣泽渊的雷暴歇了七日。有人说那是天地替一个人送行。',
    rewards: { exp: 4000, spirit_stone: 1000, items: [{ name: '五行灵石', count: 5 }] },
    loreHooks: { realm: '化神', era: true }
  },
  {
    id: 'v3_02_heart_demon',
    name: '无相幻境照心',
    type: 'main',
    chapter: { volume: 3, title: '卷三 · 问心', order: 2 },
    realmFrom: '化神', realmTo: '炼虚',
    giver: { name: '幻境守者 无名', title: '无相幻境看守', place: '无相幻境' },
    brief: '无名没有形体，声音像从你自己胸中传出：「境无所相，所遇皆是你自己的心魔与旧劫。进来的人，多半死在自己手里。」它停了停，「你要进，我不拦。只是提醒一句：里头那个『你』，比外头的你诚实。」',
    stages: [
      { text: '幻境先映出你杀过的东西，一一再战。', objectives: [{ type: 'battle', target: 'battle', current: 0, required: 25 }] },
      { text: '再往深处，是你没做过却想过的事——走完那一段。', objectives: [{ type: 'explore', target: '无相幻境', current: 0, required: 3 }] },
      { text: '破境之法不在力，在静。修至炼虚。', objectives: [{ type: 'level', target: 'level', current: 0, required: 55 }] }
    ],
    closing: '无名的声音最后一次响起：「你出来了。上一次有人出来，是四百年前。」',
    epilogue: '无相幻境依旧开着。境边多了一行不知谁刻的字：进来的人，请对自己诚实。',
    rewards: { exp: 6000, spirit_stone: 1500, items: [{ name: '星陨砂', count: 3 }] },
    loreHooks: { era: true }
  },
  {
    id: 'v3_03_ghost_debt',
    name: '幽冥殿的七日',
    type: 'side',
    chapter: { volume: 3, title: '卷三 · 问心', order: 3 },
    realmFrom: '化神', realmTo: '炼虚',
    giver: { name: '幽冥殿执事 玄鸦', title: '幽冥殿接引', place: '幽冥地府' },
    brief: '「幽冥殿立派于近古幽元纪，门规只有一条：生死之间，自有大道。」玄鸦指着殿后的石台，「入门试炼是尸山静坐七日。你要么坐满七日，要么现在就下山——不丢人，多数人都下山了。」',
    stages: [
      { text: '殿外的怨灵闻生人而来，先清干净才坐得住。', objectives: [{ type: 'kill', target: '怨灵', current: 0, required: 20 }] },
      { text: '坐足七日——以历练代日，其间不得停。', objectives: [{ type: 'battle', target: 'battle', current: 0, required: 30 }] },
      { text: '七日坐满，起身与玄鸦对答几句。', objectives: [{ type: 'talk', target: '幽冥殿执事 玄鸦', current: 0, required: 1 }] }
    ],
    closing: '玄鸦递来一盏冷茶：「七日里你睁了几次眼，我都记着。三次——比上一代执事少两次。」',
    epilogue: '幽冥殿的名册上添了一行。殿后石台上，多了一个坐痕。',
    rewards: { exp: 5500, spirit_stone: 1400, items: [{ name: '回城符', count: 5 }] },
    loreHooks: { sect: '幽冥殿', era: true }
  },
  {
    id: 'v3_04_formation_keystone',
    name: '五行轮台的大阵',
    type: 'side',
    chapter: { volume: 3, title: '卷三 · 问心', order: 4 },
    realmFrom: '炼虚', realmTo: '合体',
    giver: { name: '阵师 桑无衣', title: '五行轮台守阵人', place: '五行轮台' },
    brief: '「轮台底下压着一座大阵，五行之力交汇而生。」桑无衣绕着轮台走了一圈，「阵眼松了。松一分，此地的灵气就漏一分——漏到最后，这一带会变成死地。我要五色材料重铸阵眼。」',
    stages: [
      { text: '轮台五色材料随节气更替而出，先采齐。', objectives: [{ type: 'gather', target: '五行轮台', current: 0, required: 20 }] },
      { text: '阵眼外有守阵灵，须逐层破。', objectives: [{ type: 'kill', target: '五行轮台', current: 0, required: 25 }] },
      { text: '重铸阵眼，需亲自锻五次。', objectives: [{ type: 'forge', target: 'forge', current: 0, required: 5 }] }
    ],
    closing: '阵眼合上的那一刻，轮台五色齐亮。桑无衣长出一口气：「四百年了。我师父没做成，我师父的师父也没做成。」',
    epilogue: '五行轮台重新流转。周围百里草木，那年格外茂盛。',
    rewards: { exp: 8000, spirit_stone: 2000, items: [{ name: '紫晶砂', count: 5 }] },
    loreHooks: { era: true }
  },
  {
    id: 'v3_05_last_pill',
    name: '最后一炉丹',
    type: 'side',
    chapter: { volume: 3, title: '卷三 · 问心', order: 5 },
    realmFrom: '合体', realmTo: '合体',
    giver: { name: '丹霞谷谷主 苏未晞', title: '丹霞谷第三代谷主', place: '药王谷' },
    brief: '苏九的孙女把一封信放在你面前：「祖父坐化前留的。他说，若有一日谷中火要灭了，就请当年从寒潭底上来的人，替丹霞谷开最后一炉。」她抬头，「我不瞒你——这一炉未必成。」',
    stages: [
      { text: '炉材还缺三味，去赤霞洞与玄武寒潭各取一次。', objectives: [{ type: 'collect', target: '赤霞洞', current: 0, required: 12 }] },
      { text: '开炉。丹霞谷的火候，全靠这一手。', objectives: [{ type: 'alchemy', target: 'alchemy', current: 0, required: 8 }] },
      { text: '丹成之后，去苏九的旧位前说一声结果。', objectives: [{ type: 'talk', target: '丹霞谷谷主 苏未晞', current: 0, required: 1 }] }
    ],
    closing: '丹成九枚。苏未晞把其中一枚放进祖父的旧炉里：「这一枚不给人吃。留着，让后来的人知道，火没灭过。」',
    epilogue: '丹霞谷的火换了三代人守，仍未熄。谷志上记着：某年某月，炉火转赤，成丹九。',
    rewards: { exp: 9000, spirit_stone: 2400, items: [{ name: '洗髓丹', count: 5 }] },
    loreHooks: { sect: '丹霞谷', era: true }
  },

  // ==================== 卷四 · 逆天（大乘 ~ 飞升） ====================
  {
    id: 'v4_01_starfall',
    name: '坠落的星宫',
    type: 'main',
    chapter: { volume: 4, title: '卷四 · 逆天', order: 1 },
    realmFrom: '大乘', realmTo: '大乘',
    giver: { name: '拾荒者 郑九', title: '星宫遗墟的拾荒人', place: '星宫遗墟' },
    brief: '「十七年前，一座星宫从天上掉下来，砸进了这片废墟。」郑九用脚踢了踢一块泛着星光的碎石，「我在这儿捡了十七年，捡到的东西越来越怪——最近挖出来的矿，都带着混沌气。你要不要看看？不过得先替我清场，底下有东西醒了。」',
    stages: [
      { text: '遗墟深处的矿脉被谁挖开过，先清掉惊醒的东西。', objectives: [{ type: 'kill', target: '星宫遗墟', current: 0, required: 30 }] },
      { text: '矿脉里带混沌气的石头，取一批上来。', objectives: [{ type: 'gather', target: '星宫遗墟', current: 0, required: 25 }] },
      { text: '矿脉底部有字，探明究竟是什么星宫。', objectives: [{ type: 'explore', target: '星宫遗墟', current: 0, required: 5 }] }
    ],
    closing: '郑九看着你带回来的拓片，一个字一个字念：「太初纪，天门守宫，坠。」他搓了搓手，「太初纪的东西……那得是多少年前了？」',
    epilogue: '星宫遗墟被宗门接管。郑九得了块地，在废墟边上盖了间屋，不再拾荒。',
    rewards: { exp: 15000, spirit_stone: 4000, items: [{ name: '星陨砂', count: 5 }] },
    loreHooks: { era: true, realm: '大乘' }
  },
  {
    id: 'v4_02_demon_abyss',
    name: '魔气冲天的那些年',
    type: 'main',
    chapter: { volume: 4, title: '卷四 · 逆天', order: 2 },
    realmFrom: '大乘', realmTo: '渡劫',
    giver: { name: '镇魔军统领 裴烈', title: '魔道深渊镇守', place: '魔道深渊' },
    brief: '「魔道深渊的魔气这十年涨了三成。」裴烈按着刀，「镇魔军三万人，十年里折了八千。我不管你是什么来路——你既然是能站到这里的修士，就替我下去看看，那底下到底是什么在涨。」',
    stages: [
      { text: '深渊外沿的魔物成群涌上，先打退第一波。', objectives: [{ type: 'kill', target: '魔道深渊', current: 0, required: 35 }] },
      { text: '深入渊底，寻魔气源头。', objectives: [{ type: 'explore', target: '魔道深渊', current: 0, required: 6 }] },
      { text: '带着所见回来，与裴烈对答。', objectives: [{ type: 'talk', target: '镇魔军统领 裴烈', current: 0, required: 1 }] }
    ],
    closing: '裴烈听完，把刀收了：「你的意思是，那底下的东西不是在涨，是在『醒』。」他转身往营里走，「我得把这三万人撤回来。」',
    epilogue: '镇魔军撤了七成。深渊外立起九座镇石，铭文只有四个字：不得擅入。',
    rewards: { exp: 20000, spirit_stone: 5500, items: [{ name: '紫晶砂', count: 8 }] },
    loreHooks: { era: true }
  },
  {
    id: 'v4_03_fading_qi',
    name: '灵气转薄',
    type: 'side',
    chapter: { volume: 4, title: '卷四 · 逆天', order: 3 },
    realmFrom: '渡劫', realmTo: '渡劫',
    giver: { name: '天机阁阁主 柳听雪', title: '天机阁第七代阁主', place: '天界花园' },
    brief: '柳听雪把七枚龟甲一字排开，每一枚都裂着同样的纹：「三百年前我祖父推演过一次，说『末法』。二百年前我父亲推演过一次，还是『末法』。今年我推——仍是。」她看着你，「我的意思是：这三次推演之间，天地灵气少了整整一分。」',
    stages: [
      { text: '天界花园的光明之力是最后的净土，先守住它。', objectives: [{ type: 'kill', target: '天界花园', current: 0, required: 30 }] },
      { text: '沿天界花园走遍九处，记录灵气浓淡。', objectives: [{ type: 'explore', target: '天界花园', current: 0, required: 9 }] },
      { text: '把九处灵气浓淡的记录，一并交回天机台。', objectives: [{ type: 'talk', target: '天机阁阁主 柳听雪', current: 0, required: 1 }] }
    ],
    closing: '柳听雪看完记录，把龟甲一枚枚收进匣子里：「最薄的那一处，在仙界入口。也就是说，末法是从上头开始的。」她合上匣子，「此事不可外传。」',
    epilogue: '天机阁的推演台封了。封台那日，柳听雪独自在台上坐到天亮。',
    rewards: { exp: 28000, spirit_stone: 7000, items: [{ name: '五雷符', count: 8 }] },
    loreHooks: { sect: '天机阁', era: true }
  },
  {
    id: 'v4_04_ancient_field',
    name: '远古战场上的名字',
    type: 'side',
    chapter: { volume: 4, title: '卷四 · 逆天', order: 4 },
    realmFrom: '渡劫', realmTo: '渡劫',
    giver: { name: '碑匠 秦无咎', title: '远古战场刻碑人', place: '远古战场' },
    brief: '秦无咎在一块断碑前刻字，刻的是无名：「这片战场上死了多少人，没人说得清。我刻了六十年碑，刻的全是『无名』。」他放下刻刀，「前日战场东头塌了一角，露出底下一间石室。我进不去——你要是能进去，替我看看，里头有没有留下名字。」',
    stages: [
      { text: '战场上的远古之力化出形来，先破它们。', objectives: [{ type: 'kill', target: '远古战场', current: 0, required: 35 }] },
      { text: '石室有九重禁制，逐一解开。', objectives: [{ type: 'explore', target: '远古战场', current: 0, required: 9 }] },
      { text: '把石室里的名册带出来，交到秦无咎手上。', objectives: [{ type: 'talk', target: '碑匠 秦无咎', current: 0, required: 1 }] }
    ],
    closing: '秦无咎一页一页翻那册子，翻了整整一夜。天亮时他说：「三千七百个名字。够我刻到死了。」',
    epilogue: '远古战场东头立起一片碑林。碑上有名，碑前有花。',
    rewards: { exp: 30000, spirit_stone: 8000, items: [{ name: '造化灵石', count: 3 }] },
    loreHooks: { era: true }
  },
  {
    id: 'v4_05_heaven_gate',
    name: '天门将启',
    type: 'main',
    chapter: { volume: 4, title: '卷四 · 逆天', order: 5 },
    realmFrom: '飞升', realmTo: '飞升',
    giver: { name: '仙人跳涧的过客', title: '不知名的渡劫者', place: '仙人跳涧' },
    brief: '涧边坐着一个人，看不出年岁。他说：「一涧之隔便是仙界。九百年来，从这跳过去的人，我见过十一个——回来过一个。」他侧过脸，「那个回来的告诉我：上头空了。你要过去，我不拦；你要留下，我也不劝。」',
    stages: [
      { text: '涧壁石缝里的仙料，是过涧的唯一凭借，先取足。', objectives: [{ type: 'gather', target: '仙人跳涧', current: 0, required: 30 }] },
      { text: '过涧之前须应一场天劫——应得过，才谈得上过去。', objectives: [{ type: 'tribulation', target: 'tribulation', current: 0, required: 1 }] },
      { text: '过涧之前，先与涧边那人把话说完。', objectives: [{ type: 'talk', target: '仙人跳涧的过客', current: 0, required: 1 }] }
    ],
    closing: '那人站起来，朝涧对岸看了一眼：「你比他们多一样东西——你身后的那些人，你都记得。」他退开一步，「去吧。」',
    epilogue: '仙人跳涧的水声依旧。有人说看见一道身影过去了，也有人说没有。涧边多了一行字：来过，未过。',
    rewards: { exp: 50000, spirit_stone: 15000, items: [{ name: '造化灵石', count: 6 }] },
    loreHooks: { era: true, realm: '渡劫' }
  }
];

/** 日常差事（可重复；用世界内说法，不叫"每日任务"）
 *
 * ⚠ 这里刻意**不设境界闸**（日常差事本就人人可做），因此它也是"钩子覆盖"的兜底：
 *   level/checkin/guild 这类目标若只挂在剧情委托上，新号（炼气期）会因为境界不够而接不到，
 *   端到端钩子测试就会失去覆盖。所以每个有钩子的目标类型，日常里都留一条。
 */
const DAILY_CHORES = [
  { id: 'd_checkin', name: '静修一日', description: '于洞府静坐一日，观息自省', objectives: [{ type: 'checkin', target: 'checkin', current: 0, required: 1 }], rewards: { exp: 60, spirit_stone: 25, items: [] } },
  { id: 'd_battle', name: '演练道法', description: '与同门或妖兽演练数场，熟其手', objectives: [{ type: 'battle', target: 'battle', current: 0, required: 5 }], rewards: { exp: 120, spirit_stone: 35, items: [] } },
  { id: 'd_gather', name: '采药三回', description: '入山采药，补宗门药圃之缺', objectives: [{ type: 'gather', target: 'gather', current: 0, required: 3 }], rewards: { exp: 90, spirit_stone: 28, items: [] } },
  { id: 'd_forge', name: '开炉一次', description: '为宗门锻一件器物', objectives: [{ type: 'forge', target: 'forge', current: 0, required: 1 }], rewards: { exp: 150, spirit_stone: 45, items: [] } },
  { id: 'd_hunt', name: '清剿妖兽', description: '讨伐为害一方的妖兽', objectives: [{ type: 'kill', target: 'monster', current: 0, required: 10 }], rewards: { exp: 180, spirit_stone: 50, items: [] } },
  { id: 'd_dungeon', name: '探一处秘境', description: '入秘境探宝，磨砺己身', objectives: [{ type: 'dungeon', target: 'dungeon', current: 0, required: 2 }], rewards: { exp: 220, spirit_stone: 60, items: [] } },
  { id: 'd_sect', name: '寻一处门庭', description: '散修终须有去处，寻门入盟或立盟', objectives: [{ type: 'guild', target: 'guild', current: 0, required: 1 }], rewards: { exp: 200, spirit_stone: 55, items: [] } },
  { id: 'd_advance', name: '精进一级', description: '修行不辍，一级一级往上走', objectives: [{ type: 'level', target: 'level', current: 0, required: 1 }], rewards: { exp: 160, spirit_stone: 48, items: [] } }
];

/**
 * 卷一览（前端章节树用）。
 *
 * ⚠ 不在这里硬编码境界名数组：本仓有一条锁「境界顺序数组不得再有多份副本」，
 * 真源是 `src/config/balance.js` 的 REALM_ORDER。所以这里只给**序号区间**，
 * 由 `volumeRealmRange` 从真源换算成名字。
 */
const VOLUMES = [
  { volume: 1, title: '卷一 · 问道', note: '引气入体，初识此界', realmFrom: 0, realmTo: 1 },
  { volume: 2, title: '卷二 · 立身', note: '宗门与坊市之间，站稳脚跟', realmFrom: 2, realmTo: 3 },
  { volume: 3, title: '卷三 · 问心', note: '寿元、旧事与自己的心魔', realmFrom: 4, realmTo: 6 },
  { volume: 4, title: '卷四 · 逆天', note: '末法之兆与天门将启', realmFrom: 7, realmTo: 9 }
];

/** 取境界顺序真源（balance.REALM_ORDER）；拿不到时回退空数组，调用方须容忍 */
function realmOrder() {
  try { return require('../config/balance').REALM_ORDER || []; } catch (e) { return []; }
}

/** 某卷的境界区间（名字数组，从真源换算） */
function volumeRealmRange(v) {
  const order = realmOrder();
  if (!order.length) return [];
  const from = Number(v.realmFrom);
  const to = Number(v.realmTo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  return order.slice(from, to + 1);
}

/** 带上境界名的卷列表（前端与接口用） */
function volumesWithRealms() {
  return VOLUMES.map((v) => ({ ...v, realmRange: volumeRealmRange(v) }));
}

/** 全部任务（主线 + 支线），按卷与序排好 */
function allQuests() {
  return QUESTS.slice().sort((a, b) => (a.chapter.volume - b.chapter.volume) || (a.chapter.order - b.chapter.order));
}

/** 按 id 取任务定义 */
function questById(id) {
  return QUESTS.find((q) => q.id === id) || null;
}

/** 某境界能看到哪些任务（含该境界可用范围的） */
function questsForRealm(realmName, realmOrder) {
  const order = Array.isArray(realmOrder) ? realmOrder : [];
  const idx = order.indexOf(realmName);
  if (idx < 0) return allQuests();
  return allQuests().filter((q) => {
    const a = order.indexOf(q.realmFrom);
    const b = order.indexOf(q.realmTo);
    if (a < 0 || b < 0) return true;
    return idx >= Math.min(a, b) && idx <= Math.max(a, b);
  });
}

/** 渲染委托人一行（"青云宗外门执事 沈砚 · 青云山麓"） */
function giverLine(quest) {
  const g = quest && quest.giver;
  if (!g) return '';
  return [g.title, g.name].filter(Boolean).join(' ') + (g.place ? ' · ' + g.place : '');
}

/** 把 stage 的目标渲染成人话（"讨伐 灵兔 3 头"），供前端与接口共用 */
function renderObjective(obj) {
  const verb = OBJECTIVE_VERBS[obj.type] || '完成';
  const unit = OBJECTIVE_UNITS[obj.type] || '';
  const target = obj.target && obj.target !== 'monster' && obj.target !== 'battle' ? obj.target + ' ' : '';
  return `${verb} ${target}${obj.required}${unit}`.replace(/\s+/g, ' ').trim();
}

/**
 * 把任务定义展开成"角色实例"（接任务时落库的形态）。
 *
 * ⚠ **不变量**：`quest.objectives` 必须与 `quest.stages[quest.stageIndex].objectives`
 * **指向同一个数组**（不是内容相同的两份副本）。理由：旧前端与旧测试读 `objectives`，
 * 新逻辑与钩子读 `stages[].objectives`；若各存一份，就会出现"改了 required 不生效"
 * 或"判完成用的是旧值"这类查不出来的幽灵 bug。`applyProgress` 每推进一步会重新挂引用。
 */
function instantiate(quest, characterId, id) {
  const stages = quest.stages.map((s, i) => ({
    index: i,
    text: s.text,
    objectives: s.objectives.map((o) => ({ ...o }))
  }));
  return {
    id,
    character_id: characterId,
    quest_id: quest.id,
    name: quest.name,
    type: quest.type,
    description: quest.brief.slice(0, 60),
    chapter: quest.chapter.title,
    volume: quest.chapter.volume,
    order: quest.chapter.order,
    giver: giverLine(quest),
    giverName: quest.giver && quest.giver.name ? quest.giver.name : '',   // talk 目标靠它匹配（见 objectiveMatches）
    brief: quest.brief,
    closing: quest.closing,
    epilogue: quest.epilogue,
    stages,
    stageIndex: 0,
    objectives: stages[0].objectives,     // 兼容旧字段：当前阶段的目标
    rewards: { ...quest.rewards },
    status: 'active',
    accepted_at: Date.now(),
    completed_at: null
  };
}

/** 当前阶段是否已完成 */
function stageDone(quest) {
  const st = quest.stages && quest.stages[quest.stageIndex];
  if (!st) return false;
  return st.objectives.every((o) => o.current >= o.required);
}

/** 全部阶段是否已完成 */
function allStagesDone(quest) {
  if (!quest.stages) return true;
  return quest.stages.every((st) => st.objectives.every((o) => o.current >= o.required));
}

/** 通配 target：这些写法表示"任何该类型的行为都算" */
const WILDCARD_TARGETS = new Set(['', 'monster', 'battle', 'gather', 'dungeon', 'checkin', 'forge', 'craft', 'level', 'guild', 'alchemy', 'tribulation', 'explore', 'collect', 'talk', 'any']);

/**
 * 目标的 `target` 是否与本次上报的 context 匹配。
 *
 * 三种情况（见 `src/routes/quests.js` 的 updateQuestProgress 文档）：
 *   1. target 是通配词 → 命中
 *   2. context 里任一声明的名字等于 target → 命中
 *   3. context 缺失 → 只命中通配（**故意严格**：宁可少推也不要错推，
 *      否则"讨伐灵兔"会被杀旱魃刷满）
 *
 * @param {{type:string,target:string}} obj
 * @param {string} objectiveType 本次上报的类型
 * @param {object} [context] { monster, map, item, dungeon, npc, realm }
 */
function objectiveMatches(obj, objectiveType, context) {
  if (!obj || obj.type !== objectiveType) return false;
  const tg = String(obj.target == null ? '' : obj.target).trim();
  // 1) 通配：空、类型同名、或显式通配词
  if (WILDCARD_TARGETS.has(tg) || tg === objectiveType) return true;
  // 3) 没有 context：不猜
  if (!context || typeof context !== 'object') return false;
  // 2) 与 context 里声明的任一实体名比对
  for (const k of ['monster', 'map', 'item', 'dungeon', 'npc', 'realm']) {
    const v = context[k];
    if (v == null) continue;
    if (Array.isArray(v)) { if (v.some((x) => String(x) === tg)) return true; }
    else if (String(v) === tg) return true;
  }
  return false;
}

/**
 * 上报进度 —— 只推进**当前阶段**（防止玩家一路推图时把后续阶段的计数也提前刷满），
 * 且只推进与 context 匹配的目标（防止"讨伐灵兔"被别的怪刷满）。
 *
 * @returns {{advanced:boolean, finished:boolean, stageIndex:number, gained:number}}
 */
function applyProgress(quest, objectiveType, increment, context) {
  const before = quest.stageIndex;
  let advanced = false;
  let gained = 0;
  let guard = 0;
  while (guard++ < 20) {
    const st = quest.stages && quest.stages[quest.stageIndex];
    if (!st) break;
    for (const o of st.objectives) {
      if (o.current >= o.required) continue;
      if (!objectiveMatches(o, objectiveType, context)) continue;
      const add = Math.min(o.current + increment, o.required) - o.current;
      if (add > 0) { o.current += add; gained += add; }
    }
    if (st.objectives.every((o) => o.current >= o.required)) {
      if (quest.stageIndex < quest.stages.length - 1) {
        quest.stageIndex++;
        advanced = true;
      } else break;
    } else break;
  }
  // 保持不变量：objectives 始终与当前阶段同引用
  quest.objectives = (quest.stages && quest.stages[quest.stageIndex]) ? quest.stages[quest.stageIndex].objectives : quest.objectives;
  return { advanced: advanced || quest.stageIndex !== before, finished: allStagesDone(quest), stageIndex: quest.stageIndex, gained };
}

module.exports = {
  QUESTS, DAILY_CHORES, VOLUMES, volumesWithRealms, volumeRealmRange, realmOrder,
  OBJECTIVE_UNITS, OBJECTIVE_VERBS,
  allQuests, questById, questsForRealm, giverLine, renderObjective,
  instantiate, stageDone, allStagesDone, applyProgress, objectiveMatches, WILDCARD_TARGETS,
};
