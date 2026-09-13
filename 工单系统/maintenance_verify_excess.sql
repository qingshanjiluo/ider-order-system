-- 一次性核对：确认超额账号已被移出遍历范围
-- 只做聚合统计，输出行数极少，便于在 workflow 日志中直接查看。
SELECT
  (SELECT COUNT(*) FROM game_accounts) AS 账号总数,
  (SELECT COUNT(*) FROM game_accounts WHERE health_status = 'cleaned') AS 已清理标记,
  (SELECT COUNT(*) FROM game_accounts ga
     WHERE ga.health_status != 'cleaned') AS 仍可遍历;

SELECT o.id AS 工单, o.quantity AS 订购,
  (SELECT COUNT(*) FROM game_accounts ga
    WHERE ga.order_id = o.id AND ga.health_status != 'cleaned') AS 现存账号
FROM orders o
WHERE o.id IN (193, 262, 292, 293)
ORDER BY o.id;
