-- v19: 商品画像は記事から独立して保存。既存のdrafts/publications/threadsは変更しない。
CREATE TABLE IF NOT EXISTS article_media (
  article_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
