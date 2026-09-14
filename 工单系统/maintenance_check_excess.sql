-- 核对：超额工单的账号构成（含 health_status 维度）
-- 输出行数少，便于在 CI 日志中直接查看。
SELECT o.id AS order_id, o.quantity AS ordered,
  (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id=o.id) AS total_all,
  (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id=o.id AND ga.health_status!='cleaned') AS active_notcleaned,
  (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id=o.id AND ga.health_status='cleaned') AS cleaned,
  (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id=o.id AND ga.status='farming' AND ga.health_status!='cleaned') AS farming_active
FROM orders o
WHERE o.id IN (193,262,292,293)
ORDER BY o.id;

-- 有 farming 但未清理的账号（异常项，应为 0）
SELECT ga.order_id, ga.id, ga.status, ga.setup_status, ga.health_status, ga.stop_monitor_at
FROM game_accounts ga
WHERE ga.order_id IN (193,262,292,293)
  AND ga.status = 'farming'
  AND ga.health_status != 'cleaned'
ORDER BY ga.order_id, ga.id
LIMIT 20;
