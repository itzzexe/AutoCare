"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Icon } from "../ui/icon";

interface Labels {
  login: string;
  register: string;
  account: string;
  logout: string;
  cases: string;
  language: string;
  theme: string;
  notifications: string;
  menu: string;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function HeaderControls({ signedIn, displayName, consoles, labels }: { signedIn: boolean; displayName: string | null; consoles: Array<{ href: string; label: string }>; labels: Labels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!signedIn) return;
    api<{ items: Array<{ readAt: string | null }> }>("/notifications")
      .then((r) => setUnread(r.items.filter((n) => !n.readAt).length))
      .catch(() => undefined);
  }, [signedIn]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    root.dataset.theme = next;
    setCookie("acq_theme", next);
  };
  const toggleLocale = () => {
    const next = document.documentElement.lang === "en" ? "ar" : "en";
    setCookie("acq_locale", next);
    router.refresh();
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    // Drop any cached private pages from the client router.
    router.push("/");
    router.refresh();
  };

  return (
    <div className="ms-auto flex items-center gap-1">
      <button type="button" onClick={toggleLocale} className="btn btn-ghost btn-sm" aria-label={labels.language}>
        <Icon name="globe" size={18} />
        <span className="hidden sm:inline">{labels.language}</span>
      </button>
      <button type="button" onClick={toggleTheme} className="btn btn-ghost btn-sm" aria-label={labels.theme} title={labels.theme}>
        <Icon name="moon" size={18} />
      </button>
      {signedIn ? (
        <>
          <Link href="/account/notifications" className="btn btn-ghost btn-sm relative" aria-label={labels.notifications}>
            <Icon name="bell" size={18} />
            {unread > 0 ? <span className="absolute -top-0.5 end-0.5 min-w-4 rounded-full bg-signal px-1 text-center font-mono text-[0.6rem] leading-4 text-[var(--signal-ink)]">{unread > 9 ? "9+" : unread}</span> : null}
          </Link>
          <div className="relative" ref={menuRef}>
            <button type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              <Icon name="user" size={18} />
              <span className="hidden max-w-[9rem] truncate sm:inline">{displayName}</span>
            </button>
            {open ? (
              <div role="menu" className="ticket absolute end-0 top-12 z-40 w-56 py-1">
                <Link role="menuitem" href="/account" className="block px-4 py-2 hover:bg-paper-2" onClick={() => setOpen(false)}>{labels.account}</Link>
                <Link role="menuitem" href="/cases" className="block px-4 py-2 hover:bg-paper-2" onClick={() => setOpen(false)}>{labels.cases}</Link>
                {consoles.map((c) => (
                  <Link key={c.href} role="menuitem" href={c.href} className="block px-4 py-2 hover:bg-paper-2" onClick={() => setOpen(false)}>{c.label}</Link>
                ))}
                <div className="my-1 border-t border-dashed border-rule" />
                <button role="menuitem" type="button" onClick={logout} className="block w-full px-4 py-2 text-start text-danger hover:bg-paper-2">{labels.logout}</button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <Link href="/login" className="btn btn-ghost btn-sm">{labels.login}</Link>
          <Link href="/register" className="btn btn-primary btn-sm hidden sm:inline-flex">{labels.register}</Link>
        </>
      )}
    </div>
  );
}
