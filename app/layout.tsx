import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Bookmark, Folder, Import, Library, Tags } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Folio — your X bookmark library",
  description: "A private, local library for years of X bookmarks.",
};

const nav = [
  ["/", "Library", Library],
  ["/review", "Review", Archive],
  ["/categories", "Categories", Tags],
  ["/collections", "Collections", Folder],
  ["/import", "Import", Import],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="border-b bg-[var(--paper-deep)]/80 px-5 py-5 md:fixed md:inset-y-0 md:w-[230px] md:border-b-0 md:border-r md:px-6 md:py-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--red)] text-white"><Bookmark size={17} fill="currentColor" /></span>
          <span><strong className="font-editorial text-xl font-normal">Folio</strong><small className="block text-[9px] uppercase tracking-[.22em] text-[var(--muted)]">Bookmark library</small></span>
        </Link>
        <nav className="mobile-scroll mt-5 flex gap-1 overflow-x-auto md:mt-12 md:block md:space-y-1">
          {nav.map(([href, label, Icon]) => <Link key={href} href={href} className="flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-white/55 hover:text-[var(--ink)]"><Icon size={16} />{label}</Link>)}
        </nav>
        <div className="mt-12 hidden border-t pt-5 text-xs leading-5 text-[var(--muted)] md:block">
          <p className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-600" />Stored locally</p>
          <p className="mt-2">Your bookmarks stay in SQLite on this machine.</p>
        </div>
      </aside>
      <main className="min-w-0 md:col-start-2">{children}</main>
    </div>
  </body></html>;
}
