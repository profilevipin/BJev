"use client";

import { useEffect, useState } from "react";
import { Folder, Plus } from "lucide-react";
import { Button, Card, EmptyState, Input } from "./ui";

type Collection = { id: number; name: string; description: string; count: number };

export function CollectionsView() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  async function load() { const response = await fetch("/api/collections"); const data = await response.json(); if (response.ok) setCollections(data.collections); }
  useEffect(() => { load(); }, []);
  async function create() {
    const response = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description }) });
    const data = await response.json();
    if (!response.ok) setError(data.error); else { setCollections(data.collections); setName(""); setDescription(""); setError(""); }
  }
  return <div className="mx-auto max-w-5xl px-5 py-10 md:px-10 md:py-14">
    <header className="border-b pb-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--red)]">Personal shelves</p><h1 className="font-editorial mt-2 text-5xl">Collections</h1><p className="mt-3 text-sm text-[var(--muted)]">Curate bookmarks across categories. Open any bookmark in the Library to pin it to a shelf.</p></header>
    <Card className="mt-7 p-5"><h2 className="font-semibold">Create a collection</h2><div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr_auto]"><Input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} /><Input placeholder="What belongs here?" value={description} onChange={(event) => setDescription(event.target.value)} /><Button onClick={create} disabled={!name.trim()}><Plus size={16} />Create</Button></div>{error && <p className="mt-3 text-sm text-red-800">{error}</p>}</Card>
    <div className="mt-8 grid gap-4 md:grid-cols-2">{collections.length ? collections.map((collection) => <Card key={collection.id} className="p-6"><Folder className="text-[var(--red)]" /><h2 className="font-editorial mt-5 text-2xl">{collection.name}</h2><p className="mt-2 min-h-10 text-sm leading-5 text-[var(--muted)]">{collection.description || "A shelf for selected bookmarks."}</p><p className="mt-5 border-t pt-4 text-xs font-bold uppercase tracking-widest">{collection.count} bookmark{collection.count === 1 ? "" : "s"}</p></Card>) : <div className="md:col-span-2"><EmptyState title="No collections yet" copy="Create a shelf for a project, a reading list, or anything else that cuts across categories." /></div>}</div>
  </div>;
}
