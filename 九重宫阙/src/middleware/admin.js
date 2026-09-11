const jwt = require('jsonwebtoken');
const config = require('../config');
const { loadDatabase } = require('../database');

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const db = loadDatabase();
    const user = db.users.find(u => u.id === decoded.userId);
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    if (!user.is_admin && user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: '无管理员权限' });
    }
    req.userId = decoded.userId;
    req.isAdmin = true;
    req.userRole = user.role || 'admin';
    next();
  } catch (error) {
    res.status(401).json({ error: '登录已过期' });
  }
}

module.exports = adminAuth;