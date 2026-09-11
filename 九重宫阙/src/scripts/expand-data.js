const { initDatabase, loadDatabase, saveDatabase } = require('../database');

initDatabase();
const db = loadDatabase();

// ========== 扩展资源种类 ==========
if (!db.items) db.items = [];

const resourceItems = [
  // === 矿石系列 ===
  { id: 101, name: '粗铁矿', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1,"element":"金","sell_price":3}', description: '最常见的矿石，可用于基础炼器' },
  { id: 102, name: '精铁矿', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1,"element":"金","sell_price":5}', description: '品质较好的铁矿' },
  { id: 103, name: '玄铁矿', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"element":"金","sell_price":12}', description: '蕴含金属性灵气的矿石' },
  { id: 104, name: '紫金矿', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"element":"金","sell_price":18}', description: '紫金色的稀有矿石' },
  { id: 105, name: '星辰矿', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3,"element":"金","sell_price":35}', description: '蕴含星辰之力的矿石' },
  { id: 106, name: '龙血矿', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3,"element":"火","sell_price":45}', description: '被龙血浸染的矿石' },
  { id: 107, name: '天外陨铁', type: '材料', quality: '古宝', realm: '元婴', stats: '{"gather_level":4,"element":"金","sell_price":80}', description: '来自天外的陨铁' },
  { id: 108, name: '混沌矿', type: '材料', quality: '灵宝', realm: '化神', stats: '{"gather_level":5,"element":"混沌","sell_price":150}', description: '混沌之力凝结的矿石' },
  { id: 109, name: '仙晶矿', type: '材料', quality: '仙器', realm: '炼虚', stats: '{"gather_level":6,"element":"仙","sell_price":300}', description: '仙界特有的矿石' },

  // === 灵草系列 ===
  { id: 110, name: '聚灵草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1,"element":"木","sell_price":4}', description: '能聚集灵气的普通灵草' },
  { id: 111, name: '清心草', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1,"element":"木","sell_price":5}', description: '能清心静气的灵草' },
  { id: 112, name: '五行草', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"element":"木","sell_price":15}', description: '蕴含五行之力的灵草' },
  { id: 113, name: '九转灵芝', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3,"element":"木","sell_price":40}', description: '需要九百年才能成熟的灵芝' },
  { id: 114, name: '万年血参', type: '材料', quality: '古宝', realm: '元婴', stats: '{"gather_level":4,"element":"木","sell_price":90}', description: '万年血参，药效惊人' },
  { id: 115, name: '仙灵草', type: '材料', quality: '仙器', realm: '炼虚', stats: '{"gather_level":6,"element":"木","sell_price":280}', description: '仙界灵草，药效无双' },

  // === 元素结晶系列 ===
  { id: 120, name: '火焰结晶', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1,"element":"火","sell_price":6}', description: '火属性灵气凝结的结晶' },
  { id: 121, name: '寒冰结晶', type: '材料', quality: '凡品', realm: '炼气', stats: '{"gather_level":1,"element":"水","sell_price":6}', description: '水属性灵气凝结的结晶' },
  { id: 122, name: '雷霆结晶', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"element":"雷","sell_price":16}', description: '雷属性灵气凝结的结晶' },
  { id: 123, name: '风灵结晶', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"element":"风","sell_price":16}', description: '风属性灵气凝结的结晶' },
  { id: 124, name: '大地结晶', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"element":"土","sell_price":16}', description: '土属性灵气凝结的结晶' },
  { id: 125, name: '暗影结晶', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3,"element":"暗","sell_price":38}', description: '暗属性灵气凝结的结晶' },
  { id: 126, name: '光明结晶', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3,"element":"光","sell_price":38}', description: '光属性灵气凝结的结晶' },
  { id: 127, name: '混沌结晶', type: '材料', quality: '古宝', realm: '元婴', stats: '{"gather_level":4,"element":"混沌","sell_price":100}', description: '混沌之力凝结的结晶' },
  { id: 128, name: '仙灵结晶', type: '材料', quality: '仙器', realm: '炼虚', stats: '{"gather_level":6,"element":"仙","sell_price":320}', description: '仙界灵气凝结的结晶' },

  // === 特殊材料 ===
  { id: 130, name: '妖兽内丹', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"source":"monster","sell_price":20}', description: '妖兽体内的灵力结晶' },
  { id: 131, name: '千年妖丹', type: '材料', quality: '宝品', realm: '金丹', stats: '{"gather_level":3,"source":"monster","sell_price":50}', description: '千年妖兽的内丹' },
  { id: 132, name: '万年妖丹', type: '材料', quality: '古宝', realm: '元婴', stats: '{"gather_level":4,"source":"monster","sell_price":120}', description: '万年妖兽的内丹' },
  { id: 133, name: '远古妖丹', type: '材料', quality: '灵宝', realm: '化神', stats: '{"gather_level":5,"source":"monster","sell_price":200}', description: '远古妖兽的内丹' },
  { id: 134, name: '仙兽内丹', type: '材料', quality: '仙器', realm: '炼虚', stats: '{"gather_level":6,"source":"monster","sell_price":350}', description: '仙兽体内的灵力结晶' },

  // === 炼丹辅助材料 ===
  { id: 140, name: '丹炉灰', type: '材料', quality: '凡品', realm: '炼气', stats: '{"alchemy辅助":true,"sell_price":2}', description: '炼丹失败留下的灰烬' },
  { id: 141, name: '灵泉水', type: '材料', quality: '凡品', realm: '炼气', stats: '{"alchemy辅助":true,"sell_price":3}', description: '蕴含灵气的泉水' },
  { id: 142, name: '地心火种', type: '材料', quality: '灵品', realm: '筑基', stats: '{"alchemy辅助":true,"element":"火","sell_price":25}', description: '地心深处的火种' },
  { id: 143, name: '天雷木', type: '材料', quality: '宝品', realm: '金丹', stats: '{"alchemy辅助":true,"element":"雷","sell_price":55}', description: '被雷劈过的灵木' },

  // === 灵宠相关材料 ===
  { id: 150, name: '灵宠口粮', type: '消耗品', quality: '凡品', realm: '炼气', stats: '{"pet_exp":30,"sell_price":3}', description: '喂养灵宠获得30经验' },
  { id: 151, name: '灵宠干粮', type: '消耗品', quality: '凡品', realm: '炼气', stats: '{"pet_exp":50,"sell_price":5}', description: '喂养灵宠获得50经验' },
  { id: 152, name: '灵宠美食', type: '消耗品', quality: '灵品', realm: '筑基', stats: '{"pet_exp":120,"sell_price":15}', description: '喂养灵宠获得120经验' },
  { id: 153, name: '灵宠仙粮', type: '消耗品', quality: '宝品', realm: '金丹', stats: '{"pet_exp":300,"sell_price":40}', description: '喂养灵宠获得300经验' },
  { id: 154, name: '灵宠进化石', type: '消耗品', quality: '古宝', realm: '元婴', stats: '{"pet_evolve":true,"sell_price":100}', description: '灵宠进化所需材料' },

  // === 功法书 ===
  { id: 160, name: '五行入门', type: '功法书', quality: '黄阶', realm: '炼气', stats: '{"gongfa_id":14,"sell_price":50}', description: '五行功法入门' },
  { id: 161, name: '烈火剑经', type: '功法书', quality: '黄阶', realm: '炼气', stats: '{"gongfa_id":15,"sell_price":60}', description: '火属性剑法秘籍' },
  { id: 162, name: '寒冰真解', type: '功法书', quality: '玄阶', realm: '筑基', stats: '{"gongfa_id":16,"sell_price":150}', description: '冰属性功法秘籍' },
  { id: 163, name: '雷霆秘典上册', type: '功法书', quality: '玄阶', realm: '筑基', stats: '{"gongfa_id":17,"sell_price":180}', description: '雷属性功法秘籍' },
  { id: 164, name: '天罡剑诀全本', type: '功法书', quality: '地阶', realm: '金丹', stats: '{"gongfa_id":18,"sell_price":400}', description: '高级剑法秘籍' },

  // === 装备材料 ===
  { id: 170, name: '凡铁锭', type: '材料', quality: '凡品', realm: '炼气', stats: '{"forge_level":1,"sell_price":4}', description: '基础锻造材料' },
  { id: 171, name: '精钢锭', type: '材料', quality: '凡品', realm: '炼气', stats: '{"forge_level":1,"sell_price":6}', description: '品质较好的钢锭' },
  { id: 172, name: '玄铁锭', type: '材料', quality: '灵品', realm: '筑基', stats: '{"forge_level":2,"sell_price":18}', description: '玄铁锻造的钢锭' },
  { id: 173, name: '紫金锭', type: '材料', quality: '宝品', realm: '金丹', stats: '{"forge_level":3,"sell_price":45}', description: '紫金锻造的钢锭' },
  { id: 174, name: '星辰锭', type: '材料', quality: '古宝', realm: '元婴', stats: '{"forge_level":4,"sell_price":110}', description: '星辰之力锻造的钢锭' },
  { id: 175, name: '混沌锭', type: '材料', quality: '灵宝', realm: '化神', stats: '{"forge_level":5,"sell_price":220}', description: '混沌之力锻造的钢锭' },
];

