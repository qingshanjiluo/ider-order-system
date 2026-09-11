const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../data/game.json');
const db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

if (!db.blueprints) {
  db.blueprints = [
    { id: 1, name: '凡铁剑图纸', type: 'weapon', rarity: '凡品', materials: [{name:'碎石',quantity:5},{name:'木材',quantity:3}], description: '基础武器锻造图纸' },
    { id: 2, name: '灵纹甲图纸', type: 'chest', rarity: '灵品', materials: [{name:'玄铁矿',quantity:3},{name:'灵草',quantity:5}], description: '灵品上衣锻造图纸' },
    { id: 3, name: '聚灵丹方', type: 'pill', rarity: '凡品', materials: [{name:'灵草',quantity:10},{name:'清心草',quantity:5}], description: '基础修炼丹药配方' },
    { id: 4, name: '破障丹方', type: 'pill', rarity: '灵品', materials: [{name:'聚灵草',quantity:8},{name:'妖兽内丹',quantity:2}], description: '突破境界辅助丹药' },
    { id: 5, name: '聚灵阵图纸', type: 'formation', rarity: '凡品', materials: [{name:'碎石',quantity:10},{name:'灵草',quantity:8}], description: '基础聚灵阵法' },
    { id: 6, name: '火球符图纸', type: 'talisman', rarity: '凡品', materials: [{name:'灵草',quantity:3},{name:'木材',quantity:2}], description: '基础攻击符箓' },
    { id: 7, name: '玄铁重剑图纸', type: 'weapon', rarity: '宝品', materials: [{name:'玄铁矿',quantity:8},{name:'星辰矿',quantity:3}], description: '宝品重剑锻造图纸' },
    { id: 8, name: '天蚕宝甲图纸', type: 'chest', rarity: '宝品', materials: [{name:'冰晶矿',quantity:5},{name:'雪莲',quantity:3}], description: '宝品上衣锻造图纸' },
    { id: 9, name: '回灵丹方', type: 'pill', rarity: '宝品', materials: [{name:'火焰结晶',quantity:3},{name:'灵草',quantity:15}], description: '恢复灵气的丹药' },
    { id: 10, name: '五行阵图纸', type: 'formation', rarity: '灵品', materials: [{name:'五行草',quantity:5},{name:'五行结晶',quantity:2}], description: '五行阵法基础图纸' }
  ];
  console.log('Added blueprints array');
} else {
  console.log('Blueprints already exist, skipping');
}

const missingMaterials = [
  { id: 600, name: '五行结晶', type: '材料', quality: '灵品', realm: '筑基', stats: '{"gather_level":2,"element":"五行","sell_price":18}', description: '五行之力凝结的结晶' }
];

for (const mat of missingMaterials) {
  const exists = db.items.some(i => i.name === mat.name);
  if (!exists) {
    db.items.push(mat);
    console.log(`Added missing material: ${mat.name}`);
  }
}

fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');
console.log('game.json saved successfully');
