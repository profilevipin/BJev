import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    collections: sqlite.prepare(`SELECT c.*,count(cb.bookmark_id) count FROM collections c
      LEFT JOIN collection_bookmarks cb ON cb.collection_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`).all(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { name?: string; description?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Collection name is required." }, { status: 400 });
  try {
    sqlite.prepare("INSERT INTO collections(name,description,created_at) VALUES(?,?,?)")
      .run(body.name.trim(), body.description?.trim() || "", new Date().toISOString());
    return GET();
  } catch {
    return NextResponse.json({ error: "A collection with that name already exists." }, { status: 409 });
  }
}
