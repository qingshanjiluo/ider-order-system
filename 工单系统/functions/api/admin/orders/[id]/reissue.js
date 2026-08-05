// functions/api/admin/orders/[id]/reissue.js — POST /api/admin/orders/:id/reissue
// 补发审查：覆盖三种情况
//   1) 创建少了（短少）：已交付账号数 < 订购数量
//   2) 角色未创建/卡住：账号存在但 setup 未完成（registering/created/error/pending）
//   3) 名字重复等失败：status = failed / error
import { json, logActivity } from '../../../../_utils.js';
import { authenticateAdmin } from '../../../../_auth.js';

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { user, error } = await authenticateAdmin(request, env);
  if (error) return json({ error }, 403);

  const orderId = parseInt(params.id);
  const order = await env.DB.prepare('SELECT id, status, user_id, quantity, order_type FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return json({ error: '工单不存在' }, 404);

  const isBatch = ['代练', '代打', '托管', '购买邀请积分'].includes(order.order_type);
  if (!isBatch) return json({ error: '该工单类型不支持补发' }, 400);

  // 1. 统计订单下账号状态分布
  const orderStats = await env.DB.prepare(
    "SELECT status, setup_status, COUNT(*) as cnt FROM game_accounts WHERE order_id = ? GROUP BY status, setup_status"
  ).bind(orderId).all();
  const statRows = orderStats.results || [];
  const totalAccounts = statRows.reduce((s, r) => s + r.cnt, 0);

  // 2. 判定"有效已交付"账号：挂机/满级且配置完成
  const VALID_SETUP = ['farming', 'active', 'completed'];
  let deliveredCount = 0;
  const failedList = [];
  const stuckList = [];
  for (const r of statRows) {
    if (r.status === 'failed' || r.status === 'error') {
      failedList.push({ status: r.status, setup_status: r.setup_status, count: r.cnt });
    } else if (r.status === 'completed' || r.status === 'farming' || r.status === 'active') {
      if (VALID_SETUP.includes(r.setup_status)) {
        deliveredCount += r.cnt;
      } else {
        stuckList.push({ status: r.status, setup_status: r.setup_status, count: r.cnt });
      }
    } else {
      // registering / created / pending 等未完成状态 → 卡住待重试
      stuckList.push({ status: r.status, setup_status: r.setup_status, count: r.cnt });
    }
  }

  // 3. 需要重置的账号 = 卡住 + 失败（角色未创建/名字重复/error 等）
  const resetAccounts = await env.DB.prepare(
    `SELECT id, username, status, error_msg FROM game_accounts 
     WHERE order_id = ? AND (
       status IN ('failed', 'error', 'registering', 'created', 'pending')
       OR (status IN ('completed', 'farming', 'active') AND setup_status NOT IN ('farming', 'active', 'completed'))
     )`
  ).bind(orderId).all();
  const resetRows = resetAccounts.results || [];

  // 4. 重置为 pending，下次扫描重新注册/补做
  let resetCount = 0;
  for (const acc of resetRows) {
    await env.DB.prepare(
      "UPDATE game_accounts SET status = 'pending', setup_status = 'pending', error_msg = '', character_name = '' WHERE id = ?"
    ).bind(acc.id).run();
    resetCount++;
  }

  // 5. 计算差额：订购数量 vs 有效交付账号数
  const quantity = order.quantity || 0;
  const shortfall = quantity > 0 ? Math.max(0, quantity - deliveredCount) : 0;

  // 6. 有差额或存在待重试账号 → 恢复成 approved 供扫描器补发
  if (shortfall > 0 || resetCount > 0) {
    await env.DB.prepare(
      "UPDATE orders SET status = 'approved', updated_at = datetime('now') WHERE id = ? AND status != 'approved'"
    ).bind(orderId).run();
    await env.DB.prepare(
      "UPDATE orders SET total_accounts_created = ? WHERE id = ?"
    ).bind(deliveredCount, orderId).run();
  } else if (order.status === 'rejected' || order.status === 'cancelled') {
    await env.DB.prepare(
      "UPDATE orders SET status = 'approved', updated_at = datetime('now') WHERE id = ?"
    ).bind(orderId).run();
  }

  // 7. 通知用户
  if (shortfall > 0 || resetCount > 0) {
    const parts = [];
    if (shortfall > 0) parts.push('缺 ' + shortfall + ' 个账号待补齐');
    if (resetCount > 0) parts.push('重置 ' + resetCount + ' 个异常账号（角色未创建/失败/重复）');
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '补发审查', '工单 #' || ? || '：' || ?, 'order')"
    ).bind(order.user_id, orderId, parts.join('，')).run();
  }

  await logActivity(env, orderId, user.id, 'reissue',
    `补发审查: 有效 ${deliveredCount}/${quantity}，重置 ${resetCount}，短少 ${shortfall}`);

  // 8. 汇总消息
  const notes = [];
  notes.push('已交付 ' + deliveredCount + '/' + quantity + ' 个账号');
  if (resetCount > 0) notes.push('重置 ' + resetCount + ' 个异常账号（角色未创建/失败/名字重复）待重新处理');
  if (shortfall > 0) notes.push('缺 ' + shortfall + ' 个账号，已恢复补发');
  if (resetCount === 0 && shortfall === 0) notes.push('账号数量已达标，无需处理');

  return json({
    ok: true,
    reset_count: resetCount,
    shortfall,
    delivered_count: deliveredCount,
    total_accounts: totalAccounts,
    quantity,
    stuck_accounts: stuckList,
    failed_accounts: failedList,
    message: notes.join('；'),
  });
}
