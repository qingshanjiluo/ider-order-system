-- 迁移：添加 orders 表缺失的列（修复工单提交500错误）
-- 这些列在 orders/index.js INSERT 中使用但 schema 中不存在

-- 1. orders 表：添加缺失列
ALTER TABLE orders ADD COLUMN frozen_points INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN invite_code_used TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN game_account_name TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN game_account_password TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN subscription_start TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN subscription_end TEXT DEFAULT '';

-- 2. redeem_log 表：添加缺失的 coins 列（修复兑换码多次使用问题）
-- redeem_codes（修仙币兑换码）的 INSERT 使用 coins 列，但 schema 中只有 xp 列
ALTER TABLE redeem_log ADD COLUMN coins INTEGER DEFAULT 0;