// 去重添加
const existingIds = new Set(db.items.map(i => i.id));
let addedCount = 0;
for (const item of resourceItems) {
  if (!existingIds.has(item.id)) {
    db.items.push(item);
    addedCount++;
  }
}
if (addedCount > 0) {
  console.log(`新增 ${addedCount} 种资源物品`);
}

// ========== 扩展怪物数据 ==========
if (!db.monsters) db.monsters = [];

const monsters = [
  // === 炼气期怪物 (1-10级) ===
  { id: 1, name: '灵兔', level_range: [1,3], element: '木', stats: '{"hp":30,"attack":5,"defense":2,"speed":8}', drops: '[{"item_id":110,"rate":0.4},{"item_id":150,"rate":0.3}]', map_id: 1, description: '常见的灵兽，速度较快' },
  { id: 2, name: '土拨鼠妖', level_range: [1,4], element: '土', stats: '{"hp":45,"attack":7,"defense":5,"speed":4}', drops: '[{"item_id":101,"rate":0.5},{"item_id":124,"rate":0.2}]', map_id: 1, description: '土属性小妖' },
  { id: 3, name: '金甲虫', level_range: [2,5], element: '金', stats: '{"hp":40,"attack":6,"defense":8,"speed":3}', drops: '[{"item_id":102,"rate":0.5},{"item_id":120,"rate":0.15}]', map_id: 1, description: '甲壳坚硬的虫妖' },
  { id: 4, name: '火焰蜥蜴', level_range: [3,6], element: '火', stats: '{"hp":50,"attack":10,"defense":4,"speed":6}', drops: '[{"item_id":120,"rate":0.4},{"item_id":110,"rate":0.3}]', map_id: 1, description: '火属性蜥蜴' },
  { id: 5, name: '冰晶鱼', level_range: [2,5], element: '水', stats: '{"hp":35,"attack":5,"defense":3,"speed":10}', drops: '[{"item_id":121,"rate":0.4},{"item_id":110,"rate":0.2}]', map_id: 1, description: '水属性鱼类妖兽' },

  // === 筑基期怪物 (10-20级) ===
  { id: 10, name: '竹妖', level_range: [10,14], element: '木', stats: '{"hp":120,"attack":18,"defense":12,"speed":8}', drops: '[{"item_id":112,"rate":0.35},{"item_id":130,"rate":0.15},{"item_id":151,"rate":0.2}]', map_id: 2, description: '竹林中的木妖' },
  { id: 11, name: '木灵', level_range: [11,15], element: '木', stats: '{"hp":100,"attack":15,"defense":15,"speed":10}', drops: '[{"item_id":112,"rate":0.3},{"item_id":130,"rate":0.12}]', map_id: 2, description: '木属性精灵' },
  { id: 12, name: '岩石巨人', level_range: [12,16], element: '土', stats: '{"hp":200,"attack":12,"defense":25,"speed":3}', drops: '[{"item_id":103,"rate":0.3},{"item_id":124,"rate":0.25}]', map_id: 2, description: '岩石构成的巨人' },
  { id: 13, name: '毒蛇', level_range: [10,14], element: '木', stats: '{"hp":80,"attack":22,"defense":8,"speed":12}', drops: '[{"item_id":112,"rate":0.25},{"item_id":130,"rate":0.1},{"item_id":152,"rate":0.08}]', map_id: 2, description: '剧毒蛇妖' },
  { id: 14, name: '风狼', level_range: [11,15], element: '风', stats: '{"hp":110,"attack":20,"defense":10,"speed":15}', drops: '[{"item_id":123,"rate":0.3},{"item_id":130,"rate":0.12}]', map_id: 2, description: '风属性狼妖' },

  // === 金丹期怪物 (20-30级) ===
  { id: 20, name: '火焰蜥蜴王', level_range: [20,24], element: '火', stats: '{"hp":300,"attack":35,"defense":20,"speed":12}', drops: '[{"item_id":120,"rate":0.4},{"item_id":131,"rate":0.15},{"item_id":142,"rate":0.1}]', map_id: 3, description: '火焰山的王者' },
  { id: 21, name: '岩浆巨人', level_range: [21,25], element: '火', stats: '{"hp":400,"attack":28,"defense":35,"speed":5}', drops: '[{"item_id":106,"rate":0.2},{"item_id":120,"rate":0.35}]', map_id: 3, description: '岩浆构成的巨人' },
  { id: 22, name: '火鸦', level_range: [20,24], element: '火', stats: '{"hp":220,"attack":40,"defense":15,"speed":18}', drops: '[{"item_id":120,"rate":0.3},{"item_id":131,"rate":0.1}]', map_id: 3, description: '火属性乌鸦' },
  { id: 23, name: '寒冰蝎', level_range: [22,26], element: '水', stats: '{"hp":280,"attack":32,"defense":28,"speed":8}', drops: '[{"item_id":121,"rate":0.35},{"item_id":105,"rate":0.15}]', map_id: 3, description: '冰属性蝎子' },
  { id: 24, name: '熔岩蛟龙', level_range: [25,30], element: '火', stats: '{"hp":500,"attack":45,"defense":30,"speed":10}', drops: '[{"item_id":106,"rate":0.25},{"item_id":131,"rate":0.2},{"item_id":142,"rate":0.08}]', map_id: 3, description: '熔岩中的蛟龙' },

  // === 元婴期怪物 (30-40级) ===
  { id: 30, name: '冰霜巨狼', level_range: [30,34], element: '水', stats: '{"hp":600,"attack":55,"defense":40,"speed":15}', drops: '[{"item_id":121,"rate":0.3},{"item_id":132,"rate":0.12}]', map_id: 4, description: '冰霜巨狼' },
  { id: 31, name: '寒冰蝎王', level_range: [31,35], element: '水', stats: '{"hp":700,"attack":50,"defense":55,"speed":8}', drops: '[{"item_id":105,"rate":0.2},{"item_id":132,"rate":0.15}]', map_id: 4, description: '寒冰蝎的王者' },
  { id: 32, name: '冰晶鸟王', level_range: [32,36], element: '水', stats: '{"hp":500,"attack":65,"defense":30,"speed":22}', drops: '[{"item_id":121,"rate":0.3},{"item_id":132,"rate":0.1}]', map_id: 4, description: '冰晶鸟的王者' },
  { id: 33, name: '冰霜巨龙', level_range: [35,40], element: '水', stats: '{"hp":1200,"attack":80,"defense":60,"speed":12}', drops: '[{"item_id":107,"rate":0.15},{"item_id":132,"rate":0.2},{"item_id":154,"rate":0.05}]', map_id: 4, description: '远古冰龙' },

  // === 化神期怪物 (40-50级) ===
  { id: 40, name: '雷兽', level_range: [40,44], element: '雷', stats: '{"hp":1500,"attack":100,"defense":70,"speed":20}', drops: '[{"item_id":122,"rate":0.3},{"item_id":133,"rate":0.1}]', map_id: 5, description: '雷属性神兽' },
  { id: 41, name: '雷鳗', level_range: [41,45], element: '雷', stats: '{"hp":1200,"attack":110,"defense":50,"speed":25}', drops: '[{"item_id":122,"rate":0.3},{"item_id":143,"rate":0.08}]', map_id: 5, description: '雷属性鳗鱼' },
  { id: 42, name: '雷鸟', level_range: [42,46], element: '雷', stats: '{"hp":1000,"attack":120,"defense":45,"speed":30}', drops: '[{"item_id":122,"rate":0.25},{"item_id":133,"rate":0.08}]', map_id: 5, description: '雷属性鸟类' },
  { id: 43, name: '雷劫使者', level_range: [45,50], element: '雷', stats: '{"hp":2500,"attack":150,"defense":100,"speed":18}', drops: '[{"item_id":108,"rate":0.1},{"item_id":133,"rate":0.15},{"item_id":154,"rate":0.05}]', map_id: 5, description: '掌控雷劫的使者' },

  // === 炼虚期怪物 (50-60级) ===
  { id: 50, name: '混沌兽', level_range: [50,54], element: '混沌', stats: '{"hp":3500,"attack":200,"defense":150,"speed":15}', drops: '[{"item_id":108,"rate":0.15},{"item_id":133,"rate":0.12}]', map_id: 6, description: '混沌之力的产物' },
  { id: 51, name: '虚空虫', level_range: [51,55], element: '混沌', stats: '{"hp":3000,"attack":220,"defense":120,"speed":22}', drops: '[{"item_id":108,"rate":0.12},{"item_id":127,"rate":0.1}]', map_id: 6, description: '虚空中的虫族' },
  { id: 52, name: '时空龙', level_range: [55,60], element: '混沌', stats: '{"hp":6000,"attack":300,"defense":200,"speed":25}', drops: '[{"item_id":109,"rate":0.08},{"item_id":127,"rate":0.15},{"item_id":134,"rate":0.05}]', map_id: 6, description: '掌控时空的巨龙' },

  // === 合体期怪物 (60-70级) ===
  { id: 60, name: '五行圣兽', level_range: [60,65], element: '五行', stats: '{"hp":8000,"attack":350,"defense":280,"speed":20}', drops: '[{"item_id":128,"rate":0.1},{"item_id":134,"rate":0.08}]', map_id: 7, description: '五行之力的化身' },
  { id: 61, name: '五行精灵', level_range: [61,66], element: '五行', stats: '{"hp":6000,"attack":380,"defense":250,"speed":25}', drops: '[{"item_id":128,"rate":0.08},{"item_id":134,"rate":0.06}]', map_id: 7, description: '五行精灵' },

  // === 大乘期怪物 (70-80级) ===
  { id: 70, name: '魔道高手', level_range: [70,75], element: '暗', stats: '{"hp":12000,"attack":500,"defense":400,"speed":22}', drops: '[{"item_id":125,"rate":0.12},{"item_id":134,"rate":0.1}]', map_id: 8, description: '魔道高手' },
  { id: 71, name: '魔道使者', level_range: [71,76], element: '暗', stats: '{"hp":14000,"attack":550,"defense":450,"speed":20}', drops: '[{"item_id":125,"rate":0.1},{"item_id":134,"rate":0.08}]', map_id: 8, description: '魔道使者' },
  { id: 72, name: '魔道至尊', level_range: [75,80], element: '暗', stats: '{"hp":20000,"attack":700,"defense":550,"speed":25}', drops: '[{"item_id":125,"rate":0.15},{"item_id":134,"rate":0.12},{"item_id":154,"rate":0.03}]', map_id: 8, description: '魔道至尊' },

  // === 渡劫期怪物 (80-90级) ===
  { id: 80, name: '仙界守卫', level_range: [80,85], element: '光', stats: '{"hp":25000,"attack":800,"defense":650,"speed":28}', drops: '[{"item_id":126,"rate":0.1},{"item_id":134,"rate":0.1}]', map_id: 9, description: '仙界守卫' },
  { id: 81, name: '仙界使者', level_range: [85,90], element: '光', stats: '{"hp":35000,"attack":1000,"defense":800,"speed":30}', drops: '[{"item_id":126,"rate":0.12},{"item_id":134,"rate":0.12}]', map_id: 9, description: '仙界使者' },

  // === 飞升期怪物 (90-100级) ===
  { id: 90, name: '远古战魂', level_range: [90,95], element: '混沌', stats: '{"hp":50000,"attack":1500,"defense":1200,"speed":35}', drops: '[{"item_id":127,"rate":0.1},{"item_id":134,"rate":0.15}]', map_id: 10, description: '远古战魂' },
  { id: 91, name: '远古巨兽', level_range: [93,98], element: '混沌', stats: '{"hp":70000,"attack":2000,"defense":1500,"speed":25}', drops: '[{"item_id":127,"rate":0.12},{"item_id":134,"rate":0.12}]', map_id: 10, description: '远古巨兽' },
  { id: 92, name: '仙界至尊', level_range: [95,100], element: '仙', stats: '{"hp":100000,"attack":3000,"defense":2500,"speed":40}', drops: '[{"item_id":128,"rate":0.15},{"item_id":134,"rate":0.2},{"item_id":154,"rate":0.02}]', map_id: 10, description: '仙界至尊' },
];

