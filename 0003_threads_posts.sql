-- v15 Threads drafts, independent from existing articles. Code runs idempotent CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS threads_posts (
  article_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  container_id TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
