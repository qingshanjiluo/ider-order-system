/**
 * 内容卫生一次性执行器（轮43）
 * 把 src/services/data-hygiene 的归一项（quality / realm / 跨阶梯品质词）跑一遍并落盘。
 * 幂等：第二次应为 0 修复。同样的工序在服务启动时也会跑（见 services/materials.js 的 ensureAll 序列），
 * 这里提供显式入口，便于修完源头后一次性清理历史脏行。
 */
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const hygiene = require('../src/services/data-hygiene');

function fixAll(db) {
  return {
    quality: hygiene.normalizeQualities(db),
    realm: hygiene.normalizeRealms(db),
    ladder: hygiene.normalizeItemQualities(db)
  };
}

const db = loadDatabase();
const before = fixAll(db);
const n = before.quality + before.realm + before.ladder;
if (n) saveDatabase(db);
closeDatabase();
console.log(`[hygiene] 归一 quality ${before.quality} 条、realm ${before.realm} 条、跨阶梯品质词 ${before.ladder} 条${n ? '（已落盘）' : '（无需修改）'}`);
if (n) {
  const again = fixAll(loadDatabase());
  const m = again.quality + again.realm + again.ladder;
  console.log(`[hygiene] 二次运行修复 ${m} 条（应为 0）`);
  closeDatabase();
  if (m !== 0) process.exitCode = 1;
}
