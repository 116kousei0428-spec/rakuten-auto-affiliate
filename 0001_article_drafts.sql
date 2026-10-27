-- Alternative to automatic schema creation; applying the migration is optional for v13.
CREATE TABLE IF NOT EXISTS article_drafts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
