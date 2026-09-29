# Folio

Folio is a private, local-first library for years of X bookmarks. It imports common exports, classifies them with TypeSafe Jev through OpenRouter, enriches them with OpenAI, and remains useful as an FTS5 keyword library without either model key.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:38471](http://localhost:38471). SQLite is created automatically at `data/folio.db`; starter categories and four sample bookmarks appear on first run.

Useful checks:

```bash
npm test
npm run typecheck
npm run build
```

## Server configuration

All model credentials are server-only. Never expose them with a `NEXT_PUBLIC_` prefix.

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | TypeSafe Jev classification through OpenRouter | unset |
| `OPENROUTER_JEV_ENDPOINT` | OpenRouter Jev API endpoint | `https://openrouter.ai/api/alpha/decisions` |
| `OPENAI_API_KEY` | summaries, tags, taxonomy, embeddings | unset |
| `OPENAI_MODEL` | text generation model | `gpt-4.1-mini` |
| `OPENAI_EMBEDDING_MODEL` | embedding model | `text-embedding-3-small` |
| `FOLIO_DB_PATH` | local SQLite file | `data/folio.db` |

Missing keys are shown as actionable messages in the UI. Import, keyword search, filters, collections, manual categories, and review remain local and usable.

Classification uses the pinned `typesafe/jev-1.13` model. The default endpoint is OpenRouter's Decisions API. To use its TypeSafe-compatible surface instead, set `OPENROUTER_JEV_ENDPOINT=https://openrouter.ai/api/v1/systemone`. Both endpoints use the same `OPENROUTER_API_KEY`; no direct TypeSafe key is required. OpenAI remains a separate provider for generative summaries, tags, taxonomy suggestions, and embeddings.

## Import bookmarks

The Import page accepts:

- JSON arrays or `{ "bookmarks": [...] }`
- newline-delimited JSON (`.jsonl`)
- CSV with common fields such as `tweet_id`, `text`/`content`, `author`/`username`, `url`, and `date`
- X archive `bookmark.js` or `bookmarks.js` files shaped like `window.YTD.bookmark.part0 = [...]`

Rows deduplicate on tweet ID. Id-only archive rows are retained so they can be classified after a later richer export. `samples/bookmarks.json` is a small import fixture.

If the official archive has no bookmark text, open `https://x.com/i/bookmarks`, scroll to load the rows you need, and paste the contents of `scripts/x-bookmarks-extract.js` into that page's browser console. The script reads rendered cards and downloads JSON. It does not access cookies, call another server, or include session data.

## Processing

1. Edit the starter taxonomy or use **Suggest from my library**. Suggestions are previewed and never automatically replace categories.
2. Run **Classify unclassified**. Folio sends one Jev request per bookmark through OpenRouter with five questions. It uses four workers, limits each run to 100 rows, persists each result, and resumes pending/failed rows on the next run.
3. Items below 55% category confidence enter Review. A manual category change locks the row against normal reclassification.
4. Run **Enrich missing** explicitly for summaries, 3–6 tags, and embeddings. Semantic search and related items use a local cosine scan.

No X login, cookies, credentials, or model keys are stored in SQLite.
