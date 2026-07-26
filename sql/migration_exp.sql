-- 添加经验存储字段
ALTER TABLE game_accounts ADD COLUMN exp INTEGER DEFAULT 0;
ALTER TABLE game_accounts ADD COLUMN exp_percent INTEGER DEFAULT 0;
