const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const aiService = require('../services/ai');

/** 管理鉴权：X-Admin-Token 与 AI_ADMIN_TOKEN（默认 dev-admin）比对 */
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  const expected = process.env.AI_ADMIN_TOKEN || 'dev-admin';
  if (token !== expected) return res.status(403).json({ error: '管理员令牌无效' });
  next();
}

// ---------- 管理后台：密钥池 ----------
router.get('/admin/keys', adminAuth, (req, res) => {
  res.json({ keys: aiService.listKeys(), failDisableThreshold: aiService.FAIL_DISABLE_THRESHOLD });
});

router.post('/admin/keys', adminAuth, (req, res) => {
  try {
    const id = aiService.addKey(req.body);
    res.json({ success: true, id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/admin/keys/:id', adminAuth, (req, res) => {
  aiService.removeKey(req.params.id);
  res.json({ success: true });
});

router.patch('/admin/keys/:id', adminAuth, (req, res) => {
  try {
    aiService.updateKey(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/admin/keys/:id/test', adminAuth, async (req, res) => {
  try {
    res.json(await aiService.testKey(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------- 管理后台：审核池 ----------
router.get('/admin/generations', adminAuth, (req, res) => {
  res.json({ generations: aiService.listGenerations(req.query.status) });
});

router.post('/admin/generations/:id/review', adminAuth, (req, res) => {
  try {
    const { action, note } = req.body;
    res.json(aiService.review(req.params.id, action, note));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------- 玩家/系统：生成入口（管线内部降级，不暴露密钥） ----------
router.post('/generate', auth, async (req, res) => {
  try {
    const { purpose, params, forcePending } = req.body;
    const r = await aiService.generate(purpose, params || {}, { forcePending });
    res.json(r);
  } catch (error) {
    // 全部密钥不可用等显式报错（原始设定 13：失效并点击显示报错）
    res.status(503).json({ error: `AI 功能暂不可用：${error.message}` });
  }
});

router.get('/purposes', auth, (req, res) => {
  res.json({ purposes: aiService.PURPOSES });
});

// ---------- 生成点1：器方词条（炼器新增配方，approved 后入库可学） ----------
router.post('/recipes/forge', auth, async (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    // 门槛：crafting 熟练度 ≥4 级（学徒以上）
    const prof = (character.proficiency || {}).crafting || { level: 0 };
    if ((prof.level || 0) < 4) return res.status(400).json({ error: '锻造熟练度需达到「熟练」（4级）方可推演新器方' });
    const cost = 500;
    if ((character.spirit_stone || 0) < cost) return res.status(400).json({ error: `推演需 ${cost} 灵石` });
    character.spirit_stone -= cost;

    const r = await aiService.generate('recipe_forge', { element: req.body.element, quality: req.body.quality }, { forcePending: false });
    // approved（本地降级）→ 直接入 learned_blueprints；pending（AI）→ 审核通过后可领
    if (r.status === 'approved') {
      if (!character.learned_blueprints) character.learned_blueprints = [];
      character.learned_blueprints.push({ name: r.content.name, kind: '器方', source: 'ai', generationId: r.generationId });
    }
    saveDatabase(db);
    res.json({ ...r, cost, learned: r.status === 'approved' });
  } catch (error) {
    res.status(503).json({ error: `AI 功能暂不可用：${error.message}` });
  }
});

// ---------- 生成点2：角色顿悟（熟练度极高 → 有概率创功法） ----------
router.post('/epiphany', auth, async (req, res) => {
  try {
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    // 门槛：任意生产熟练度 ≥7 级（登峰造极）
    const profs = character.proficiency || {};
    const top = Object.entries(profs).sort((a, b) => (b[1].level || 0) - (a[1].level || 0))[0];
    if (!top || (top[1].level || 0) < 7) return res.status(400).json({ error: '需某项生产熟练度达到「登峰造极」（7级）方有可能顿悟' });
    // 每游戏日一次（2.4h 现实）
    const now = Date.now();
    if (character.last_epiphany_at && now - character.last_epiphany_at < 2.4 * 3600 * 1000) {
      return res.status(400).json({ error: '道心需沉淀，顿悟每游戏日仅一次' });
    }
    if (Math.random() > 0.4) {
      character.last_epiphany_at = now;
      saveDatabase(db);
      return res.json({ success: false, message: '静坐半日，道心微有所感，却未能抓住那一缕灵光（可再试）' });
    }
    const r = await aiService.generate('skill_invent', { element: req.body.element, quality: '地阶' });
    character.last_epiphany_at = now;
    if (r.status === 'approved') {
      // 本地降级：直接铸为功法物品入包
      const itemId = getNextId('items');
      db.items.push({
        id: itemId, name: r.content.name, type: '功法', quality: r.content.quality,
        stats: JSON.stringify({ skill_damage: r.content.stats.skill_damage, element: r.content.element, invented: true }),
        description: r.content.desc
      });
      db.inventory.push({ id: getNextId('inventory'), character_id: character.id, item_id: itemId, quantity: 1 });
      r.content.itemId = itemId;
      // 阶段9：顿悟写入编年史
      require('../services/gameTime').logEvent(character, 'epiphany', `顿悟创法·${r.content.name}`, r.content.desc);
    }
    saveDatabase(db);
    res.json(r);
  } catch (error) {
    res.status(503).json({ error: `AI 功能暂不可用：${error.message}` });
  }
});

module.exports = router;
