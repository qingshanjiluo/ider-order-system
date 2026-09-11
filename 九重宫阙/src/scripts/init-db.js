const { initDatabase, loadDatabase, saveDatabase } = require('../database');

initDatabase();

const db = loadDatabase();

// 物品数据
if (db.items.length <= 6) {
  const newItems = [
    // 装备
    { id: 7, name: '玄铁重剑', type: '装备', subtype: '武器', quality: '灵器', realm: '筑基', stats: '{"attack":35,"defense":5,"critChance":3}', description: '玄铁打造的重剑，沉重但威力巨大' },
    { id: 8, name: '紫金软甲', type: '装备', subtype: '护甲', quality: '法宝', realm: '金丹', stats: '{"attack":10,"defense":50,"hp":100}', description: '紫金编织的软甲，轻便且防御极高' },
    { id: 9, name: '天蚕丝手套', type: '装备', subtype: '饰品', quality: '古宝', realm: '元婴', stats: '{"attack":80,"speed":10,"critChance":5}', description: '天蚕丝编织的手套，提升攻击速度' },
    { id: 10, name: '龙鳞战靴', type: '装备', subtype: '护甲', quality: '灵宝', realm: '化神', stats: '{"defense":60,"speed":20,"hp":200}', description: '龙鳞打造的战靴，提升移动速度' },
    { id: 11, name: '凤凰羽衣', type: '装备', subtype: '护甲', quality: '道器', realm: '炼虚', stats: '{"defense":100,"hp":500,"speed":15}', description: '凤凰羽毛编织的衣裳，防御极高' },
    { id: 12, name: '混沌神剑', type: '装备', subtype: '武器', quality: '仙器', realm: '合体', stats: '{"attack":300,"speed":25,"critChance":10}', description: '混沌之力凝聚的神剑，攻击力惊人' },
    { id: 13, name: '太极图', type: '装备', subtype: '灵器', quality: '混沌至宝', realm: '大乘', stats: '{"attack":500,"defense":200,"hp":1000}', description: '先天至宝太极图，攻防一体' },

    // 功法
    { id: 14, name: '基础剑诀', type: '功法', subtype: '战斗', quality: '黄阶', realm: '炼气', stats: '{"cultivation_speed":1.05,"skill_damage":1.05,"element":"金"}', description: '基础剑法修炼，金属性' },
    { id: 15, name: '烈火剑法', type: '功法', subtype: '战斗', quality: '黄阶', realm: '炼气', stats: '{"cultivation_speed":1.0,"skill_damage":1.15,"element":"火"}', description: '火属性剑法，伤害极高' },
    { id: 16, name: '寒冰真诀', type: '功法', subtype: '战斗', quality: '玄阶', realm: '筑基', stats: '{"cultivation_speed":1.1,"skill_damage":1.2,"element":"水"}', description: '冰属性功法，有几率冻结敌人' },
    { id: 17, name: '雷霆秘典', type: '功法', subtype: '战斗', quality: '玄阶', realm: '筑基', stats: '{"cultivation_speed":1.15,"skill_damage":1.25,"element":"雷"}', description: '雷属性功法，有几率麻痹敌人' },
    { id: 18, name: '天罡剑诀', type: '功法', subtype: '战斗', quality: '地阶', realm: '金丹', stats: '{"cultivation_speed":1.2,"skill_damage":1.3,"element":"金"}', description: '高级剑法，剑气凌厉' },
    { id: 19, name: '九阳神功', type: '功法', subtype: '修炼', quality: '地阶', realm: '金丹', stats: '{"cultivation_speed":1.25,"hp_regen":1.5}', description: '阳属性功法，回复生命' },
    { id: 20, name: '紫霞神功', type: '功法', subtype: '修炼', quality: '天阶', realm: '元婴', stats: '{"cultivation_speed":1.3,"mp_regen":1.5}', description: '紫霞真气功法，回复灵力' },
    { id: 21, name: '太极心法', type: '功法', subtype: '修炼', quality: '天阶', realm: '元婴', stats: '{"cultivation_speed":1.35,"hp_regen":1.3,"mp_regen":1.3}', description: '太极之道心法，平衡回复' },
    { id: 22, name: '混沌诀', type: '功法', subtype: '修炼', quality: '圣阶', realm: '化神', stats: '{"cultivation_speed":1.4,"all_stats":1.2}', description: '混沌之力功法，全面提升' },
    { id: 23, name: '造化功', type: '功法', subtype: '修炼', quality: '仙阶', realm: '炼虚', stats: '{"cultivation_speed":1.5,"exp_bonus":1.5}', description: '造化之力功法，经验大增' },

    // 灵宠
    { id: 24, name: '小灵狐', type: '灵宠', quality: '灵兽', realm: '炼气', stats: '{"hp":80,"attack":8,"defense":5,"speed":6,"skill":"幻影"}', description: '灵巧的小狐狸，擅长闪避' },
    { id: 25, name: '金翅大鹏', type: '灵宠', quality: '玄兽', realm: '筑基', stats: '{"hp":150,"attack":15,"defense":10,"speed":12,"skill":"疾风"}', description: '金翅大鹏鸟，速度极快' },
    { id: 26, name: '玄武神兽', type: '灵宠', quality: '地兽', realm: '金丹', stats: '{"hp":300,"attack":20,"defense":30,"speed":5,"skill":"玄武盾"}', description: '玄武神兽，防御极高' },
    { id: 27, name: '白虎神兽', type: '灵宠', quality: '天兽', realm: '元婴', stats: '{"hp":250,"attack":35,"defense":15,"speed":15,"skill":"白虎啸"}', description: '白虎神兽，攻击极强' },
    { id: 28, name: '青龙神兽', type: '灵宠', quality: '圣兽', realm: '化神', stats: '{"hp":400,"attack":30,"defense":25,"speed":20,"skill":"龙息"}', description: '青龙神兽，属性均衡' },
    { id: 29, name: '朱雀神兽', type: '灵宠', quality: '仙兽', realm: '炼虚', stats: '{"hp":350,"attack":40,"defense":20,"speed":25,"skill":"涅槃"}', description: '朱雀神兽，有复活能力' },

    // 消耗品
    { id: 30, name: '回灵丹', type: '消耗品', quality: '凡品', realm: '炼气', stats: '{"mp_restore":50}', description: '恢复50点灵力' },
    { id: 31, name: '疗伤丹', type: '消耗品', quality: '凡品', realm: '炼气', stats: '{"hp_restore":100}', description: '恢复100点生命' },
    { id: 32, name: '培元丹', type: '消耗品', quality: '灵品', realm: '筑基', stats: '{"exp_bonus":1.5,"duration":300}', description: '修炼经验增加50%，持续5分钟' },
    { id: 33, name: '洗髓丹', type: '消耗品', quality: '灵品', realm: '筑基', stats: '{"reset_stats":true}', description: '重置角色属性' },
    { id: 34, name: '筑基丹', type: '消耗品', quality: '灵品', realm: '炼气', stats: '{"breakthrough_bonus":0.3}', description: '突破成功率+30%' },
    { id: 35, name: '金丹丹', type: '消耗品', quality: '宝品', realm: '筑基', stats: '{"breakthrough_bonus":0.4}', description: '突破成功率+40%' },
    { id: 36, name: '大还丹', type: '消耗品', quality: '宝品', realm: '金丹', stats: '{"hp_restore":500,"mp_restore":200}', description: '恢复大量生命和灵力' },
    { id: 37, name: '续命丹', type: '消耗品', quality: '灵品', realm: '筑基', stats: '{"revive":true}', description: '战斗中自动复活一次' },

    // 材料
    { id: 38, name: '灵草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1}', description: '普通灵草，可用于炼丹' },
    { id: 39, name: '千年灵芝', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2}', description: '千年灵芝，珍贵药材' },
    { id: 40, name: '九转还魂草', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3}', description: '珍稀灵草，可炼制续命丹' },
    { id: 41, name: '玄铁', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1}', description: '炼器基础材料' },
    { id: 42, name: '紫金', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2}', description: '高级炼器材料' },
    { id: 43, name: '星辰石', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3}', description: '蕴含星辰之力的矿石' },
    { id: 44, name: '龙涎香', type: '材料', quality: '仙品', realm: '元婴', stats: '{"gather_level":4}', description: '龙族唾液凝结，炼器圣品' },
    { id: 45, name: '凤凰羽毛', type: '材料', quality: '仙品', realm: '化神', stats: '{"gather_level":5}', description: '凤凰脱落的羽毛' },
    { id: 46, name: '混沌之石', type: '材料', quality: '混沌', realm: '炼虚', stats: '{"gather_level":6}', description: '混沌之力凝结的石头' },

    // 灵宠蛋
    { id: 47, name: '灵宠蛋', type: '灵宠蛋', quality: '凡兽', realm: '炼气', stats: '{"pet_quality":"凡兽"}', description: '普通灵宠蛋' },
    { id: 48, name: '灵兽蛋', type: '灵宠蛋', quality: '灵兽', realm: '筑基', stats: '{"pet_quality":"灵兽"}', description: '灵兽蛋' },
    { id: 49, name: '玄兽蛋', type: '灵宠蛋', quality: '玄兽', realm: '金丹', stats: '{"pet_quality":"玄兽"}', description: '玄兽蛋' },
    { id: 50, name: '神兽蛋', type: '灵宠蛋', quality: '地兽', realm: '元婴', stats: '{"pet_quality":"地兽"}', description: '神兽蛋' },

    // 礼包
    { id: 51, name: '新手礼包', type: '礼包', quality: '凡品', realm: '炼气', stats: '{"spirit_stone":100,"exp":50,"items":[30,31]}', description: '新手入门礼包' },
    { id: 52, name: '筑基礼包', type: '礼包', quality: '灵品', realm: '筑基', stats: '{"spirit_stone":500,"exp":200,"items":[32,34]}', description: '筑基成功礼包' },
    { id: 53, name: '金丹礼包', type: '礼包', quality: '宝品', realm: '金丹', stats: '{"spirit_stone":2000,"exp":1000,"items":[35,36]}', description: '金丹成功礼包' },
    { id: 54, name: '元婴礼包', type: '礼包', quality: '宝品', realm: '元婴', stats: '{"spirit_stone":10000,"exp":5000,"items":[37]}', description: '元婴成功礼包' },

    // 道具
    { id: 55, name: '传音符', type: '道具', quality: '凡品', realm: '炼气', stats: '{}', description: '全服传音' },
    { id: 56, name: '回城符', type: '道具', quality: '凡品', realm: '炼气', stats: '{}', description: '传送回城' },
    { id: 57, name: '随机传送符', type: '道具', quality: '凡品', realm: '炼气', stats: '{}', description: '随机传送' },
    { id: 58, name: '经验卷轴', type: '道具', quality: '灵品', realm: '筑基', stats: '{"exp_bonus":2.0,"duration":600}', description: '经验翻倍，持续10分钟' },

    // 炼丹配方材料
    { id: 59, name: '火灵草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"element":"火","gather_level":1}', description: '火属性灵草' },
    { id: 60, name: '水灵草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"element":"水","gather_level":1}', description: '水属性灵草' },
    { id: 61, name: '土灵草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"element":"土","gather_level":1}', description: '土属性灵草' },
    { id: 62, name: '金灵草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"element":"金","gather_level":1}', description: '金属性灵草' },
    { id: 63, name: '木灵草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"element":"木","gather_level":1}', description: '木属性灵草' },

    // 炼器材料
    { id: 64, name: '精铁', type: '材料', quality: '凡品', realm: '炼气', stats: '{"forge_level":1}', description: '炼器基础材料' },
    { id: 65, name: '寒冰铁', type: '材料', quality: '灵品', realm: '筑基', stats: '{"forge_level":2,"element":"水"}', description: '水属性炼器材料' },
    { id: 66, name: '火焰石', type: '材料', quality: '灵品', realm: '筑基', stats: '{"forge_level":2,"element":"火"}', description: '火属性炼器材料' },
    { id: 67, name: '雷霆晶', type: '材料', quality: '宝品', realm: '金丹', stats: '{"forge_level":3,"element":"雷"}', description: '雷属性炼器材料' },
    { id: 68, name: '风灵石', type: '材料', quality: '宝品', realm: '金丹', stats: '{"forge_level":3,"element":"风"}', description: '风属性炼器材料' },

    // 套装装备
    { id: 69, name: '青云剑', type: '装备', subtype: '武器', quality: '灵器', realm: '筑基', stats: '{"attack":25,"set":"青云"}', description: '青云宗制式长剑' },
    { id: 70, name: '青云甲', type: '装备', subtype: '护甲', quality: '灵器', realm: '筑基', stats: '{"defense":30,"set":"青云"}', description: '青云宗制式护甲' },
    { id: 71, name: '青云靴', type: '装备', subtype: '护甲', quality: '灵器', realm: '筑基', stats: '{"speed":10,"set":"青云"}', description: '青云宗制式战靴' },
    { id: 72, name: '青云佩', type: '装备', subtype: '饰品', quality: '灵器', realm: '筑基', stats: '{"hp":50,"set":"青云"}', description: '青云宗制式玉佩' },

    { id: 73, name: '天魔刀', type: '装备', subtype: '武器', quality: '法宝', realm: '金丹', stats: '{"attack":60,"element":"魔","set":"天魔"}', description: '天魔门镇派之宝' },
    { id: 74, name: '天魔甲', type: '装备', subtype: '护甲', quality: '法宝', realm: '金丹', stats: '{"defense":50,"element":"魔","set":"天魔"}', description: '天魔门制式护甲' },
    { id: 75, name: '天魔靴', type: '装备', subtype: '护甲', quality: '法宝', realm: '金丹', stats: '{"speed":15,"element":"魔","set":"天魔"}', description: '天魔门制式战靴' },

    // 特殊道具
    { id: 76, name: '藏宝图', type: '道具', quality: '灵品', realm: '筑基', stats: '{"treasure_hunt":true}', description: '指引寻找宝藏' },
    { id: 77, name: '宠物口粮', type: '消耗品', quality: '凡品', realm: '炼气', stats: '{"pet_exp":50}', description: '喂养宠物获得经验' },
    { id: 78, name: '高级宠物口粮', type: '消耗品', quality: '灵品', realm: '筑基', stats: '{"pet_exp":200}', description: '喂养宠物获得大量经验' },
    { id: 79, name: '洗练石', type: '材料', quality: '灵品', realm: '筑基', stats: '{"reroll_stats":true}', description: '重置装备属性' },
    { id: 80, name: '强化石', type: '材料', quality: '凡品', realm: '炼气', stats: '{"enhance_bonus":0.1}', description: '提升强化成功率' },

    // 8槽位装备 - 炼气期
    { id: 81, name: '炼气头盔', type: '装备', slot: 'head', quality: '凡器', realm: '炼气', stats: '{"defense":3,"hp":20}', description: '炼气期基础头盔' },
    { id: 82, name: '炼气护腿', type: '装备', slot: 'legs', quality: '凡器', realm: '炼气', stats: '{"defense":2,"speed":2}', description: '炼气期基础护腿' },
    { id: 83, name: '炼气战靴', type: '装备', slot: 'boots', quality: '凡器', realm: '炼气', stats: '{"speed":3,"defense":1}', description: '炼气期基础战靴' },
    { id: 84, name: '炼气戒指', type: '装备', slot: 'ring', quality: '凡器', realm: '炼气', stats: '{"attack":3,"speed":1}', description: '炼气期基础戒指' },
    { id: 85, name: '炼气项链', type: '装备', slot: 'necklace', quality: '凡器', realm: '炼气', stats: '{"hp":30,"attack":2}', description: '炼气期基础项链' },
    { id: 86, name: '炼气法袍', type: '装备', slot: 'chest', quality: '凡器', realm: '炼气', stats: '{"defense":2,"speed":2,"hp":10}', description: '炼气期基础法袍' },

    // 筑基期
    { id: 87, name: '筑基头盔', type: '装备', slot: 'head', quality: '法器', realm: '筑基', stats: '{"defense":10,"hp":50}', description: '筑基期法器头盔' },
    { id: 88, name: '筑基护腿', type: '装备', slot: 'legs', quality: '法器', realm: '筑基', stats: '{"defense":8,"speed":5}', description: '筑基期法器护腿' },
    { id: 89, name: '筑基战靴', type: '装备', slot: 'boots', quality: '法器', realm: '筑基', stats: '{"speed":8,"defense":5}', description: '筑基期法器战靴' },
    { id: 90, name: '筑基戒指', type: '装备', slot: 'ring', quality: '法器', realm: '筑基', stats: '{"attack":8,"speed":3}', description: '筑基期法器戒指' },
    { id: 91, name: '筑基项链', type: '装备', slot: 'necklace', quality: '法器', realm: '筑基', stats: '{"hp":80,"attack":5}', description: '筑基期法器项链' },
    { id: 92, name: '筑基法袍', type: '装备', slot: 'chest', quality: '法器', realm: '筑基', stats: '{"defense":6,"speed":5,"hp":30}', description: '筑基期法器法袍' },

    // 金丹期
    { id: 93, name: '金丹头盔', type: '装备', slot: 'head', quality: '灵器', realm: '金丹', stats: '{"defense":20,"hp":100}', description: '金丹期灵器头盔' },
    { id: 94, name: '金丹护腿', type: '装备', slot: 'legs', quality: '灵器', realm: '金丹', stats: '{"defense":15,"speed":10}', description: '金丹期灵器护腿' },
    { id: 95, name: '金丹战靴', type: '装备', slot: 'boots', quality: '灵器', realm: '金丹', stats: '{"speed":12,"defense":8}', description: '金丹期灵器战靴' },
    { id: 96, name: '金丹戒指', type: '装备', slot: 'ring', quality: '灵器', realm: '金丹', stats: '{"attack":15,"speed":5}', description: '金丹期灵器戒指' },
    { id: 97, name: '金丹项链', type: '装备', slot: 'necklace', quality: '灵器', realm: '金丹', stats: '{"hp":150,"attack":10}', description: '金丹期灵器项链' },
    { id: 98, name: '金丹法袍', type: '装备', slot: 'chest', quality: '灵器', realm: '金丹', stats: '{"defense":12,"speed":8,"hp":60}', description: '金丹期灵器法袍' },

    // 元婴期
    { id: 99, name: '元婴头盔', type: '装备', slot: 'head', quality: '法宝', realm: '元婴', stats: '{"defense":40,"hp":200}', description: '元婴期法宝头盔' },
    { id: 100, name: '元婴护腿', type: '装备', slot: 'legs', quality: '法宝', realm: '元婴', stats: '{"defense":30,"speed":15}', description: '元婴期法宝护腿' },
    { id: 101, name: '元婴战靴', type: '装备', slot: 'boots', quality: '法宝', realm: '元婴', stats: '{"speed":18,"defense":12}', description: '元婴期法宝战靴' },
    { id: 102, name: '元婴戒指', type: '装备', slot: 'ring', quality: '法宝', realm: '元婴', stats: '{"attack":30,"speed":8}', description: '元婴期法宝戒指' },
    { id: 103, name: '元婴项链', type: '装备', slot: 'necklace', quality: '法宝', realm: '元婴', stats: '{"hp":300,"attack":20}', description: '元婴期法宝项链' },
    { id: 104, name: '元婴法袍', type: '装备', slot: 'chest', quality: '法宝', realm: '元婴', stats: '{"defense":25,"speed":12,"hp":100}', description: '元婴期法宝法袍' },

    // 化神期
    { id: 105, name: '化神头盔', type: '装备', slot: 'head', quality: '古宝', realm: '化神', stats: '{"defense":70,"hp":350}', description: '化神期古宝头盔' },
    { id: 106, name: '化神护腿', type: '装备', slot: 'legs', quality: '古宝', realm: '化神', stats: '{"defense":50,"speed":20}', description: '化神期古宝护腿' },
    { id: 107, name: '化神战靴', type: '装备', slot: 'boots', quality: '古宝', realm: '化神', stats: '{"speed":25,"defense":18}', description: '化神期古宝战靴' },
    { id: 108, name: '化神戒指', type: '装备', slot: 'ring', quality: '古宝', realm: '化神', stats: '{"attack":50,"speed":12}', description: '化神期古宝戒指' },
    { id: 109, name: '化神项链', type: '装备', slot: 'necklace', quality: '古宝', realm: '化神', stats: '{"hp":500,"attack":35}', description: '化神期古宝项链' },
    { id: 110, name: '化神法袍', type: '装备', slot: 'chest', quality: '古宝', realm: '化神', stats: '{"defense":40,"speed":18,"hp":180}', description: '化神期古宝法袍' },

    // 炼虚期
    { id: 111, name: '炼虚头盔', type: '装备', slot: 'head', quality: '灵宝', realm: '炼虚', stats: '{"defense":110,"hp":550}', description: '炼虚期灵宝头盔' },
    { id: 112, name: '炼虚护腿', type: '装备', slot: 'legs', quality: '灵宝', realm: '炼虚', stats: '{"defense":80,"speed":28}', description: '炼虚期灵宝护腿' },
    { id: 113, name: '炼虚战靴', type: '装备', slot: 'boots', quality: '灵宝', realm: '炼虚', stats: '{"speed":32,"defense":25}', description: '炼虚期灵宝战靴' },
    { id: 114, name: '炼虚戒指', type: '装备', slot: 'ring', quality: '灵宝', realm: '炼虚', stats: '{"attack":80,"speed":18}', description: '炼虚期灵宝戒指' },
    { id: 115, name: '炼虚项链', type: '装备', slot: 'necklace', quality: '灵宝', realm: '炼虚', stats: '{"hp":800,"attack":55}', description: '炼虚期灵宝项链' },
    { id: 116, name: '炼虚法袍', type: '装备', slot: 'chest', quality: '灵宝', realm: '炼虚', stats: '{"defense":65,"speed":25,"hp":280}', description: '炼虚期灵宝法袍' },

    // 合体期
    { id: 117, name: '合体头盔', type: '装备', slot: 'head', quality: '道器', realm: '合体', stats: '{"defense":170,"hp":800}', description: '合体期道器头盔' },
    { id: 118, name: '合体护腿', type: '装备', slot: 'legs', quality: '道器', realm: '合体', stats: '{"defense":120,"speed":35}', description: '合体期道器护腿' },
    { id: 119, name: '合体战靴', type: '装备', slot: 'boots', quality: '道器', realm: '合体', stats: '{"speed":42,"defense":35}', description: '合体期道器战靴' },
    { id: 120, name: '合体戒指', type: '装备', slot: 'ring', quality: '道器', realm: '合体', stats: '{"attack":120,"speed":25}', description: '合体期道器戒指' },
    { id: 121, name: '合体项链', type: '装备', slot: 'necklace', quality: '道器', realm: '合体', stats: '{"hp":1200,"attack":85}', description: '合体期道器项链' },
    { id: 122, name: '合体法袍', type: '装备', slot: 'chest', quality: '道器', realm: '合体', stats: '{"defense":100,"speed":35,"hp":420}', description: '合体期道器法袍' },

    // 大乘期
    { id: 123, name: '大乘头盔', type: '装备', slot: 'head', quality: '仙器', realm: '大乘', stats: '{"defense":270,"hp":1200}', description: '大乘期仙器头盔' },
    { id: 124, name: '大乘护腿', type: '装备', slot: 'legs', quality: '仙器', realm: '大乘', stats: '{"defense":190,"speed":48}', description: '大乘期仙器护腿' },
    { id: 125, name: '大乘战靴', type: '装备', slot: 'boots', quality: '仙器', realm: '大乘', stats: '{"speed":55,"defense":48}', description: '大乘期仙器战靴' },
    { id: 126, name: '大乘戒指', type: '装备', slot: 'ring', quality: '仙器', realm: '大乘', stats: '{"attack":190,"speed":35}', description: '大乘期仙器戒指' },
    { id: 127, name: '大乘项链', type: '装备', slot: 'necklace', quality: '仙器', realm: '大乘', stats: '{"hp":1800,"attack":130}', description: '大乘期仙器项链' },
    { id: 128, name: '大乘法袍', type: '装备', slot: 'chest', quality: '仙器', realm: '大乘', stats: '{"defense":160,"speed":48,"hp":650}', description: '大乘期仙器法袍' },

    // 渡劫/飞升期
    { id: 129, name: '混沌头盔', type: '装备', slot: 'head', quality: '混沌至宝', realm: '渡劫', stats: '{"defense":430,"hp":1800}', description: '渡劫期混沌头盔' },
    { id: 130, name: '混沌护腿', type: '装备', slot: 'legs', quality: '混沌至宝', realm: '渡劫', stats: '{"defense":300,"speed":65}', description: '渡劫期混沌护腿' },
    { id: 131, name: '混沌战靴', type: '装备', slot: 'boots', quality: '混沌至宝', realm: '渡劫', stats: '{"speed":75,"defense":65}', description: '渡劫期混沌战靴' },
    { id: 132, name: '混沌戒指', type: '装备', slot: 'ring', quality: '混沌至宝', realm: '渡劫', stats: '{"attack":300,"speed":48}', description: '渡劫期混沌戒指' },
    { id: 133, name: '混沌项链', type: '装备', slot: 'necklace', quality: '混沌至宝', realm: '渡劫', stats: '{"hp":2800,"attack":200}', description: '渡劫期混沌项链' },
    { id: 134, name: '混沌法袍', type: '装备', slot: 'chest', quality: '混沌至宝', realm: '渡劫', stats: '{"defense":250,"speed":65,"hp":1000}', description: '渡劫期混沌法袍' }
  ];

  db.items.push(...newItems);
  saveDatabase(db);
  console.log('物品数据已更新');
}

