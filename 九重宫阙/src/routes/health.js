const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadDatabase } = require('../database');

const BOOTED_AT = Date.now();
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'game.db');

/** 健康检查（零依赖）：供负载均衡、容器 healthcheck、监控探针使用
 *  判据：内存数据库可载入即视为健康；db 文件为附加信息（缺失时仍可由 seed 引导）*/
router.get('/', (req, res) => {
  let file = { exists: false, sizeBytes: 0, mtime: null, staleSeconds: null, error: null };
  try {
    const st = fs.statSync(DB_PATH);
    file = { exists: true, sizeBytes: st.size, mtime: st.mtime.toISOString(), staleSeconds: Math.round((Date.now() - st.mtime.getTime()) / 1000) };
  } catch (e) { file.error = e.code || e.message; }

  let db = { ok: false, error: null, collections: null };
  try {
    const d = loadDatabase();
    db = {
      ok: true, error: null,
      collections: ['characters', 'items', 'inventory', 'maps', 'monsters', 'dungeons', 'shop', 'pets', 'achievements', 'blueprints', 'recipes']
        .reduce((acc, k) => { acc[k] = Array.isArray(d[k]) ? d[k].length : 0; return acc; }, {})
    };
  } catch (e) { db = { ok: false, error: e.message, collections: null }; }

  const mem = process.memoryUsage();
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    service: 'jiuchong-gongque',
    version: require('../../package.json').version,
    env: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round((Date.now() - BOOTED_AT) / 1000),
    now: new Date().toISOString(),
    node: process.version,
    pid: process.pid,
    memory: { rssMB: +(mem.rss / 1048576).toFixed(1), heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1) },
    db, file
  });
});

module.exports = router;
