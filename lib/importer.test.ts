import { describe, expect, it } from "vitest";
import { parseBookmarkFile } from "./importer";

describe("parseBookmarkFile", () => {
  it("normalizes JSON exporters", () => {
    const [row] = parseBookmarkFile("bookmarks.json", JSON.stringify({ bookmarks: [{ id: "42", full_text: "hello", screen_name: "ada" }] }));
    expect(row).toMatchObject({ tweetId: "42", text: "hello", author: "ada", url: "https://x.com/i/status/42" });
  });

  it("parses X archive JavaScript and id-only rows", () => {
    const [row] = parseBookmarkFile("bookmark.js", 'window.YTD.bookmark.part0 = [{"bookmark":{"tweetId":"99"}}];');
    expect(row).toMatchObject({ tweetId: "99", text: "", url: "https://x.com/i/status/99" });
  });

  it("parses JSONL and derives IDs from URLs", () => {
    const [row] = parseBookmarkFile("bookmarks.jsonl", '{"url":"https://x.com/a/status/123","text":"saved"}\n');
    expect(row.tweetId).toBe("123");
  });

  it("parses CSV headers used by common exporters", () => {
    const [row] = parseBookmarkFile("bookmarks.csv", "tweet_id,content,username\n7,Useful link,grace\n");
    expect(row).toMatchObject({ tweetId: "7", text: "Useful link", author: "grace" });
  });

  it("rejects rows with no stable ID", () => {
    expect(() => parseBookmarkFile("bad.json", '[{"text":"orphan"}]')).toThrow(/No bookmark rows/);
  });
});
