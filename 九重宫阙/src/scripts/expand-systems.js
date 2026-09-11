const { initDatabase, loadDatabase, saveDatabase } = require('../database');

initDatabase();
const db = loadDatabase();

// ========== 法器体系 ==========
// 法器分类：飞剑、法杖、宝镜、法印、法宝、灵器
const weapons = [
  // === 飞剑系列 ===
  { id: 200, name: '青钢剑', type: '法器', subtype: '飞剑', quality: '凡器', realm: '炼气', stats: '{"attack":12,"speed":3,"element":"金","set":"青钢"}', description: '青钢打造的飞剑，锋利无比' },
  { id: 201, name: '青钢双剑', type: '法器', subtype: '飞剑', quality: '凡器', realm: '炼气', stats: '{"attack":18,"speed":5,"element":"金","set":"青钢"}', description: '一对青钢飞剑，双剑合璧' },
  { id: 202, name: '烈火飞剑', type: '法器', subtype: '飞剑', quality: '灵器', realm: '筑基', stats: '{"attack":30,"speed":8,"element":"火","set":"烈火"}', description: '火属性飞剑，可喷射火焰' },
  { id: 203, name: '寒冰飞剑', type: '法器', subtype: '飞剑', quality: '灵器', realm: '筑基', stats: '{"attack":28,"speed":10,"element":"水","set":"寒冰"}', description: '水属性飞剑，可冻结敌人' },
  { id: 204, name: '雷霆飞剑', type: '法器', subtype: '飞剑', quality: '法宝', realm: '金丹', stats: '{"attack":55,"speed":15,"element":"雷","set":"雷霆"}', description: '雷属性飞剑，可释放雷霆' },
  { id: 205, name: '紫霄飞剑', type: '法器', subtype: '飞剑', quality: '古宝', realm: '元婴', stats: '{"attack":90,"speed":20,"element":"雷","set":"紫霄"}', description: '紫霄神雷凝聚的飞剑' },
  { id: 206, name: '天诛飞剑', type: '法器', subtype: '飞剑', quality: '灵宝', realm: '化神', stats: '{"attack":140,"speed":25,"element":"金","set":"天诛"}', description: '天道诛邪的神剑' },
  { id: 207, name: '诛仙飞剑', type: '法器', subtype: '飞剑', quality: '道器', realm: '炼虚', stats: '{"attack":220,"speed":30,"element":"金","set":"诛仙"}', description: '传说中的诛仙四剑之一' },
  { id: 208, name: '轩辕神剑', type: '法器', subtype: '飞剑', quality: '仙器', realm: '合体', stats: '{"attack":350,"speed":35,"element":"金","set":"轩辕"}', description: '轩辕黄帝的神剑' },
  { id: 209, name: '混沌飞剑', type: '法器', subtype: '飞剑', quality: '混沌至宝', realm: '大乘', stats: '{"attack":500,"speed":40,"element":"混沌","set":"混沌"}', description: '混沌之力凝聚的飞剑' },

  // === 法杖系列 ===
  { id: 210, name: '桃木杖', type: '法器', subtype: '法杖', quality: '凡器', realm: '炼气', stats: '{"attack":8,"mp":20,"element":"木","set":"桃木"}', description: '桃木打造的法杖，驱邪避凶' },
  { id: 211, name: '烈焰杖', type: '法器', subtype: '法杖', quality: '灵器', realm: '筑基', stats: '{"attack":25,"mp":50,"element":"火","set":"烈焰"}', description: '火属性法杖，可召唤烈焰' },
  { id: 212, name: '寒冰杖', type: '法器', subtype: '法杖', quality: '灵器', realm: '筑基', stats: '{"attack":22,"mp":60,"element":"水","set":"寒冰"}', description: '水属性法杖，可召唤寒冰' },
  { id: 213, name: '雷霆杖', type: '法器', subtype: '法杖', quality: '法宝', realm: '金丹', stats: '{"attack":45,"mp":100,"element":"雷","set":"雷霆"}', description: '雷属性法杖，可召唤雷霆' },
  { id: 214, name: '五行杖', type: '法器', subtype: '法杖', quality: '古宝', realm: '元婴', stats: '{"attack":80,"mp":150,"element":"五行","set":"五行"}', description: '蕴含五行之力的法杖' },
  { id: 215, name: '星辰杖', type: '法器', subtype: '法杖', quality: '灵宝', realm: '化神', stats: '{"attack":130,"mp":200,"element":"星辰","set":"星辰"}', description: '蕴含星辰之力的法杖' },
  { id: 216, name: '太极杖', type: '法器', subtype: '法杖', quality: '道器', realm: '炼虚', stats: '{"attack":200,"mp":300,"element":"阴阳","set":"太极"}', description: '蕴含太极之道的法杖' },
  { id: 217, name: '造化杖', type: '法器', subtype: '法杖', quality: '仙器', realm: '合体', stats: '{"attack":320,"mp":500,"element":"造化","set":"造化"}', description: '蕴含造化之力的法杖' },

  // === 宝镜系列 ===
  { id: 220, name: '八卦镜', type: '法器', subtype: '宝镜', quality: '凡器', realm: '炼气', stats: '{"defense":15,"speed":2,"element":"光","set":"八卦"}', description: '八卦宝镜，可反射攻击' },
  { id: 221, name: '昊天镜', type: '法器', subtype: '宝镜', quality: '灵器', realm: '筑基', stats: '{"defense":30,"speed":5,"element":"光","set":"昊天"}', description: '昊天宝镜，可照妖除魔' },
  { id: 222, name: '阴阳镜', type: '法器', subtype: '宝镜', quality: '法宝', realm: '金丹', stats: '{"defense":50,"speed":8,"element":"阴阳","set":"阴阳"}', description: '阴阳宝镜，可定人生死' },
  { id: 223, name: '乾坤镜', type: '法器', subtype: '宝镜', quality: '古宝', realm: '元婴', stats: '{"defense":80,"speed":12,"element":"混沌","set":"乾坤"}', description: '乾坤宝镜，可照见万物' },
  { id: 224, name: '混元镜', type: '法器', subtype: '宝镜', quality: '灵宝', realm: '化神', stats: '{"defense":120,"speed":18,"element":"混沌","set":"混元"}', description: '混元宝镜，可照见因果' },
  { id: 225, name: '太极镜', type: '法器', subtype: '宝镜', quality: '道器', realm: '炼虚', stats: '{"defense":180,"speed":25,"element":"阴阳","set":"太极"}', description: '太极宝镜，可照见天道' },

  // === 法印系列 ===
  { id: 230, name: '五行印', type: '法器', subtype: '法印', quality: '凡器', realm: '炼气', stats: '{"attack":10,"defense":10,"element":"五行","set":"五行"}', description: '蕴含五行之力的法印' },
  { id: 231, name: '雷印', type: '法器', subtype: '法印', quality: '灵器', realm: '筑基', stats: '{"attack":20,"defense":15,"element":"雷","set":"雷印"}', description: '雷属性法印，可释放雷电' },
  { id: 232, name: '火印', type: '法器', subtype: '法印', quality: '法宝', realm: '金丹', stats: '{"attack":40,"defense":20,"element":"火","set":"火印"}', description: '火属性法印，可召唤烈焰' },
  { id: 233, name: '冰印', type: '法器', subtype: '法印', quality: '古宝', realm: '元婴', stats: '{"attack":70,"defense":30,"element":"水","set":"冰印"}', description: '水属性法印，可冻结万物' },
  { id: 234, name: '风印', type: '法器', subtype: '法印', quality: '灵宝', realm: '化神', stats: '{"attack":110,"defense":40,"element":"风","set":"风印"}', description: '风属性法印，可操控风力' },
  { id: 235, name: '混沌印', type: '法器', subtype: '法印', quality: '道器', realm: '炼虚', stats: '{"attack":170,"defense":60,"element":"混沌","set":"混沌"}', description: '混沌法印，蕴含混沌之力' },

  // === 法宝系列 ===
  { id: 240, name: '金钟罩', type: '法器', subtype: '法宝', quality: '灵器', realm: '筑基', stats: '{"defense":40,"hp":100,"element":"金","set":"金钟"}', description: '防御型法宝，可形成金钟罩' },
  { id: 241, name: '琉璃塔', type: '法器', subtype: '法宝', quality: '法宝', realm: '金丹', stats: '{"defense":60,"hp":200,"element":"光","set":"琉璃"}', description: '防御型法宝，可形成琉璃塔' },
  { id: 242, name: '乾坤袋', type: '法器', subtype: '法宝', quality: '古宝', realm: '元婴', stats: '{"hp":500,"mp":200,"element":"空间","set":"乾坤"}', description: '空间型法宝，可收纳万物' },
  { id: 243, name: '山河图', type: '法器', subtype: '法宝', quality: '灵宝', realm: '化神', stats: '{"hp":800,"mp":300,"element":"五行","set":"山河"}', description: '蕴含山河之力的画卷' },
  { id: 244, name: '太极图', type: '法器', subtype: '法宝', quality: '道器', realm: '炼虚', stats: '{"hp":1200,"mp":500,"element":"阴阳","set":"太极"}', description: '蕴含太极之道的法宝' },
  { id: 245, name: '混沌钟', type: '法器', subtype: '法宝', quality: '仙器', realm: '合体', stats: '{"hp":2000,"mp":800,"element":"混沌","set":"混沌"}', description: '混沌至宝，可镇压万物' },

  // === 灵器系列 ===
  { id: 250, name: '飞天梭', type: '法器', subtype: '灵器', quality: '凡器', realm: '炼气', stats: '{"speed":15,"attack":5,"element":"风","set":"飞天"}', description: '飞行法器，可日行万里' },
  { id: 251, name: '遁天梭', type: '法器', subtype: '灵器', quality: '灵器', realm: '筑基', stats: '{"speed":30,"attack":10,"element":"风","set":"遁天"}', description: '高级飞行法器，可遁入虚空' },
  { id: 252, name: '瞬息万里梭', type: '法器', subtype: '灵器', quality: '法宝', realm: '金丹', stats: '{"speed":50,"attack":15,"element":"空间","set":"瞬息"}', description: '瞬息万里的飞行法器' },
  { id: 253, name: '破空梭', type: '法器', subtype: '灵器', quality: '古宝', realm: '元婴', stats: '{"speed":80,"attack":20,"element":"空间","set":"破空"}', description: '可破开虚空的飞行法器' },
  { id: 254, name: '时空梭', type: '法器', subtype: '灵器', quality: '仙器', realm: '合体', stats: '{"speed":150,"attack":30,"element":"时空","set":"时空"}', description: '可穿越时空的飞行法器' },
];

