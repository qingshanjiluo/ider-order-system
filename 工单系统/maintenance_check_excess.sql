-- 核对：超额工单账号构成，结果拼成单行文本，便于在 CI 日志中直接阅读
SELECT GROUP_CONCAT(
  '#193 t=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193)
  || ' nc=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193 AND health_status!='cleaned')
  || ' cl=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193 AND health_status='cleaned')
  || ' farm=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=193 AND status='farming' AND health_status!='cleaned')
  || ' | #262 t=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=262)
  || ' nc=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=262 AND health_status!='cleaned')
  || ' cl=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=262 AND health_status='cleaned')
  || ' farm=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=262 AND status='farming' AND health_status!='cleaned')
  || ' | #292 t=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=292)
  || ' nc=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=292 AND health_status!='cleaned')
  || ' cl=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=292 AND health_status='cleaned')
  || ' farm=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=292 AND status='farming' AND health_status!='cleaned')
  || ' | #293 t=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=293)
  || ' nc=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=293 AND health_status!='cleaned')
  || ' cl=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=293 AND health_status='cleaned')
  || ' farm=' || (SELECT COUNT(*) FROM game_accounts WHERE order_id=293 AND status='farming' AND health_status!='cleaned')
  || ' | TOTAL=' || (SELECT COUNT(*) FROM game_accounts)
  || ' TOTAL_NOTCLEANED=' || (SELECT COUNT(*) FROM game_accounts WHERE health_status!='cleaned'),
  ''
) AS REPORT;

-- 仍处于 farming 且未清理的账号明细（异常项）
SELECT 'FARMING_ACTIVE: order=' || order_id || ' id=' || id || ' setup=' || COALESCE(setup_status,'')
       || ' stop=' || COALESCE(stop_monitor_at,'NULL') AS detail
FROM game_accounts
WHERE status='farming' AND health_status!='cleaned'
  AND order_id IN (193,262,292,293)
ORDER BY order_id, id
LIMIT 20;
