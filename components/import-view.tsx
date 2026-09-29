"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileJson, LoaderCircle, Play, TerminalSquare, UploadCloud } from "lucide-react";
import { Button, Card, Progress } from "./ui";

type Job = { id: string; type: string; status: string; total: number; done: number; failed: number; error?: string };

export function ImportView() {
  const [file, setFile] = useState<File | null>(null);
  const [clearSamples, setClearSamples] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [capabilities, setCapabilities] = useState({ openrouter: false, openai: false });

  async function loadJobs() {
    const response = await fetch("/api/jobs");
    if (response.ok) {
      const result = await response.json();
      setJobs(result.jobs);
      setCapabilities(result.capabilities);
    }
  }
  useEffect(() => { loadJobs(); }, []);
  async function upload() {
    if (!file) return;
    setBusy("import"); setError(""); setMessage("");
    const data = new FormData(); data.set("file", file); data.set("clearSamples", String(clearSamples));
    const response = await fetch("/api/import", { method: "POST", body: data });
    const result = await response.json();
    if (response.ok) setMessage(`Imported ${result.imported} of ${result.total} rows. Duplicate tweet IDs were updated.`);
    else setError(result.error);
    setBusy(""); loadJobs();
  }
  async function run(type: "classify" | "enrich") {
    setBusy(type); setError(""); setMessage("");
    const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, limit: 100 }) });
    const result = await response.json();
    if (response.ok) setMessage(`${type === "classify" ? "Classification" : "Enrichment"} finished: ${result.done} complete, ${result.failed} failed.`);
    else setError(result.error);
    setBusy(""); loadJobs();
  }
  return <div className="mx-auto max-w-5xl px-5 py-10 md:px-10 md:py-14">
    <header className="border-b pb-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--red)]">Bring your archive</p><h1 className="font-editorial mt-2 text-5xl">Import & process</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Folio accepts common exports without logging into X. Files are read on this machine and written to local SQLite.</p></header>
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      <Card className="p-6"><FileJson className="text-[var(--red)]" /><h2 className="font-editorial mt-5 text-2xl">Upload an export</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">JSON, JSONL, CSV, or X archive <code>bookmark.js</code> / <code>bookmarks.js</code>. Maximum 50 MB.</p>
        <label className="mt-5 grid min-h-36 cursor-pointer place-items-center rounded-lg border border-dashed bg-white/35 p-5 text-center hover:bg-white/60"><UploadCloud /><span className="mt-2 text-sm font-semibold">{file ? file.name : "Choose a bookmark file"}</span><input type="file" className="sr-only" accept=".json,.jsonl,.csv,.js" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <label className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={clearSamples} onChange={(event) => setClearSamples(event.target.checked)} />Remove built-in samples on import</label>
        <Button className="mt-4 w-full" disabled={!file || Boolean(busy)} onClick={upload}>{busy === "import" ? <LoaderCircle className="animate-spin" size={16} /> : null}Import file</Button>
      </Card>
      <Card className="p-6"><TerminalSquare className="text-[var(--red)]" /><h2 className="font-editorial mt-5 text-2xl">Export from the browser</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Open <strong>x.com/i/bookmarks</strong>, scroll to load the bookmarks you want, then paste the repository script into DevTools Console.</p>
        <div className="mt-5 rounded-lg bg-[var(--ink)] p-4 font-mono text-xs leading-5 text-white">scripts/x-bookmarks-extract.js</div><p className="mt-3 text-xs leading-5 text-[var(--muted)]">The script reads rendered tweet cards only. It never reads cookies, makes network requests, or sends your data anywhere.</p>
      </Card>
    </div>
    <section className="mt-8"><h2 className="font-editorial text-3xl">Model passes</h2><p className="mt-2 text-sm text-[var(--muted)]">Runs are bounded to 100 bookmarks, four requests at a time, and save after every row. Run again to resume failed or remaining work.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><Card className="p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">1. Classify with Jev</h3><span className={`text-xs font-semibold ${capabilities.openrouter ? "text-emerald-700" : "text-amber-700"}`}>{capabilities.openrouter ? "OpenRouter ready" : "OpenRouter key missing"}</span></div><p className="mt-2 min-h-12 text-sm leading-6 text-[var(--muted)]">Category, format, priority, actionable, and evergreen via TypeSafe Jev on OpenRouter. Confidence below 55% goes to Review.</p><Button className="mt-4" onClick={() => run("classify")} disabled={Boolean(busy)}><Play size={15} />Classify unclassified</Button></Card>
      <Card className="p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">2. Enrich with OpenAI</h3><span className={`text-xs font-semibold ${capabilities.openai ? "text-emerald-700" : "text-amber-700"}`}>{capabilities.openai ? "OpenAI ready" : "OpenAI key missing"}</span></div><p className="mt-2 min-h-12 text-sm leading-6 text-[var(--muted)]">Add a concise summary, tags, and embeddings for semantic and related search.</p><Button className="mt-4" onClick={() => run("enrich")} disabled={Boolean(busy)}><Play size={15} />Enrich missing</Button></Card></div>
    </section>
    {error && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {message && <p className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={17} />{message}</p>}
    <section className="mt-9 border-t pt-7"><h2 className="font-editorial text-2xl">Recent jobs</h2>{jobs.length ? <div className="mt-4 space-y-3">{jobs.map((job) => <Card key={job.id} className="p-4"><div className="flex justify-between text-sm"><span className="font-semibold capitalize">{job.type} · {job.status}</span><span>{job.done}/{job.total}{job.failed ? ` · ${job.failed} failed` : ""}</span></div><div className="mt-3"><Progress value={job.total ? ((job.done + job.failed) / job.total) * 100 : 100} /></div></Card>)}</div> : <p className="mt-3 text-sm text-[var(--muted)]">No jobs yet. Import a file to begin.</p>}</section>
  </div>;
}