// ========== 丹药体系 ==========
const pills = [
  // === 回复类丹药 ===
  { id: 300, name: '回灵丹', type: '丹药', subtype: '回复', quality: '凡品', realm: '炼气', stats: '{"mp_restore":50,"cooldown":60}', description: '恢复50点灵力' },
  { id: 301, name: '疗伤丹', type: '丹药', subtype: '回复', quality: '凡品', realm: '炼气', stats: '{"hp_restore":100,"cooldown":60}', description: '恢复100点生命' },
  { id: 302, name: '大回灵丹', type: '丹药', subtype: '回复', quality: '灵品', realm: '筑基', stats: '{"mp_restore":200,"cooldown":60}', description: '恢复200点灵力' },
  { id: 303, name: '大疗伤丹', type: '丹药', subtype: '回复', quality: '灵品', realm: '筑基', stats: '{"hp_restore":500,"cooldown":60}', description: '恢复500点生命' },
  { id: 304, name: '续命丹', type: '丹药', subtype: '回复', quality: '宝品', realm: '金丹', stats: '{"hp_restore":1500,"mp_restore":500,"cooldown":120}', description: '恢复大量生命和灵力' },
  { id: 305, name: '九转回魂丹', type: '丹药', subtype: '回复', quality: '古宝', realm: '元婴', stats: '{"hp_restore":5000,"mp_restore":2000,"cooldown":300}', description: '恢复巨量生命和灵力' },
  { id: 306, name: '仙灵丹', type: '丹药', subtype: '回复', quality: '仙器', realm: '合体', stats: '{"hp_full":true,"mp_full":true,"cooldown":600}', description: '完全恢复生命和灵力' },

  // === 增益类丹药 ===
  { id: 310, name: '培元丹', type: '丹药', subtype: '增益', quality: '凡品', realm: '炼气', stats: '{"exp_bonus":1.5,"duration":300}', description: '修炼经验增加50%，持续5分钟' },
  { id: 311, name: '聚灵丹', type: '丹药', subtype: '增益', quality: '灵品', realm: '筑基', stats: '{"attack_bonus":1.2,"duration":300}', description: '攻击增加20%，持续5分钟' },
  { id: 312, name: '铁壁丹', type: '丹药', subtype: '增益', quality: '灵品', realm: '筑基', stats: '{"defense_bonus":1.2,"duration":300}', description: '防御增加20%，持续5分钟' },
  { id: 313, name: '疾风丹', type: '丹药', subtype: '增益', quality: '灵品', realm: '筑基', stats: '{"speed_bonus":1.3,"duration":300}', description: '速度增加30%，持续5分钟' },
  { id: 314, name: '狂暴丹', type: '丹药', subtype: '增益', quality: '宝品', realm: '金丹', stats: '{"attack_bonus":1.5,"crit_bonus":0.2,"duration":300}', description: '攻击增加50%，暴击增加20%' },
  { id: 315, name: '金刚丹', type: '丹药', subtype: '增益', quality: '宝品', realm: '金丹', stats: '{"defense_bonus":1.5,"hp_bonus":1.3,"duration":300}', description: '防御增加50%，生命增加30%' },
  { id: 316, name: '天罡丹', type: '丹药', subtype: '增益', quality: '古宝', realm: '元婴', stats: '{"all_stats_bonus":1.3,"duration":600}', description: '全属性增加30%，持续10分钟' },
  { id: 317, name: '造化丹', type: '丹药', subtype: '增益', quality: '仙器', realm: '合体', stats: '{"all_stats_bonus":1.5,"duration":600}', description: '全属性增加50%，持续10分钟' },

  // === 突破类丹药 ===
  { id: 320, name: '筑基丹', type: '丹药', subtype: '突破', quality: '灵品', realm: '炼气', stats: '{"breakthrough_bonus":0.3}', description: '突破成功率+30%' },
  { id: 321, name: '金丹丹', type: '丹药', subtype: '突破', quality: '宝品', realm: '筑基', stats: '{"breakthrough_bonus":0.4}', description: '突破成功率+40%' },
  { id: 322, name: '元婴丹', type: '丹药', subtype: '突破', quality: '古宝', realm: '金丹', stats: '{"breakthrough_bonus":0.5}', description: '突破成功率+50%' },
  { id: 323, name: '化神丹', type: '丹药', subtype: '突破', quality: '灵宝', realm: '元婴', stats: '{"breakthrough_bonus":0.6}', description: '突破成功率+60%' },
  { id: 324, name: '炼虚丹', type: '丹药', subtype: '突破', quality: '道器', realm: '化神', stats: '{"breakthrough_bonus":0.7}', description: '突破成功率+70%' },
  { id: 325, name: '合体丹', type: '丹药', subtype: '突破', quality: '仙器', realm: '炼虚', stats: '{"breakthrough_bonus":0.8}', description: '突破成功率+80%' },

  // === 特殊类丹药 ===
  { id: 330, name: '洗髓丹', type: '丹药', subtype: '特殊', quality: '灵品', realm: '筑基', stats: '{"reset_stats":true}', description: '重置角色属性' },
  { id: 331, name: '驻颜丹', type: '丹药', subtype: '特殊', quality: '宝品', realm: '金丹', stats: '{"appearance":"永葆青春"}', description: '永葆青春' },
  { id: 332, name: '破境丹', type: '丹药', subtype: '特殊', quality: '古宝', realm: '元婴', stats: '{"instant_breakthrough":true}', description: '立即突破当前境界' },
  { id: 333, name: '造化丹', type: '丹药', subtype: '特殊', quality: '仙器', realm: '合体', stats: '{"reroll_quality":true}', description: '重置装备品质' },

  // === 灵宠丹药 ===
  { id: 340, name: '灵宠口粮', type: '丹药', subtype: '灵宠', quality: '凡品', realm: '炼气', stats: '{"pet_exp":30}', description: '喂养灵宠获得30经验' },
  { id: 341, name: '灵宠干粮', type: '丹药', subtype: '灵宠', quality: '凡品', realm: '炼气', stats: '{"pet_exp":50}', description: '喂养灵宠获得50经验' },
  { id: 342, name: '灵宠美食', type: '丹药', subtype: '灵宠', quality: '灵品', realm: '筑基', stats: '{"pet_exp":120}', description: '喂养灵宠获得120经验' },
  { id: 343, name: '灵宠仙粮', type: '丹药', subtype: '灵宠', quality: '宝品', realm: '金丹', stats: '{"pet_exp":300}', description: '喂养灵宠获得300经验' },
  { id: 344, name: '灵宠进化石', type: '丹药', subtype: '灵宠', quality: '古宝', realm: '元婴', stats: '{"pet_evolve":true}', description: '灵宠进化所需材料' },
];

