-- 核对：game_accounts / orders 现有索引，以及高频查询的执行计划
SELECT 'INDEX: ' || name || ' ON ' || tbl_name || ' (' || COALESCE(sql,'') || ')' AS detail
FROM sqlite_master
WHERE type = 'index' AND tbl_name IN ('game_accounts','orders','account_logs')
  AND name NOT LIKE 'sqlite_%'
ORDER BY tbl_name, name;

-- 关键查询的执行计划（看是否全表扫描 SCAN）
SELECT 'PLAN all-accounts: ' || COALESCE(GROUP_CONCAT(detail, ' / '), '') AS detail
FROM (SELECT detail FROM pragma_query_plan(
  'SELECT ga.id FROM game_accounts ga JOIN orders o ON ga.order_id = o.id
   WHERE o.status NOT IN (''completed'',''rejected'',''cancelled'')
     AND ga.status NOT IN (''completed'',''error'')
     AND (ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime(''now''))'));

SELECT 'PLAN active-accounts: ' || COALESCE(GROUP_CONCAT(detail, ' / '), '') AS detail
FROM (SELECT detail FROM pragma_query_plan(
  'SELECT ga.id FROM game_accounts ga WHERE ga.status IN (''farming'',''active'',''registering'')
     AND (ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime(''now''))'));
