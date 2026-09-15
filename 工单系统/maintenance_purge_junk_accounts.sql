-- 迁移 v21：真删历史垃圾账号行，给 D1 瘦身
--
-- 背景：前几轮把超额账号"软清理"了（status=completed, health_status=cleaned），
-- 但行仍留在表里，D1 占用 59.86MB，且每次账号遍历仍要扫描这些行。
-- 本迁移把已 cleaned / deleted 的账号行**永久删除**（含关联日志），
-- 直接降低表体积与读放大。
--
-- ⚠️ 不可恢复。执行前请先导出备份：
--   npx wrangler d1 export ider-orders --remote --output=backup_before_v21.sql
--
-- 删除范围（谨慎限定，避免误删有效账号）：
--   1) health_status = 'cleaned' 的账号（软清理标记的垃圾号）
--   2) status = 'deleted' 的账号（历史删号残留）
--   保留：status 为 farming/active/completed 且 health_status != 'cleaned' 的账号。
--
-- 关联表（避免外键约束阻塞）：
--   account_logs.account_id  -> game_accounts.id
--   checkin_logs.game_account_id -> game_accounts.id
--
-- 分批执行：D1 对单条语句有时间限制，每条 DELETE 限定 LIMIT 范围内，
-- 由工作流循环多次执行本文件直到清空。

-- 待删除账号 id 集合（分批 2000 条，避免单语句超时）
CREATE TEMP TABLE IF NOT EXISTS _junk_ids AS
SELECT id FROM game_accounts
WHERE health_status = 'cleaned' OR status = 'deleted'
LIMIT 2000;

SELECT 'JUNK_REMAINING=' || (SELECT COUNT(*) FROM game_accounts WHERE health_status='cleaned' OR status='deleted') AS report1;
SELECT 'BATCH_SIZE=' || (SELECT COUNT(*) FROM _junk_ids) AS report2;

DELETE FROM account_logs WHERE account_id IN (SELECT id FROM _junk_ids);
DELETE FROM checkin_logs WHERE game_account_id IN (SELECT id FROM _junk_ids);
DELETE FROM game_accounts WHERE id IN (SELECT id FROM _junk_ids);
DROP TABLE IF EXISTS _junk_ids;

SELECT 'ACCOUNTS_LEFT=' || (SELECT COUNT(*) FROM game_accounts) AS report3;