// ========== 符箓体系 ====
const talismans = [
  // === 攻击符箓 ===
  { id: 400, name: '火球符', type: '符箓', subtype: '攻击', quality: '凡品', realm: '炼气', stats: '{"damage":50,"element":"火","uses":3}', description: '释放火球攻击敌人' },
  { id: 401, name: '冰锥符', type: '符箓', subtype: '攻击', quality: '凡品', realm: '炼气', stats: '{"damage":45,"element":"水","freeze_chance":0.3,"uses":3}', description: '释放冰锥攻击，有几率冻结' },
  { id: 402, name: '雷电符', type: '符箓', subtype: '攻击', quality: '灵品', realm: '筑基', stats: '{"damage":100,"element":"雷","stun_chance":0.2,"uses":5}', description: '释放雷电攻击，有几率麻痹' },
  { id: 403, name: '风刃符', type: '符箓', subtype: '攻击', quality: '灵品', realm: '筑基', stats: '{"damage":90,"element":"风","speed_bonus":0.3,"uses":5}', description: '释放风刃攻击，提升速度' },
  { id: 404, name: '地刺符', type: '符箓', subtype: '攻击', quality: '灵品', realm: '筑基', stats: '{"damage":110,"element":"土","slow_chance":0.3,"uses":5}', description: '释放地刺攻击，有几率减速' },
  { id: 405, name: '五雷符', type: '符箓', subtype: '攻击', quality: '法宝', realm: '金丹', stats: '{"damage":200,"element":"雷","stun_chance":0.3,"uses":8}', description: '释放五雷轰顶' },
  { id: 406, name: '天火符', type: '符箓', subtype: '攻击', quality: '法宝', realm: '金丹', stats: '{"damage":250,"element":"火","burn_chance":0.4,"uses":8}', description: '释放天火焚烧' },
  { id: 407, name: '冰封千里符', type: '符箓', subtype: '攻击', quality: '古宝', realm: '元婴', stats: '{"damage":400,"element":"水","freeze_chance":0.5,"aoe":true,"uses":10}', description: '冰封千里，群体攻击' },
  { id: 408, name: '雷霆万钧符', type: '符箓', subtype: '攻击', quality: '古宝', realm: '元婴', stats: '{"damage":500,"element":"雷","stun_chance":0.4,"aoe":true,"uses":10}', description: '雷霆万钧，群体攻击' },
  { id: 409, name: '灭世天火符', type: '符箓', subtype: '攻击', quality: '灵宝', realm: '化神', stats: '{"damage":800,"element":"火","burn_chance":0.6,"aoe":true,"uses":12}', description: '灭世天火，群体攻击' },
  { id: 410, name: '混沌神雷符', type: '符箓', subtype: '攻击', quality: '道器', realm: '炼虚', stats: '{"damage":1500,"element":"混沌","stun_chance":0.5,"aoe":true,"uses":15}', description: '混沌神雷，群体攻击' },

  // === 防御符箓 ===
  { id: 420, name: '铁壁符', type: '符箓', subtype: '防御', quality: '凡品', realm: '炼气', stats: '{"defense_bonus":1.3,"duration":60,"uses":3}', description: '防御增加30%，持续1分钟' },
  { id: 421, name: '金钟符', type: '符箓', subtype: '防御', quality: '灵品', realm: '筑基', stats: '{"defense_bonus":1.5,"duration":120,"uses":5}', description: '防御增加50%，持续2分钟' },
  { id: 422, name: '护体神光符', type: '符箓', subtype: '防御', quality: '法宝', realm: '金丹', stats: '{"defense_bonus":2.0,"hp_bonus":1.5,"duration":180,"uses":8}', description: '防御增加100%，生命增加50%' },
  { id: 423, name: '金刚不坏符', type: '符箓', subtype: '防御', quality: '古宝', realm: '元婴', stats: '{"defense_bonus":3.0,"duration":300,"immune_damage":true,"uses":10}', description: '免疫所有伤害，持续5分钟' },
  { id: 424, name: '混元一气符', type: '符箓', subtype: '防御', quality: '灵宝', realm: '化神', stats: '{"defense_bonus":5.0,"duration":300,"reflect_damage":0.3,"uses":12}', description: '防御增加400%，反弹30%伤害' },

  // === 辅助符箓 ===
  { id: 430, name: '疾风符', type: '符箓', subtype: '辅助', quality: '凡品', realm: '炼气', stats: '{"speed_bonus":1.5,"duration":60,"uses":3}', description: '速度增加50%，持续1分钟' },
  { id: 431, name: '神行符', type: '符箓', subtype: '辅助', quality: '灵品', realm: '筑基', stats: '{"speed_bonus":2.0,"duration":120,"uses":5}', description: '速度增加100%，持续2分钟' },
  { id: 432, name: '聚灵符', type: '符箓', subtype: '辅助', quality: '灵品', realm: '筑基', stats: '{"exp_bonus":2.0,"duration":300,"uses":5}', description: '经验增加100%，持续5分钟' },
  { id: 433, name: '遁地符', type: '符箓', subtype: '辅助', quality: '法宝', realm: '金丹', stats: '{"teleport":true,"uses":3}', description: '传送回城' },
  { id: 434, name: '隐身符', type: '符箓', subtype: '辅助', quality: '法宝', realm: '金丹', stats: '{"stealth":true,"duration":180,"uses":5}', description: '隐身3分钟' },
  { id: 435, name: '千里眼符', type: '符箓', subtype: '辅助', quality: '古宝', realm: '元婴', stats: '{"vision_range":10,"duration":300,"uses":8}', description: '视野范围增加10倍' },
  { id: 436, name: '他心通符', type: '符箓', subtype: '辅助', quality: '古宝', realm: '元婴', stats: '{"read_mind":true,"duration":180,"uses":5}', description: '可读取他人心思' },

  // === 封印符箓 ===
  { id: 440, name: '封印符', type: '符箓', subtype: '封印', quality: '灵品', realm: '筑基', stats: '{"seal_target":true,"duration":60,"uses":3}', description: '封印目标60秒' },
  { id: 441, name: '禁魔术', type: '符箓', subtype: '封印', quality: '法宝', realm: '金丹', stats: '{"seal_magic":true,"duration":120,"uses":5}', description: '禁止目标使用法术' },
  { id: 442, name: '困仙符', type: '符箓', subtype: '封印', quality: '古宝', realm: '元婴', stats: '{"trap":true,"duration":300,"uses":8}', description: '困住目标5分钟' },
  { id: 443, name: '封神符', type: '符箓', subtype: '封印', quality: '灵宝', realm: '化神', stats: '{"seal_all":true,"duration":600,"uses":10}', description: '封印目标所有能力' },
];

