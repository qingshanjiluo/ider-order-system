const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'game.json');
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Fix dungeons - add max_level based on min_level + 10
for (const d of (db.dungeons || [])) {
  if (!d.max_level) {
    d.max_level = d.min_level + 10;
  }
}

// Fix achievement
for (const a of (db.achievements || [])) {
  if (!a.name) a.name = '成就 ' + a.id;
  if (!a.condition) a.condition = { type: 'manual', target: 1 };
}

// Fix items - add subtype for equipment
const slotMap = {
  'weapon': 'weapon', '头': 'head', '上身': 'chest', '裤子': 'pants', 
  '手套': 'gloves', '鞋子': 'shoes', '项链': 'necklace', '戒指': 'ring'
};

for (const item of db.items) {
  if (item.type === '装备' && !item.subtype) {
    // Try to infer from name
    let subtype = 'weapon';
    const name = item.name || '';
    if (name.includes('剑') || name.includes('刀') || name.includes('枪') || name.includes('棍') || name.includes('斧') || name.includes('锤') || name.includes('弓') || name.includes('拳')) {
      subtype = 'weapon';
    } else if (name.includes('冠') || name.includes('帽') || name.includes('盔') || name.includes('帽') || name.includes('头') || name.includes('发')) {
      subtype = 'head';
    } else if (name.includes('甲') || name.includes('衣') || name.includes('袍') || name.includes('铠') || name.includes('服') || name.includes('上') || name.includes('胸')) {
      subtype = 'chest';
    } else if (name.includes('裤') || name.includes('裙') || name.includes('腿') || name.includes('下')) {
      subtype = 'pants';
    } else if (name.includes('手套') || name.includes('护腕') || name.includes('护手') || name.includes('手') || name.includes('腕')) {
      subtype = 'gloves';
    } else if (name.includes('靴') || name.includes('鞋') || name.includes('履') || name.includes('足')) {
      subtype = 'shoes';
    } else if (name.includes('项链') || name.includes('护符') || name.includes('坠') || name.includes('链') || name.includes('颈')) {
      subtype = 'necklace';
    } else if (name.includes('戒指') || name.includes('戒') || name.includes('指环') || name.includes('指')) {
      subtype = 'ring';
    }
    item.subtype = subtype;
  }
  
  // Ensure stats is valid JSON
  if (item.stats) {
    try {
      JSON.parse(item.stats);
    } catch (e) {
      item.stats = '{}';
    }
  } else if (item.type === '装备' || item.type === '功法' || item.type === '灵宠') {
    item.stats = '{}';
  }
}

// Add skills array if not exists
if (!db.skills) {
  db.skills = [];
}

// Save
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log('Data fixes applied successfully');