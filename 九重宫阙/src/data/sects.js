/**
 * 宗门数据（阶段4 · 原始设定 03）
 * 18 个 NPC 宗门先行（第 19 席位 = 玩家创建/第三阵营，阶段4二期开放）
 * joinReq: minLevel 境界门槛 / minRoots 灵根数门槛（五行山=3）
 */
const SECTS = [
  // —— 正派（7）——
  { key: 'feiyu',    name: '飞羽门',   faction: '正派', school: '剑修', description: '剑意如羽，轻灵致远。正派剑修魁首。', joinReq: { minLevel: 5 },  gongfaFocus: 'sword' },
  { key: 'lingxiao', name: '凌霄阁',   faction: '正派', school: '法修', description: '法诀通天，雷法冠绝一方。', joinReq: { minLevel: 5 },  gongfaFocus: 'spell' },
  { key: 'changqing',name: '长青圣地', faction: '正派', school: '丹修', description: '丹道圣地，济世救人。', joinReq: { minLevel: 8 },  gongfaFocus: 'alchemy' },
  { key: 'jiqiao',   name: '机巧门',   faction: '正派', school: '器修', description: '机关巧械，炼器名门。', joinReq: { minLevel: 8 },  gongfaFocus: 'forge' },
  { key: 'xuanwu',   name: '玄武宗',   faction: '正派', school: '体修', description: '肉身成圣，玄武镇脉。', joinReq: { minLevel: 5 },  gongfaFocus: 'body' },
  { key: 'qingzhu',  name: '青竹兽门', faction: '正派', school: '兽修', description: '灵兽为伴，御兽称雄。', joinReq: { minLevel: 10 }, gongfaFocus: 'beast' },
  { key: 'tongxuan', name: '通玄道门', faction: '正派', school: '道',   description: '道法自然，清静无为。', joinReq: { minLevel: 15 }, gongfaFocus: 'dao' },
  // —— 魔教（7）——
  { key: 'hehuan',   name: '合欢宗',   faction: '魔教', school: '魅修', description: '魅术惑心，双修问道。', joinReq: { minLevel: 5 },  gongfaFocus: 'charm' },
  { key: 'xuesha',   name: '血煞盟',   faction: '魔教', school: '血道', description: '以血入道，杀伐果断。', joinReq: { minLevel: 8 },  gongfaFocus: 'blood' },
  { key: 'bailian',  name: '百炼宗',   faction: '魔教', school: '炼道', description: '百炼成魔，器毒双绝。', joinReq: { minLevel: 8 },  gongfaFocus: 'refine' },
  { key: 'diyuan',   name: '地渊魔门', faction: '魔教', school: '体修·土', description: '地渊深处，魔体如山。', joinReq: { minLevel: 10 }, gongfaFocus: 'earth' },
  { key: 'anye',     name: '暗夜门',   faction: '魔教', school: '刀修·金', description: '夜色为幕，一刀断金。', joinReq: { minLevel: 10 }, gongfaFocus: 'blade' },
  { key: 'youming',  name: '幽冥宗',   faction: '魔教', school: '暗系·刺杀', description: '幽冥索命，无影无踪。', joinReq: { minLevel: 12 }, gongfaFocus: 'dark' },
  { key: 'wandu',    name: '万毒教',   faction: '魔教', school: '毒教', description: '万毒心经，百毒不侵。', joinReq: { minLevel: 12 }, gongfaFocus: 'poison' },
  // —— 其他（4 NPC + 1 玩家席）——
  { key: 'wanjie',   name: '万界商城', faction: '其他', school: '商道', description: '万界通商，灵石开路。「哈弗克的大手」', joinReq: { minLevel: 1, fee: 500 }, gongfaFocus: 'trade' },
  { key: 'feisheng', name: '飞升门',   faction: '其他', school: '蛊道', description: '上界在下界的子宗门，管理并收割下界。', joinReq: { minLevel: 30 }, gongfaFocus: 'gu' },
  { key: 'wuxing',   name: '五行山',   faction: '其他', school: '五行流派', description: '五灵根老祖创立，通过模拟全属性达成阴阳调和，同阶无敌，全元素克制。', joinReq: { minRoots: 3, minLevel: 20 }, gongfaFocus: 'wuxing' },
  { key: 'tianchao', name: '天朝圣国', faction: '其他', school: '人道', description: '以声望入道，力量与个人声望成正比。', joinReq: { minLevel: 25 }, gongfaFocus: 'renwang' }
  // 第 19 席位：第三阵营 / 玩家创建（阶段4二期）
];

// 六大建筑（完整体系图14）：key/名称/功能/升级贡献消耗（×level）/效果描述
const BUILDINGS = [
  { key: 'library', name: '藏书阁', desc: '研读典籍：炼器/炼丹成功率提升', upgradeCost: (lv) => 400 * lv,  effect: '生产成功率 +3%/级' },
  { key: 'chore',   name: '杂役堂', desc: '宗门任务：贡献值来源',         upgradeCost: (lv) => 300 * lv,  effect: '杂役收益 +10%/级' },
  { key: 'arena',   name: '演武馆', desc: '切磋演武：战斗属性提升',         upgradeCost: (lv) => 500 * lv,  effect: '战力 +2%/级' },
  { key: 'tower',   name: '通天塔', desc: '租用修炼室：修炼加速',           upgradeCost: (lv) => 600 * lv,  effect: '修炼速度 +5%/级' },
  { key: 'treasury',name: '藏宝阁', desc: '积分兑换：贡献换宝物',           upgradeCost: (lv) => 450 * lv,  effect: '解锁更高阶兑换品' },
  { key: 'notice',  name: '布告栏', desc: '宗门公告与见闻',                 upgradeCost: (lv) => 150 * lv,  effect: '公告位 +1/级' }
];

// 藏宝阁兑换（按物品名，contrib 为所需贡献值）
const EXCHANGE_TABLE = [
  { item: '回灵丹',   contrib: 30,   treasuryLevel: 1, desc: '恢复灵力' },
  { item: '疗伤丹',   contrib: 50,   treasuryLevel: 1, desc: '清空伤势' },
  { item: '大还丹',   contrib: 200,  treasuryLevel: 2, desc: '疗伤并固本' },
  { item: '聚灵丹',   contrib: 120,  treasuryLevel: 2, desc: '修炼增益' },
  { item: '凡铁剑图纸', contrib: 260, treasuryLevel: 3, desc: '锻造图纸' }
];

module.exports = { SECTS, BUILDINGS, EXCHANGE_TABLE };
