import { NextResponse } from "next/server";
import { cosine } from "@/lib/ai";
import { sqlite } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const bookmark = sqlite.prepare(`SELECT b.*,c.name category_name FROM bookmarks b LEFT JOIN categories c ON c.id=b.category_id WHERE b.id=?`).get(id) as Record<string, unknown> | undefined;
  if (!bookmark) return NextResponse.json({ error: "Bookmark not found." }, { status: 404 });
  const embedding = JSON.parse(String(bookmark.embedding_json || "[]")) as number[];
  let related: Record<string, unknown>[] = [];
  if (embedding.length) {
    related = (sqlite.prepare("SELECT id,text,author,summary,url,embedding_json FROM bookmarks WHERE embedding_json IS NOT NULL AND id!=?").all(id) as Record<string, unknown>[])
      .map((row) => ({ ...row, similarity: cosine(embedding, JSON.parse(String(row.embedding_json || "[]"))) }))
      .sort((a, b) => Number(b.similarity) - Number(a.similarity)).slice(0, 5)
      .map((row) => {
        const clean: Record<string, unknown> = { ...row };
        delete clean.embedding_json;
        return clean;
      });
  }
  const collections = sqlite.prepare(`SELECT c.*,cb.bookmark_id IS NOT NULL selected FROM collections c
    LEFT JOIN collection_bookmarks cb ON cb.collection_id=c.id AND cb.bookmark_id=? ORDER BY c.name`).all(id);
  return NextResponse.json({ bookmark, related, collections });
}
