const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(
  process.env.BOOKMARKS_DB_PATH || path.join(dataDir, 'bookmarks.db')
);

db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    tags TEXT NOT NULL DEFAULT '[]',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

ensureColumn('folders', 'color', 'TEXT');
ensureColumn('bookmarks', 'color', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookmark_tags (
    bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag TEXT COLLATE NOCASE NOT NULL,
    PRIMARY KEY (bookmark_id, tag)
  ) WITHOUT ROWID
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bookmarks_folder_created
  ON bookmarks(folder_id, created_at DESC, id DESC)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bookmarks_favorite_created
  ON bookmarks(is_favorite, created_at DESC, id DESC)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag
  ON bookmark_tags(tag COLLATE NOCASE, bookmark_id)
`);

db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
const tagsMigration = 'bookmark-tags-v1';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(tagsMigration)) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag)
      SELECT b.id, j.value
      FROM bookmarks b, json_each(b.tags) AS j
      WHERE j.type = 'text' AND trim(j.value) != ''
    `);
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(tagsMigration);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = db;
