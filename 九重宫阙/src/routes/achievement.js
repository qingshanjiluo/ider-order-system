const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const characterService = require('../services/character');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const ACHIEVEMENTS = [
  { id: 1, name: '初出茅庐', category: '修炼', description: '达到炼气境界', requirement: { type: 'realm', value: '炼气' }, reward: { exp: 100, spiritStone: 50 } },
  { id: 2, name: '小有所成', category: '修炼', description: '达到筑基境界', requirement: { type: 'realm', value: '筑基' }, reward: { exp: 200, spiritStone: 100 } },
  { id: 3, name: '金丹大道', category: '修炼', description: '达到金丹境界', requirement: { type: 'realm', value: '金丹' }, reward: { exp: 400, spiritStone: 200 } },
  { id: 4, name: '元婴初成', category: '修炼', description: '达到元婴境界', requirement: { type: 'realm', value: '元婴' }, reward: { exp: 800, spiritStone: 400 } },
  { id: 5, name: '化神归一', category: '修炼', description: '达到化神境界', requirement: { type: 'realm', value: '化神' }, reward: { exp: 1600, spiritStone: 800 } },
  { id: 6, name: '炼虚合道', category: '修炼', description: '达到炼虚境界', requirement: { type: 'realm', value: '炼虚' }, reward: { exp: 3200, spiritStone: 1600 } },
  { id: 7, name: '合体大成', category: '修炼', description: '达到合体境界', requirement: { type: 'realm', value: '合体' }, reward: { exp: 6400, spiritStone: 3200 } },
  { id: 8, name: '大乘圆满', category: '修炼', description: '达到大乘境界', requirement: { type: 'realm', value: '大乘' }, reward: { exp: 12800, spiritStone: 6400 } },
  { id: 9, name: '渡劫飞升', category: '修炼', description: '达到渡劫境界', requirement: { type: 'realm', value: '渡劫' }, reward: { exp: 25600, spiritStone: 12800 } },
  { id: 10, name: '飞升仙界', category: '修炼', description: '达到飞升境界', requirement: { type: 'realm', value: '飞升' }, reward: { exp: 51200, spiritStone: 25600 } },

  { id: 11, name: '初入江湖', category: '战斗', description: '完成第一场战斗', requirement: { type: 'battles', value: 1 }, reward: { exp: 50, spiritStone: 20 } },
  { id: 12, name: '百战老兵', category: '战斗', description: '完成100场战斗', requirement: { type: 'battles', value: 100 }, reward: { exp: 500, spiritStone: 200 } },
  { id: 13, name: '千战封神', category: '战斗', description: '完成1000场战斗', requirement: { type: 'battles', value: 1000 }, reward: { exp: 5000, spiritStone: 2000 } },
  { id: 14, name: '万人敌', category: '战斗', description: '完成10000场战斗', requirement: { type: 'battles', value: 10000 }, reward: { exp: 50000, spiritStone: 20000 } },
  { id: 15, name: '战无不胜', category: '战斗', description: '连续获胜10场', requirement: { type: 'winStreak', value: 10 }, reward: { exp: 1000, spiritStone: 500 } },
  { id: 16, name: '常胜将军', category: '战斗', description: '连续获胜50场', requirement: { type: 'winStreak', value: 50 }, reward: { exp: 5000, spiritStone: 2000 } },
  { id: 17, name: '不败神话', category: '战斗', description: '连续获胜100场', requirement: { type: 'winStreak', value: 100 }, reward: { exp: 10000, spiritStone: 5000 } },
  { id: 18, name: '以一敌百', category: '战斗', description: '单场战斗击败100个敌人', requirement: { type: 'kills', value: 100 }, reward: { exp: 2000, spiritStone: 1000 } },
  { id: 19, name: '千人斩', category: '战斗', description: '单场战斗击败1000个敌人', requirement: { type: 'kills', value: 1000 }, reward: { exp: 20000, spiritStone: 10000 } },
  { id: 20, name: '万人斩', category: '战斗', description: '单场战斗击败10000个敌人', requirement: { type: 'kills', value: 10000 }, reward: { exp: 200000, spiritStone: 100000 } },

  { id: 21, name: '小富即安', category: '收集', description: '拥有1000灵石', requirement: { type: 'spiritStone', value: 1000 }, reward: { exp: 100, spiritStone: 100 } },
  { id: 22, name: '家财万贯', category: '收集', description: '拥有10000灵石', requirement: { type: 'spiritStone', value: 10000 }, reward: { exp: 500, spiritStone: 500 } },
  { id: 23, name: '富可敌国', category: '收集', description: '拥有100000灵石', requirement: { type: 'spiritStone', value: 100000 }, reward: { exp: 2000, spiritStone: 2000 } },
  { id: 24, name: '腰缠万贯', category: '收集', description: '拥有1000000灵石', requirement: { type: 'spiritStone', value: 1000000 }, reward: { exp: 10000, spiritStone: 10000 } },
  { id: 25, name: '装备初成', category: '收集', description: '装备1件装备', requirement: { type: 'equipCount', value: 1 }, reward: { exp: 50, spiritStone: 20 } },
  { id: 26, name: '全套装备', category: '收集', description: '装备8件装备', requirement: { type: 'equipCount', value: 8 }, reward: { exp: 1000, spiritStone: 500 } },
  { id: 27, name: '功法入门', category: '收集', description: '学习1个功法', requirement: { type: 'gongfaCount', value: 1 }, reward: { exp: 50, spiritStone: 20 } },
  { id: 28, name: '功法大成', category: '收集', description: '学习10个功法', requirement: { type: 'gongfaCount', value: 10 }, reward: { exp: 1000, spiritStone: 500 } },
  { id: 29, name: '灵宠初得', category: '收集', description: '获得1只灵宠', requirement: { type: 'petCount', value: 1 }, reward: { exp: 50, spiritStone: 20 } },
  { id: 30, name: '灵宠成群', category: '收集', description: '获得10只灵宠', requirement: { type: 'petCount', value: 10 }, reward: { exp: 1000, spiritStone: 500 } },

  { id: 31, name: '仙盟新丁', category: '社交', description: '加入仙盟', requirement: { type: 'guild', value: 'join' }, reward: { exp: 100, spiritStone: 50 } },
  { id: 32, name: '仙盟骨干', category: '社交', description: '成为仙盟长老', requirement: { type: 'guild', value: 'elder' }, reward: { exp: 500, spiritStone: 200 } },
  { id: 33, name: '仙盟盟主', category: '社交', description: '成为仙盟盟主', requirement: { type: 'guild', value: 'leader' }, reward: { exp: 1000, spiritStone: 500 } },
  { id: 34, name: '竞技新手', category: '社交', description: '完成第一场竞技', requirement: { type: 'arena', value: 1 }, reward: { exp: 100, spiritStone: 50 } },
  { id: 35, name: '竞技达人', category: '社交', description: '完成100场竞技', requirement: { type: 'arena', value: 100 }, reward: { exp: 1000, spiritStone: 500 } },
  { id: 36, name: '竞技之王', category: '社交', description: '完成1000场竞技', requirement: { type: 'arena', value: 1000 }, reward: { exp: 10000, spiritStone: 5000 } },
  { id: 37, name: '天榜高手', category: '社交', description: '进入天榜前100', requirement: { type: 'arenaRank', value: 100 }, reward: { exp: 5000, spiritStone: 2000 } },
  { id: 38, name: '地榜精英', category: '社交', description: '进入地榜前100', requirement: { type: 'arenaRank', value: 100 }, reward: { exp: 2000, spiritStone: 1000 } },
  { id: 39, name: '人榜新秀', category: '社交', description: '进入人榜前100', requirement: { type: 'arenaRank', value: 100 }, reward: { exp: 1000, spiritStone: 500 } },
  { id: 40, name: '社交达人', category: '社交', description: '拥有50个好友', requirement: { type: 'friends', value: 50 }, reward: { exp: 500, spiritStone: 200 } },

  { id: 41, name: '副本新手', category: '探索', description: '完成第一个副本', requirement: { type: 'dungeon', value: 1 }, reward: { exp: 100, spiritStone: 50 } },
  { id: 42, name: '副本达人', category: '探索', description: '完成100个副本', requirement: { type: 'dungeon', value: 100 }, reward: { exp: 1000, spiritStone: 500 } },
  { id: 43, name: '副本之王', category: '探索', description: '完成1000个副本', requirement: { type: 'dungeon', value: 1000 }, reward: { exp: 10000, spiritStone: 5000 } },
  { id: 44, name: '五星通关', category: '探索', description: '获得第一个5星评价', requirement: { type: 'dungeonStar', value: 5 }, reward: { exp: 500, spiritStone: 200 } },
  { id: 45, name: '全五星', category: '探索', description: '所有副本获得5星评价', requirement: { type: 'allDungeonStar', value: 5 }, reward: { exp: 10000, spiritStone: 5000 } },
  { id: 46, name: 'BOSS猎人', category: '探索', description: '击杀第一个BOSS', requirement: { type: 'bossKill', value: 1 }, reward: { exp: 200, spiritStone: 100 } },
  { id: 47, name: 'BOSS杀手', category: '探索', description: '击杀100个BOSS', requirement: { type: 'bossKill', value: 100 }, reward: { exp: 2000, spiritStone: 1000 } },
  { id: 48, name: 'BOSS终结者', category: '探索', description: '击杀1000个BOSS', requirement: { type: 'bossKill', value: 1000 }, reward: { exp: 20000, spiritStone: 10000 } },
  { id: 49, name: '地图探索者', category: '探索', description: '探索所有地图', requirement: { type: 'allMaps', value: 1 }, reward: { exp: 5000, spiritStone: 2000 } },
  { id: 50, name: '世界征服者', category: '探索', description: '通关所有副本', requirement: { type: 'allDungeons', value: 1 }, reward: { exp: 50000, spiritStone: 20000 } }
];

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const unlockedAchievements = db.achievements
      .filter(a => a.character_id === character.id)
      .map(a => a.achievement_id);

    const achievementsWithStatus = ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: unlockedAchievements.includes(a.id),
      progress: getProgress(character, a.requirement)
    }));

    res.json(achievementsWithStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/progress', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    res.json({ progress: character.achievement_progress || {} });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/claim', auth, (req, res) => {
  try {
    const { achievementId } = req.body;
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) {
      return res.status(400).json({ error: '成就不存在' });
    }

    const alreadyUnlocked = db.achievements.find(
      a => a.character_id === character.id && a.achievement_id === achievementId
    );
    if (alreadyUnlocked) {
      return res.status(400).json({ error: '成就已领取' });
    }

    if (!isAchievementUnlocked(character, achievement.requirement)) {
      return res.status(400).json({ error: '未达成成就' });
    }

    db.achievements.push({
      id: getNextId('achievements'),
      character_id: character.id,
      achievement_id: achievementId,
      unlocked_at: new Date().toISOString()
    });

    characterService.addExp(character.id, achievement.reward.exp);
    character.spirit_stone += achievement.reward.spiritStone;

    db.characters.forEach(c => {
      if (c.id === character.id) {
        c.spirit_stone = character.spirit_stone;
      }
    });

    saveDatabase(db);

    res.json({
      success: true,
      reward: achievement.reward
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getProgress(character, requirement) {
  const db = loadDatabase();
  switch (requirement.type) {
    case 'realm':
      const realms = require('../config/balance').REALM_ORDER;   // 境界顺序单一真源
      const currentRealmIndex = realms.indexOf(character.realm);
      const targetRealmIndex = realms.indexOf(requirement.value);
      return Math.min(1, (currentRealmIndex + 1) / (targetRealmIndex + 1));
    case 'spiritStone':
      return Math.min(1, (character.spirit_stone || 0) / requirement.value);
    case 'battles':
      return Math.min(1, (character.total_battles || 0) / requirement.value);
    case 'winStreak':
      return Math.min(1, (character.win_streak || 0) / requirement.value);
    case 'kills':
      return Math.min(1, (character.total_kills || 0) / requirement.value);
    case 'equipCount':
      const equipCount = db.equipments.filter(e => e.character_id === character.id).length;
      return Math.min(1, equipCount / requirement.value);
    case 'gongfaCount':
      const gongfaCount = db.gongfa.filter(g => g.character_id === character.id).length;
      return Math.min(1, gongfaCount / requirement.value);
    case 'petCount':
      const petCount = db.pets.filter(p => p.character_id === character.id).length;
      return Math.min(1, petCount / requirement.value);
    case 'dungeon':
      return Math.min(1, (character.dungeon_count || 0) / requirement.value);
    case 'dungeonStar':
      return Math.min(1, (character.dungeon_star || 0) / requirement.value);
    case 'bossKill':
      return Math.min(1, (character.boss_kill || 0) / requirement.value);
    case 'guild':
      const member = db.guild_members.find(m => m.character_id === character.id);
      if (requirement.value === 'join') return member ? 1 : 0;
      if (requirement.value === 'elder') return member && (member.role === '长老' || member.role === '盟主') ? 1 : 0;
      if (requirement.value === 'leader') return member && member.role === '盟主' ? 1 : 0;
      return 0;
    case 'arena':
      return Math.min(1, (character.arena_points || 0) / requirement.value);
    case 'arenaRank': {
      // 内容富集九期修复：按竞技积分实算名次（原实现恒返回 0 → 天/地/人榜成就永不可得）
      const rank = 1 + db.characters.filter(c => c.id !== character.id && (c.arena_points || 0) > (character.arena_points || 0)).length;
      return rank <= requirement.value ? 1 : 0;
    }
    case 'friends': {
      const friends = (db.friends || []).filter(f => f.character_id === character.id || f.friend_id === character.id).length;
      return Math.min(1, friends / requirement.value);
    }
    case 'allMaps': {
      // 已探索地图（由采集/战斗入口写入 visited_maps）
      const visited = new Set(character.visited_maps || []);
      const total = (db.maps || []).length || 1;
      return Math.min(1, visited.size / total);
    }
    case 'allDungeons': {
      // 已通关副本（由副本通关写入 cleared_dungeons）
      const cleared = new Set(character.cleared_dungeons || []);
      const total = (db.dungeons || []).length || 1;
      return Math.min(1, cleared.size / total);
    }
    case 'allDungeonStar': {
      // 全副本五星（由副本结算写入 dungeon_stars 最高评价）
      const stars = character.dungeon_stars || {};
      const total = (db.dungeons || []).length || 1;
      const five = Object.values(stars).filter(v => Number(v) >= 5).length;
      return Math.min(1, five / total);
    }
    default:
      return 0;
  }
}

function isAchievementUnlocked(character, requirement) {
  return getProgress(character, requirement) >= 1;
}

module.exports = router;
module.exports.__getProgress = getProgress;
module.exports.__isUnlocked = isAchievementUnlocked;
module.exports.__DEFINITIONS = ACHIEVEMENTS;
