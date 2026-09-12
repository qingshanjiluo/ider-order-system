/**
 * 内容卫生一次性执行器（轮43）
 * 把 src/services/data-hygiene 的两项归一（quality / realm 引用）跑一遍并落盘。
 * 幂等：第二次应为 0 修复。存档被服务在启动时同样会跑这道工序（见 services/materials.js 的 ensure 序列），
 * 这里提供显式入口，便于修完源头后一次性清理历史脏行。
 */
const { loadDatabase, saveDatabase, closeDatabase } = require('../src/database');
const hygiene = require('../src/services/data-hygiene');

const db = loadDatabase();
const q = hygiene.normalizeQualities(db);
const r = hygiene.normalizeRealms(db);
if (q || r) saveDatabase(db);
closeDatabase();
console.log(`[hygiene] 归一 quality ${q} 条、realm ${r} 条${q || r ? '（已落盘）' : '（无需修改，幂等成立）'}`);
if (q || r) {
  const db2 = loadDatabase();
  const again = hygiene.normalizeQualities(db2) + hygiene.normalizeRealms(db2);
  console.log(`[hygiene] 二次运行修复 ${again} 条（应为 0）`);
  closeDatabase();
  if (again !== 0) process.exitCode = 1;
}
