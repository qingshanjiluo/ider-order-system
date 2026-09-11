/**
 * 管理员后台路由（Worker 版）
 * 所有接口需 JWT 登录 + 账号 is_admin=1。
 */
import { verifyToken } from '../auth.js';
import { createDb } from '../db.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/** 管理员鉴权：验证 JWT + is_admin */
async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { error: '未登录', code: 401 };
  const payload = await verifyToken(token, env);
  if (!payload) return { error: '登录已过期', code: 401 };
  const accountId = payload.accountId || payload.sub || 0;
  const acc = await env.DB.prepare('SELECT id, username, is_admin FROM accounts WHERE id = ? LIMIT 1')
    .bind(accountId).first().catch(() => null);
  if (!acc) return { error: '账号不存在', code: 401 };
  if (!Number(acc.is_admin || 0)) return { error: '无管理员权限', code: 403 };
  return { accountId, username: acc.username };
}

export async function handleAdminRoute(request, env, route) {
  if (!route.startsWith('/admin')) return null;

  const auth = await requireAdmin(request, env);
  if (auth.error) return json({ ok: false, error: auth.error }, auth.code);

  const db = createDb(env);
  const method = request.method;
  const body = method === 'POST' ? await request.json().catch(() => ({})) : {};
  const url = new URL(request.url);
  const params = url.searchParams;

  // ════════════════════ 玩家管理 ════════════════════

  // GET /admin/players?page=1&pageSize=20&search=xxx
  if (route === '/admin/players' && method === 'GET') {
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 20));
    const search = String(params.get('search') || '').trim();
    const offset = (page - 1) * pageSize;

    let countQuery = 'SELECT COUNT(*) as total FROM players';
    let dataQuery = `SELECT p.account_id, p.data, a.username, a.is_banned, a.is_admin, a.created_at as reg_at
      FROM players p LEFT JOIN accounts a ON p.account_id = a.id`;
    const binds = [];

    if (search) {
      const like = `%${search}%`;
      countQuery += ' WHERE p.account_id IN (SELECT id FROM accounts WHERE username LIKE ? OR id = ?)';
      dataQuery += ' WHERE a.username LIKE ? OR p.account_id = ?';
      binds.push(like, Number(search) || -1);
    }

    const countRow = await env.DB.prepare(countQuery).bind(...binds).first().catch(() => ({ total: 0 }));
    const total = Number(countRow?.total || 0);

    dataQuery += ' ORDER BY p.account_id DESC LIMIT ? OFFSET ?';
    binds.push(pageSize, offset);
    const rows = await env.DB.prepare(dataQuery).bind(...binds).all().catch(() => ({ results: [] }));

    const players = (rows.results || []).map(r => {
      let d = {};
      try { d = JSON.parse(r.data || '{}'); } catch {}
      return {
        accountId: r.account_id,
        username: r.username || '',
        name: d.name || '',
        level: d.level || 1,
        realm: d.realm || '',
        is_ai: !!d.is_ai,
        is_banned: !!r.is_banned,
        is_admin: !!r.is_admin,
        spiritStones: d.spiritStones || 0,
        hp: d.hp || 0,
        maxHp: d.maxHp || 0,
        attack: d.attack || 0,
        defense: d.defense || 0,
        agility: d.agility || 0,
        spirit: d.spirit || 0,
        regAt: r.reg_at || 0,
      };
    });

    return json({ ok: true, players, total, page, pageSize });
  }

  // GET /admin/players/:id - 玩家详情
  if (route.match(/^\/admin\/players\/\d+$/) && method === 'GET') {
    const accountId = Number(route.split('/').pop());
    const row = await env.DB.prepare(
      `SELECT p.account_id, p.data, p.inventory_json, a.username, a.is_banned, a.is_admin, a.ban_reason, a.ban_expires_at, a.created_at as reg_at, a.last_login_ip
       FROM players p LEFT JOIN accounts a ON p.account_id = a.id WHERE p.account_id = ? LIMIT 1`
    ).bind(accountId).first().catch(() => null);
    if (!row) return json({ ok: false, error: '玩家不存在' }, 404);

    let d = {};
    try { d = JSON.parse(row.data || '{}'); } catch {}
    let inv = {};
    try { inv = JSON.parse(row.inventory_json || '{}'); } catch {}

    return json({
      ok: true,
      player: {
        accountId: row.account_id,
        username: row.username || '',
        is_banned: !!row.is_banned,
        is_admin: !!row.is_admin,
        banReason: row.ban_reason || '',
        banExpiresAt: Number(row.ban_expires_at || 0),
        regAt: row.reg_at || 0,
        lastLoginIp: row.last_login_ip || '',
        data: d,
        inventory: inv,
      }
    });
  }

  // POST /admin/players/:id/ban
  if (route.match(/^\/admin\/players\/\d+\/ban$/) && method === 'POST') {
    const accountId = Number(route.split('/')[3]);
    const { reason, expiresAt } = body;
    if (accountId === auth.accountId) return json({ ok: false, error: '不能封禁自己' });
    // 不允许封禁其他管理员
    const target = await env.DB.prepare('SELECT is_admin FROM accounts WHERE id = ?').bind(accountId).first();
    if (target && Number(target.is_admin || 0) && accountId !== auth.accountId) {
      return json({ ok: false, error: '不能封禁其他管理员' });
    }
    await env.DB.prepare('UPDATE accounts SET is_banned = 1, ban_reason = ?, banned_at = ?, ban_expires_at = ? WHERE id = ?')
      .bind(reason || '管理员操作', Math.floor(Date.now() / 1000), Number(expiresAt) || 0, accountId).run();
    return json({ ok: true, message: '已封禁' });
  }

  // POST /admin/players/:id/unban
  if (route.match(/^\/admin\/players\/\d+\/unban$/) && method === 'POST') {
    const accountId = Number(route.split('/')[3]);
    await env.DB.prepare('UPDATE accounts SET is_banned = 0, ban_reason = \'\', banned_at = 0, ban_expires_at = 0 WHERE id = ?')
      .bind(accountId).run();
    return json({ ok: true, message: '已解封' });
  }

  // POST /admin/players/:id/set-admin  { is_admin: true/false }
  if (route.match(/^\/admin\/players\/\d+\/set-admin$/) && method === 'POST') {
    const accountId = Number(route.split('/')[3]);
    const { is_admin } = body;
    if (accountId === auth.accountId) return json({ ok: false, error: '不能修改自己的管理员状态' });
    await env.DB.prepare('UPDATE accounts SET is_admin = ? WHERE id = ?')
      .bind(is_admin ? 1 : 0, accountId).run();
    return json({ ok: true, message: is_admin ? '已设为管理员' : '已取消管理员' });
  }

  // POST /admin/players/:id/set-stats  { hp, maxHp, attack, defense, ... }
  if (route.match(/^\/admin\/players\/\d+\/set-stats$/) && method === 'POST') {
    const accountId = Number(route.split('/')[3]);
    const row = await env.DB.prepare('SELECT data FROM players WHERE account_id = ?').bind(accountId).first();
    if (!row) return json({ ok: false, error: '玩家不存在' }, 404);
    let d = {};
    try { d = JSON.parse(row.data || '{}'); } catch {}
    const allowed = ['hp', 'maxHp', 'attack', 'defense', 'agility', 'spirit', 'level', 'exp', 'spiritStones', 'name', 'realm'];
    for (const k of allowed) {
      if (body[k] !== undefined) d[k] = body[k];
    }
    await env.DB.prepare('UPDATE players SET data = ? WHERE account_id = ?')
      .bind(JSON.stringify(d), accountId).run();
    return json({ ok: true, message: '属性已更新' });
  }

  // POST /admin/players/:id/send-mail  { subject, content, items }
  if (route.match(/^\/admin\/players\/\d+\/send-mail$/) && method === 'POST') {
    const accountId = Number(route.split('/')[3]);
    const { subject, content, items } = body;
    if (!subject || !content) return json({ ok: false, error: '缺少主题或内容' });
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO mailbox (account_id, subject, content, items_json, is_read, is_claimed, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)'
    ).bind(accountId, subject, content, JSON.stringify(items || []), now).run();
    return json({ ok: true, message: '邮件已发送' });
  }

  // ════════════════════ AI 玩家管理 ════════════════════

  // GET /admin/ai/players - 所有AI玩家列表（含详细数据）
  if (route === '/admin/ai/players' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT p.account_id, p.data, a.username FROM players p LEFT JOIN accounts a ON p.account_id = a.id
       WHERE p.account_id >= 90001 AND p.account_id <= 90040 ORDER BY p.account_id`
    ).all().catch(() => ({ results: [] }));
    const aiPlayers = (rows.results || []).map(r => {
      let d = {};
      try { d = JSON.parse(r.data || '{}'); } catch {}
      return {
        accountId: r.account_id,
        username: r.username || '',
        name: d.name || '',
        level: d.level || 1,
        realm: d.realm || '',
        personality: d.ai_personality || 'BALANCED',
        is_ai: !!d.is_ai,
        spiritRoots: d.spiritRoots || [],
        hp: d.hp || 0,
        maxHp: d.maxHp || 0,
        attack: d.attack || 0,
        defense: d.defense || 0,
        agility: d.agility || 0,
        spirit: d.spirit || 0,
        spiritStones: d.spiritStones || 0,
        combatPower: d.combatPower || 0,
        sectId: d.sect_id || null,
        allianceId: d.alliance_id || null,
      };
    });
    return json({ ok: true, aiPlayers });
  }

  // POST /admin/ai/tick - 手动触发AI行为
  if (route === '/admin/ai/tick' && method === 'POST') {
    const { accountId } = body;
    // 导入 AI scheduler 执行单个 tick
    try {
      const mod = await import('../game/aiScheduler.js');
      if (accountId) {
        await mod.runSingleAITick(env, Number(accountId));
      } else {
        await mod.runAllAITicks(env);
      }
      return json({ ok: true, message: accountId ? `AI ${accountId} tick 已执行` : '全部 AI tick 已执行' });
    } catch (e) {
      return json({ ok: false, error: 'AI tick 失败: ' + (e?.message || e) }, 500);
    }
  }

  // POST /admin/ai/init - 初始化/重建AI玩家
  if (route === '/admin/ai/init' && method === 'POST') {
    try {
      const mod = await import('../game/aiScheduler.js');
      await mod.initializeAIPlayers(env);
      return json({ ok: true, message: 'AI 玩家已初始化' });
    } catch (e) {
      return json({ ok: false, error: '初始化失败: ' + (e?.message || e) }, 500);
    }
  }

  // POST /admin/ai/reset - 重置AI缓存
  if (route === '/admin/ai/reset' && method === 'POST') {
    try {
      const mod = await import('../game/aiScheduler.js');
      mod.resetCache();
      return json({ ok: true, message: 'AI 缓存已重置' });
    } catch (e) {
      return json({ ok: false, error: '重置失败: ' + (e?.message || e) }, 500);
    }
  }

  // GET /admin/ai/leaderboard - AI排行榜
  if (route === '/admin/ai/leaderboard' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT p.account_id, p.data, a.username FROM players p LEFT JOIN accounts a ON p.account_id = a.id
       WHERE p.account_id >= 90001 AND p.account_id <= 90040`
    ).all().catch(() => ({ results: [] }));
    const list = (rows.results || []).map(r => {
      let d = {};
      try { d = JSON.parse(r.data || '{}'); } catch {}
      return {
        accountId: r.account_id,
        username: r.username || '',
        name: d.name || '',
        level: d.level || 1,
        realm: d.realm || '',
        personality: d.ai_personality || 'BALANCED',
        combatPower: d.combatPower || 0,
        spiritStones: d.spiritStones || 0,
      };
    }).sort((a, b) => b.level - a.level || b.combatPower - a.combatPower);
    return json({ ok: true, leaderboard: list });
  }

  // ════════════════════ 系统管理 ════════════════════

  // GET /admin/system/stats - 系统统计
  if (route === '/admin/system/stats' && method === 'GET') {
    const totalPlayers = await env.DB.prepare('SELECT COUNT(*) as c FROM players').first().catch(() => ({ c: 0 }));
    const totalAccounts = await env.DB.prepare('SELECT COUNT(*) as c FROM accounts').first().catch(() => ({ c: 0 }));
    const bannedAccounts = await env.DB.prepare('SELECT COUNT(*) as c FROM accounts WHERE is_banned = 1').first().catch(() => ({ c: 0 }));
    const aiPlayers = await env.DB.prepare('SELECT COUNT(*) as c FROM players WHERE account_id >= 90001 AND account_id <= 90040').first().catch(() => ({ c: 0 }));
    const today注册 = await env.DB.prepare("SELECT COUNT(*) as c FROM accounts WHERE created_at > strftime('%s','now') - 86400").first().catch(() => ({ c: 0 }));

    // 各境界分布
    const allPlayers = await env.DB.prepare('SELECT data FROM players').all().catch(() => ({ results: [] }));
    const realmCount = {};
    for (const row of (allPlayers.results || [])) {
      try {
        const d = JSON.parse(row.data || '{}');
        const r = d.realm || '凡人';
        realmCount[r] = (realmCount[r] || 0) + 1;
      } catch {}
    }

    return json({
      ok: true,
      stats: {
        totalAccounts: Number(totalAccounts?.c || 0),
        totalPlayers: Number(totalPlayers?.c || 0),
        bannedAccounts: Number(bannedAccounts?.c || 0),
        aiPlayers: Number(aiPlayers?.c || 0),
        todayRegistered: Number(today注册?.c || 0),
        realmDistribution: realmCount,
      }
    });
  }

  // GET /admin/system/accounts?page=1&pageSize=20&search=xxx - 账号列表
  if (route === '/admin/system/accounts' && method === 'GET') {
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 20));
    const search = String(params.get('search') || '').trim();
    const offset = (page - 1) * pageSize;

    let countQuery = 'SELECT COUNT(*) as total FROM accounts';
    let dataQuery = 'SELECT id, username, email, is_banned, is_admin, created_at, last_login_ip FROM accounts';
    const binds = [];

    if (search) {
      const like = `%${search}%`;
      countQuery += ' WHERE username LIKE ? OR id = ?';
      dataQuery += ' WHERE username LIKE ? OR id = ?';
      binds.push(like, Number(search) || -1);
    }

    const countRow = await env.DB.prepare(countQuery).bind(...binds).first().catch(() => ({ total: 0 }));
    const total = Number(countRow?.total || 0);

    dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    binds.push(pageSize, offset);
    const rows = await env.DB.prepare(dataQuery).bind(...binds).all().catch(() => ({ results: [] }));

    return json({
      ok: true,
      accounts: (rows.results || []).map(r => ({
        id: r.id,
        username: r.username,
        email: r.email || '',
        is_banned: !!r.is_banned,
        is_admin: !!r.is_admin,
        createdAt: r.created_at || 0,
        lastLoginIp: r.last_login_ip || '',
      })),
      total, page, pageSize
    });
  }

  // POST /admin/system/config - 修改游戏配置（预留）
  if (route === '/admin/system/config' && method === 'POST') {
    // TODO: 实现游戏配置修改（经验倍率、掉落率等）
    return json({ ok: true, message: '配置已更新（功能开发中）' });
  }

  return null;
}
