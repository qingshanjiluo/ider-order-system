const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

const AVAILABLE_QUESTS = [
  { id: 1, name: '斩妖除魔', type: 'main', description: '击杀10只妖兽', objectives: [{ type: 'kill', target: 'monster', current: 0, required: 10 }], rewards: { exp: 500, spirit_stone: 100, items: [] } },
  { id: 2, name: '秘境探宝', type: 'main', description: '通关3次副本', objectives: [{ type: 'dungeon', target: 'dungeon', current: 0, required: 3 }], rewards: { exp: 800, spirit_stone: 200, items: [] } },
  { id: 3, name: '境界突破', type: 'main', description: '达到指定等级', objectives: [{ type: 'level', target: 'level', current: 0, required: 10 }], rewards: { exp: 1000, spirit_stone: 300, items: [] } },
  { id: 4, name: '每日签到', type: 'daily', description: '完成每日签到', objectives: [{ type: 'checkin', target: 'checkin', current: 0, required: 1 }], rewards: { exp: 50, spirit_stone: 20, items: [] } },
  { id: 5, name: '勤修苦练', type: 'daily', description: '战斗5次', objectives: [{ type: 'battle', target: 'battle', current: 0, required: 5 }], rewards: { exp: 100, spirit_stone: 30, items: [] } },
  { id: 6, name: '采集资源', type: 'daily', description: '采集3次资源', objectives: [{ type: 'gather', target: 'gather', current: 0, required: 3 }], rewards: { exp: 80, spirit_stone: 25, items: [] } },
  { id: 7, name: '炼器入门', type: 'side', description: '制作2件装备', objectives: [{ type: 'craft', target: 'equipment', current: 0, required: 2 }], rewards: { exp: 200, spirit_stone: 50, items: [] } },
  { id: 8, name: '宗门贡献', type: 'side', description: '加入仙盟', objectives: [{ type: 'guild', target: 'guild', current: 0, required: 1 }], rewards: { exp: 300, spirit_stone: 80, items: [] } }
];

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const quests = (db.quests || []).filter(q => q.character_id === character.id);
    res.json({ quests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/available', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const activeQuestIds = (db.quests || [])
      .filter(q => q.character_id === character.id && (q.status === 'active' || q.status === 'completed'))
      .map(q => q.quest_id);

    const available = AVAILABLE_QUESTS.filter(q => !activeQuestIds.includes(q.id));
    res.json({ quests: available });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/accept', auth, (req, res) => {
  try {
    const { questId } = req.body;
    if (!questId) {
      return res.status(400).json({ error: '请指定要接受的任务' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const questDef = AVAILABLE_QUESTS.find(q => q.id === questId);
    if (!questDef) {
      return res.status(400).json({ error: '未知的任务' });
    }

    const existing = (db.quests || []).find(
      q => q.character_id === character.id && q.quest_id === questId && (q.status === 'active' || q.status === 'completed')
    );
    if (existing) {
      return res.status(400).json({ error: '已接受或已完成该任务' });
    }

    const quest = {
      id: getNextId('quests'),
      character_id: character.id,
      quest_id: questId,
      name: questDef.name,
      type: questDef.type,
      description: questDef.description,
      objectives: JSON.parse(JSON.stringify(questDef.objectives)),
      rewards: { ...questDef.rewards },
      status: 'active',
      accepted_at: Date.now(),
      completed_at: null
    };

    if (!db.quests) db.quests = [];
    db.quests.push(quest);

    saveDatabase(db);
    res.json({ success: true, message: `已接受任务：${questDef.name}`, quest });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/complete', auth, (req, res) => {
  try {
    const { questId } = req.body;
    if (!questId) {
      return res.status(400).json({ error: '请指定要完成的任务' });
    }

    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) {
      return res.status(404).json({ error: '角色不存在' });
    }

    const quest = (db.quests || []).find(
      q => q.id === questId && q.character_id === character.id && q.status === 'active'
    );
    if (!quest) {
      return res.status(400).json({ error: '任务不存在或未激活' });
    }

    const allComplete = quest.objectives.every(obj => obj.current >= obj.required);
    if (!allComplete) {
      return res.status(400).json({ error: '任务目标未全部完成' });
    }

    quest.status = 'completed';
    quest.completed_at = Date.now();

    const rewards = quest.rewards || {};
    const expGain = rewards.exp || 0;
    const spiritStoneGain = rewards.spirit_stone || 0;

    character.exp = (character.exp || 0) + expGain;
    character.spirit_stone = (character.spirit_stone || 0) + spiritStoneGain;

    let levelUp = false;
    while (character.exp >= (character.exp_to_next || 100)) {
      character.exp -= (character.exp_to_next || 100);
      character.level = (character.level || 1) + 1;
      character.exp_to_next = Math.floor((character.exp_to_next || 100) * 1.5);
      character.max_hp = (character.max_hp || 100) + 10;
      character.hp = character.max_hp;
      levelUp = true;
    }

    saveDatabase(db);
    res.json({
      success: true,
      message: `任务"${quest.name}"完成`,
      rewards: { exp: expGain, spirit_stone: spiritStoneGain },
      levelUp,
      newLevel: character.level
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

module.exports.updateQuestProgress = function updateQuestProgress(characterId, objectiveType, increment) {
  try {
    const db = loadDatabase();
    if (!db.quests) return;
    const activeQuests = db.quests.filter(q => q.character_id === characterId && q.status === 'active');
    const completedQuests = [];
    activeQuests.forEach(quest => {
      quest.objectives.forEach(obj => {
        if (obj.type === objectiveType && obj.current < obj.required) {
          obj.current = Math.min(obj.current + increment, obj.required);
        }
      });
      if (quest.objectives.every(obj => obj.current >= obj.required)) {
        completedQuests.push(quest);
      }
    });
    saveDatabase(db);
    return completedQuests;
  } catch (e) {
    return [];
  }
};