// 副本数据
if (db.dungeons.length === 0) {
  const newDungeons = [
    { id: 1, name: '青云试炼', type: '公共副本', min_level: 1, max_level: 10, difficulty: 1, element: '金', boss: '金甲傀儡', rewards: '{"exp":50,"spiritStone":20,"items":[38,41]}', description: '青云宗入门试炼，击败金甲傀儡' },
    { id: 2, name: '妖兽洞穴', type: '公共副本', min_level: 10, max_level: 20, difficulty: 2, element: '木', boss: '千年树妖', rewards: '{"exp":100,"spiritStone":50,"items":[39,42]}', description: '妖兽栖息的洞穴，击败千年树妖' },
    { id: 3, name: '火焰秘境', type: '公共副本', min_level: 20, max_level: 30, difficulty: 3, element: '火', boss: '火焰领主', rewards: '{"exp":200,"spiritStone":100,"items":[40,43]}', description: '火焰山深处的秘境，击败火焰领主' },
    { id: 4, name: '冰雪世界', type: '公共副本', min_level: 30, max_level: 40, difficulty: 4, element: '水', boss: '冰霜巨龙', rewards: '{"exp":400,"spiritStone":200,"items":[44,65]}', description: '冰雪原深处的世界，击败冰霜巨龙' },
    { id: 5, name: '雷劫之地', type: '公共副本', min_level: 40, max_level: 50, difficulty: 5, element: '雷', boss: '雷劫使者', rewards: '{"exp":800,"spiritStone":400,"items":[45,67]}', description: '渡劫之地，击败雷劫使者' },
    { id: 6, name: '混沌深渊', type: '公共副本', min_level: 50, max_level: 60, difficulty: 6, element: '混沌', boss: '混沌魔神', rewards: '{"exp":1600,"spiritStone":800,"items":[46,68]}', description: '混沌深渊，击败混沌魔神' },
    { id: 7, name: '宗门大殿', type: '宗门副本', min_level: 15, max_level: 25, difficulty: 3, element: '金', boss: '宗门叛徒', rewards: '{"exp":150,"spiritStone":80,"items":[39,79]}', description: '宗门专属副本，击败宗门叛徒' },
    { id: 8, name: '宗门禁地', type: '宗门副本', min_level: 35, max_level: 45, difficulty: 5, element: '魔', boss: '魔道高手', rewards: '{"exp":600,"spiritStone":300,"items":[44,80]}', description: '宗门禁地，击败魔道高手' },
    { id: 9, name: '飞升之路', type: '飞升副本', min_level: 60, max_level: 70, difficulty: 7, element: '仙', boss: '仙界守卫', rewards: '{"exp":3200,"spiritStone":1600,"items":[45,46]}', description: '飞升之路，击败仙界守卫' },
    { id: 10, name: '仙界入口', type: '飞升副本', min_level: 70, max_level: 80, difficulty: 8, element: '仙', boss: '仙界使者', rewards: '{"exp":6400,"spiritStone":3200,"items":[46]}', description: '仙界入口，击败仙界使者' },
    { id: 11, name: '五行试炼', type: '公共副本', min_level: 25, max_level: 35, difficulty: 4, element: '五行', boss: '五行圣兽', rewards: '{"exp":300,"spiritStone":150,"items":[59,60,61,62,63]}', description: '五行圣地，击败五行圣兽' },
    { id: 12, name: '魔道巢穴', type: '公共副本', min_level: 45, max_level: 55, difficulty: 6, element: '魔', boss: '魔道至尊', rewards: '{"exp":1200,"spiritStone":600,"items":[73,74,75]}', description: '魔道巢穴，击败魔道至尊' },
    { id: 13, name: '远古战场', type: '公共副本', min_level: 55, max_level: 65, difficulty: 7, element: '混沌', boss: '远古战魂', rewards: '{"exp":2400,"spiritStone":1200,"items":[44,45]}', description: '远古战场，击败远古战魂' },
    { id: 14, name: '天劫降临', type: '公共副本', min_level: 65, max_level: 75, difficulty: 8, element: '雷', boss: '天劫雷龙', rewards: '{"exp":4800,"spiritStone":2400,"items":[45,46]}', description: '天劫降临，击败天劫雷龙' },
    { id: 15, name: '仙界试炼', type: '飞升副本', min_level: 80, max_level: 90, difficulty: 9, element: '仙', boss: '仙界至尊', rewards: '{"exp":12800,"spiritStone":6400,"items":[46]}', description: '仙界试炼，击败仙界至尊' }
  ];

  db.dungeons.push(...newDungeons);
  saveDatabase(db);
  console.log('副本数据已更新');
}

