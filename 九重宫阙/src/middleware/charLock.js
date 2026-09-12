/**
 * E1 写安全 · 角色级互斥（不变量 4：改角色/背包/灵石/寿元的端点必须在锁内，且先算后写）
 *
 * 背景：本服务是"进程内全量镜像 + saveDatabase 落盘"，Express 单线程但 async 路由会在
 * await 处让出，导致 A 请求读到的旧值被 B 请求覆盖（丢失更新）。锁把同一角色的临界区串行化。
 *
 * 用法：
 *   const charLock = require('../middleware/charLock');
 *   await charLock.withCharacterLock(character.id, () => { ...同步读改+saveDatabase... });
 * 注意：临界区内不要再对外发 async 请求（AI/HTTP），否则等于把锁租期拉长。
 */

const chains = new Map();

/** 单角色串行 */
function withCharacterLock(characterId, task) {
  const key = String(characterId);
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(() => task());
  // 链尾吞掉异常，保证队列后续任务不被前一个失败阻断；调用方仍拿到真实结果/异常
  const tail = run.then(() => undefined, () => undefined);
  chains.set(key, tail);
  tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
  return run;
}

/**
 * 多角色串行（交易/仙盟/切磋等跨角色操作）：按 key 升序加锁，避免 AB/BA 交叉死锁。
 */
function withCharacterLocks(characterIds, task) {
  const keys = [...new Set(characterIds.map(String))].sort();
  if (keys.length === 0) return task();
  if (keys.length === 1) return withCharacterLock(keys[0], task);
  let inner = task;
  for (const k of keys.slice().reverse()) {
    const captured = inner;
    inner = () => withCharacterLock(k, captured);
  }
  return inner();
}

/** 当前排队长度（监控/测试用） */
function queueDepth(characterId) {
  return chains.has(String(characterId)) ? 1 : 0;
}

/** 是否有任一角色仍在持锁/排队（优雅退出前检查） */
function hasPendingLocks() {
  return chains.size > 0;
}

module.exports = { withCharacterLock, withCharacterLocks, queueDepth, hasPendingLocks };
