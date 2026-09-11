-- online 系统（百艺/宗门/洞府/传人）依赖表
-- 说明：sect_task_completions 已在 001_schema.sql 建立；此处以 IF NOT EXISTS 幂等兜底，
--       并补齐 account_redemptions（兑换码使用记录，账号级，删档不清除）。

CREATE TABLE IF NOT EXISTS sect_task_completions (
  account_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  completions INTEGER DEFAULT 0,
  PRIMARY KEY (account_id, date)
);

CREATE TABLE IF NOT EXISTS account_redemptions (
  account_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (account_id, code)
);