// 地图数据
if (!db.maps) db.maps = [];
if (db.maps.length === 0) {
  const newMaps = [
    { id: 1, name: '青云山', min_level: 1, max_level: 10, difficulty: 1, element: '金', monsters: ['金甲傀儡','金翅鸟','金蛇'], exp_per_second: 5, spirit_stone_per_second: 1, description: '青云宗所在山脉，灵气充沛' },
    { id: 2, name: '翠竹林', min_level: 10, max_level: 20, difficulty: 1.2, element: '木', monsters: ['竹妖','木灵','树精'], exp_per_second: 10, spirit_stone_per_second: 2, description: '翠竹成林，木属性灵气浓郁' },
    { id: 3, name: '火焰山', min_level: 20, max_level: 30, difficulty: 1.5, element: '火', monsters: ['火焰蜥蜴','岩浆巨人','火鸦'], exp_per_second: 20, spirit_stone_per_second: 4, description: '火焰山深处，火属性灵气浓郁' },
    { id: 4, name: '寒冰谷', min_level: 30, max_level: 40, difficulty: 1.8, element: '水', monsters: ['冰霜狼','寒冰蝎','冰晶鸟'], exp_per_second: 40, spirit_stone_per_second: 8, description: '寒冰谷深处，水属性灵气浓郁' },
    { id: 5, name: '雷霆峰', min_level: 40, max_level: 50, difficulty: 2.0, element: '雷', monsters: ['雷兽','电鳗','雷鸟'], exp_per_second: 80, spirit_stone_per_second: 16, description: '雷霆峰顶，雷属性灵气浓郁' },
    { id: 6, name: '混沌海', min_level: 50, max_level: 60, difficulty: 2.5, element: '混沌', monsters: ['混沌兽','虚空虫','时空龙'], exp_per_second: 160, spirit_stone_per_second: 32, description: '混沌海深处，混沌之力浓郁' },
    { id: 7, name: '五行圣地', min_level: 60, max_level: 70, difficulty: 3.0, element: '五行', monsters: ['五行圣兽','五行精灵','五行守护者'], exp_per_second: 320, spirit_stone_per_second: 64, description: '五行圣地，五行之力交汇' },
    { id: 8, name: '魔道深渊', min_level: 70, max_level: 80, difficulty: 3.5, element: '魔', monsters: ['魔道高手','魔道使者','魔道至尊'], exp_per_second: 640, spirit_stone_per_second: 128, description: '魔道深渊，魔气冲天' },
    { id: 9, name: '仙界入口', min_level: 80, max_level: 90, difficulty: 4.0, element: '仙', monsters: ['仙界守卫','仙界使者','仙界至尊'], exp_per_second: 1280, spirit_stone_per_second: 256, description: '仙界入口，仙气缭绕' },
    { id: 10, name: '远古战场', min_level: 90, max_level: 100, difficulty: 5.0, element: '混沌', monsters: ['远古战魂','远古巨兽','远古神灵'], exp_per_second: 2560, spirit_stone_per_second: 512, description: '远古战场，蕴含远古之力' }
  ];

  db.maps.push(...newMaps);
  saveDatabase(db);
  console.log('地图数据已更新');
}

