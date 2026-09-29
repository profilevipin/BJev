import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const starterCategories = [
  ["AI", "Models, agents, research, and applied AI"],
  ["Engineering", "Software architecture, code, and infrastructure"],
  ["Design", "Interfaces, craft, and visual systems"],
  ["Product", "Product thinking, growth, and customer insight"],
  ["Startups", "Founders, markets, and company building"],
  ["Writing", "Essays, language, and communication"],
  ["Tools", "Apps, workflows, and useful resources"],
  ["News", "Current events and timely updates"],
  ["People", "Profiles, interviews, and careers"],
  ["Finance", "Markets, investing, and economics"],
  ["Science", "Research and the natural world"],
  ["Personal", "Ideas kept for yourself"],
  ["Other", "Anything that does not fit elsewhere"],
] as const;

const sampleBookmarks = [
  {
    tweetId: "folio-sample-1",
    author: "Maya Chen",
    text: "A practical guide to building evaluations before you ship an AI feature: start with twenty real failures, not a generic benchmark.",
    url: "https://x.com/example/status/1001",
    summary: "A field guide to evaluation-driven AI product development.",
    tags: ["AI", "evaluation", "product"],
    category: "AI",
    format: "thread",
    priority: "study",
    actionable: 1,
    evergreen: 1,
  },
  {
    tweetId: "folio-sample-2",
    author: "Noah Williams",
    text: "The best interface detail I saw this week: an undo toast that explains exactly what changed and keeps the next action close.",
    url: "https://x.com/example/status/1002",
    summary: "A small interaction pattern for clear, reversible actions.",
    tags: ["design", "UX", "interaction"],
    category: "Design",
    format: "opinion",
    priority: "read",
    actionable: 1,
    evergreen: 1,
  },
  {
    tweetId: "folio-sample-3",
    author: "Ravi Patel",
    text: "SQLite is not a toy database. WAL mode, FTS5, strict schemas, and a boring backup routine will take a local-first app surprisingly far.",
    url: "https://x.com/example/status/1003",
    summary: "A reminder that SQLite is a capable foundation for local-first software.",
    tags: ["SQLite", "local-first", "engineering"],
    category: "Engineering",
    format: "opinion",
    priority: "read",
    actionable: 0,
    evergreen: 1,
  },
  {
    tweetId: "folio-sample-4",
    author: "Inez Park",
    text: "New launch: Papertrail turns a folder of messy customer interviews into a linked map of claims and supporting quotes.",
    url: "https://x.com/example/status/1004",
    summary: "Papertrail maps product claims back to customer evidence.",
    tags: ["research", "tool", "product"],
    category: "Tools",
    format: "tool",
    priority: "skim",
    actionable: 1,
    evergreen: 0,
  },
];

const globalForDb = globalThis as unknown as { folioSqlite?: Database.Database };

function openDatabase() {
  const configured = process.env.FOLIO_DB_PATH || "data/folio.db";
  const filename = path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tweet_id TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT 'Unknown',
      posted_at TEXT, media_json TEXT NOT NULL DEFAULT '[]', raw_json TEXT NOT NULL DEFAULT '{}',
      summary TEXT, tags_json TEXT NOT NULL DEFAULT '[]', category_id INTEGER REFERENCES categories(id),
      format TEXT, priority TEXT, actionable INTEGER, evergreen INTEGER, confidence REAL,
      probabilities_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
      category_locked INTEGER NOT NULL DEFAULT 0, embedding_json TEXT, error TEXT,
      is_sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_bookmarks (
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
      PRIMARY KEY(collection_id, bookmark_id)
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, cursor TEXT, error TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(text, author, summary, tags, content='bookmarks', content_rowid='id');
    CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(rowid,text,author,summary,tags) VALUES(new.id,new.text,new.author,coalesce(new.summary,''),new.tags_json);
    END;
    CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(bookmarks_fts,rowid,text,author,summary,tags) VALUES('delete',old.id,old.text,old.author,coalesce(old.summary,''),old.tags_json);
    END;
    CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(bookmarks_fts,rowid,text,author,summary,tags) VALUES('delete',old.id,old.text,old.author,coalesce(old.summary,''),old.tags_json);
      INSERT INTO bookmarks_fts(rowid,text,author,summary,tags) VALUES(new.id,new.text,new.author,coalesce(new.summary,''),new.tags_json);
    END;
  `);

  const insertCategory = sqlite.prepare("INSERT OR IGNORE INTO categories(name,description,sort_order) VALUES(?,?,?)");
  starterCategories.forEach(([name, description], index) => insertCategory.run(name, description, index));

  const count = (sqlite.prepare("SELECT count(*) AS count FROM bookmarks").get() as { count: number }).count;
  if (count === 0) {
    const now = new Date().toISOString();
    const insert = sqlite.prepare(`INSERT INTO bookmarks
      (tweet_id,url,text,author,summary,tags_json,category_id,format,priority,actionable,evergreen,confidence,status,is_sample,raw_json,media_json,created_at,updated_at)
      VALUES (@tweetId,@url,@text,@author,@summary,@tags,(SELECT id FROM categories WHERE name=@category),@format,@priority,@actionable,@evergreen,.92,'classified',1,'{}','[]',@now,@now)`);
    const transaction = sqlite.transaction(() => sampleBookmarks.forEach((item) => insert.run({ ...item, tags: JSON.stringify(item.tags), now })));
    transaction();
  }
  return sqlite;
}

export const sqlite = globalForDb.folioSqlite ?? openDatabase();
if (process.env.NODE_ENV !== "production") globalForDb.folioSqlite = sqlite;
export const db = drizzle(sqlite, { schema });
