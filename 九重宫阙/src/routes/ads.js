const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/admin');
const { loadDatabase, saveDatabase, getNextId } = require('../database');

router.get('/', auth, (req, res) => {
  try {
    const db = loadDatabase();
    const ads = (db.ads || []).filter(a => a.enabled);
    res.json({ ads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/all', adminAuth, (req, res) => {
  try {
    const db = loadDatabase();
    res.json({ ads: db.ads || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/recharge', auth, (req, res) => {
  try {
    const { packageId } = req.body;
    if (!packageId) return res.status(400).json({ error: '请选择充值套餐' });
    const db = loadDatabase();
    const character = db.characters.find(c => c.user_id === req.userId);
    if (!character) return res.status(404).json({ error: '角色不存在' });
    let targetPkg = null;
    for (const ad of (db.ads || [])) {
      const pkg = (ad.packages || []).find(p => p.id === packageId);
      if (pkg) { targetPkg = pkg; break; }
    }
    if (!targetPkg) return res.status(404).json({ error: '套餐不存在' });
    const totalJade = (targetPkg.jade || 0) + (targetPkg.bonus_jade || 0);
    character.jade = (character.jade || 0) + totalJade;
    saveDatabase(db);
    res.json({ success: true, message: `充值成功，获得 ${totalJade} 仙玉`, jade: character.jade, received: totalJade });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', adminAuth, (req, res) => {
  try {
    const { title, description, type, image, packages, enabled } = req.body;
    if (!title) return res.status(400).json({ error: '标题不能为空' });
    const db = loadDatabase();
    const ad = {
      id: getNextId('ads'),
      title, description: description || '',
      type: type || 'recharge',
      image: image || '',
      packages: packages || [],
      enabled: enabled !== false,
      created_at: new Date().toISOString()
    };
    db.ads.push(ad);
    saveDatabase(db);
    res.json({ success: true, ad });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    const ad = (db.ads || []).find(a => a.id === parseInt(id));
    if (!ad) return res.status(404).json({ error: '广告不存在' });
    const { title, description, type, image, packages, enabled } = req.body;
    if (title) ad.title = title;
    if (description !== undefined) ad.description = description;
    if (type) ad.type = type;
    if (image !== undefined) ad.image = image;
    if (packages) ad.packages = packages;
    if (enabled !== undefined) ad.enabled = enabled;
    saveDatabase(db);
    res.json({ success: true, ad });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    const idx = (db.ads || []).findIndex(a => a.id === parseInt(id));
    if (idx === -1) return res.status(404).json({ error: '广告不存在' });
    db.ads.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true, message: '广告已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
