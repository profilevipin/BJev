import { NextRequest, NextResponse } from "next/server";
import { suggestTaxonomy } from "@/lib/ai";
import { sqlite } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    categories: sqlite.prepare("SELECT c.*,count(b.id) count FROM categories c LEFT JOIN bookmarks b ON b.category_id=c.id GROUP BY c.id ORDER BY c.sort_order,c.name").all(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { action?: string; name?: string; description?: string; categories?: { name: string; description: string }[] };
  if (body.action === "suggest") {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OpenAI is not configured. Add OPENAI_API_KEY to .env.local and restart Folio." }, { status: 400 });
    const texts = (sqlite.prepare("SELECT text FROM bookmarks WHERE text!='' ORDER BY random() LIMIT 100").all() as { text: string }[]).map((row) => row.text);
    return NextResponse.json({ categories: await suggestTaxonomy(texts) });
  }
  if (body.action === "accept" && body.categories) {
    const insert = sqlite.prepare("INSERT OR IGNORE INTO categories(name,description,sort_order) VALUES(?,?,?)");
    sqlite.transaction(() => body.categories!.forEach((category, index) => insert.run(category.name.trim(), category.description.trim(), index)))();
  } else if (body.name?.trim()) {
    sqlite.prepare("INSERT INTO categories(name,description,sort_order) VALUES(?,?,(SELECT count(*) FROM categories))")
      .run(body.name.trim(), body.description?.trim() || "");
  } else return NextResponse.json({ error: "Category name is required." }, { status: 400 });
  return GET();
}

export async function PATCH(request: NextRequest) {
  const body = await request.json() as { id: number; name?: string; description?: string; mergeIntoId?: number };
  if (body.mergeIntoId) {
    sqlite.transaction(() => {
      sqlite.prepare("UPDATE bookmarks SET category_id=? WHERE category_id=?").run(body.mergeIntoId, body.id);
      sqlite.prepare("DELETE FROM categories WHERE id=?").run(body.id);
    })();
  } else {
    sqlite.prepare("UPDATE categories SET name=coalesce(?,name),description=coalesce(?,description) WHERE id=?")
      .run(body.name?.trim() || null, body.description?.trim() ?? null, body.id);
  }
  return GET();
}
