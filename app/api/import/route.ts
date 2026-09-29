import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { parseBookmarkFile } from "@/lib/importer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to import." }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "Files must be smaller than 50 MB." }, { status: 413 });
    const rows = parseBookmarkFile(file.name, await file.text());
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    sqlite.prepare("INSERT INTO jobs(id,type,status,total,done,failed,created_at,updated_at) VALUES(?,'import','running',?,0,0,?,?)")
      .run(jobId, rows.length, now, now);
    if (form.get("clearSamples") === "true") sqlite.prepare("DELETE FROM bookmarks WHERE is_sample=1").run();
    const insert = sqlite.prepare(`INSERT INTO bookmarks
      (tweet_id,url,text,author,posted_at,media_json,raw_json,status,is_sample,created_at,updated_at)
      VALUES(@tweetId,@url,@text,@author,@postedAt,@media,@raw,'pending',0,@now,@now)
      ON CONFLICT(tweet_id) DO UPDATE SET url=excluded.url,text=CASE WHEN excluded.text!='' THEN excluded.text ELSE bookmarks.text END,
      author=CASE WHEN excluded.author!='Unknown' THEN excluded.author ELSE bookmarks.author END,posted_at=coalesce(excluded.posted_at,bookmarks.posted_at),
      media_json=excluded.media_json,raw_json=excluded.raw_json,is_sample=0,updated_at=excluded.updated_at`);
    let done = 0, failed = 0;
    const transaction = sqlite.transaction(() => {
      for (const row of rows) {
        try {
          insert.run({ ...row, media: JSON.stringify(row.media), raw: JSON.stringify(row.raw), now });
          done++;
        } catch { failed++; }
      }
    });
    transaction();
    sqlite.prepare("UPDATE jobs SET status=?,done=?,failed=?,updated_at=? WHERE id=?")
      .run(failed === rows.length ? "failed" : "complete", done, failed, new Date().toISOString(), jobId);
    return NextResponse.json({ jobId, total: rows.length, imported: done, failed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
