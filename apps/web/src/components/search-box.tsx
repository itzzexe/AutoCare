"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./i18n";
import { Icon } from "./ui/icon";

export function SearchBox({ initial = "", examples = [], size = "lg", vehicleId }: { initial?: string; examples?: string[]; size?: "lg" | "md"; vehicleId?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const go = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const params = new URLSearchParams({ q: v });
    if (vehicleId) params.set("vehicleId", vehicleId);
    router.push(`/search?${params.toString()}`);
  };
  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className={`flex items-stretch border-2 border-ink bg-card shadow-[0_3px_0_var(--ink)] ${size === "lg" ? "min-h-16" : "min-h-12"}`}
      >
        <label htmlFor="q" className="sr-only">{t.home.placeholder}</label>
        <span className="flex items-center ps-4 text-ink-3">
          <Icon name="search" size={size === "lg" ? 24 : 20} />
        </span>
        <input
          id="q"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          placeholder={t.home.placeholder}
          className={`min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-ink-3 ${size === "lg" ? "text-lg" : "text-base"}`}
        />
        <button type="submit" className="bg-signal px-5 text-base font-bold text-[var(--signal-ink)] transition-colors hover:bg-[var(--signal-hover)] sm:px-8">
          {t.home.submit}
        </button>
      </form>
      {examples.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-3">{t.home.examples}</span>
          {examples.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => { setQ(ex); go(ex); }}>
              {/^[A-Z0-9-]+$/i.test(ex) ? <span className="ltr-id text-[0.8rem]">{ex}</span> : ex}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
