/**
 * 好友与亲密度（P2 · 章程 E8 · 修 D4；轮48）
 *
 * 为什么必须先有这张表：`routes/achievement.js` 早就在读 `db.friends`（case 'friends'），
 * 但全库没有 friends 集合 —— 靠 `|| []` 兜住不崩，于是「社交达人」等 friends 类成就**恒 0 进度、永不可达**。
 * 本轮把集合建出来、把写入路径接上，成就进度才第一次可能 > 0（E8 验收原文）。
 *
 * 字段口径：`character_id`（发起方）+ `friend_id`（接收方）+ `status` + `intimacy` + 时间戳。
 * 规划文档 P2 段写的是 `target_character_id`，但**消费方已经在读 `friend_id`**（achievement.js:198），
 * 按"先接消费方"的纪律以代码为准，规划文档已同步更正并写明理由。
 *
 * 并发口径：所有端点都已在 `middleware/auth.js` 的角色锁内执行（每个登录请求包一层 withCharacterLock）。
 * 这里**不再嵌套第二把锁**：好友操作天然涉及两个角色，若在已持锁的请求里再锁对方，就会出现
 * A→B 与 B→A 交叉持锁的 AB/BA 死锁（只能靠看门狗超时放行）。本模块的每个函数都是**同步临界区**，
 * Node 单线程下不会与自身交错，因此不需要跨角色锁；一旦将来引入 await，必须改成"锁内重读"再写。
 */
const { loadDatabase, getNextId } = require('../database');

const FRIEND_LIMIT = 50;      // 方案规划/07-技术架构/游戏规则.md:106「好友上限 50 人」
const PENDING_LIMIT = 20;     // 同一角色同时最多 20 条待处理申请（防灌水）
const VISIT_INTIMACY = 1;     // 拜访洞府 +1 亲密度
const VISIT_DAILY_LIMIT = 3;  // 每日对同一好友最多 3 次拜访收益
const REJECT_COOLDOWN_DAYS = 1;   // 被拒后 1 天内不得再向同一人申请

const today = () => new Date().toISOString().slice(0, 10);

function list(db) {
  if (!Array.isArray(db.friends)) db.friends = [];
  return db.friends;
}

function pairIn(list, a, b) {
  return list.find(f =>
    (Number(f.character_id) === Number(a) && Number(f.friend_id) === Number(b)) ||
    (Number(f.character_id) === Number(b) && Number(f.friend_id) === Number(a)));
}

function acceptedCount(list, id) {
  return list.filter(f => f.status === 'accepted' && (Number(f.character_id) === Number(id) || Number(f.friend_id) === Number(id))).length;
}

function pendingOutgoing(list, id) {
  return list.filter(f => f.status === 'pending' && Number(f.character_id) === Number(id)).length;
}

function nameOf(db, id) {
  const ch = (db.characters || []).find(c => Number(c.id) === Number(id));
  return ch ? ch.name : `#${id}`;
}

