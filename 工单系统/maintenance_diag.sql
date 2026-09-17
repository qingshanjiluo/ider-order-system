-- 诊断（单行拼接，便于日志直接阅读）
SELECT 'DIAG|total=' || (SELECT COUNT(*) FROM game_accounts)
  || '|junk_match=' || (SELECT COUNT(*) FROM game_accounts WHERE health_status='cleaned' OR status='deleted')
  || '|clean193=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193)
  || '|clean193_health_cleaned=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193 AND health_status='cleaned')
  || '|clean193_status_completed=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193 AND status='completed')
  || '|clean193_deleted=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193 AND status='deleted')
  AS report1;

SELECT 'BY_COMBO_193: ' || GROUP_CONCAT(
  '[' || status || '|' || COALESCE(health_status,'NULL') || ']:' || cnt, ' '
) AS r
FROM (
  SELECT status, health_status, COUNT(*) AS cnt
  FROM game_accounts WHERE order_id = 193
  GROUP BY status, health_status
  ORDER BY 1,2
);

SELECT 'JUNK_BY_ORDER: ' || GROUP_CONCAT(order_id || ':' || cnt, ' ') AS r
FROM (
  SELECT order_id, COUNT(*) AS cnt FROM game_accounts
  WHERE health_status='cleaned' OR status='deleted'
  GROUP BY order_id ORDER BY order_id
);