-- 艾德尔工单系统 - D1 数据库 Schema
-- 赛博朋克修仙工单平台 v5.0 (综合版本)
-- 包含所有 v5-v16 迁移的列和表

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  email TEXT DEFAULT '',
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  invite_code TEXT UNIQUE,
  invited_by INTEGER DEFAULT 0,
  invite_points REAL DEFAULT 0,
  total_invited INTEGER DEFAULT 0,
  commission_rate REAL DEFAULT 0.3,
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT,
  ip_address TEXT DEFAULT '',
  locked INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'super_admin')),
  bonus_points REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  invite_code TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_account TEXT NOT NULL,
  amount INTEGER NOT NULL,
  price REAL NOT NULL,
  coupon_code TEXT DEFAULT '',
  discount REAL DEFAULT 0,
  bonus_points INTEGER DEFAULT 0,
  order_type TEXT DEFAULT '代练',
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  bind_account_name TEXT DEFAULT '',
  bind_invite_code TEXT DEFAULT '',
  admin_notes TEXT DEFAULT '',
  total_accounts_created INTEGER DEFAULT 0,
  frozen_points REAL DEFAULT 0,
  invite_code_used TEXT DEFAULT '',
  dispatch_map TEXT DEFAULT '',
  material_type TEXT DEFAULT '',
  clear_type TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  est_complete_date TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS game_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  server_username TEXT DEFAULT '',
  server_password TEXT DEFAULT '',
  level INTEGER DEFAULT 0,
  realm TEXT DEFAULT '',
  skills TEXT DEFAULT '[]',
  techniques TEXT DEFAULT '[]',
  equipment TEXT DEFAULT '[]',
  map_id INTEGER DEFAULT 0,
  map_name TEXT DEFAULT '',
  is_farming INTEGER DEFAULT 0,
  is_online INTEGER DEFAULT 0,
  health_status TEXT DEFAULT 'ok',
  last_check_at TEXT,
  reached_120_at TEXT,
  stop_monitor_at TEXT,
  status TEXT DEFAULT 'pending',
  error_msg TEXT DEFAULT '',
  character_name TEXT DEFAULT '',
  spirit_roots TEXT DEFAULT '{"metal":0,"wood":0,"water":0,"fire":0,"earth":0}',
  operator_id INTEGER DEFAULT 0,
  operator_name TEXT DEFAULT '',
  created_result TEXT DEFAULT '',
  setup_status TEXT DEFAULT 'pending',
  technique_id INTEGER DEFAULT 0,
  equipped_skills TEXT DEFAULT '[]',
  battle_auto_restart INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  discount_percent INTEGER NOT NULL DEFAULT 10,
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  min_amount REAL DEFAULT 0,
  coupon_type TEXT DEFAULT 'percent',
  fixed_amount REAL DEFAULT 0,
  description TEXT DEFAULT '',
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  type TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_id INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'appeal',
  status TEXT DEFAULT 'pending',
  admin_reply TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS bot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS checkin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_account_id INTEGER NOT NULL,
  check_type TEXT DEFAULT 'daily',
  result TEXT DEFAULT 'ok',
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (game_account_id) REFERENCES game_accounts(id)
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO config (key, value) VALUES ('price_per_120_points', '1');
INSERT OR IGNORE INTO config (key, value) VALUES ('spirit_stone_per_10_points', '1000000');
INSERT OR IGNORE INTO config (key, value) VALUES ('commission_rate', '30');
INSERT OR IGNORE INTO config (key, value) VALUES ('est_delivery_days', '5');
INSERT OR IGNORE INTO config (key, value) VALUES ('max_level', '120');
INSERT OR IGNORE INTO config (key, value) VALUES ('site_name', '艾德尔修仙工单平台');

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_game_accounts_order ON game_accounts(order_id);
CREATE INDEX IF NOT EXISTS idx_game_accounts_status ON game_accounts(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id);

CREATE TABLE IF NOT EXISTS order_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_order_activities_order ON order_activities(order_id);

