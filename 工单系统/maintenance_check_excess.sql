-- 额度压力核对：统计各遍历端点实际会返回/处理的账号数
-- 结果拼成单行文本，便于在 CI 日志中阅读。
SELECT
  'TOTAL_ACCOUNTS=' || (SELECT COUNT(*) FROM game_accounts)
  || ' | all-accounts=' || (
      SELECT COUNT(*) FROM game_accounts ga JOIN orders o ON ga.order_id = o.id
      WHERE o.status NOT IN ('completed','rejected','cancelled')
        AND ga.status NOT IN ('completed','error')
        AND (ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime('now'))
    )
  || ' | active-accounts=' || (
      SELECT COUNT(*) FROM game_accounts ga JOIN orders o ON ga.order_id = o.id
      WHERE ga.status IN ('farming','active','registering')
        AND (ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime('now'))
    )
  || ' | cleaned=' || (SELECT COUNT(*) FROM game_accounts WHERE health_status='cleaned')
  || ' | farming_notcleaned=' || (SELECT COUNT(*) FROM game_accounts WHERE status='farming' AND health_status!='cleaned')
  || ' | notcleaned=' || (SELECT COUNT(*) FROM game_accounts WHERE health_status!='cleaned')
  AS REPORT;
