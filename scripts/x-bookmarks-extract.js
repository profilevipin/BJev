/*
 * Folio bookmark extractor
 * Run only in your own browser console on https://x.com/i/bookmarks.
 * It reads rendered bookmark cards, never reads cookies, and only downloads
 * data already visible in the page. Scroll first to load more bookmarks.
 */
(() => {
  if (location.hostname !== "x.com" && location.hostname !== "twitter.com") {
    throw new Error("Open x.com/i/bookmarks before running this extractor.");
  }
  const rows = [...document.querySelectorAll("article")].flatMap((article) => {
    const statusLink = [...article.querySelectorAll('a[href*="/status/"]')]
      .map((node) => node.href).find((href) => /\/status\/\d+/.test(href));
    if (!statusLink) return [];
    const tweetId = statusLink.match(/\/status\/(\d+)/)?.[1];
    const text = article.querySelector('[data-testid="tweetText"]')?.innerText || "";
    const userLink = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
    const author = userLink?.getAttribute("href")?.slice(1) || "Unknown";
    const postedAt = article.querySelector("time")?.getAttribute("datetime") || null;
    const media = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .map((image) => image.src);
    return [{ tweetId, url: statusLink, text, author, postedAt, media }];
  });
  const unique = [...new Map(rows.map((row) => [row.tweetId, row])).values()];
  const blob = new Blob([JSON.stringify({ bookmarks: unique }, null, 2)], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `folio-bookmarks-${new Date().toISOString().slice(0, 10)}.json`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
  console.info(`Folio exported ${unique.length} visible bookmarks.`);
})();