// ========== 阵法体系 ==========
const formations = [
  // === 攻击阵法 ===
  { id: 500, name: '五行攻击阵', type: '阵法', subtype: '攻击', quality: '凡品', realm: '炼气', stats: '{"attack_bonus":1.2,"aoe_damage":50,"element":"五行","members":5}', description: '五行攻击阵，提升全队攻击' },
  { id: 501, name: '烈焰焚天阵', type: '阵法', subtype: '攻击', quality: '灵器', realm: '筑基', stats: '{"attack_bonus":1.3,"aoe_damage":120,"element":"火","members":5}', description: '火属性攻击阵，召唤烈焰' },
  { id: 502, name: '寒冰绝杀阵', type: '阵法', subtype: '攻击', quality: '灵器', realm: '筑基', stats: '{"attack_bonus":1.3,"aoe_damage":110,"element":"水","freeze_chance":0.3,"members":5}', description: '水属性攻击阵，冻结敌人' },
  { id: 503, name: '雷霆灭世阵', type: '阵法', subtype: '攻击', quality: '法宝', realm: '金丹', stats: '{"attack_bonus":1.5,"aoe_damage":250,"element":"雷","stun_chance":0.3,"members":7}', description: '雷属性攻击阵，雷霆万钧' },
  { id: 504, name: '天罡北斗阵', type: '阵法', subtype: '攻击', quality: '古宝', realm: '元婴', stats: '{"attack_bonus":1.8,"aoe_damage":500,"element":"星辰","members":7}', description: '北斗七星攻击阵' },
  { id: 505, name: '诛仙剑阵', type: '阵法', subtype: '攻击', quality: '灵宝', realm: '化神', stats: '{"attack_bonus":2.5,"aoe_damage":1000,"element":"金","members":4}', description: '传说中的诛仙剑阵' },
  { id: 506, name: '混沌灭世阵', type: '阵法', subtype: '攻击', quality: '道器', realm: '炼虚', stats: '{"attack_bonus":3.0,"aoe_damage":2000,"element":"混沌","members":9}', description: '混沌之力攻击阵' },

  // === 防御阵法 ===
  { id: 510, name: '五行防御阵', type: '阵法', subtype: '防御', quality: '凡品', realm: '炼气', stats: '{"defense_bonus":1.3,"damage_reduce":0.2,"element":"五行","members":5}', description: '五行防御阵，提升全队防御' },
  { id: 511, name: '金钟护体阵', type: '阵法', subtype: '防御', quality: '灵器', realm: '筑基', stats: '{"defense_bonus":1.5,"damage_reduce":0.3,"element":"金","members":5}', description: '金属性防御阵，金钟罩体' },
  { id: 512, name: '玄武镇岳阵', type: '阵法', subtype: '防御', quality: '法宝', realm: '金丹', stats: '{"defense_bonus":2.0,"damage_reduce":0.4,"element":"土","members":7}', description: '玄武防御阵，稳如泰山' },
  { id: 513, name: '混元一气阵', type: '阵法', subtype: '防御', quality: '古宝', realm: '元婴', stats: '{"defense_bonus":2.5,"damage_reduce":0.5,"element":"混沌","members":7}', description: '混元防御阵，万法不侵' },
  { id: 514, name: '太极两仪阵', type: '阵法', subtype: '防御', quality: '灵宝', realm: '化神', stats: '{"defense_bonus":3.0,"damage_reduce":0.6,"element":"阴阳","members":9}', description: '太极防御阵，阴阳调和' },
  { id: 515, name: '周天星斗大阵', type: '阵法', subtype: '防御', quality: '道器', realm: '炼虚', stats: '{"defense_bonus":5.0,"damage_reduce":0.8,"element":"星辰","members":9}', description: '周天星斗防御阵' },

  // === 辅助阵法 ===
  { id: 520, name: '聚灵阵', type: '阵法', subtype: '辅助', quality: '凡品', realm: '炼气', stats: '{"exp_bonus":1.3,"mp_regen":1.5,"members":5}', description: '聚灵阵，提升修炼速度' },
  { id: 521, name: '回春阵', type: '阵法', subtype: '辅助', quality: '灵器', realm: '筑基', stats: '{"hp_regen":1.5,"mp_regen":1.5,"members":5}', description: '回春阵，持续恢复生命' },
  { id: 522, name: '乾坤挪移阵', type: '阵法', subtype: '辅助', quality: '法宝', realm: '金丹', stats: '{"teleport":true,"cooldown":300,"members":7}', description: '传送阵，可传送至目的地' },
  { id: 523, name: '时空逆转阵', type: '阵法', subtype: '辅助', quality: '古宝', realm: '元婴', stats: '{"revive":true,"revive_hp":0.5,"cooldown":600,"members":7}', description: '逆转时空，复活队友' },
  { id: 524, name: '天道循环阵', type: '阵法', subtype: '辅助', quality: '灵宝', realm: '化神', stats: '{"all_stats_bonus":1.3,"duration":300,"members":9}', description: '天道循环，全属性提升' },
  { id: 525, name: '造化之阵', type: '阵法', subtype: '辅助', quality: '仙器', realm: '合体', stats: '{"all_stats_bonus":2.0,"duration":600,"members":9}', description: '造化之力，全属性大幅提升' },

  // === 封印阵法 ===
  { id: 530, name: '五行封印阵', type: '阵法', subtype: '封印', quality: '灵器', realm: '筑基', stats: '{"seal_target":true,"duration":120,"element":"五行","members":5}', description: '五行封印阵，封印敌人' },
  { id: 531, name: '困仙锁魔阵', type: '阵法', subtype: '封印', quality: '法宝', realm: '金丹', stats: '{"trap":true,"duration":300,"element":"金","members":7}', description: '困仙锁魔阵，困住敌人' },
  { id: 532, name: '乾坤禁锢阵', type: '阵法', subtype: '封印', quality: '古宝', realm: '元婴', stats: '{"seal_all":true,"duration":600,"element":"混沌","members":7}', description: '乾坤禁锢阵，禁锢一切' },
  { id: 533, name: '天道审判阵', type: '阵法', subtype: '封印', quality: '道器', realm: '炼虚', stats: '{"seal_all":true,"duration":900,"element":"光","members":9}', description: '天道审判阵，天道制裁' },
];

