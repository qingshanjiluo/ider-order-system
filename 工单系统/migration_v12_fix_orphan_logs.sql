-- 迁移 v12: 修复孤儿日志（account_id=0 但有 order_id 的日志关联到正确账号）
-- 对每条 account_id=0 且有 order_id 的日志，尝试匹配 game_accounts

UPDATE account_logs
SET account_id = (
  SELECT COALESCE(
    (SELECT id FROM game_accounts WHERE order_id = account_logs.order_id AND status NOT IN ('failed') LIMIT 1),
    0
  )
)
WHERE account_id = 0 AND order_id > 0;
