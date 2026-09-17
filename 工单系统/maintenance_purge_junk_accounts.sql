-- 迁移 v21b：真删历史垃圾账号行，给 D1 瘦身（无 TEMP TABLE 版）
--
-- 修复：v21 版用 CREATE TEMP TABLE，但 D1（Serverless SQLite）不支持临时表，
-- 执行时报 SQLITE_AUTH。本版改为子查询内联 + LIMIT 分批删除，
-- 由工作流循环执行本文件直到 JUNK_REMAINING=0。
--
-- ⚠️ 不可恢复。删除范围仅：
--   health_status='cleaned' 或 status='deleted' 的账号（及其 account_logs /
--   checkin_logs 关联记录）。有效账号（farming/active/completed 且未 cleaned）
--   一律保留。
--
-- 顺序：先删日志再删账号，避免孤儿；三条 DELETE 的 IN 子查询条件一致，
-- SQLite 顺序执行时 game_accounts 尚未删除，故三条作用于同一批 id。

-- 0) 待删数量（预检 + 循环判停）
SELECT 'JUNK_COUNT=' || COUNT(*) AS report
FROM game_accounts
WHERE health_status = 'cleaned' OR status = 'deleted';

-- 1) 删日志（每批 1000）
DELETE FROM account_logs
WHERE account_id IN (
  SELECT id FROM game_accounts
  WHERE health_status = 'cleaned' OR status = 'deleted'
  LIMIT 1000
);

-- 2) 删签到（每批 1000）
DELETE FROM checkin_logs
WHERE game_account_id IN (
  SELECT id FROM game_accounts
  WHERE health_status = 'cleaned' OR status = 'deleted'
  LIMIT 1000
);

-- 3) 删账号（每批 1000）
DELETE FROM game_accounts
WHERE id IN (
  SELECT id FROM game_accounts
  WHERE health_status = 'cleaned' OR status = 'deleted'
  LIMIT 1000
);

-- 4) 剩余数量（循环判停用）
SELECT 'JUNK_REMAINING=' || COUNT(*) AS report2
FROM game_accounts
WHERE health_status = 'cleaned' OR status = 'deleted';