/** 发起申请：可传角色 id 或道号（前端只有名字可搜） */
function request(characterId, target) {
  const db = loadDatabase();
  const rows = list(db);
  const tid = Number(target);
  const to = Number.isFinite(tid) && tid > 0
    ? (db.characters || []).find(c => Number(c.id) === tid)
    : (db.characters || []).find(c => String(c.name) === String(target));
  if (!to) return { ok: false, error: '找不到该修士' };
  if (Number(to.id) === Number(characterId)) return { ok: false, error: '不能添加自己为好友' };
  if (to.banned || to.is_banned) return { ok: false, error: '对方当前不可添加' };

  const exist = pairIn(rows, characterId, to.id);
  if (exist) {
    if (exist.status === 'accepted') return { ok: false, error: '你们已经是好友了' };
    if (exist.status === 'pending') return { ok: false, error: '已发出申请，等待对方回应' };
    const last = new Date(exist.updated_at || exist.created_at || 0).getTime();
    if (exist.status === 'rejected' && Date.now() - last < REJECT_COOLDOWN_DAYS * 86400000) {
      return { ok: false, error: '对方刚拒绝过申请，改日再试' };
    }
    exist.status = 'pending';
    exist.character_id = Number(characterId);        // 复活为"由我发起"，方向必须翻转
    exist.friend_id = Number(to.id);
    exist.created_at = new Date().toISOString();
    exist.updated_at = exist.created_at;
    return { ok: true, reused: true, requestId: exist.id, target: to.name };
  }

  if (acceptedCount(rows, characterId) >= FRIEND_LIMIT) return { ok: false, error: `好友数量已达上限（${FRIEND_LIMIT}）` };
  if (acceptedCount(rows, to.id) >= FRIEND_LIMIT) return { ok: false, error: '对方好友已满' };
  if (pendingOutgoing(rows, characterId) >= PENDING_LIMIT) return { ok: false, error: `待处理申请已达上限（${PENDING_LIMIT}）` };

  const row = {
    id: getNextId('friends'),
    character_id: Number(characterId),
    friend_id: Number(to.id),
    status: 'pending',
    intimacy: 0,
    visits: { date: today(), count: 0 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  rows.push(row);
  return { ok: true, requestId: row.id, target: to.name };
}

/** 回应申请：只有被申请方能操作 */
function respond(characterId, requestId, accept) {
  const db = loadDatabase();
  const rows = list(db);
  const row = rows.find(f => Number(f.id) === Number(requestId));
  if (!row) return { ok: false, error: '申请不存在' };
  if (row.status !== 'pending') return { ok: false, error: '该申请已被处理' };
  if (Number(row.friend_id) !== Number(characterId)) return { ok: false, error: '只能处理发给自己的申请' };
  if (accept && acceptedCount(rows, characterId) >= FRIEND_LIMIT) return { ok: false, error: `你的好友数量已达上限（${FRIEND_LIMIT}）` };
  if (accept && acceptedCount(rows, row.character_id) >= FRIEND_LIMIT) return { ok: false, error: '对方好友已满' };
  row.status = accept ? 'accepted' : 'rejected';
  row.updated_at = new Date().toISOString();
  return { ok: true, status: row.status, with: nameOf(db, accept ? row.character_id : row.friend_id) };
}

/** 删除好友：任一方向都可删，删行即亲密度归零（蓝图 §6.2 验收口径） */
function remove(characterId, otherId) {
  const db = loadDatabase();
  const rows = list(db);
  const idx = rows.findIndex(f => pairIn(rows, characterId, otherId) === f);
  if (idx < 0) return { ok: false, error: '你们之间没有好友关系' };
  const [gone] = rows.splice(idx, 1);
  return { ok: true, removed: gone.status, intimacyLost: gone.intimacy || 0 };
}

/** 我的好友页：好友 / 收到的申请 / 我发出的申请 */
function overview(characterId) {
  const db = loadDatabase();
  const rows = list(db);
  const me = Number(characterId);
  const shape = (f) => ({
    requestId: f.id, intimacy: f.intimacy || 0, status: f.status, updatedAt: f.updated_at,
    character: (() => {
      const other = (db.characters || []).find(c => Number(c.id) === Number(Number(f.character_id) === me ? f.friend_id : f.character_id));
      return other ? { id: other.id, name: other.name, realm: other.realm, realm_stage: other.realm_stage, level: other.level } : null;
    })()
  });
  return {
    friends: rows.filter(f => f.status === 'accepted' && (Number(f.character_id) === me || Number(f.friend_id) === me)).map(shape),
    incoming: rows.filter(f => f.status === 'pending' && Number(f.friend_id) === me).map(shape),
    outgoing: rows.filter(f => f.status === 'pending' && Number(f.character_id) === me).map(shape),
    limit: FRIEND_LIMIT,
    pendingLimit: PENDING_LIMIT
  };
}

/** 访问洞府：仅好友可访，每日限次，给亲密度；返回对方的公开洞府概览 */
function visit(visitorId, hostId) {
  const db = loadDatabase();
  const rows = list(db);
  if (Number(visitorId) === Number(hostId)) return { ok: false, error: '不必拜访自己' };
  const row = pairIn(rows, visitorId, hostId);
  if (!row || row.status !== 'accepted') return { ok: false, error: '只能拜访好友的洞府' };
  const host = (db.characters || []).find(c => Number(c.id) === Number(hostId));
  if (!host) return { ok: false, error: '好友不存在或已转世' };
  if (!row.visits || row.visits.date !== today()) row.visits = { date: today(), count: 0 };
  if (row.visits.count >= VISIT_DAILY_LIMIT) return { ok: false, error: `今日拜访次数已用完（${VISIT_DAILY_LIMIT}）` };
  row.visits.count++;
  row.intimacy = (row.intimacy || 0) + VISIT_INTIMACY;
  row.updated_at = new Date().toISOString();
  return {
    ok: true,
    intimacy: row.intimacy,
    visitsToday: row.visits.count,
    host: { id: host.id, name: host.name, realm: host.realm, realm_stage: host.realm_stage, level: host.level, faction: host.faction }
  };
}

/** 按道号搜人（只回可公开的信息，且屏蔽自己） */
function search(characterId, keyword) {
  const db = loadDatabase();
  const rows = list(db);
  const kw = String(keyword || '').trim();
  if (!kw) return [];
  return (db.characters || [])
    .filter(c => Number(c.id) !== Number(characterId) && String(c.name).includes(kw))
    .slice(0, 20)
    .map(c => {
      const rel = pairIn(rows, characterId, c.id);
      return { id: c.id, name: c.name, realm: c.realm, level: c.level, relation: rel ? rel.status : 'none' };
    });
}

module.exports = {
  request, respond, remove, overview, visit, search,
  FRIEND_LIMIT, PENDING_LIMIT, VISIT_INTIMACY, VISIT_DAILY_LIMIT, REJECT_COOLDOWN_DAYS
};
