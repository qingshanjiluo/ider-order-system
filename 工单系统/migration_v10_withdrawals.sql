-- v10: 提现审核 + updated_at
-- 提现记录表
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  points REAL NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_reply TEXT DEFAULT '',
  processed_by INTEGER DEFAULT 0,
  processed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- game_accounts 表添加 updated_at 列（如果不存在）
-- D1/SQLite 不支持 ADD COLUMN IF NOT EXISTS，需要通过应用层处理
ALTER TABLE game_accounts ADD COLUMN updated_at TEXT;
