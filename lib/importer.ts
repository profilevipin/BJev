import Papa from "papaparse";

export type ImportedBookmark = {
  tweetId: string;
  url: string;
  text: string;
  author: string;
  postedAt: string | null;
  media: unknown[];
  raw: unknown;
};

type AnyRow = Record<string, unknown>;

const value = (row: AnyRow, keys: string[]) => {
  for (const key of keys) {
    const found = row[key];
    if (found !== undefined && found !== null && String(found).trim()) return String(found).trim();
  }
  return "";
};

function normalize(row: unknown): ImportedBookmark | null {
  if (!row || typeof row !== "object") return null;
  const outer = row as AnyRow;
  const inner = (outer.bookmark ?? outer.tweet ?? outer) as AnyRow;
  const id = value(inner, ["tweetId", "tweet_id", "id_str", "id", "tweetID"]);
  const url = value(inner, ["url", "tweetUrl", "tweet_url"]) || (id ? `https://x.com/i/status/${id}` : "");
  const match = url.match(/status\/(\d+)/);
  const tweetId = id || match?.[1] || "";
  if (!tweetId) return null;
  const author = value(inner, ["author", "username", "screen_name", "authorUsername", "user"]) || "Unknown";
  const text = value(inner, ["text", "full_text", "content", "tweetText"]);
  const postedAt = value(inner, ["postedAt", "posted_at", "created_at", "date"]) || null;
  const mediaValue = inner.media ?? inner.mediaUrls ?? inner.attachments ?? [];
  const media = Array.isArray(mediaValue) ? mediaValue : mediaValue ? [mediaValue] : [];
  return { tweetId, url, text, author, postedAt, media, raw: row };
}

function unwrapJson(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const object = parsed as AnyRow;
  for (const key of ["bookmarks", "tweets", "items", "data"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  return [parsed];
}

export function parseBookmarkFile(name: string, content: string): ImportedBookmark[] {
  const extension = name.toLowerCase().split(".").pop();
  let rows: unknown[] = [];
  if (extension === "csv") {
    const result = Papa.parse<AnyRow>(content, { header: true, skipEmptyLines: true });
    if (result.errors.length && !result.data.length) throw new Error(result.errors[0].message);
    rows = result.data;
  } else if (extension === "jsonl") {
    rows = content.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${index + 1}`); }
    });
  } else {
    let source = content.trim();
    if (/^window\.YTD\.(bookmark|bookmarks)\.part\d+\s*=/.test(source)) {
      source = source.replace(/^window\.YTD\.(bookmark|bookmarks)\.part\d+\s*=\s*/, "").replace(/;\s*$/, "");
    }
    try { rows = unwrapJson(JSON.parse(source)); } catch { throw new Error("This is not valid JSON or an X archive bookmark file."); }
  }
  const normalized = rows.map(normalize).filter((row): row is ImportedBookmark => Boolean(row));
  if (!normalized.length) throw new Error("No bookmark rows with a tweet ID or status URL were found.");
  return normalized;
}
