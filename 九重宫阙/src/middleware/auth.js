const jwt = require('jsonwebtoken');
const config = require('../config');
const charLock = require('./charLock');
const { loadDatabase } = require('../database');

const LOCK_WATCHDOG_MS = 15000;

/**
 * 鉴权 + E1 写安全：同一角色的请求端到端串行。
 * 真实竞态发生在 async 路由跨 await 的读-改-写（battle/dungeon/arena/chronicle/ai 共 9 处）；
 * 在鉴权成功后按 characterId 取锁、响应结束（finish/close）释放，一处覆盖全部已鉴权路由。
 * 15s 看门狗兜底，防某条路由未响应把该角色永久卡死。
 */
function auth(req, res, next) {
  const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.userId = jwt.verify(token, config.jwt.secret).userId;
  } catch (error) {
    return res.status(401).json({ error: '登录已过期' });
  }

  let characterId = null;
  try {
    const ch = (loadDatabase().characters || []).find((c) => c.user_id === req.userId);
    if (ch) characterId = ch.id;
  } catch (e) {
    // 库不可用时不加锁：鉴权不应因取锁失败而变 401
  }
  if (characterId === null) return next();

  charLock.withCharacterLock(characterId, () => new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.removeListener('finish', done);
      res.removeListener('close', done);
      resolve();
    };
    const timer = setTimeout(() => {
      console.warn(`[auth] 角色 ${characterId} 请求超过 ${LOCK_WATCHDOG_MS}ms 未结束，强制放行`);
      done();
    }, LOCK_WATCHDOG_MS);
    res.on('finish', done);
    res.on('close', done);
    next();
  }));
}

module.exports = auth;
