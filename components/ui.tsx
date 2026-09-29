import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...values: Parameters<typeof clsx>) => twMerge(clsx(values));

export function Button({ className, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }) {
  return <button className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", {
    "bg-[var(--ink)] text-white hover:bg-black": variant === "primary",
    "border bg-white/40 hover:bg-white": variant === "outline",
    "hover:bg-black/5": variant === "ghost",
  }, className)} {...props} />;
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex rounded-full border bg-white/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]", className)}>{children}</span>;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-white/45", className)} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("h-11 w-full rounded-md border bg-white/70 px-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--ink)]", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("h-10 rounded-md border bg-white/70 px-3 text-sm outline-none focus:border-[var(--ink)]", props.className)} />;
}

export function Progress({ value }: { value: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-[var(--red)] transition-all" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} /></div>;
}

export function EmptyState({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-10 text-center">
    <p className="font-editorial text-2xl">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{copy}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