// 添加到数据库
const existingIds = new Set(db.items.map(i => i.id));
let addedCount = 0;

for (const item of [...weapons, ...pills, ...talismans, ...formations]) {
  if (!existingIds.has(item.id)) {
    db.items.push(item);
    addedCount++;
  }
}

if (addedCount > 0) {
  console.log(`新增 ${addedCount} 种物品`);
}

// ========== 炼丹配方扩展 ==========
if (!db.recipes) db.recipes = [];

const pillRecipes = [
  { id: 10, name: '回灵丹', type: '丹药', materials: [{item_id:110,quantity:2},{item_id:121,quantity:1}], result: 300, quantity: 2, level: 1, description: '恢复50点灵力' },
  { id: 11, name: '疗伤丹', type: '丹药', materials: [{item_id:110,quantity:2},{item_id:120,quantity:1}], result: 301, quantity: 2, level: 1, description: '恢复100点生命' },
  { id: 12, name: '大回灵丹', type: '丹药', materials: [{item_id:112,quantity:2},{item_id:122,quantity:1}], result: 302, quantity: 2, level: 2, description: '恢复200点灵力' },
  { id: 13, name: '大疗伤丹', type: '丹药', materials: [{item_id:112,quantity:2},{item_id:122,quantity:1}], result: 303, quantity: 2, level: 2, description: '恢复500点生命' },
  { id: 14, name: '培元丹', type: '丹药', materials: [{item_id:111,quantity:3},{item_id:110,quantity:2}], result: 310, quantity: 1, level: 1, description: '修炼经验增加50%' },
  { id: 15, name: '聚灵丹', type: '丹药', materials: [{item_id:112,quantity:2},{item_id:120,quantity:2}], result: 311, quantity: 1, level: 2, description: '攻击增加20%' },
  { id: 16, name: '铁壁丹', type: '丹药', materials: [{item_id:112,quantity:2},{item_id:124,quantity:2}], result: 312, quantity: 1, level: 2, description: '防御增加20%' },
  { id: 17, name: '疾风丹', type: '丹药', materials: [{item_id:112,quantity:2},{item_id:123,quantity:2}], result: 313, quantity: 1, level: 2, description: '速度增加30%' },
  { id: 18, name: '筑基丹', type: '丹药', materials: [{item_id:113,quantity:2},{item_id:121,quantity:3},{item_id:141,quantity:1}], result: 320, quantity: 1, level: 3, description: '突破成功率+30%' },
  { id: 19, name: '金丹丹', type: '丹药', materials: [{item_id:113,quantity:3},{item_id:122,quantity:3},{item_id:142,quantity:1}], result: 321, quantity: 1, level: 4, description: '突破成功率+40%' },
  { id: 20, name: '元婴丹', type: '丹药', materials: [{item_id:114,quantity:3},{item_id:125,quantity:3},{item_id:143,quantity:1}], result: 322, quantity: 1, level: 5, description: '突破成功率+50%' },
  { id: 21, name: '狂暴丹', type: '丹药', materials: [{item_id:120,quantity:3},{item_id:131,quantity:2}], result: 314, quantity: 1, level: 3, description: '攻击增加50%，暴击增加20%' },
  { id: 22, name: '金刚丹', type: '丹药', materials: [{item_id:124,quantity:3},{item_id:131,quantity:2}], result: 315, quantity: 1, level: 3, description: '防御增加50%，生命增加30%' },
  { id: 23, name: '天罡丹', type: '丹药', materials: [{item_id:114,quantity:2},{item_id:127,quantity:2},{item_id:142,quantity:2}], result: 316, quantity: 1, level: 6, description: '全属性增加30%' },
  { id: 24, name: '洗髓丹', type: '丹药', materials: [{item_id:112,quantity:3},{item_id:122,quantity:2},{item_id:130,quantity:1}], result: 330, quantity: 1, level: 3, description: '重置角色属性' },
  { id: 25, name: '续命丹', type: '丹药', materials: [{item_id:113,quantity:3},{item_id:131,quantity:3},{item_id:142,quantity:1}], result: 304, quantity: 1, level: 4, description: '恢复大量生命和灵力' },
  { id: 26, name: '九转回魂丹', type: '丹药', materials: [{item_id:114,quantity:3},{item_id:132,quantity:3},{item_id:143,quantity:2}], result: 305, quantity: 1, level: 7, description: '恢复巨量生命和灵力' },
];

