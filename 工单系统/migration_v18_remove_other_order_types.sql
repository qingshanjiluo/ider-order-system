-- ═══════════════════════════════════════════════════════════════════════════
-- 迁移 v18: 下线「购买邀请积分」以外的所有工单类型
-- 创建时间: 2026-09-11
--
-- 背景
--   平台只保留「购买邀请积分」一种工单。以下 5 种类型已从产品与代码中移除，
--   存量数据需要一并清理：
--     仙盟采集 / 试炼测试 / 每日试炼 / 传人派出 / 副本刷取
--
-- 说明
--   1. 邀请积分工单在库中以 代练 / 代打 / 托管 三种写法存在，本脚本不动它们。
--   2. 先归档再删除：orders_removed_archive / refund_requests_removed_archive
--      两张归档表会保留被删工单的完整快照，便于事后核对与退款。
--   3. 脚本可重复执行（归档表用 IF NOT EXISTS；删除语句幂等）。
--
-- 执行方式
--   cd 工单系统
--   npx wrangler d1 execute ider-orders --remote --file=migration_v18_remove_other_order_types.sql
--
-- ⚠ 执行前请先备份数据库：
--   npx wrangler d1 export ider-orders --remote --output=backup_before_v18.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 第 1 步：归档被下线的工单（此时 orders 尚未删除）
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders_removed_archive AS
SELECT * FROM orders
WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取');

CREATE TABLE IF NOT EXISTS refund_requests_removed_archive AS
SELECT * FROM refund_requests
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

-- ───────────────────────────────────────────────────────────────────────────
-- 第 2 步（可选）：退还修仙币
--   修仙币工单在创建时即扣款（frozen_points）。已完成(completed)的视为已交付
--   不退款；已拒绝/已取消的此前已退过款，避免重复退。
--   如需退款，请取消下面 UPDATE 的注释后执行（必须在第 3 步删除前执行）。
-- ───────────────────────────────────────────────────────────────────────────
-- UPDATE users
-- SET bonus_points = bonus_points + (
--       SELECT COALESCE(SUM(a.frozen_points), 0)
--       FROM orders_removed_archive a
--       WHERE a.user_id = users.id
--         AND a.payment_method = 'coin'
--         AND a.frozen_points > 0
--         AND a.status IN ('pending', 'approved', 'processing')
--     )
-- WHERE id IN (
--   SELECT user_id FROM orders_removed_archive
--   WHERE payment_method = 'coin'
--     AND frozen_points > 0
--     AND status IN ('pending', 'approved', 'processing')
-- );

-- ───────────────────────────────────────────────────────────────────────────
-- 第 3 步：清理子表（必须早于 orders 删除，否则外键约束会阻止删除）
-- ───────────────────────────────────────────────────────────────────────────

-- 3.1 账号操作日志（account_logs.order_id）
DELETE FROM account_logs
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

-- 3.2 签到日志（checkin_logs.game_account_id → game_accounts）
DELETE FROM checkin_logs
WHERE game_account_id IN (
  SELECT ga.id FROM game_accounts ga
  JOIN orders o ON ga.order_id = o.id
  WHERE o.order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

-- 3.3 游戏账号（game_accounts.order_id）
DELETE FROM game_accounts
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

-- 3.4 工单操作日志（order_activities.order_id）
DELETE FROM order_activities
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

-- 3.5 退款申请（refund_requests.order_id NOT NULL，已归档到 refund_requests_removed_archive）
DELETE FROM refund_requests
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

-- 3.6 客服会话 / 申诉：解除关联而不是删除，保留客服沟通历史
UPDATE cs_conversations
SET order_id = NULL
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

UPDATE appeals
SET order_id = NULL
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取')
);

-- 3.7 站内通知：删除指向这些工单的订单通知（正文形如「工单 #12 ...」）
DELETE FROM notifications
WHERE type = 'order'
  AND EXISTS (
    SELECT 1 FROM orders_removed_archive a
    WHERE notifications.content LIKE '工单 #' || a.id || ' %'
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 第 4 步：删除被下线的工单本体
-- ───────────────────────────────────────────────────────────────────────────
DELETE FROM orders
WHERE order_type IN ('仙盟采集', '试炼测试', '每日试炼', '传人派出', '副本刷取');

-- ───────────────────────────────────────────────────────────────────────────
-- 第 5 步：校验（剩余工单应全部是邀请积分工单）
-- ───────────────────────────────────────────────────────────────────────────
SELECT COALESCE(NULLIF(order_type, ''), '代练') AS order_type, COUNT(*) AS cnt
FROM orders
GROUP BY COALESCE(NULLIF(order_type, ''), '代练')
ORDER BY cnt DESC;