// 炼丹配方
if (!db.recipes) db.recipes = [];
if (db.recipes.length === 0) {
  const newRecipes = [
    { id: 1, name: '回灵丹', type: '丹药', materials: [38,59], result: 30, quantity: 2, level: 1, description: '恢复50点灵力' },
    { id: 2, name: '疗伤丹', type: '丹药', materials: [38,60], result: 31, quantity: 2, level: 1, description: '恢复100点生命' },
    { id: 3, name: '培元丹', type: '丹药', materials: [39,61], result: 32, quantity: 1, level: 2, description: '修炼经验增加50%' },
    { id: 4, name: '筑基丹', type: '丹药', materials: [39,62,63], result: 34, quantity: 1, level: 2, description: '突破成功率+30%' },
    { id: 5, name: '金丹丹', type: '丹药', materials: [40,43,65], result: 35, quantity: 1, level: 3, description: '突破成功率+40%' },
    { id: 6, name: '大还丹', type: '丹药', materials: [40,44,66], result: 36, quantity: 1, level: 4, description: '恢复大量生命和灵力' },
    { id: 7, name: '续命丹', type: '丹药', materials: [40,45,67], result: 37, quantity: 1, level: 5, description: '战斗中自动复活一次' },
    { id: 8, name: '洗髓丹', type: '丹药', materials: [39,43,68], result: 33, quantity: 1, level: 3, description: '重置角色属性' }
  ];

  db.recipes.push(...newRecipes);
  saveDatabase(db);
  console.log('配方数据已更新');
}

