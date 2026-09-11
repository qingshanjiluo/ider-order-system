-- 仙盟系统补表（001_schema.sql 已建基础表，此处补齐缺失列）
-- alliances：建筑等级列 + 宝阁刷新字段
ALTER TABLE alliances ADD COLUMN statue_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE alliances ADD COLUMN spirit_pool_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE alliances ADD COLUMN garden_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE alliances ADD COLUMN enlightenment_tree_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE alliances ADD COLUMN treasury_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE alliances ADD COLUMN gate_level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE alliances ADD COLUMN treasury_refresh_date TEXT NOT NULL DEFAULT '';
ALTER TABLE alliances ADD COLUMN treasury_goods_json TEXT NOT NULL DEFAULT '[]';

-- alliance_members：成员贡献
ALTER TABLE alliance_members ADD COLUMN contribution INTEGER NOT NULL DEFAULT 0;