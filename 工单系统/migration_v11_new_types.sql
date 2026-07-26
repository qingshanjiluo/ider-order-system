-- 迁移 v11: 新增传人派出和副本刷取工单类型
-- 创建时间: 2026-07-26

ALTER TABLE orders ADD COLUMN dispatch_map TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN material_type TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN clear_type TEXT DEFAULT '';
