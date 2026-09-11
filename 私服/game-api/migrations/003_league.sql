-- 联赛系统（迁移自 server/game/leagueSystem.js ensureTables）
  -- 时间戳均为 INTEGER 秒（UTC），联赛以周一 00:00(UTC+8) 为赛季起始

  -- 联赛赛季
  CREATE TABLE IF NOT EXISTS league_seasons (
    season_id INTEGER PRIMARY KEY,
    reg_start INTEGER NOT NULL,
    reg_end INTEGER NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'registration', -- registration/running/finished
    total_rounds INTEGER NOT NULL DEFAULT 0,
    rounds_completed INTEGER NOT NULL DEFAULT 0,
    initialized INTEGER NOT NULL DEFAULT 0,
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- 联赛队伍（成员存 members_json/frozen_json，技能组存 skill_json）
  CREATE TABLE IF NOT EXISTS league_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    team_code TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    captain_account_id INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT 'manual', -- manual/system
    registered INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'forming', -- forming/registered/active/finished/disbanded
    rating_seed INTEGER NOT NULL DEFAULT 1000,
    season_points INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    members_json TEXT NOT NULL DEFAULT '[]',
    frozen_json TEXT NOT NULL DEFAULT '[]',
    skill_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_league_teams_season_code ON league_teams(season_id, team_code);
  CREATE INDEX IF NOT EXISTS idx_league_teams_season_status ON league_teams(season_id, status);

  -- 联赛对战记录
  CREATE TABLE IF NOT EXISTS league_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    round_no INTEGER NOT NULL,
    match_no INTEGER NOT NULL,
    team_a_id INTEGER NOT NULL,
    team_b_id INTEGER NOT NULL DEFAULT 0,
    result TEXT NOT NULL DEFAULT 'pending', -- a_win/b_win/draw/bye
    winner_team_id INTEGER NOT NULL DEFAULT 0,
    points_a INTEGER NOT NULL DEFAULT 0,
    points_b INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT NOT NULL DEFAULT '{}',
    battle_log_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    settled_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_league_matches_season_round ON league_matches(season_id, round_no, match_no);
  CREATE INDEX IF NOT EXISTS idx_league_matches_team_a ON league_matches(team_a_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_league_matches_team_b ON league_matches(team_b_id, created_at);
  -- 唯一键兜底：防重启/并发重复结算同一场
  CREATE UNIQUE INDEX IF NOT EXISTS idx_league_matches_unique_round_match
    ON league_matches(season_id, round_no, match_no);

  -- 联赛积分按轮补发台账（补偿去重）
  CREATE TABLE IF NOT EXISTS league_point_round_comp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    round_no INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_league_point_round_comp_unique
    ON league_point_round_comp(season_id, round_no, account_id);

  CREATE INDEX IF NOT EXISTS idx_league_point_round_comp_season_round
    ON league_point_round_comp(season_id, round_no);