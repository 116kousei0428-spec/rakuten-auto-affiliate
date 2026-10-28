-- Optional: the Worker auto-creates this table on the first authorized D1 request.
CREATE TABLE IF NOT EXISTS article_publications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_article_publications_at ON article_publications(published_at DESC);
