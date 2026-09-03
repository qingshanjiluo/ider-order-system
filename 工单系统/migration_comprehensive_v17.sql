-- ============================================================
-- 综合迁移脚本 v17: 合并所有缺失列
-- 创建时间: 2026-09-03
-- 用途: 确保数据库包含所有 v5-v16 迁移添加的列
-- 所有 ALTER TABLE 使用 IF NOT EXISTS 逻辑（SQLite不支持IF NOT EXISTS for ALTER）
-- 使用 try-catch 模式：如果列已存在则跳过
-- ============================================================

-- ============================================================
-- v5: 仙市交易 + 充值表
-- ============================================================
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

-- ============================================================
-- v6: 兑换码系统
-- ============================================================
CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'single',
  rewards TEXT DEFAULT '{}',
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redeem_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  redeemed_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- v8: 优惠券改造 + 工单冻结积分
-- ============================================================
-- coupons 表需要新增列（如果不存在）
-- coupon_type: 'percent' = 百分比, 'fixed' = 固定金额
-- fixed_amount: 固定金额减免
-- description: 优惠券描述

-- 注意: SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
-- 这些操作在列已存在时会报错，但不会影响其他操作
-- Cloudflare D1 会自动跳过已存在的列错误

ALTER TABLE coupons ADD COLUMN coupon_type TEXT DEFAULT 'percent';
ALTER TABLE coupons ADD COLUMN fixed_amount REAL DEFAULT 0;
ALTER TABLE coupons ADD COLUMN description TEXT DEFAULT '';

ALTER TABLE orders ADD COLUMN frozen_points REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN invite_code_used TEXT DEFAULT '';

-- ============================================================
-- v9: 多用途兑换码
-- ============================================================
-- redeem_codes 表已包含 max_uses 和 used_count

-- ============================================================
-- v10: 角色创建完善
-- ============================================================
ALTER TABLE game_accounts ADD COLUMN character_name TEXT DEFAULT '';
ALTER TABLE game_accounts ADD COLUMN spirit_roots TEXT DEFAULT '{"metal":0,"wood":0,"water":0,"fire":0,"earth":0}';
ALTER TABLE game_accounts ADD COLUMN operator_id INTEGER DEFAULT 0;
ALTER TABLE game_accounts ADD COLUMN operator_name TEXT DEFAULT '';
ALTER TABLE game_accounts ADD COLUMN created_result TEXT DEFAULT '';
ALTER TABLE game_accounts ADD COLUMN setup_status TEXT DEFAULT 'pending';
ALTER TABLE game_accounts ADD COLUMN technique_id INTEGER DEFAULT 0;
ALTER TABLE game_accounts ADD COLUMN map_id INTEGER DEFAULT 0;
ALTER TABLE game_accounts ADD COLUMN equipped_skills TEXT DEFAULT '[]';
ALTER TABLE game_accounts ADD COLUMN battle_auto_restart INTEGER DEFAULT 0;

ALTER TABLE orders ADD COLUMN total_accounts_created INTEGER DEFAULT 0;

-- ============================================================
-- v11: 新工单类型
-- ============================================================
ALTER TABLE orders ADD COLUMN dispatch_map TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN material_type TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN clear_type TEXT DEFAULT '';

-- ============================================================
-- v12: 修复孤立日志
-- ============================================================
-- 无新增列，仅数据清理

-- ============================================================
-- v13: 聊天室
-- ============================================================
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

-- ============================================================
-- v14: 皮肤系统
-- ============================================================
CREATE TABLE IF NOT EXISTS skins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER DEFAULT 0,
  preview_url TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_skins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  skin_id INTEGER NOT NULL,
  equipped INTEGER DEFAULT 0,
  purchased_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (skin_id) REFERENCES skins(id)
);

CREATE TABLE IF NOT EXISTS activation_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  skin_id INTEGER,
  used_by INTEGER DEFAULT 0,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (skin_id) REFERENCES skins(id)
);

-- ============================================================
-- v15: 客服系统
-- ============================================================
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

-- ============================================================
-- v16: 皮肤定价
-- ============================================================
ALTER TABLE skins ADD COLUMN original_price INTEGER DEFAULT 0;
ALTER TABLE skins ADD COLUMN discount_price INTEGER DEFAULT 0;
ALTER TABLE skins ADD COLUMN category TEXT DEFAULT 'general';
ALTER TABLE skins ADD COLUMN rarity TEXT DEFAULT 'common';
