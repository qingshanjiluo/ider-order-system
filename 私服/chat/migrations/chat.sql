-- 艾德尔修仙传 私服 · 聊天系统 D1 迁移
-- 兼容原 server/routes/chat.js 的数据结构，改为 D1 持久化

-- 聊天消息（世界/仙盟 持久化，替代原内存数组）
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL DEFAULT 'global',   -- global / alliance
  alliance_id INTEGER NOT NULL DEFAULT 0,   -- channel=alliance 时生效
  account_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_channel_ts ON chat_messages(channel, alliance_id, ts);
CREATE INDEX IF NOT EXISTS idx_chat_alliance ON chat_messages(alliance_id, ts);

-- 私聊会话（v2 预留）
CREATE TABLE IF NOT EXISTS chat_whispers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_whisper_to ON chat_whispers(to_id, read, ts);