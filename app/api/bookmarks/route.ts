import { NextRequest, NextResponse } from "next/server";
import { cosine, embedQuery, hasOpenRouter, MissingKeyError } from "@/lib/ai";
import { sqlite } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookmarkRow = Record<string, unknown> & { id: number; embedding_json?: string };

const select = `SELECT b.*, c.name AS category_name,
  (SELECT group_concat(co.name, ' · ') FROM collection_bookmarks cb JOIN collections co ON co.id=cb.collection_id WHERE cb.bookmark_id=b.id) AS collections
  FROM bookmarks b LEFT JOIN categories c ON c.id=b.category_id`;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clauses: string[] = [];
  const values: unknown[] = [];
  const query = params.get("q")?.trim();
  if (query) {
    clauses.push("b.id IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?)");
    values.push(query.split(/\s+/).map((word) => `"${word.replaceAll('"', '""')}"*`).join(" AND "));
  }
  const mappings: [string, string][] = [
    ["category", "c.name"], ["format", "b.format"], ["priority", "b.priority"], ["author", "b.author"], ["status", "b.status"],
  ];
  for (const [parameter, column] of mappings) {
    if (params.get(parameter)) { clauses.push(`${column} = ?`); values.push(params.get(parameter)); }
  }
  if (params.get("actionable") === "true") clauses.push("b.actionable = 1");
  if (params.get("review") === "true") clauses.push("b.status = 'needs_review'");
  if (params.get("unclassified") === "true") clauses.push("b.status IN ('pending','failed')");
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  try {
    let rows = sqlite.prepare(`${select}${where} ORDER BY b.created_at DESC LIMIT 500`).all(...values) as BookmarkRow[];
    if (query && params.get("semantic") === "true") {
      const vector = await embedQuery(query);
      rows = (sqlite.prepare(`${select} WHERE b.embedding_json IS NOT NULL`).all() as BookmarkRow[])
        .map((row) => ({ ...row, similarity: cosine(vector, JSON.parse(row.embedding_json || "[]")) }))
        .sort((a, b) => Number(b.similarity) - Number(a.similarity)).slice(0, 100);
    }
    const facets = {
      categories: sqlite.prepare("SELECT c.name, count(b.id) count FROM categories c LEFT JOIN bookmarks b ON b.category_id=c.id GROUP BY c.id ORDER BY c.sort_order").all(),
      authors: sqlite.prepare("SELECT author AS name, count(*) count FROM bookmarks GROUP BY author ORDER BY count DESC LIMIT 30").all(),
      total: (sqlite.prepare("SELECT count(*) count FROM bookmarks").get() as { count: number }).count,
      review: (sqlite.prepare("SELECT count(*) count FROM bookmarks WHERE status='needs_review'").get() as { count: number }).count,
    };
    return NextResponse.json({
      bookmarks: rows,
      facets,
      capabilities: {
        jev: hasOpenRouter(),
        openrouter: hasOpenRouter(),
        openai: Boolean(process.env.OPENAI_API_KEY),
      },
    });
  } catch (error) {
    const status = error instanceof MissingKeyError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed" }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json() as { id: number; categoryId?: number; status?: string; collectionId?: number; removeCollection?: boolean };
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "Invalid bookmark ID" }, { status: 400 });
  if (body.categoryId) {
    sqlite.prepare("UPDATE bookmarks SET category_id=?,category_locked=1,status='classified',error=NULL,updated_at=? WHERE id=?")
      .run(body.categoryId, new Date().toISOString(), body.id);
  }
  if (body.status === "classified") {
    sqlite.prepare("UPDATE bookmarks SET status='classified',updated_at=? WHERE id=?").run(new Date().toISOString(), body.id);
  }
  if (body.collectionId) {
    const verb = body.removeCollection ? "DELETE FROM collection_bookmarks WHERE collection_id=? AND bookmark_id=?" : "INSERT OR IGNORE INTO collection_bookmarks(collection_id,bookmark_id) VALUES(?,?)";
    sqlite.prepare(verb).run(body.collectionId, body.id);
  }
  return NextResponse.json({ ok: true });
}
