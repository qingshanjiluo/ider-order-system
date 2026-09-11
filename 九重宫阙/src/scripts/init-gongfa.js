const { loadDatabase, saveDatabase, getNextId } = require('../database');

function initGongfa() {
  const db = loadDatabase();

  const existingGongfa = db.items.filter(i => i.type === '功法');
  if (existingGongfa.length >= 50) {
    console.log(`已有${existingGongfa.length}个功法，跳过初始化`);
    return;
  }

  const gongfaData = [
    // 黄阶修炼功法 (8个)
    { name: '吐纳术', quality: '黄阶', type: '修炼', realm: '炼气', stats: { cultivation_speed: 1.1 } },
    { name: '导引术', quality: '黄阶', type: '修炼', realm: '炼气', stats: { cultivation_speed: 1.12 } },
    { name: '静心诀', quality: '黄阶', type: '修炼', realm: '炼气', stats: { cultivation_speed: 1.15 } },
    { name: '聚气法', quality: '黄阶', type: '修炼', realm: '炼气', stats: { cultivation_speed: 1.18 } },
    { name: '养生功', quality: '黄阶', type: '修炼', realm: '炼气', stats: { cultivation_speed: 1.2 } },
    { name: '筑基引导', quality: '黄阶', type: '修炼', realm: '筑基', stats: { cultivation_speed: 1.25 } },
    { name: '固本培元', quality: '黄阶', type: '修炼', realm: '筑基', stats: { cultivation_speed: 1.3 } },
    { name: '凝神静气', quality: '黄阶', type: '修炼', realm: '筑基', stats: { cultivation_speed: 1.35 } },

    // 黄阶战斗功法 (7个)
    { name: '基础剑法', quality: '黄阶', type: '战斗', realm: '炼气', stats: { skill_damage: 1.1, element: 'none' } },
    { name: '基础拳法', quality: '黄阶', type: '战斗', realm: '炼气', stats: { skill_damage: 1.12, element: 'none' } },
    { name: '基础刀法', quality: '黄阶', type: '战斗', realm: '炼气', stats: { skill_damage: 1.15, element: 'none' } },
    { name: '基础枪法', quality: '黄阶', type: '战斗', realm: '炼气', stats: { skill_damage: 1.18, element: 'none' } },
    { name: '基础符术', quality: '黄阶', type: '战斗', realm: '炼气', stats: { skill_damage: 1.2, element: 'none' } },
    { name: '基础掌法', quality: '黄阶', type: '战斗', realm: '筑基', stats: { skill_damage: 1.22, element: 'none' } },
    { name: '基础腿法', quality: '黄阶', type: '战斗', realm: '筑基', stats: { skill_damage: 1.25, element: 'none' } },

    // 玄阶修炼功法 (6个)
    { name: '青云心法', quality: '玄阶', type: '修炼', realm: '金丹', stats: { cultivation_speed: 1.4 } },
    { name: '天罡功', quality: '玄阶', type: '修炼', realm: '金丹', stats: { cultivation_speed: 1.5 } },
    { name: '地煞诀', quality: '玄阶', type: '修炼', realm: '金丹', stats: { cultivation_speed: 1.55 } },
    { name: '乾坤引', quality: '玄阶', type: '修炼', realm: '金丹', stats: { cultivation_speed: 1.6 } },
    { name: '太虚引', quality: '玄阶', type: '修炼', realm: '元婴', stats: { cultivation_speed: 1.7 } },
    { name: '混元功', quality: '玄阶', type: '修炼', realm: '元婴', stats: { cultivation_speed: 1.8 } },

    // 玄阶战斗功法 (6个)
    { name: '青云剑诀', quality: '玄阶', type: '战斗', realm: '金丹', stats: { skill_damage: 1.4, element: 'wind' } },
    { name: '烈火掌', quality: '玄阶', type: '战斗', realm: '金丹', stats: { skill_damage: 1.5, element: 'fire' } },
    { name: '寒冰指', quality: '玄阶', type: '战斗', realm: '金丹', stats: { skill_damage: 1.5, element: 'water' } },
    { name: '奔雷拳', quality: '玄阶', type: '战斗', realm: '金丹', stats: { skill_damage: 1.55, element: 'lightning' } },
    { name: '磐石功', quality: '玄阶', type: '战斗', realm: '元婴', stats: { skill_damage: 1.6, element: 'earth' } },
    { name: '幻影步', quality: '玄阶', type: '战斗', realm: '元婴', stats: { skill_damage: 1.65, element: 'wind' } },

    // 地阶修炼功法 (5个)
    { name: '九转玄功', quality: '地阶', type: '修炼', realm: '元婴', stats: { cultivation_speed: 2.0 } },
    { name: '紫府心经', quality: '地阶', type: '修炼', realm: '化神', stats: { cultivation_speed: 2.2 } },
    { name: '太上忘情', quality: '地阶', type: '修炼', realm: '化神', stats: { cultivation_speed: 2.5 } },
    { name: '混沌诀', quality: '地阶', type: '修炼', realm: '炼虚', stats: { cultivation_speed: 2.8 } },
    { name: '天人合一', quality: '地阶', type: '修炼', realm: '炼虚', stats: { cultivation_speed: 3.0 } },

    // 地阶战斗功法 (5个)
    { name: '焚天火舞', quality: '地阶', type: '战斗', realm: '元婴', stats: { skill_damage: 2.0, element: 'fire' } },
    { name: '寒冰领域', quality: '地阶', type: '战斗', realm: '化神', stats: { skill_damage: 2.2, element: 'water' } },
    { name: '大地震击', quality: '地阶', type: '战斗', realm: '化神', stats: { skill_damage: 2.3, element: 'earth' } },
    { name: '雷霆万钧', quality: '地阶', type: '战斗', realm: '炼虚', stats: { skill_damage: 2.5, element: 'lightning' } },
    { name: '风卷残云', quality: '地阶', type: '战斗', realm: '炼虚', stats: { skill_damage: 2.6, element: 'wind' } },

    // 天阶修炼功法 (4个)
    { name: '造化功', quality: '天阶', type: '修炼', realm: '炼虚', stats: { cultivation_speed: 3.5 } },
    { name: '虚空引', quality: '天阶', type: '修炼', realm: '合体', stats: { cultivation_speed: 4.0 } },
    { name: '无极功', quality: '天阶', type: '修炼', realm: '合体', stats: { cultivation_speed: 4.5 } },
    { name: '大道至简', quality: '天阶', type: '修炼', realm: '大乘', stats: { cultivation_speed: 5.0 } },

    // 天阶战斗功法 (4个)
    { name: '圣光裁决', quality: '天阶', type: '战斗', realm: '炼虚', stats: { skill_damage: 3.0, element: 'holy' } },
    { name: '暗影吞噬', quality: '天阶', type: '战斗', realm: '合体', stats: { skill_damage: 3.5, element: 'dark' } },
    { name: '五雷正法', quality: '天阶', type: '战斗', realm: '合体', stats: { skill_damage: 3.8, element: 'lightning' } },
    { name: '诛仙剑阵', quality: '天阶', type: '战斗', realm: '大乘', stats: { skill_damage: 4.0, element: 'wind' } },

    // 圣阶功法 (5个)
    { name: '混元一气', quality: '圣阶', type: '修炼', realm: '大乘', stats: { cultivation_speed: 6.0 } },
    { name: '天道酬勤', quality: '圣阶', type: '修炼', realm: '渡劫', stats: { cultivation_speed: 8.0 } },
    { name: '万法归宗', quality: '圣阶', type: '战斗', realm: '大乘', stats: { skill_damage: 5.0, element: 'holy' } },
    { name: '寂灭涅槃', quality: '圣阶', type: '战斗', realm: '渡劫', stats: { skill_damage: 6.0, element: 'dark' } },
    { name: '天道轮回', quality: '圣阶', type: '战斗', realm: '渡劫', stats: { skill_damage: 7.0, element: 'none' } },

    // 仙阶功法 (3个)
    { name: '永恒不灭', quality: '仙阶', type: '修炼', realm: '渡劫', stats: { cultivation_speed: 10.0 } },
    { name: '诸天万界', quality: '仙阶', type: '战斗', realm: '飞升', stats: { skill_damage: 8.0, element: 'holy' } },
    { name: '开天辟地', quality: '仙阶', type: '战斗', realm: '飞升', stats: { skill_damage: 10.0, element: 'fire' } }
  ];

  const descriptions = {
    '黄阶': '基础功法，适合初学者修炼',
    '玄阶': '进阶功法，需要一定修为方可参悟',
    '地阶': '高阶功法，蕴含天地至理',
    '天阶': '顶级功法，传闻为上古大能所创',
    '圣阶': '传说功法，可沟通天地法则',
    '仙阶': '仙人遗留的无上功法'
  };

  let nextId = db.items.length > 0 ? Math.max(...db.items.map(i => i.id)) + 1 : 1;

  for (const gf of gongfaData) {
    db.items.push({
      id: nextId++,
      name: gf.name,
      type: '功法',
      quality: gf.quality,
      realm: gf.realm,
      stats: JSON.stringify(gf.stats),
      description: descriptions[gf.quality]
    });
  }

  saveDatabase(db);
  console.log(`成功初始化${gongfaData.length}个功法`);
}

if (require.main === module) {
  initGongfa();
}

module.exports = initGongfa;