// 炼器配方
if (!db.forge_recipes) db.forge_recipes = [];
if (db.forge_recipes.length === 0) {
  const newForgeRecipes = [
    { id: 1, name: '精铁剑', type: '武器', materials: [64], result: 69, quantity: 1, level: 1, description: '基础精铁剑' },
    { id: 2, name: '寒冰剑', type: '武器', materials: [64,65], result: 14, quantity: 1, level: 2, description: '水属性长剑' },
    { id: 3, name: '火焰剑', type: '武器', materials: [64,66], result: 15, quantity: 1, level: 2, description: '火属性长剑' },
    { id: 4, name: '雷霆剑', type: '武器', materials: [64,67], result: 17, quantity: 1, level: 3, description: '雷属性长剑' },
    { id: 5, name: '玄铁重剑', type: '武器', materials: [41,42,67], result: 7, quantity: 1, level: 3, description: '玄铁打造的重剑' },
    { id: 6, name: '混沌神剑', type: '武器', materials: [44,45,46], result: 12, quantity: 1, level: 6, description: '混沌之力凝聚的神剑' },
    { id: 7, name: '精铁甲', type: '护甲', materials: [64], result: 70, quantity: 1, level: 1, description: '基础精铁甲' },
    { id: 8, name: '紫金软甲', type: '护甲', materials: [42,65,66], result: 8, quantity: 1, level: 3, description: '紫金编织的软甲' },
    { id: 9, name: '凤凰羽衣', type: '护甲', materials: [44,45,46], result: 11, quantity: 1, level: 5, description: '凤凰羽毛编织的衣裳' }
  ];

  db.forge_recipes.push(...newForgeRecipes);
  saveDatabase(db);
  console.log('炼器配方数据已更新');
}

