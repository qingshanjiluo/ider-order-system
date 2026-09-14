-- 迁移 v19：为账号遍历类查询补索引，降低 D1 读放大
--
-- 背景：D1 免费日读额度（5M 行）长期被烧光，导致工单扫描与升级任务周期性失败。
-- 实测单条"统计将遍历多少账号"的查询就要读 103,205 行；而
-- 「全账号自动升级（每30min）」每 13-22 分钟跑一次、健康检测每次 55 分钟，
-- 每个账号都要做多次类似查询，一天累积数百万行读。
--
-- 现有索引（schema.sql）：
--   idx_game_accounts_order  (order_id)
--   idx_game_accounts_status (status)
--   idx_orders_status        (status)
--
-- 缺失的是遍历查询真正用到的组合维度：
--   all-accounts / active-accounts 都会过滤 status + stop_monitor_at，
--   并且 all-accounts 还要 ORDER BY level ASC（会把命中行全部排序）。
--   下面按这两个查询的谓词顺序补覆盖索引，让 SQLite 直接走索引取有序结果，
--   避免全表扫描与临时排序。
--
-- 幂等：IF NOT EXISTS，可重复执行。
-- 注意：索引会占用少量写入开销与磁盘空间，但能大幅降低读放大。

-- all-accounts：status NOT IN (...) AND stop_monitor_at > now() ORDER BY level
CREATE INDEX IF NOT EXISTS idx_game_accounts_status_level
  ON game_accounts(status, level);

-- active-accounts：status IN (...) AND stop_monitor_at > now()
CREATE INDEX IF NOT EXISTS idx_game_accounts_stop_monitor
  ON game_accounts(stop_monitor_at);

-- 超额判断 / 健康检测大量使用 health_status != 'cleaned'
CREATE INDEX IF NOT EXISTS idx_game_accounts_health_status
  ON game_accounts(health_status);

-- report-account 每次上报都要按 (username, order_id) 查账号
CREATE INDEX IF NOT EXISTS idx_game_accounts_order_username
  ON game_accounts(order_id, username);

-- 工单列表按 created_at 倒序分页 + 按状态过滤
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at);

-- 账号日志按 order_id 查询（工作流日志上报）
CREATE INDEX IF NOT EXISTS idx_account_logs_order
  ON account_logs(order_id);