const existingRecipes = new Set(db.recipes.map(r => r.id));
let recipeCount = 0;
for (const recipe of pillRecipes) {
  if (!existingRecipes.has(recipe.id)) {
    db.recipes.push(recipe);
    recipeCount++;
  }
}
if (recipeCount > 0) {
  console.log(`新增 ${recipeCount} 个炼丹配方`);
}

// ========== 炼器配方扩展 ==========
if (!db.forge_recipes) db.forge_recipes = [];

const forgeRecipes = [
  { id: 10, name: '青钢剑', type: '飞剑', materials: [{item_id:101,quantity:3},{item_id:170,quantity:2}], result: 200, quantity: 1, level: 1, description: '青钢打造的飞剑' },
  { id: 11, name: '烈火飞剑', type: '飞剑', materials: [{item_id:103,quantity:2},{item_id:120,quantity:3},{item_id:172,quantity:1}], result: 202, quantity: 1, level: 2, description: '火属性飞剑' },
  { id: 12, name: '寒冰飞剑', type: '飞剑', materials: [{item_id:103,quantity:2},{item_id:121,quantity:3},{item_id:172,quantity:1}], result: 203, quantity: 1, level: 2, description: '水属性飞剑' },
  { id: 13, name: '雷霆飞剑', type: '飞剑', materials: [{item_id:105,quantity:2},{item_id:122,quantity:3},{item_id:173,quantity:1}], result: 204, quantity: 1, level: 3, description: '雷属性飞剑' },
  { id: 14, name: '桃木杖', type: '法杖', materials: [{item_id:110,quantity:3},{item_id:170,quantity:2}], result: 210, quantity: 1, level: 1, description: '桃木打造的法杖' },
  { id: 15, name: '烈焰杖', type: '法杖', materials: [{item_id:112,quantity:2},{item_id:120,quantity:3},{item_id:172,quantity:1}], result: 211, quantity: 1, level: 2, description: '火属性法杖' },
  { id: 16, name: '寒冰杖', type: '法杖', materials: [{item_id:112,quantity:2},{item_id:121,quantity:3},{item_id:172,quantity:1}], result: 212, quantity: 1, level: 2, description: '水属性法杖' },
  { id: 17, name: '八卦镜', type: '宝镜', materials: [{item_id:102,quantity:3},{item_id:126,quantity:1},{item_id:171,quantity:2}], result: 220, quantity: 1, level: 1, description: '八卦宝镜' },
  { id: 18, name: '昊天镜', type: '宝镜', materials: [{item_id:104,quantity:2},{item_id:126,quantity:2},{item_id:172,quantity:1}], result: 221, quantity: 1, level: 2, description: '昊天宝镜' },
  { id: 19, name: '五行印', type: '法印', materials: [{item_id:120,quantity:1},{item_id:121,quantity:1},{item_id:122,quantity:1},{item_id:123,quantity:1},{item_id:124,quantity:1}], result: 230, quantity: 1, level: 1, description: '五行法印' },
  { id: 20, name: '金钟罩', type: '法宝', materials: [{item_id:103,quantity:3},{item_id:120,quantity:2},{item_id:172,quantity:2}], result: 240, quantity: 1, level: 2, description: '防御型法宝' },
  { id: 21, name: '飞天梭', type: '灵器', materials: [{item_id:123,quantity:3},{item_id:101,quantity:2},{item_id:170,quantity:2}], result: 250, quantity: 1, level: 1, description: '飞行法器' },
  { id: 22, name: '火球符', type: '符箓', materials: [{item_id:120,quantity:2},{item_id:110,quantity:1}], result: 400, quantity: 3, level: 1, description: '火属性攻击符' },
  { id: 23, name: '冰锥符', type: '符箓', materials: [{item_id:121,quantity:2},{item_id:110,quantity:1}], result: 401, quantity: 3, level: 1, description: '水属性攻击符' },
  { id: 24, name: '雷电符', type: '符箓', materials: [{item_id:122,quantity:2},{item_id:112,quantity:1}], result: 402, quantity: 3, level: 2, description: '雷属性攻击符' },
  { id: 25, name: '铁壁符', type: '符箓', materials: [{item_id:124,quantity:2},{item_id:110,quantity:1}], result: 420, quantity: 3, level: 1, description: '防御符箓' },
  { id: 26, name: '疾风符', type: '符箓', materials: [{item_id:123,quantity:2},{item_id:110,quantity:1}], result: 430, quantity: 3, level: 1, description: '加速符箓' },
  { id: 27, name: '五行攻击阵', type: '阵法', materials: [{item_id:120,quantity:2},{item_id:121,quantity:2},{item_id:122,quantity:2},{item_id:123,quantity:2},{item_id:124,quantity:2}], result: 500, quantity: 1, level: 2, description: '五行攻击阵' },
  { id: 28, name: '五行防御阵', type: '阵法', materials: [{item_id:120,quantity:2},{item_id:121,quantity:2},{item_id:122,quantity:2},{item_id:123,quantity:2},{item_id:124,quantity:2}], result: 510, quantity: 1, level: 2, description: '五行防御阵' },
];

