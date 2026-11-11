"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../ui/icon";

export function MobileTabBar({ items }: { items: Array<{ href: string; label: string; icon: string }> }) {
  const path = usePathname();
  return (
    <nav aria-label="primary" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map((it) => {
          const active = path === it.href || path.startsWith(`${it.href}/`);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-medium ${active ? "text-ink" : "text-ink-3"}`}
              >
                <span className={`flex h-7 w-10 items-center justify-center rounded-full ${active ? "bg-signal-soft text-signal" : ""}`}>
                  <Icon name={it.icon} size={20} />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
