-- Cloudflare D1 / SQLite. All schema changes are additive and versioned.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL,
  query TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, identity_key TEXT NOT NULL UNIQUE, category_id TEXT NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image_url TEXT,
  score REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','hidden')),
  featured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, source_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_cat_status_score ON products(category_id,status,score DESC);
CREATE TABLE IF NOT EXISTS offers (
  item_code TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shop_code TEXT NOT NULL, shop_name TEXT NOT NULL, price INTEGER NOT NULL,
  affiliate_rate REAL NOT NULL DEFAULT 0, review_average REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0, image_url TEXT, affiliate_url TEXT NOT NULL,
  availability INTEGER NOT NULL DEFAULT 0, shipping_included INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0, fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_offers_product_price ON offers(product_id,availability,price);
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK(channel IN ('site','threads','note')),
  title TEXT NOT NULL, body TEXT NOT NULL, generation_mode TEXT NOT NULL DEFAULT 'template',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','published','hidden')),
  external_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_articles_channel_status ON articles(channel,status,created_at DESC);
CREATE TABLE IF NOT EXISTS click_events (
  id TEXT PRIMARY KEY, item_code TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'unknown',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_click_time ON click_events(occurred_at);
CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, target TEXT, state TEXT NOT NULL,
  fetched INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_recent ON job_runs(started_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
  target TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO categories (id,label,icon,query,sort_order) VALUES
('gadgets','ガジェット・PC','laptop','ワイヤレスイヤホン',1),
('appliances','家電','tv','小型 家電',2),
('beauty','美容・コスメ','sparkles','スキンケア',3),
('fashion','ファッション','shirt','ファッション 小物',4),
('home','生活・日用品','house','便利グッズ',5),
('pets','ペット用品','paw','ペット グッズ',6),
('food','食品・グルメ','coffee','お取り寄せ グルメ',7),
('other','その他','grid','文房具 おすすめ',8);
