-- 九重宫阙 SQLite Schema（阶段1 · 按 v2 全量预建）
-- 动态集合表（col_*）由 store.js 按需创建：rowid 顺序 + doc_id + JSON 文档
-- 新系统使用真实关系表（下方 v2 区段）

-- 元数据
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================
-- v2 新系统 · 关系表（阶段4/6/8/9 启用，先建避免二次迁移）
-- ============================================================

-- 宗门（阶段4）
CREATE TABLE IF NOT EXISTS sects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  faction TEXT NOT NULL,              -- 正派/魔教/其他
  school TEXT,                        -- 流派：剑修/丹修/...
  description TEXT,
  founder_user_id INTEGER,            -- 玩家创建时非空
  is_player_created INTEGER NOT NULL DEFAULT 0,
  join_requirement TEXT,              -- JSON：境界/灵根/贡献等门槛
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS sect_members (
  id INTEGER PRIMARY KEY,
  sect_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  rank TEXT NOT NULL DEFAULT '外门弟子',
  contribution INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT,
  UNIQUE(sect_id, character_id)
);

CREATE TABLE IF NOT EXISTS sect_buildings (
  id INTEGER PRIMARY KEY,
  sect_id INTEGER NOT NULL,
  building_key TEXT NOT NULL,         -- library/chore/arena/tower/treasure/notice
  level INTEGER NOT NULL DEFAULT 1,
  UNIQUE(sect_id, building_key)
);

CREATE TABLE IF NOT EXISTS sect_posts (
  id INTEGER PRIMARY KEY,
  sect_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  author_character_id INTEGER,
  created_at TEXT
);

-- 仙盟建设队列（阶段7：与其他队列串行）
CREATE TABLE IF NOT EXISTS guild_build_queue (
  id INTEGER PRIMARY KEY,
  guild_id INTEGER NOT NULL,
  building_key TEXT NOT NULL,
  target_level INTEGER NOT NULL,
  participants TEXT,                  -- JSON: [character_id...]
  started_at TEXT,
  finish_at TEXT,
  status TEXT NOT NULL DEFAULT 'building'
);

-- 寿命编年史（阶段2/9）
CREATE TABLE IF NOT EXISTS lifespan_events (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL,
  game_year REAL NOT NULL,            -- 游戏年（24h=10年）
  type TEXT NOT NULL,                 -- birth/breakthrough/battle_injury/meditate/ascend/pass_away...
  title TEXT,
  content TEXT,
  created_at TEXT
);

-- 交易行（阶段6）
CREATE TABLE IF NOT EXISTS market_listings (
  id INTEGER PRIMARY KEY,
  seller_character_id INTEGER NOT NULL,
  item_kind TEXT NOT NULL,            -- item/equipment/pet/gongfa
  item_ref INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'spirit_stone', -- spirit_stone 下品单位 / jade
  status TEXT NOT NULL DEFAULT 'open',           -- open/sold/cancelled/expired
  created_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS market_orders (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  buyer_character_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  created_at TEXT
);

-- 市场调控系数（阶段6 浮动面板）
CREATE TABLE IF NOT EXISTS market_rates (
  resource TEXT PRIMARY KEY,
  rate REAL NOT NULL DEFAULT 1.0,     -- 0.7~1.3 供需系数
  updated_at TEXT
);

-- AI 系统（阶段8）
CREATE TABLE IF NOT EXISTS ai_keys (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT,                       -- 功能映射：null=通用
  enabled INTEGER NOT NULL DEFAULT 1,
  last_latency_ms INTEGER,
  last_ok_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_generations (
  id INTEGER PRIMARY KEY,
  purpose TEXT NOT NULL,              -- recipe/enchant/guild/lore/skill_invent/sect
  prompt TEXT,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected/failed
  result TEXT,                        -- JSON
  reviewer_note TEXT,
  created_at TEXT,
  reviewed_at TEXT
);

-- 宗门藏书阁（内容富集三期：宗门功法 + 弟子上传的功法/丹方/器方/符方/技能书）
CREATE TABLE IF NOT EXISTS sect_library (
  id INTEGER PRIMARY KEY,
  sect_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                 -- 功法/丹方/器方/符方/技能书
  name TEXT NOT NULL,
  quality TEXT,
  realm TEXT,                         -- 适用境界（功法）
  upgradeable INTEGER DEFAULT 1,      -- 功法是否可升级
  source TEXT,                        -- sect_base/upload
  contributor TEXT,                   -- 上传弟子
  contribution INTEGER DEFAULT 0,     -- 上传所得贡献
  stats TEXT,                         -- JSON
  created_at TEXT
);
