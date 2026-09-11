
  -- 账号表
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    email_verified INTEGER NOT NULL DEFAULT 0,
    register_ip TEXT NOT NULL DEFAULT '',
    machine_id TEXT NOT NULL DEFAULT '',
    is_banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT NOT NULL DEFAULT '',
    banned_at INTEGER NOT NULL DEFAULT 0,
    ban_expires_at INTEGER NOT NULL DEFAULT 0,
    cheat_scan_exempt_until INTEGER NOT NULL DEFAULT 0,
    machine_share_ban_count INTEGER NOT NULL DEFAULT 0,
    machine_share_exempt INTEGER NOT NULL DEFAULT 0,
    last_login_ip TEXT NOT NULL DEFAULT '',
    last_machine_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  -- 玩家存档表（每账号多角色暂不支持，先 1:1）
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id),
    slot INTEGER DEFAULT 1,
    data TEXT NOT NULL,
    inventory_json TEXT,
    cave_json TEXT,
    equipment_json TEXT,
    lineage_apprentice_json TEXT,
    skill_levels_json TEXT,
    skill_cooldowns_json TEXT,
    technique_levels_json TEXT,
    timed_buffs_json TEXT,
    talents_json TEXT,
    alchemy_json TEXT,
    forging_json TEXT,
    baiyi_json TEXT,
    used_redemption_codes_json TEXT,
    skill_presets_json TEXT,
    auto_battle_enabled INTEGER,
    auto_battle_map_id INTEGER,
    current_map_id INTEGER,
    rest_until INTEGER,
    last_activity_at INTEGER,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    created_at INTEGER DEFAULT 0
  );

  -- 战斗会话（用于 PvE 校验）
  CREATE TABLE IF NOT EXISTS battle_sessions (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    map_id INTEGER,
    enemy_id INTEGER,
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active / finished / aborted
    state_json TEXT NOT NULL DEFAULT '{}',
    last_seq INTEGER NOT NULL DEFAULT 0,
    result_json TEXT NOT NULL DEFAULT '{}',
    ended_at INTEGER NOT NULL DEFAULT 0,
    last_cmd_at INTEGER NOT NULL DEFAULT 0,
    rng_seed INTEGER NOT NULL DEFAULT 0,
    rng_cursor INTEGER NOT NULL DEFAULT 0
  );

  -- 战斗指令流水（幂等 / 审计）
  CREATE TABLE IF NOT EXISTS battle_commands (
    battle_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    command_json TEXT NOT NULL,
    apply_result_json TEXT NOT NULL DEFAULT '{}',
    recv_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (battle_id, seq)
  );

  -- 战斗事件流水（客户端回放）
  CREATE TABLE IF NOT EXISTS battle_events (
    battle_id TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    event_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (battle_id, event_index)
  );

  -- 宗门任务每日完成次数（account_id, date 唯一，completions 今日完成次数）
  CREATE TABLE IF NOT EXISTS sect_task_completions (
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    completions INTEGER DEFAULT 0,
    PRIMARY KEY (account_id, date)
  );

  -- 副本每日完成次数（account_id, dungeon_id, date 唯一，completions 今日成功次数）
  CREATE TABLE IF NOT EXISTS dungeon_completions (
    account_id INTEGER NOT NULL,
    dungeon_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    completions INTEGER DEFAULT 0,
    PRIMARY KEY (account_id, dungeon_id, date)
  );

  -- 副本队伍（队伍码 6 位，用于组队）
  CREATE TABLE IF NOT EXISTS dungeon_teams (
    team_code TEXT PRIMARY KEY,
    leader_account_id INTEGER NOT NULL,
    dungeon_id INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER NOT NULL
  );

  -- 副本队伍成员
  CREATE TABLE IF NOT EXISTS dungeon_team_members (
    team_code TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    joined_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (team_code, account_id)
  );

  -- 交易所挂单
  CREATE TABLE IF NOT EXISTS exchange_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_account_id INTEGER NOT NULL,
    item_id INTEGER DEFAULT 0,
    item_name TEXT NOT NULL,
    item_snapshot_json TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity_total INTEGER NOT NULL,
    quantity_left INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', -- open / partial / filled / cancelled / expired
    side TEXT NOT NULL DEFAULT 'sell',
    tax_per_unit INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER NOT NULL
  );

  -- 交易所成交记录
  CREATE TABLE IF NOT EXISTS exchange_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    seller_account_id INTEGER NOT NULL,
    buyer_account_id INTEGER NOT NULL,
    item_id INTEGER DEFAULT 0,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    seller_income INTEGER NOT NULL DEFAULT 0,
    side TEXT NOT NULL DEFAULT 'sell',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  -- 系统邮箱（交易结算/退回等）
  CREATE TABLE IF NOT EXISTS mailbox_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- trade_sale / trade_buy / trade_refund / system
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    attachments_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'unread', -- unread / claimed
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    claimed_at INTEGER DEFAULT 0,
    expires_at INTEGER DEFAULT 0,
    dedupe_key TEXT DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_battle_expires ON battle_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_battle_account_status ON battle_sessions(account_id, status);
  CREATE INDEX IF NOT EXISTS idx_battle_events_battle_index ON battle_events(battle_id, event_index);
  CREATE INDEX IF NOT EXISTS idx_players_account ON players(account_id);
  CREATE INDEX IF NOT EXISTS idx_players_auto_battle_enabled ON players(json_extract(data, '$.auto_battle_enabled'));
  CREATE INDEX IF NOT EXISTS idx_players_pending_job ON players(COALESCE(json_type(baiyi_json, '$.pending_job'), json_type(data, '$.baiyi.pending_job')));
  CREATE INDEX IF NOT EXISTS idx_sect_task_completions ON sect_task_completions(account_id, date);
  CREATE INDEX IF NOT EXISTS idx_dungeon_completions ON dungeon_completions(account_id, date);
  CREATE INDEX IF NOT EXISTS idx_dungeon_teams_expires ON dungeon_teams(expires_at);
  CREATE INDEX IF NOT EXISTS idx_exchange_listings_status_item_price_time ON exchange_listings(status, item_id, unit_price, created_at);
  CREATE INDEX IF NOT EXISTS idx_exchange_listings_seller_status ON exchange_listings(seller_account_id, status);
  CREATE INDEX IF NOT EXISTS idx_exchange_listings_expires ON exchange_listings(expires_at);
  CREATE INDEX IF NOT EXISTS idx_exchange_trades_item_created_time ON exchange_trades(item_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_mailbox_account_status_time ON mailbox_messages(account_id, status, created_at);

  -- 副本战斗状态（持久化，进程重启可恢复）
  CREATE TABLE IF NOT EXISTS dungeon_battle_sessions (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    dungeon_id INTEGER NOT NULL,
    state_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_dungeon_battle_account ON dungeon_battle_sessions(account_id);

  -- 城池斗法记录（挑战/被挑战双方都可查看）
  CREATE TABLE IF NOT EXISTS city_duel_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_account_id INTEGER NOT NULL,
    target_account_id INTEGER NOT NULL,
    winner_account_id INTEGER NOT NULL,
    challenger_name TEXT NOT NULL DEFAULT '',
    target_name TEXT NOT NULL DEFAULT '',
    challenger_level INTEGER NOT NULL DEFAULT 1,
    target_level INTEGER NOT NULL DEFAULT 1,
    challenger_sect_name TEXT NOT NULL DEFAULT '散修',
    target_sect_name TEXT NOT NULL DEFAULT '散修',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_city_duel_logs_challenger_time ON city_duel_logs(challenger_account_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_city_duel_logs_target_time ON city_duel_logs(target_account_id, created_at);

  -- 斗法战神榜：每日挑战次数（发起时记录，用于限制 5 次/天、同目标 3 次/天）
  CREATE TABLE IF NOT EXISTS city_duel_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_account_id INTEGER NOT NULL,
    target_account_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_city_duel_challenges_challenger_date ON city_duel_challenges(challenger_account_id, created_at);

  -- 斗法战神榜赛季：记录已结算期数
  CREATE TABLE IF NOT EXISTS duel_rank_state (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT -1
  );

  -- 仙盟（玩家公会）
  CREATE TABLE IF NOT EXISTS alliances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL DEFAULT 1,
    creator_account_id INTEGER NOT NULL,
    rank_names_json TEXT NOT NULL DEFAULT '["仙友","仙长","尊者","长老","副盟主","盟主"]',
    materials INTEGER NOT NULL DEFAULT 0,
    warehouse_pages INTEGER NOT NULL DEFAULT 10,
    warehouse_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_alliances_name ON alliances(name);

  -- 仙盟成员（rank 0-5：仙友、仙长、尊者、长老、副盟主、盟主）
  CREATE TABLE IF NOT EXISTS alliance_members (
    alliance_id INTEGER NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL,
    rank INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (alliance_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_alliance_members_account ON alliance_members(account_id);

  -- 仙盟入盟申请
  CREATE TABLE IF NOT EXISTS alliance_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alliance_id INTEGER NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(alliance_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_alliance_applications_alliance ON alliance_applications(alliance_id);

  -- 仙盟仓库提取授权（盟主授权的人可提取）
  CREATE TABLE IF NOT EXISTS alliance_withdraw_auth (
    alliance_id INTEGER NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL,
    PRIMARY KEY (alliance_id, account_id)
  );

  -- 邀请系统：邀请人存储灵石、每人发放数、邀请码
  CREATE TABLE IF NOT EXISTS invite_inviters (
    account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
    invite_code TEXT UNIQUE NOT NULL,
    stored_stones INTEGER NOT NULL DEFAULT 0,
    per_person_stones INTEGER NOT NULL DEFAULT 0,
    invite_points INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  -- 邀请绑定：被邀请人 -> 邀请人
  CREATE TABLE IF NOT EXISTS invite_bindings (
    invitee_account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
    inviter_account_id INTEGER NOT NULL REFERENCES accounts(id),
    bound_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );

  -- 邀请积分已领取记录（每个被邀请人只能提供1次）
  CREATE TABLE IF NOT EXISTS invite_point_claims (
    inviter_account_id INTEGER NOT NULL,
    invitee_account_id INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (inviter_account_id, invitee_account_id)
  );

      CREATE TABLE IF NOT EXISTS machine_login_log (
        account_id INTEGER NOT NULL,
        machine_id TEXT NOT NULL,
        PRIMARY KEY (account_id, machine_id)
      );
    

    

      CREATE TABLE IF NOT EXISTS ip_bans (
        ip TEXT PRIMARY KEY,
        reason TEXT NOT NULL DEFAULT '',
        banned_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        expires_at INTEGER NOT NULL DEFAULT 0
      );
    

    

      CREATE TABLE IF NOT EXISTS account_redemptions (
        account_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        redeemed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY (account_id, code)
      );
    

    

      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_email_codes_account ON email_verification_codes(account_id, used, expires_at);
    

-- ══════ 聊天系统（合并自 chat/migrations/chat.sql）══════
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