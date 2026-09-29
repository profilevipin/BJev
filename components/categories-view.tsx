"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Merge, Pencil, Plus, Sparkles } from "lucide-react";
import { Button, Card, EmptyState, Input } from "./ui";

type Category = { id: number; name: string; description: string; count: number };
type Suggestion = { name: string; description: string };

export function CategoriesView() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  async function load() { const response = await fetch("/api/categories"); const data = await response.json(); if (response.ok) setCategories(data.categories); else setError(data.error); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!name.trim()) return;
    const response = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await response.json(); if (!response.ok) setError(data.error); else { setName(""); setCategories(data.categories); }
  }
  async function edit(category: Category) {
    const nextName = prompt("Category name", category.name); if (!nextName) return;
    const description = prompt("Description used by the classifier", category.description); if (description === null) return;
    await fetch("/api/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: category.id, name: nextName, description }) }); load();
  }
  async function merge(category: Category) {
    const destination = prompt(`Merge “${category.name}” into which category?`, "Other");
    const target = categories.find((item) => item.name.toLowerCase() === destination?.toLowerCase());
    if (!target || target.id === category.id) { if (destination) setError("Choose the exact name of another category."); return; }
    await fetch("/api/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: category.id, mergeIntoId: target.id }) }); load();
  }
  async function suggest() {
    setBusy("suggest"); setError("");
    const response = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest" }) });
    const data = await response.json(); if (response.ok) setSuggestions(data.categories); else setError(data.error); setBusy("");
  }
  async function accept() {
    setBusy("accept");
    await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", categories: suggestions }) });
    setSuggestions([]); setBusy(""); load();
  }
  return <div className="mx-auto max-w-5xl px-5 py-10 md:px-10 md:py-14">
    <header className="flex flex-wrap items-end justify-between gap-5 border-b pb-8"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--red)]">Your taxonomy</p><h1 className="font-editorial mt-2 text-5xl">Categories</h1><p className="mt-3 text-sm text-[var(--muted)]">The filing system Jev uses. Changes apply to future runs; manual bookmark choices stay locked.</p></div><Button variant="outline" onClick={suggest} disabled={Boolean(busy)}>{busy === "suggest" ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}Suggest from my library</Button></header>
    <div className="mt-7 flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="New category name" /><Button onClick={add}><Plus size={16} />Add</Button></div>
    {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {suggestions.length > 0 && <Card className="mt-6 border-[var(--red)] p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-editorial text-2xl">Suggested taxonomy</h2><p className="mt-1 text-xs text-[var(--muted)]">Review before accepting. Existing categories are never removed.</p></div><Button onClick={accept} disabled={Boolean(busy)}>Accept suggestions</Button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{suggestions.map((item) => <div key={item.name} className="border-t pt-3"><strong className="text-sm">{item.name}</strong><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.description}</p></div>)}</div></Card>}
    <div className="mt-8 grid gap-3">{categories.length ? categories.map((category) => <Card key={category.id} className="flex items-center gap-4 p-5"><span className="font-editorial grid size-11 shrink-0 place-items-center rounded-full bg-[var(--paper-deep)] text-xl">{category.count}</span><div className="min-w-0 flex-1"><h2 className="font-semibold">{category.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{category.description || "No classifier guidance yet."}</p></div><Button variant="ghost" aria-label="Edit" onClick={() => edit(category)}><Pencil size={15} /></Button><Button variant="ghost" aria-label="Merge" onClick={() => merge(category)}><Merge size={15} /></Button></Card>) : <EmptyState title="No categories yet" copy="Add a category or ask OpenAI to suggest a taxonomy from your bookmarks." />}</div>
  </div>;
}