const existingMonsters = new Set(db.monsters.map(m => m.id));
let monsterCount = 0;
for (const monster of monsters) {
  if (!existingMonsters.has(monster.id)) {
    db.monsters.push(monster);
    monsterCount++;
  }
}
if (monsterCount > 0) {
  console.log(`新增 ${monsterCount} 种怪物`);
}

// ========== 扩展地图系统 ==========
if (!db.maps) db.maps = [];

const maps = [
  { id: 1, name: '青云山', min_level: 1, max_level: 10, difficulty: 1, element: '金', monsters: ['灵兔','土拨鼠妖','金甲虫','火焰蜥蜴','冰晶鱼'], exp_per_second: 5, spirit_stone_per_second: 1, gather_nodes: ['粗铁矿','聚灵草','火焰结晶','寒冰结晶'], description: '青云宗所在山脉，灵气充沛' },
  { id: 2, name: '翠竹林', min_level: 10, max_level: 20, difficulty: 1.2, element: '木', monsters: ['竹妖','木灵','岩石巨人','毒蛇','风狼'], exp_per_second: 12, spirit_stone_per_second: 2, gather_nodes: ['精铁矿','五行草','风灵结晶','大地结晶'], description: '翠竹成林，木属性灵气浓郁' },
  { id: 3, name: '火焰山', min_level: 20, max_level: 30, difficulty: 1.5, element: '火', monsters: ['火焰蜥蜴王','岩浆巨人','火鸦','寒冰蝎','熔岩蛟龙'], exp_per_second: 25, spirit_stone_per_second: 5, gather_nodes: ['玄铁矿','龙血矿','火焰结晶','地心火种'], description: '火焰山深处，火属性灵气浓郁' },
  { id: 4, name: '寒冰谷', min_level: 30, max_level: 40, difficulty: 1.8, element: '水', monsters: ['冰霜巨狼','寒冰蝎王','冰晶鸟王','冰霜巨龙'], exp_per_second: 50, spirit_stone_per_second: 10, gather_nodes: ['星辰矿','九转灵芝','寒冰结晶','灵泉水'], description: '寒冰谷深处，水属性灵气浓郁' },
  { id: 5, name: '雷霆峰', min_level: 40, max_level: 50, difficulty: 2.0, element: '雷', monsters: ['雷兽','雷鳗','雷鸟','雷劫使者'], exp_per_second: 100, spirit_stone_per_second: 20, gather_nodes: ['天外陨铁','万年血参','雷霆结晶','天雷木'], description: '雷霆峰顶，雷属性灵气浓郁' },
  { id: 6, name: '混沌海', min_level: 50, max_level: 60, difficulty: 2.5, element: '混沌', monsters: ['混沌兽','虚空虫','时空龙'], exp_per_second: 200, spirit_stone_per_second: 40, gather_nodes: ['混沌矿','仙灵草','混沌结晶','妖兽内丹'], description: '混沌海深处，混沌之力浓郁' },
  { id: 7, name: '五行圣地', min_level: 60, max_level: 70, difficulty: 3.0, element: '五行', monsters: ['五行圣兽','五行精灵'], exp_per_second: 400, spirit_stone_per_second: 80, gather_nodes: ['仙晶矿','仙灵草','仙灵结晶','仙兽内丹'], description: '五行圣地，五行之力交汇' },
  { id: 8, name: '魔道深渊', min_level: 70, max_level: 80, difficulty: 3.5, element: '暗', monsters: ['魔道高手','魔道使者','魔道至尊'], exp_per_second: 800, spirit_stone_per_second: 160, gather_nodes: ['混沌矿','暗影结晶','远古妖丹'], description: '魔道深渊，魔气冲天' },
  { id: 9, name: '仙界入口', min_level: 80, max_level: 90, difficulty: 4.0, element: '光', monsters: ['仙界守卫','仙界使者'], exp_per_second: 1600, spirit_stone_per_second: 320, gather_nodes: ['仙晶矿','光明结晶','仙兽内丹'], description: '仙界入口，仙气缭绕' },
  { id: 10, name: '远古战场', min_level: 90, max_level: 100, difficulty: 5.0, element: '混沌', monsters: ['远古战魂','远古巨兽','仙界至尊'], exp_per_second: 3200, spirit_stone_per_second: 640, gather_nodes: ['混沌矿','混沌结晶','远古妖丹','仙灵结晶'], description: '远古战场，蕴含远古之力' },
  // 新增特殊地图
  { id: 11, name: '幽冥地府', min_level: 15, max_level: 25, difficulty: 1.3, element: '暗', monsters: ['幽冥鬼','僵尸','怨灵'], exp_per_second: 15, spirit_stone_per_second: 3, gather_nodes: ['暗影结晶','妖兽内丹','灵泉水'], description: '阴气森森的地府，暗属性怪物出没' },
  { id: 12, name: '天界花园', min_level: 55, max_level: 65, difficulty: 2.8, element: '光', monsters: ['天使','光明精灵','神圣巨龙'], exp_per_second: 350, spirit_stone_per_second: 70, gather_nodes: ['仙灵草','光明结晶','仙兽内丹'], description: '天界花园，光明之力汇聚' },
  { id: 13, name: '龙巢', min_level: 45, max_level: 55, difficulty: 2.2, element: '火', monsters: ['幼龙','火龙','冰龙','黑龙'], exp_per_second: 150, spirit_stone_per_second: 30, gather_nodes: ['龙血矿','龙涎香','火焰结晶'], description: '龙族栖息的巢穴' },
  { id: 14, name: '妖兽森林', min_level: 5, max_level: 15, difficulty: 1.1, element: '木', monsters: ['树精','花妖','藤妖','蘑菇怪'], exp_per_second: 8, spirit_stone_per_second: 1.5, gather_nodes: ['聚灵草','清心草','五行草'], description: '妖兽栖息的森林' },
  { id: 15, name: '沙漠遗迹', min_level: 25, max_level: 35, difficulty: 1.6, element: '土', monsters: ['沙虫','沙人','沙漠蝎','金字塔守卫'], exp_per_second: 35, spirit_stone_per_second: 7, gather_nodes: ['玄铁矿','大地结晶','星辰矿'], description: '古代文明遗迹，土属性怪物出没' },
  { id: 16, name: '深渊裂隙', min_level: 65, max_level: 75, difficulty: 3.2, element: '暗', monsters: ['深渊恶魔','暗影刺客','虚空行者'], exp_per_second: 600, spirit_stone_per_second: 120, gather_nodes: ['暗影结晶','混沌矿','远古妖丹'], description: '通往深渊的裂隙，暗属性力量汇聚' },
  { id: 17, name: '时空裂缝', min_level: 85, max_level: 95, difficulty: 4.5, element: '混沌', monsters: ['时空守卫','时间旅者','空间扭曲者'], exp_per_second: 2500, spirit_stone_per_second: 500, gather_nodes: ['混沌矿','仙晶矿','混沌结晶','仙灵结晶'], description: '时空裂缝，蕴含时空之力' },
  { id: 18, name: '神兽平原', min_level: 35, max_level: 45, difficulty: 1.9, element: '五行', monsters: ['青龙幼崽','白虎幼崽','朱雀幼崽','玄武幼崽'], exp_per_second: 70, spirit_stone_per_second: 14, gather_nodes: ['五行草','五行结晶','妖兽内丹'], description: '神兽幼崽栖息的平原' },
  { id: 19, name: '冰火两重天', min_level: 42, max_level: 52, difficulty: 2.1, element: '火', monsters: ['冰火双头蛇','冰火精灵','冰火巨兽'], exp_per_second: 120, spirit_stone_per_second: 24, gather_nodes: ['火焰结晶','寒冰结晶','龙血矿'], description: '冰火交汇的奇特区域' },
  { id: 20, name: '仙界秘境', min_level: 95, max_level: 100, difficulty: 6.0, element: '仙', monsters: ['仙界至尊','远古仙人','天道守护者'], exp_per_second: 5000, spirit_stone_per_second: 1000, gather_nodes: ['仙晶矿','仙灵草','仙灵结晶','仙兽内丹'], description: '仙界最深处的秘境' },
];

