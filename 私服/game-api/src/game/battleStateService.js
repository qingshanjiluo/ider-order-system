/**
 * 战斗状态查询（Worker 版）
 * 依赖注入：deps.bsc（D1 battleSessionCache）、deps.engine（battleEngine）。
 */

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

export async function queryBattleState({ accountId, battleId, after, deps }) {
  const bsc = deps.bsc;
  const engineApi = deps.engine;
  const id = String(battleId || '');
  if (!id) return { ok: false, error: '缺少 battleId' };

  const session = await bsc.getSession(id);
  if (!session || session.account_id !== accountId) {
    return { ok: false, error: '战斗会话无效或已过期' };
  }

  session.last_poll_at = Math.floor(Date.now() / 1000);
  const afterIdx = Math.max(0, intVal(after, 0));
  const rows = await bsc.listEventsSince(id, afterIdx, 200);
  const events = rows.map((x) => ({
    index: intVal(x.event_index, 0),
    ...(x.event || {})
  }));

  return {
    ok: true,
    battleId: id,
    status: String(session.status || 'active'),
    last_seq: Math.max(0, intVal(session.last_seq, 0)),
    state: engineApi.stateToClient(session.state || {}),
    events,
    result: session.result || {}
  };
}