-- 002_alters.sql：运行时补齐的列（对应原 server/db.js 的 _ensureColumn）
-- 说明：D1 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，
-- 若列已存在会报错。此迁移用于全新部署时补齐；已有库通过手动/脚本幂等执行。
-- 执行方式：migrations 目录随 wrangler 部署，或通过 db.js 启动时校验。

-- ── accounts（认证/封禁/邮箱）──
ALTER TABLE accounts ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN register_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN machine_id TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN ban_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN banned_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN ban_expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN cheat_scan_exempt_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN machine_share_ban_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN machine_share_exempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN last_login_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN last_machine_id TEXT NOT NULL DEFAULT '';

-- ── exchange（交易所）──
ALTER TABLE exchange_listings ADD COLUMN side TEXT NOT NULL DEFAULT 'sell';
ALTER TABLE exchange_listings ADD COLUMN tax_per_unit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exchange_trades ADD COLUMN side TEXT NOT NULL DEFAULT 'sell';

-- ── mailbox（系统邮件）──
ALTER TABLE mailbox_messages ADD COLUMN dedupe_key TEXT DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_account_dedupe ON mailbox_messages(account_id, dedupe_key);
