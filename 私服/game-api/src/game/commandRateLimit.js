/**
 * 战斗类请求频率限制（Worker 简化版）
 *
 * 原版依赖 process.env + setInterval（进程内长驻）。
 * Worker 每请求隔离，无进程内共享状态 → 限制退化为"请求级"（作用有限）。
 * 逐指令协议的 seq 校验（指令乱序检测）已能阻止客户端刷包。
 */

const SERVER_TICK_MS = 240;
const SERVER_TICK_MIN_MS = 120;
const SERVER_TICK_MAX_MS = 800;
const COMMAND_BURST_WINDOW_MS = 1200;
const COMMAND_COALESCE_BURST_HITS = 2;
const COMMAND_COALESCE_REMAIN_MS = 160;

const _lastCmd = new Map();
const _state = new Map();

function _intClamp(v, lo, hi) {
  const n = Math.floor(Number(v) || 0);
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function _getState(accountId, now) {
  let st = _state.get(accountId);
  if (!st) {
    st = {
      tickMs: SERVER_TICK_MS,
      burstCount: 0,
      burstWindowStart: now,
      lastSeenAt: now
    };
    _state.set(accountId, st);
  }
  st.lastSeenAt = now;
  return st;
}

function getCommandDelay(accountId) {
  const aid = Number(accountId);
  if (!Number.isFinite(aid) || aid <= 0) return 0;

  const now = Date.now();
  const st = _getState(aid, now);
  const tick = _intClamp(st.tickMs, SERVER_TICK_MIN_MS, SERVER_TICK_MAX_MS);
  const last = _lastCmd.get(aid) || 0;
  const earliest = last + tick;

  if (now >= earliest) {
    _lastCmd.set(aid, now);
    st.burstCount = 0;
    st.burstWindowStart = now;
    st.tickMs = Math.max(SERVER_TICK_MIN_MS, tick - 10);
    return 0;
  }

  if ((now - Number(st.burstWindowStart || 0)) > COMMAND_BURST_WINDOW_MS) {
    st.burstWindowStart = now;
    st.burstCount = 0;
  }
  st.burstCount += 1;
  st.tickMs = Math.min(SERVER_TICK_MAX_MS, tick + 20);

  const remain = earliest - now;
  const shouldCoalesce = remain >= COMMAND_COALESCE_REMAIN_MS || st.burstCount >= COMMAND_COALESCE_BURST_HITS;
  if (!shouldCoalesce) {
    _lastCmd.set(aid, earliest);
  }
  return remain;
}

function checkCommandRate(accountId) {
  const aid = Number(accountId);
  if (!Number.isFinite(aid) || aid <= 0) return false;
  const now = Date.now();
  const last = _lastCmd.get(aid) || 0;
  if (now - last < 60) return false;
  _lastCmd.set(aid, now);
  _getState(aid, now);
  return true;
}

export {
  checkCommandRate,
  getCommandDelay,
  SERVER_TICK_MS,
  SERVER_TICK_MIN_MS,
  SERVER_TICK_MAX_MS
};