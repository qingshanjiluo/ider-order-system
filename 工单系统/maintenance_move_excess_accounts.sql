-- 一次性维护：把"超出订购数量 + 1"的超额账号移出自动遍历范围
--
-- 背景：历史 bug 让扫描器以为"已有 0 个账号"，对每张已批准工单每轮新建 50 个，
-- 造成 #193 订购 50 → 4924 个、#262 → 3693、#292 → 2243、#293 → 383。
-- 这些垃圾账号被"全账号自动升级（每 30min）/一键升级/健康检测"反复遍历，
-- 每次遍历产生大量 D1 读写，把免费额度烧光——而额度一光，逐账号清理脚本
-- 又跑不动，形成死循环。
--
-- 本脚本用一条【纯写入】UPDATE 打破循环：不逐账号读，只用窗口函数算出每张
-- 工单应保留的前 quantity+1 个账号，其余就地标记为不再被遍历。
--
-- 与 cleanup-excess 端点（软清理）的差异：
--   端点会逐个账号读出来再写日志（读多）；
--   本脚本只做一次 UPDATE（读少），适合在额度紧张时抢跑。
--
-- 判定"已被遍历"的三个条件（见 functions/api/gh/all-accounts.js）：
--   o.status NOT IN ('completed','rejected','cancelled')
--   ga.status NOT IN ('completed','error')
--   ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime('now')
-- 因此把超额账号设为 status='completed' + stop_monitor_at=now 即可移出。
--
-- 幂等：已标记的账号不再匹配 health_status != 'cleaned'，重复执行安全。

-- 只处理超额工单，并用窗口函数保留每张单前 quantity+1 个（id 升序，先到先得）
UPDATE game_accounts
SET status = 'completed',
    health_status = 'cleaned',
    stop_monitor_at = datetime('now'),
    last_check_at = datetime('now')
WHERE id IN (
  SELECT id FROM (
    SELECT ga.id,
           ROW_NUMBER() OVER (PARTITION BY ga.order_id ORDER BY ga.id ASC) AS rn,
           o.quantity + 1 AS keep_count
    FROM game_accounts ga
    JOIN orders o ON o.id = ga.order_id
    WHERE o.quantity > 0
      AND ga.health_status != 'cleaned'
      AND (SELECT COUNT(*) FROM game_accounts g2
           WHERE g2.order_id = ga.order_id AND g2.health_status != 'cleaned') > o.quantity + 1
  )
  WHERE rn > keep_count
);

-- 重算受影响工单的已建账号数
UPDATE orders
SET total_accounts_created = (
  SELECT COUNT(*) FROM game_accounts ga
  WHERE ga.order_id = orders.id AND ga.status NOT IN ('failed','completed')
)
WHERE id IN (
  SELECT DISTINCT ga.order_id FROM game_accounts ga
  WHERE ga.health_status = 'cleaned'
);
