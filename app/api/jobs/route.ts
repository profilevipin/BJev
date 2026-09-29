import { NextRequest, NextResponse } from "next/server";
import { classifyWithJev, enrichWithOpenAI, MissingKeyError } from "@/lib/ai";
import { sqlite } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

type Row = { id: number; text: string; author: string; url: string };

export async function GET() {
  return NextResponse.json({
    jobs: sqlite.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 20").all(),
    capabilities: {
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { type?: "classify" | "enrich"; force?: boolean; limit?: number };
  const type = body.type || "classify";
  if (type === "classify" && !process.env.OPENROUTER_API_KEY) return NextResponse.json({ error: new MissingKeyError("OpenRouter").message }, { status: 400 });
  if (type === "enrich" && !process.env.OPENAI_API_KEY) return NextResponse.json({ error: new MissingKeyError("OpenAI").message }, { status: 400 });
  const limit = Math.min(Math.max(body.limit || 100, 1), 500);
  const condition = type === "classify"
    ? `${body.force ? "1=1" : "status IN ('pending','failed') AND category_locked=0"}`
    : "summary IS NULL OR embedding_json IS NULL";
  const rows = sqlite.prepare(`SELECT id,text,author,url FROM bookmarks WHERE ${condition} ORDER BY id LIMIT ?`).all(limit) as Row[];
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO jobs(id,type,status,total,done,failed,created_at,updated_at) VALUES(?,?, 'running',?,0,0,?,?)")
    .run(jobId, type, rows.length, now, now);
  const taxonomy = sqlite.prepare("SELECT name,description FROM categories ORDER BY sort_order").all() as { name: string; description: string }[];
  let cursor = 0, done = 0, failed = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      try {
        if (type === "classify") {
          const result = await classifyWithJev(row, taxonomy);
          const category = taxonomy.find((item) => item.name.toLowerCase() === result.category.toLowerCase())?.name || "Other";
          const status = result.confidence < 0.55 ? "needs_review" : "classified";
          sqlite.prepare(`UPDATE bookmarks SET category_id=(SELECT id FROM categories WHERE name=?),format=?,priority=?,
            actionable=?,evergreen=?,confidence=?,probabilities_json=?,status=?,error=NULL,updated_at=? WHERE id=?`)
            .run(category, result.format, result.priority, result.actionable ? 1 : 0, result.evergreen ? 1 : 0,
              result.confidence, JSON.stringify(result.probabilities), status, new Date().toISOString(), row.id);
        } else {
          const result = await enrichWithOpenAI(row);
          sqlite.prepare("UPDATE bookmarks SET summary=?,tags_json=?,embedding_json=?,error=NULL,updated_at=? WHERE id=?")
            .run(result.summary, JSON.stringify(result.tags), JSON.stringify(result.embedding), new Date().toISOString(), row.id);
        }
        done++;
      } catch (error) {
        failed++;
        sqlite.prepare("UPDATE bookmarks SET status='failed',error=?,updated_at=? WHERE id=?")
          .run(error instanceof Error ? error.message : "Unknown model error", new Date().toISOString(), row.id);
      }
      sqlite.prepare("UPDATE jobs SET done=?,failed=?,cursor=?,updated_at=? WHERE id=?")
        .run(done, failed, String(row.id), new Date().toISOString(), jobId);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  sqlite.prepare("UPDATE jobs SET status=?,updated_at=? WHERE id=?")
    .run(failed && !done ? "failed" : "complete", new Date().toISOString(), jobId);
  return NextResponse.json({ jobId, total: rows.length, done, failed });
}
