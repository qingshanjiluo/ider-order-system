-- 迁移 v20：降低账号遍历类任务的 D1 读放大
--
-- 背景：v19 补索引后读放大仅下降 31%（103205 → 71379 行），D1 免费日额度
-- （5M 行读）仍会被打满，「自动补齐工单」「AI Planner」等因此报
-- "exceeded D1's free tier daily row read limit"。
--
-- 根因分析（实测）：
--   1. active-accounts / all-accounts 每次调用都要在 2.5 万行表上筛选 + 排序，
--      即使只取 LIMIT 200，也要先把所有命中行排序（USE TEMP B-TREE FOR ORDER BY）。
--   2. 这些端点没有"轮转"机制：每次任务都返回同一批 200 个账号，
--      导致同一批账号被反复检查，而其余 1 万多个长期没被处理、也没被"跳过"。
--   3. 每次任务对每个账号调用 report-account（2-4 次 D1 操作）。
--
-- 本迁移：
--   a) 补 (status, stop_monitor_at, level) 复合覆盖索引，让 all-accounts 的
--      "过滤 + 按 level 排序"完全走索引，消除 TEMP B-TREE 排序。
--   b) 补 last_check_at 索引：支撑"最久未检查优先"的轮转查询。
--
-- 幂等：IF NOT EXISTS。

-- all-accounts：status NOT IN (...) AND stop_monitor_at > now() ORDER BY level ASC
-- 把 level 放进索引，排序即可直接由索引提供，无需临时 B-TREE。
CREATE INDEX IF NOT EXISTS idx_game_accounts_walk_level
  ON game_accounts(status, stop_monitor_at, level);

-- active-accounts：status IN (...) AND stop_monitor_at > now()
-- 覆盖 stop_monitor_at，避免排序与回表。
CREATE INDEX IF NOT EXISTS idx_game_accounts_walk_active
  ON game_accounts(status, stop_monitor_at);

-- 轮转依据：按最后检查时间优先处理最久未检查的账号
CREATE INDEX IF NOT EXISTS idx_game_accounts_last_check
  ON game_accounts(last_check_at);
