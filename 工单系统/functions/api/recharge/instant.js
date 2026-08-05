// functions/api/recharge/instant.js — POST /api/recharge/instant
// 灵石即时充值：登录卖家账号上架装备，供用户购买
import { json, logActivity } from '../../_utils.js';
import { authenticate } from '../../_auth.js';

const WORKER_URL = 'https://ider-order-system.pages.dev';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const body = await request.json().catch(() => ({}));
  const { amount_spirit } = body;

  if (!amount_spirit || amount_spirit < 10) return json({ error: '最少充值 10 万灵石' }, 400);

  // 从队列获取一个可用的卖家账号
  const seller = await env.DB.prepare(
    "SELECT username, password FROM game_accounts WHERE order_id IN (SELECT id FROM orders WHERE status IN ('processing','approved')) AND status = 'active' LIMIT 1"
  ).first();

  if (!seller) return json({ error: '暂无可用卖家账号' }, 503);

  try {
    // 调用 gh-actions 的工作流（通过 worker API 触发）
    const resp = await fetch(WORKER_URL + '/api/gh/instant-sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'ider-gh-5fc9c4b0899ad14bc2ee55562eaa5b3a' },
      body: JSON.stringify({
        seller_username: seller.username,
        seller_password: seller.password,
        amount_spirit,
        user_id: user.id,
      }),
    });
    const result = await resp.json();

    if (result.ok) {
      await logActivity(env, 0, user.id, 'recharge_instant',
        '灵石即时充值: ' + amount_spirit + '万灵石, listingId=' + result.listing_id);
      return json({
        ok: true,
        message: '挂单已创建，请在游戏交易所搜索并购买',
        listing_id: result.listing_id,
        item_name: result.item_name || '一阶装备',
        price: result.price,
        expire_sec: 600,
      });
    }
    return json({ error: result.error || '创建失败' }, 500);
  } catch (e) {
    return json({ error: '系统繁忙: ' + e.message }, 500);
  }
}
