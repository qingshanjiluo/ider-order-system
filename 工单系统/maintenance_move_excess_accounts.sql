-- 一次性维护：把"超出订购数量 + 1"的超额账号移出自动遍历范围
--
-- 背景：历史 bug 让扫描器以为"已有 0 个账号"，对每张已批准工单每轮新建 50 个，
-- 造成 #193 订购 50 → 4924 个、#262 → 3693、#292 → 2243、#293 → 383。
-- 这些垃圾账号被"全账号自动升级（每30min）/一键升级/健康检测"反复遍历，
-- 把 D1 免费日读额度烧光；额度一光，逐账号清理脚本又抢不到执行窗口——
-- 垃圾号越积越多，形成死循环。
--
-- 为什么不用一条整表 UPDATE：
--   整表 UPDATE + 窗口函数会扫描全部 24812 行并排序，实测触发
--   "D1 DB storage operation exceeded timeout which caused object to be reset"。
--   因此改为【按工单逐张执行】：每张工单只扫自己那部分账号，单条语句轻得多。
--
-- 判定"被遍历"的三个条件（见 functions/api/gh/all-accounts.js）：
--   o.status NOT IN ('completed','rejected','cancelled')
--   ga.status NOT IN ('completed','error')
--   ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime('now')
-- 所以把超额账号设为 status='completed' + stop_monitor_at=now 即可移出。
--
-- 幂等：已标记的账号不再匹配 health_status != 'cleaned'，可重复执行。
--
-- 当前需处理的超额工单（订购 50 → 保留 51）：
--   #193 (4924) / #262 (3693) / #292 (2243) / #293 (383)
-- 用以下语句查看实时超额清单：
--   SELECT o.id, o.quantity,
--     (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id=o.id AND ga.health_status!='cleaned') AS cnt
--   FROM orders o
--   WHERE (SELECT COUNT(*) FROM game_accounts ga WHERE ga.order_id=o.id AND ga.health_status!='cleaned') > o.quantity + 1
--   ORDER BY cnt DESC;

-- ── #293：383 → 保留 51 ─────────────────────────────────
UPDATE game_accounts
SET status = 'completed', health_status = 'cleaned',
    stop_monitor_at = datetime('now'), last_check_at = datetime('now')
WHERE order_id = 293 AND health_status != 'cleaned'
  AND id NOT IN (
    SELECT id FROM game_accounts
    WHERE order_id = 293 AND health_status != 'cleaned'
    ORDER BY id ASC LIMIT 51
  );

-- ── #292：2243 → 保留 51 ────────────────────────────────
UPDATE game_accounts
SET status = 'completed', health_status = 'cleaned',
    stop_monitor_at = datetime('now'), last_check_at = datetime('now')
WHERE order_id = 292 AND health_status != 'cleaned'
  AND id NOT IN (
    SELECT id FROM game_accounts
    WHERE order_id = 292 AND health_status != 'cleaned'
    ORDER BY id ASC LIMIT 51
  );

-- ── #262：3693 → 保留 51 ────────────────────────────────
UPDATE game_accounts
SET status = 'completed', health_status = 'cleaned',
    stop_monitor_at = datetime('now'), last_check_at = datetime('now')
WHERE order_id = 262 AND health_status != 'cleaned'
  AND id NOT IN (
    SELECT id FROM game_accounts
    WHERE order_id = 262 AND health_status != 'cleaned'
    ORDER BY id ASC LIMIT 51
  );

-- ── #193：4924 → 保留 51 ────────────────────────────────
UPDATE game_accounts
SET status = 'completed', health_status = 'cleaned',
    stop_monitor_at = datetime('now'), last_check_at = datetime('now')
WHERE order_id = 193 AND health_status != 'cleaned'
  AND id NOT IN (
    SELECT id FROM game_accounts
    WHERE order_id = 193 AND health_status != 'cleaned'
    ORDER BY id ASC LIMIT 51
  );

-- ── 重算受影响工单的已建账号数 ───────────────────────────
UPDATE orders
SET total_accounts_created = (
  SELECT COUNT(*) FROM game_accounts ga
  WHERE ga.order_id = orders.id AND ga.status NOT IN ('failed','completed')
)
WHERE id IN (193, 262, 292, 293);