// 商店数据
if (!db.shop) db.shop = [];
if (db.shop.length === 0) {
  const newShop = [
    { id: 1, item_id: 30, price: 10, stock: 999, description: '回灵丹' },
    { id: 2, item_id: 31, price: 10, stock: 999, description: '疗伤丹' },
    { id: 3, item_id: 38, price: 5, stock: 999, description: '灵草' },
    { id: 4, item_id: 59, price: 8, stock: 999, description: '火灵草' },
    { id: 5, item_id: 60, price: 8, stock: 999, description: '水灵草' },
    { id: 6, item_id: 61, price: 8, stock: 999, description: '土灵草' },
    { id: 7, item_id: 62, price: 8, stock: 999, description: '金灵草' },
    { id: 8, item_id: 63, price: 8, stock: 999, description: '木灵草' },
    { id: 9, item_id: 64, price: 15, stock: 999, description: '精铁' },
    { id: 10, item_id: 41, price: 20, stock: 999, description: '玄铁' },
    { id: 11, item_id: 77, price: 5, stock: 999, description: '宠物口粮' },
    { id: 12, item_id: 55, price: 100, stock: 10, description: '传音符' },
    { id: 13, item_id: 56, price: 50, stock: 50, description: '回城符' },
    { id: 14, item_id: 57, price: 30, stock: 50, description: '随机传送符' },
    { id: 15, item_id: 47, price: 500, stock: 5, description: '灵宠蛋' },
    { id: 16, item_id: 48, price: 2000, stock: 3, description: '灵兽蛋' },
    { id: 17, item_id: 51, price: 0, stock: 1, description: '新手礼包' }
  ];

  db.shop.push(...newShop);
  saveDatabase(db);
  console.log('商店数据已更新');
}

console.log('数据初始化完成');
