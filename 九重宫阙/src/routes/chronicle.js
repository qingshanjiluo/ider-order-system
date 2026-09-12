const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase } = require('../database');
const chronicle = require('../services/chronicle');
const aiService = require('../services/ai');

function getChar(req, res) {
  const db = loadDatabase();
  const character = db.characters.find(c => c.user_id === req.userId);
  if (!character) {
    res.status(404).json({ error: '角色不存在' });
    return null;
  }
  return character;
}

/** 编年史（按游戏年记录） */
router.get('/', auth, (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    res.json(chronicle.getChronicle(character));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 开局传记（name 传，程序化确定性；approved 的 AI 润色惰性应用） */
router.get('/biography', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    // 阶段9：审核通过的润色自动应用（审核池 → 角色）
    if (!character.biography_ai && character.biography_pending) {
      const store = require('../db/store');
      const gen = store.queryRel('ai_generations', { id: character.biography_pending })[0];
      if (gen && gen.status === 'approved') {
        try {
          character.biography_ai = { generationId: gen.id, paragraphs: JSON.parse(gen.result || '{}') && [JSON.parse(gen.result).name, JSON.parse(gen.result).desc].filter(Boolean) };
        } catch { /* result解析失败忽略 */ }
        character.biography_pending = null;
        saveDatabase(db);
      } else if (gen && gen.status === 'rejected') {
        character.biography_pending = null;
        saveDatabase(db);
      }
    }
    const bio = chronicle.getBiography(character);
    if (character.biography_ai) bio.aiParagraphs = character.biography_ai.paragraphs || null;
    res.json(bio);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** AI 增强传记（purpose=lore；pending 需审核，approve 后读取时自动应用） */
router.post('/biography/enhance', auth, async (req, res) => {
  try {
    const character = getChar(req, res);
    if (!character) return;
    const bio = chronicle.getBiography(character);
    const r = await aiService.generate('lore', {
      kind: 'biography',
      name: character.name,
      origin: bio.origin,
      constitution: bio.constitution || '无特殊体质'
    }, { forcePending: true }); // 文案类一律进审核池
    if (r.status === 'approved') {
      character.biography_ai = { generationId: r.generationId, paragraphs: [r.content.name, r.content.desc].filter(Boolean) };
    } else if (r.status === 'pending') {
      character.biography_pending = r.generationId; // 审核通过后读取传记时自动应用
    }
    saveDatabase(loadDatabase());
    res.json({ ...r, message: r.status === 'pending' ? '传记润色已提交审核，通过后自动生效' : '传记润色已生效' });
  } catch (error) {
    res.status(503).json({ error: `AI 功能暂不可用：${error.message}` });
  }
});

module.exports = router;
