-- 核对：game_accounts / orders / account_logs 现有索引
SELECT 'IDX|' || tbl_name || '|' || name || '|' || COALESCE(REPLACE(REPLACE(sql, char(10), ' '), char(13), ' '), '') AS detail
FROM sqlite_master
WHERE type = 'index' AND tbl_name IN ('game_accounts','orders','account_logs')
  AND name NOT LIKE 'sqlite_%'
ORDER BY tbl_name, name;

-- 各表行数（判断索引收益）
SELECT 'COUNT|' || 'game_accounts|' || (SELECT COUNT(*) FROM game_accounts)
  || '|orders|' || (SELECT COUNT(*) FROM orders)
  || '|account_logs|' || (SELECT COUNT(*) FROM account_logs) AS detail;
