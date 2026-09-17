-- 诊断：为什么真删没删掉 completed 账号
SELECT 'JUNK_MATCH=' || COUNT(*) AS j, '
BY_HEALTH:' AS x
FROM game_accounts
WHERE health_status='cleaned' OR status='deleted';

SELECT 'BY_STATUS|' || status || '|' || COUNT(*) AS r
FROM game_accounts
WHERE order_id IN (193,262,292,293)
GROUP BY status;

SELECT 'BY_HEALTH|' || COALESCE(health_status,'NULL') || '|' || COUNT(*) AS h
FROM game_accounts
WHERE order_id IN (193,262,292,293)
GROUP BY health_status;

SELECT 'BY_COMBO|' || status || '+' || COALESCE(health_status,'NULL') || '|' || COUNT(*) AS c
FROM game_accounts
WHERE order_id IN (193,262,292,293)
GROUP BY status, health_status
ORDER BY 1;

SELECT 'TOTAL_ACCOUNTS=' || COUNT(*) AS t FROM game_accounts;
SELECT 'TOTAL_JUNK=' || COUNT(*) AS tj FROM game_accounts WHERE health_status='cleaned' OR status='deleted';