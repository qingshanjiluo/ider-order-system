/**
 * 邮箱 API（Worker 版）
 * 迁移自 server/routes/mail.js。
 * 依赖：createDb 的 listMailbox / claimMailboxAtomic / deleteClaimedMailbox / settleExpiredExchangeListings
 * 说明：原 route 依赖 settlementLock（进程内写锁）与 backgroundJobs 按需结算，
 *       本版本省略两者（D1 原子 UPDATE 抢占保障不重复领取；离线收益由 Cron 结算负责）。
 */
import { createDb } from '../db.js';
import { verifyToken } from '../auth.js';
import * as ops from '../game/playerOps.js';
import { getItemById } from '../game/dataLoader.js';
import { rollEquipmentFromTemplateItem, getPlayerAffixQualityCap } from '../game/equipmentGen.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Version, X-Sign, X-Sign-T',
  'Access-Control-Max-Age': '86400'
};

function applyMailAttachmentsToPlayer(player, attachments) {
  player.inventory = ops.ensureInventoryStructure(player.inventory || []);
  for (const a of attachments) {
    const kind = String(a?.kind || '');
    if (kind === 'currency') {
      const currency = String(a?.currency || '');
      const amount = Math.floor(Math.max(0, Number(a?.amount || 0)));
      if (currency === 'spirit_stones' && amount > 0) {
        player.spirit_stones = (Number(player.spirit_stones) || 0) + amount;
      }
    } else if (kind === 'item') {
      const count = Math.floor(Math.max(1, Number(a?.count || 1)));
      const itemId = Math.floor(Number(a?.item_id || 0));
      const dynamicRoll = Boolean(a?.dynamic_roll) && itemId > 0;
      if (dynamicRoll) {
        const template = getItemById(itemId);
        if (!template || Object.keys(template).length === 0) {
          return { ok: false, error: '邮件附件异常' };
        }
        const affixCap = getPlayerAffixQualityCap(Number(player.level) || 1);
        for (let i = 0; i < count; i += 1) {
          const rolled = rollEquipmentFromTemplateItem(template, affixCap) || template;
          const ok = ops.putItemInInventory(player.inventory, rolled, 1);
          if (!ok) return { ok: false, error: '背包已满，领取失败' };
        }
        continue;
      }
      let item = a?.item || {};
      // 兼容旧邮件：仅保存了 item_id / item_name，没有完整 item 快照
      if ((!item || typeof item !== 'object' || Object.keys(item).length === 0) && itemId > 0) item = getItemById(itemId);
      if (!item || typeof item !== 'object' || Object.keys(item).length === 0) {
        return { ok: false, error: '邮件附件异常' };
      }
      const ok = ops.putItemInInventory(player.inventory, item, count);
      if (!ok) return { ok: false, error: '背包已满，领取失败' };
    }
  }
  return { ok: true };
}

export async function handleMailRoute(request, env, route) {
  const method = request.method;
  const url = new URL(request.url);
  const subPath = route.replace(/^\/mail/, '') || '/';

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const auth = token ? await verifyToken(token, env) : null;
  if (!auth) return json({ ok: false, error: '未登录' }, 401);
  const accountId = auth.accountId || auth.sub || 0;

  const db = createDb(env);
  const accountIdNum = Number(accountId) || 0;

  if (subPath === '/list' && method === 'GET') return handleMailList(db, accountIdNum);
  const claimMatch = subPath.match(/^\/claim\/(\d+)$/);
  if (claimMatch && method === 'POST') return handleMailClaim(db, accountIdNum, intVal(claimMatch[1], 0));
  if (subPath === '/claim_all' && method === 'POST') return handleMailClaimAll(db, accountIdNum);
  if (subPath === '/delete_claimed' && method === 'POST') return handleMailDeleteClaimed(db, accountIdNum);

  return null;
}

function intVal(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

async function claimOneMail(db, accountId, mailId) {
  return db.claimMailboxAtomic(accountId, mailId, (player, attachments) => {
    // 兜底规范背包结构，避免历史脏数据导致领取成功但未实际入包
    player.inventory = ops.ensureInventoryStructure(player.inventory || []);
    return applyMailAttachmentsToPlayer(player, Array.isArray(attachments) ? attachments : []);
  });
}

async function handleMailList(db, accountId) {
  // 交易所到期结算兼容：用户仅打开邮件页时，也应及时看到挂单到期退回邮件。
  try {
    await db.settleExpiredExchangeListings();
  } catch (e) {
    // 结算失败不阻断邮件读取
  }

  const list = (await db.listMailbox(accountId)).map((m) => ({
    id: m.id,
    type: m.type,
    title: m.title,
    content: m.content || '',
    attachments: m.attachments || [],
    claimed: String(m.status) === 'claimed',
    created_at: m.created_at
  }));
  return json({ ok: true, mails: list });
}

async function handleMailClaim(db, accountId, mailId) {
  if (!mailId) return json({ ok: false, error: '无效邮件ID' });
  const r = await claimOneMail(db, accountId, mailId);
  if (!r.ok) return json(r);
  return json({ ok: true, player: r.player });
}

async function handleMailClaimAll(db, accountId) {
  const mails = (await db.listMailbox(accountId)).filter((m) => String(m.status) === 'unread');
  let claimed = 0;
  let lastPlayer = null;
  let firstError = '';
  for (const m of mails) {
    try {
      const r = await claimOneMail(db, accountId, Number(m.id));
      if (!r.ok) {
        if (!firstError) firstError = r.error || '领取失败';
        continue;
      }
      claimed += 1;
      lastPlayer = r.player;
    } catch (e) {
      if (!firstError) firstError = e.message || '领取失败';
    }
  }
  return json({
    ok: claimed > 0 || mails.length === 0,
    claimed_count: claimed,
    skipped: mails.length - claimed,
    warning: firstError,
    player: lastPlayer
  });
}

async function handleMailDeleteClaimed(db, accountId) {
  try {
    const r = await db.deleteClaimedMailbox(accountId);
    return json({ ok: true, deleted_count: Number(r?.changes || 0) });
  } catch (e) {
    return json({ ok: false, error: e?.message || '删除失败' });
  }
}