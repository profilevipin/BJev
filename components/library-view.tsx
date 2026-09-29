"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, Command, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Select } from "./ui";

type Row = {
  id: number; text: string; author: string; url: string; summary: string | null; tags_json: string;
  category_id: number | null; category_name: string | null; format: string | null; priority: string | null;
  actionable: number | null; evergreen: number | null; confidence: number | null; status: string; error: string | null;
  probabilities_json: string; collections: string | null;
};
type Category = { id: number; name: string; description: string; count: number };
type Collection = { id: number; name: string; selected?: number };

const json = <T,>(value: string | null, fallback: T): T => { try { return JSON.parse(value || "") as T; } catch { return fallback; } };

export function LibraryView({ reviewOnly = false }: { reviewOnly?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState({ category: "", format: "", priority: "", actionable: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [detail, setDetail] = useState<{ related: Row[]; collections: Collection[] } | null>(null);
  const [capabilities, setCapabilities] = useState({ jev: false, openai: false });
  const [semantic, setSemantic] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (semantic) params.set("semantic", "true");
    if (reviewOnly) params.set("review", "true");
    Object.entries(filter).forEach(([key, value]) => value && params.set(key, String(value)));
    try {
      const response = await fetch(`/api/bookmarks?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.bookmarks); setCategories(data.facets.categories); setCapabilities(data.capabilities);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load bookmarks."); }
    finally { setLoading(false); }
  }, [query, semantic, reviewOnly, filter]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>("#library-search")?.focus(); }
      if (reviewOnly && selected && /^[1-9]$/.test(event.key)) {
        const category = categories[Number(event.key) - 1]; if (category) updateCategory(selected.id, category.id);
      }
    };
    addEventListener("keydown", handler); return () => removeEventListener("keydown", handler);
  });

  async function openDetail(row: Row) {
    setSelected(row); setDetail(null);
    const response = await fetch(`/api/bookmarks/${row.id}`);
    if (response.ok) setDetail(await response.json());
  }
  async function updateCategory(id: number, categoryId: number) {
    await fetch("/api/bookmarks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, categoryId }) });
    setSelected(null); load();
  }
  async function accept(id: number) {
    await fetch("/api/bookmarks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "classified" }) });
    setSelected(null); load();
  }
  async function toggleCollection(id: number, collectionId: number, removeCollection: boolean) {
    await fetch("/api/bookmarks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, collectionId, removeCollection }) });
    if (selected) openDetail(selected);
  }

  const activeFilters = useMemo(() => Object.values(filter).filter(Boolean).length, [filter]);
  return <div className="mx-auto max-w-6xl px-5 py-8 md:px-10 md:py-12">
    <header className="flex flex-wrap items-end justify-between gap-5 border-b pb-8">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-[var(--red)]">{reviewOnly ? "Confidence desk" : "The archive"}</p>
        <h1 className="font-editorial text-4xl md:text-5xl">{reviewOnly ? "Review queue" : "Your reading, remembered."}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">{reviewOnly ? "Resolve uncertain classifications. Choose a category or accept the model’s suggestion." : "Search the ideas, tools, and references you saved for later."}</p>
      </div>
      {!reviewOnly && <Button variant="outline" onClick={() => location.href="/import"}>Import bookmarks</Button>}
    </header>

    <div className="mt-7 flex flex-col gap-3 lg:flex-row">
      <label className="relative flex-1"><Search className="absolute left-3 top-3.5 text-[var(--muted)]" size={16} /><Input id="library-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search text, author, summary, or tags…" className="pl-10 pr-20" /><span className="absolute right-3 top-3 text-xs text-[var(--muted)]"><Command size={12} className="inline" /> K</span></label>
      <div className="flex gap-2 overflow-x-auto">
        <Select aria-label="Category filter" value={filter.category} onChange={(event) => setFilter({ ...filter, category: event.target.value })}><option value="">All categories</option>{categories.map((item) => <option key={item.id}>{item.name}</option>)}</Select>
        <Select aria-label="Format filter" value={filter.format} onChange={(event) => setFilter({ ...filter, format: event.target.value })}><option value="">Any format</option>{["thread","link","tool","opinion","announcement","media","other"].map((value) => <option key={value}>{value}</option>)}</Select>
        <Select aria-label="Priority filter" value={filter.priority} onChange={(event) => setFilter({ ...filter, priority: event.target.value })}><option value="">Any priority</option>{["skip","skim","read","study"].map((value) => <option key={value}>{value}</option>)}</Select>
        <Button variant={filter.actionable ? "primary" : "outline"} onClick={() => setFilter({ ...filter, actionable: !filter.actionable })}>Actionable</Button>
      </div>
    </div>
    {query && <label className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={semantic} onChange={(event) => setSemantic(event.target.checked)} disabled={!capabilities.openai} /> Semantic search {!capabilities.openai && "(requires OpenAI)"}</label>}

    <div className="mt-8 grid gap-8 lg:grid-cols-[180px_1fr]">
      <aside className="hidden lg:block"><p className="mb-3 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)]">Filed under</p>
        <button className="flex w-full justify-between py-1.5 text-sm" onClick={() => setFilter({ ...filter, category: "" })}>Everything <span>{categories.reduce((sum, item) => sum + item.count, 0)}</span></button>
        {categories.filter((item) => item.count).map((item) => <button key={item.id} onClick={() => setFilter({ ...filter, category: item.name })} className="flex w-full justify-between py-1.5 text-left text-sm text-[var(--muted)] hover:text-[var(--ink)]"><span>{item.name}</span><span>{item.count}</span></button>)}
      </aside>
      <section>
        <div className="mb-3 flex items-center justify-between text-xs text-[var(--muted)]"><span>{loading ? "Looking through your library…" : `${rows.length} bookmark${rows.length === 1 ? "" : "s"}${activeFilters ? " in this view" : ""}`}</span>{activeFilters > 0 && <button onClick={() => setFilter({ category: "", format: "", priority: "", actionable: false })}>Clear filters</button>}</div>
        {error ? <EmptyState title="The library could not open" copy={error} action={<Button onClick={load}>Try again</Button>} /> :
        loading ? <div className="grid place-items-center py-24 text-[var(--muted)]"><LoaderCircle className="animate-spin" /><span className="mt-3 text-sm">Opening the folio…</span></div> :
        rows.length === 0 ? <EmptyState title={reviewOnly ? "Nothing needs review" : "No bookmarks found"} copy={reviewOnly ? "Low-confidence classifications will wait here. You are all caught up." : "Try another phrase, clear the filters, or import your first bookmark export."} /> :
        <div className="divide-y border-y">{rows.map((row) => <article key={row.id} className="group py-6">
          <button className="w-full text-left" onClick={() => openDetail(row)}>
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><strong className="text-[var(--ink)]">{row.author}</strong><span>·</span><span>{row.category_name || "Unclassified"}</span>{row.status === "needs_review" && <Badge className="border-amber-300 bg-amber-50 text-amber-800">Review</Badge>}</div>
            <p className="font-editorial mt-3 text-xl leading-7">{row.summary || row.text || "Bookmark text is unavailable in this archive export."}</p>
            {row.summary && <p className="line-clamp-3 mt-2 text-sm leading-6 text-[var(--muted)]">{row.text}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">{row.format && <Badge>{row.format}</Badge>}{row.priority && <Badge>{row.priority}</Badge>}{json<string[]>(row.tags_json, []).slice(0, 4).map((tag) => <span key={tag} className="text-xs text-[var(--muted)]">#{tag}</span>)}<ChevronRight className="ml-auto opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" size={17} /></div>
          </button>
          {row.error && <p className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-800">{row.error}</p>}
        </article>)}</div>}
      </section>
    </div>
    {selected && <div className="fixed inset-0 z-40 bg-black/25" onMouseDown={() => setSelected(null)}>
      <aside className="paper-shadow absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-[var(--paper)] p-6 md:p-9" onMouseDown={(event) => event.stopPropagation()}>
        <button onClick={() => setSelected(null)} className="absolute right-5 top-5 rounded-full p-2 hover:bg-black/5" aria-label="Close"><X size={18} /></button>
        <p className="pr-10 text-xs font-bold uppercase tracking-[.18em] text-[var(--red)]">{selected.category_name || "Unclassified"} · {selected.author}</p>
        <h2 className="font-editorial mt-5 text-3xl leading-10">{selected.summary || selected.text || "Saved bookmark"}</h2>
        {selected.summary && <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">{selected.text}</p>}
        <a href={selected.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold">Open on X <ArrowUpRight size={15} /></a>
        <div className="mt-7 flex flex-wrap gap-2">{json<string[]>(selected.tags_json, []).map((tag) => <Badge key={tag}>#{tag}</Badge>)}</div>
        {selected.confidence !== null && <section className="mt-8 border-t pt-6"><p className="text-xs font-bold uppercase tracking-widest">Classification · {Math.round(selected.confidence * 100)}% confidence</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">{Object.entries(json<Record<string, number>>(selected.probabilities_json, {})).map(([name, score]) => <div key={name} className="flex justify-between border-b py-2"><span>{name.split(":")[0]}</span><span>{Math.round(score * 100)}%</span></div>)}</div>
        </section>}
        <section className="mt-8 border-t pt-6"><label className="text-xs font-bold uppercase tracking-widest">Change category</label><Select className="mt-3 w-full" value={selected.category_id || ""} onChange={(event) => updateCategory(selected.id, Number(event.target.value))}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>
          {selected.status === "needs_review" && <Button className="mt-3 w-full" onClick={() => accept(selected.id)}><Check size={15} />Accept {selected.category_name}</Button>}
        </section>
        <section className="mt-8 border-t pt-6"><p className="text-xs font-bold uppercase tracking-widest">Collections</p>{!detail ? <LoaderCircle className="mt-4 animate-spin" size={18} /> : detail.collections.length ? <div className="mt-3 space-y-2">{detail.collections.map((collection) => <label key={collection.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(collection.selected)} onChange={() => toggleCollection(selected.id, collection.id, Boolean(collection.selected))} />{collection.name}</label>)}</div> : <p className="mt-3 text-sm text-[var(--muted)]">Create a collection first, then pin this bookmark to it.</p>}</section>
        <section className="mt-8 border-t pt-6"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><Sparkles size={14} />Related by meaning</p>{detail?.related.length ? <div className="mt-3 space-y-4">{detail.related.map((row) => <button key={row.id} onClick={() => openDetail(row)} className="block text-left text-sm leading-6 hover:underline">{row.summary || row.text}</button>)}</div> : <p className="mt-3 text-sm text-[var(--muted)]">Enrich bookmarks with OpenAI to find related ideas.</p>}</section>
      </aside>
    </div>}
  </div>;
}