-- v3.0: 兑换码系统
CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  xp INTEGER NOT NULL DEFAULT 100,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  created_by INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redeem_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS account_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  log_type TEXT DEFAULT 'info',
  message TEXT DEFAULT '',
  raw_output TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES game_accounts(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'popup',
  image_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  title TEXT DEFAULT '',
  enabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_account_logs_account ON account_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_redeem_log_user ON redeem_log(user_id);

-- v3.1: 密码重置 Token 表
CREATE TABLE IF NOT EXISTS reset_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON reset_tokens(expires_at);

-- v4.0: 联系留言
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER DEFAULT 0,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  content TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 迁移 v4.0: 旧管理员 is_admin=1 自动升级为 admin 角色
UPDATE users SET role = 'admin' WHERE is_admin = 1 AND role = 'user';

-- v5.0: 皮肤系统
CREATE TABLE IF NOT EXISTS skins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  original_price INTEGER DEFAULT 0,
  discount_price INTEGER DEFAULT 0,
  category TEXT DEFAULT 'general',
  rarity TEXT DEFAULT 'common',
  preview_url TEXT DEFAULT '',
  css_url TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_skins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  skin_id INTEGER NOT NULL,
  order_id INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (skin_id) REFERENCES skins(id)
);

CREATE TABLE IF NOT EXISTS activation_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  skin_id INTEGER NOT NULL,
  user_id INTEGER DEFAULT 0,
  used_at TEXT,
  expires_at TEXT,
  created_by INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (skin_id) REFERENCES skins(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_skins_user ON user_skins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skins_active ON user_skins(is_active);
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_skin ON activation_codes(skin_id);

INSERT OR IGNORE INTO skins (name, key, label, description, price, sort_order, is_active) VALUES
('水墨修仙', 'ink', '水墨修仙', '泼墨写意，素雅高远 · 大面积留白，笔触质感', 129, 0, 1),
('赛博修仙', 'cyber', '赛博修仙', '霓虹光污染，数据流涌动 · 紧凑布局，速度感', 129, 1, 1),
('敦煌飞天', 'dunhuang', '敦煌飞天', '壁画霓裳，飞天神韵 · 莫高色彩，飘带灵动', 129, 2, 1),
('阴阳太极', 'taiji', '阴阳太极', '阴阳相生，太极无极 · 黑白对立，道法自然', 129, 3, 1),
('奢华金属', 'luxe', '奢华金属', '鎏金溢彩，华贵典藏 · 金属光泽，浮雕质感', 88, 4, 1),
('日式和风', 'wabi', '日式和风', '侘寂美学，一木一石 · 自然质感，和纸纹理', 88, 5, 1),
('轻奢杂志', 'magazine', '轻奢杂志', '杂志级排版，克制优雅 · 大留白，精字距', 68, 6, 1),
('磨砂玻璃态', 'frost', '磨砂玻璃态', 'Apple 风格玻璃拟态 · 通透模糊，悬浮层次', 68, 7, 1),
('极简主义', 'minimal', '极简主义', '少即是多，内容至上 · 极致留白，去装饰化', 48, 8, 1),
('粗野主义', 'brutal', '粗野主义', '粗粝不羁，破格醒目 · 厚边框，撞色块，无圆角', 48, 9, 1);

-- v5: 仙市交易 + 充值表
CREATE TABLE IF NOT EXISTS market_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price REAL NOT NULL,
  status TEXT DEFAULT 'active',
  buyer_id INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS recharge_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- v13: 聊天室
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT DEFAULT 'general',
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- v15: 客服系统
CREATE TABLE IF NOT EXISTS cs_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cs_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES cs_tickets(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- Seed admin user (最中幻想 / Pipi20100817)
INSERT OR IGNORE INTO users (username, password_hash, display_name, invite_code, is_admin, role, level, xp, created_at)
VALUES ('zzhx', 'ce768490e42a23ffdbd585e0a437293f9cf91d6dc7d2f8c55887ad0c4063d982', '最中幻想', 'ADMIN01', 1, 'super_admin', 10, 9999, datetime('now'));
