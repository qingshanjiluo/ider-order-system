-- 宗门（sect）系统依赖表
-- 迁移自 server/db.js 的 sect_task_completions 表定义（宗门其余状态均存玩家 data JSON，无需独立表）
-- 说明：sect_task_completions 已由 001_schema.sql / 005_online.sql 建立，此处以 IF NOT EXISTS 幂等兜底，
--       保证"宗门系统"迁移在全新库上也能独立生效。
CREATE TABLE IF NOT EXISTS sect_task_completions (
  account_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  completions INTEGER DEFAULT 0,
  PRIMARY KEY (account_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sect_task_completions ON sect_task_completions(account_id, date);