const existingMaps = new Set(db.maps.map(m => m.id));
let mapCount = 0;
for (const map of maps) {
  if (!existingMaps.has(map.id)) {
    db.maps.push(map);
    mapCount++;
  }
}
if (mapCount > 0) {
  console.log(`新增 ${mapCount} 张地图`);
}

// ========== 扩展副本数据 ==========
if (!db.dungeons) db.dungeons = [];

const dungeons = [
  { id: 16, name: '幽冥地府', type: '公共副本', min_level: 15, max_level: 25, difficulty: 1.5, element: '暗', boss: '幽冥鬼王', rewards: '{"exp":180,"spiritStone":90,"items":[125,130]}', description: '幽冥地府，击败幽冥鬼王' },
  { id: 17, name: '龙巢深处', type: '公共副本', min_level: 45, max_level: 55, difficulty: 2.5, element: '火', boss: '远古巨龙', rewards: '{"exp":1000,"spiritStone":500,"items":[106,132]}', description: '龙巢深处，击败远古巨龙' },
  { id: 18, name: '天界花园', type: '公共副本', min_level: 55, max_level: 65, difficulty: 3.0, element: '光', boss: '天使长', rewards: '{"exp":2000,"spiritStone":1000,"items":[126,133]}', description: '天界花园，击败天使长' },
  { id: 19, name: '深渊裂隙', type: '公共副本', min_level: 65, max_level: 75, difficulty: 3.5, element: '暗', boss: '深渊魔王', rewards: '{"exp":4000,"spiritStone":2000,"items":[125,134]}', description: '深渊裂隙，击败深渊魔王' },
  { id: 20, name: '时空裂缝', type: '公共副本', min_level: 85, max_level: 95, difficulty: 5.0, element: '混沌', boss: '时空主宰', rewards: '{"exp":20000,"spiritStone":10000,"items":[128,134]}', description: '时空裂缝，击败时空主宰' },
];

const existingDungeons = new Set(db.dungeons.map(d => d.id));
let dungeonCount = 0;
for (const dungeon of dungeons) {
  if (!existingDungeons.has(dungeon.id)) {
    db.dungeons.push(dungeon);
    dungeonCount++;
  }
}
if (dungeonCount > 0) {
  console.log(`新增 ${dungeonCount} 个副本`);
}

saveDatabase(db);
console.log('数据扩展完成');
