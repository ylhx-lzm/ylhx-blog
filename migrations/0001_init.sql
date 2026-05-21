CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  parent_id TEXT,
  author TEXT NOT NULL,
  email_hash TEXT,
  website TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_hash TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, voter_hash)
);

CREATE TABLE IF NOT EXISTS post_stats (
  path TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  pv INTEGER NOT NULL DEFAULT 0,
  uv INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

CREATE TABLE IF NOT EXISTS daily_visitors (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, path, visitor_hash)
);

CREATE TABLE IF NOT EXISTS post_likes (
  path TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (path, voter_hash)
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  frontmatter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  avatar TEXT,
  description TEXT,
  email_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  email_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_path_status ON comments(path, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_daily_stats_day ON daily_stats(day);
CREATE INDEX IF NOT EXISTS idx_drafts_status_updated ON drafts(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status_created ON friend_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_enabled ON announcements(enabled, starts_at, ends_at);
