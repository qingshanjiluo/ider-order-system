-- 真删超额游戏账号（B 方案，用户已确认：游戏账号可物理删除）
--
-- 数据安全边界：本文件只删 game_accounts / account_logs / checkin_logs 三张表，
-- 不触碰 users、orders、邀请积分、修仙币等任何平台用户数据。
--
-- 目标：
--   1) 物理删除所有已标记 health_status='cleaned' 或 status='deleted' 的垃圾行
--   2) 对四张超量工单（#193/#262/#292/#293，各订购 50）只保留最好的 51 个
--      （quantity+1；failed/error 垫底，其余按 id 最早的优先），其余物理删除
--      → 保留数恰等于扫描器目标值，不会再触发重新注册
--   3) 每张工单保留集在删除过程中恒定（只删保留集之外的行），分批收敛安全
--
-- 每批 1000 行（IN 子查询 + LIMIT），避免 D1 单语句超时；由工作流循环
-- 执行本文件直到 REMAIN 不再下降。幂等。

-- ══ 1) 常规垃圾行（cleaned / deleted）══
DELETE FROM account_logs WHERE account_id IN (
  SELECT id FROM game_accounts WHERE health_status = 'cleaned' OR status = 'deleted' LIMIT 1000
);
DELETE FROM checkin_logs WHERE game_account_id IN (
  SELECT id FROM game_accounts WHERE health_status = 'cleaned' OR status = 'deleted' LIMIT 1000
);
DELETE FROM game_accounts WHERE id IN (
  SELECT id FROM game_accounts WHERE health_status = 'cleaned' OR status = 'deleted' LIMIT 1000
);

-- ══ 2) #193：保留最好的 51 个，其余删除 ══
DELETE FROM account_logs WHERE account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 193
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 193
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM checkin_logs WHERE game_account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 193
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 193
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM game_accounts WHERE id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 193
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 193
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);

-- ══ 3) #262 ══
DELETE FROM account_logs WHERE account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 262
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 262
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM checkin_logs WHERE game_account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 262
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 262
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM game_accounts WHERE id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 262
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 262
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);

-- ══ 4) #292 ══
DELETE FROM account_logs WHERE account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 292
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 292
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM checkin_logs WHERE game_account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 292
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 292
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM game_accounts WHERE id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 292
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 292
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);

-- ══ 5) #293 ══
DELETE FROM account_logs WHERE account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 293
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 293
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM checkin_logs WHERE game_account_id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 293
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 293
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);
DELETE FROM game_accounts WHERE id IN (
  SELECT id FROM game_accounts
  WHERE order_id = 293
    AND id NOT IN (SELECT id FROM game_accounts WHERE order_id = 293
                   ORDER BY CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END, id ASC LIMIT 51)
  LIMIT 1000
);

-- ══ 6) 孤儿日志：指向已删除账号的 account_logs / checkin_logs ══
-- 注：account_id=0 是订单级日志（report-log 写入），必须保留，故限定 account_id>0。
-- 实测 D1 单语句 2.3 万行删除仅 ~300ms，故孤儿段每批放大到 20000。
DELETE FROM account_logs WHERE id IN (
  SELECT id FROM account_logs
  WHERE account_id > 0
    AND account_id NOT IN (SELECT id FROM game_accounts)
  LIMIT 20000
);
DELETE FROM checkin_logs WHERE id IN (
  SELECT id FROM checkin_logs
  WHERE game_account_id NOT IN (SELECT id FROM game_accounts)
  LIMIT 20000
);

-- ══ 7) 本轮剩余（工作流据此判停）══
SELECT 'REMAIN=' || COUNT(*) AS r FROM game_accounts;