const existingForgeRecipes = new Set(db.forge_recipes.map(r => r.id));
let forgeCount = 0;
for (const recipe of forgeRecipes) {
  if (!existingForgeRecipes.has(recipe.id)) {
    db.forge_recipes.push(recipe);
    forgeCount++;
  }
}
if (forgeCount > 0) {
  console.log(`新增 ${forgeCount} 个炼器配方`);
}

// ========== 商店扩展 ==========
if (!db.shop) db.shop = [];

const shopItems = [
  { id: 20, item_id: 400, price: 30, stock: 99, description: '火球符' },
  { id: 21, item_id: 401, price: 30, stock: 99, description: '冰锥符' },
  { id: 22, item_id: 420, price: 40, stock: 99, description: '铁壁符' },
  { id: 23, item_id: 430, price: 25, stock: 99, description: '疾风符' },
  { id: 24, item_id: 500, price: 200, stock: 10, description: '五行攻击阵阵图' },
  { id: 25, item_id: 510, price: 200, stock: 10, description: '五行防御阵阵图' },
  { id: 26, item_id: 520, price: 150, stock: 10, description: '聚灵阵阵图' },
  { id: 27, item_id: 310, price: 50, stock: 50, description: '培元丹' },
  { id: 28, item_id: 311, price: 80, stock: 30, description: '聚灵丹' },
  { id: 29, item_id: 312, price: 80, stock: 30, description: '铁壁丹' },
  { id: 30, item_id: 313, price: 80, stock: 30, description: '疾风丹' },
];

const existingShop = new Set(db.shop.map(s => s.id));
let shopCount = 0;
for (const item of shopItems) {
  if (!existingShop.has(item.id)) {
    db.shop.push(item);
    shopCount++;
  }
}
if (shopCount > 0) {
  console.log(`新增 ${shopCount} 个商店物品`);
}

saveDatabase(db);
console.log('法器/丹药/符箓/阵法体系扩展完成');
