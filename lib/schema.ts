import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const bookmarks = sqliteTable("bookmarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tweetId: text("tweet_id").notNull(),
  url: text("url").notNull(),
  text: text("text").notNull().default(""),
  author: text("author").notNull().default("Unknown"),
  postedAt: text("posted_at"),
  mediaJson: text("media_json").notNull().default("[]"),
  rawJson: text("raw_json").notNull().default("{}"),
  summary: text("summary"),
  tagsJson: text("tags_json").notNull().default("[]"),
  categoryId: integer("category_id").references(() => categories.id),
  format: text("format"),
  priority: text("priority"),
  actionable: integer("actionable", { mode: "boolean" }),
  evergreen: integer("evergreen", { mode: "boolean" }),
  confidence: real("confidence"),
  probabilitiesJson: text("probabilities_json").notNull().default("{}"),
  status: text("status").notNull().default("pending"),
  categoryLocked: integer("category_locked", { mode: "boolean" }).notNull().default(false),
  embeddingJson: text("embedding_json"),
  error: text("error"),
  isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("bookmarks_tweet_id_unique").on(table.tweetId)]);

export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const collectionBookmarks = sqliteTable("collection_bookmarks", {
  collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  bookmarkId: integer("bookmark_id").notNull().references(() => bookmarks.id, { onDelete: "cascade" }),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  total: integer("total").notNull().default(0),
  done: integer("done").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  cursor: text("cursor"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Bookmark = typeof bookmarks.$inferSelect;
