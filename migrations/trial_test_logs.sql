-- 试炼测试记录表
CREATE TABLE IF NOT EXISTS trial_test_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_json TEXT,
  summary TEXT,
  api_base TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
