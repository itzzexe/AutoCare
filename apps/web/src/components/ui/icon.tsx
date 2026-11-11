/** Small hand-drawn line icon set (no external icon font; CSP-friendly). */
const P: Record<string, string> = {
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.3-2.2L21 21",
  car: "M3 15.5v-3l2.2-5A2 2 0 0 1 7 6h10a2 2 0 0 1 1.8 1.2l2.2 5.3v3M3 15.5h18M3 15.5V18h3v-2.5m12 0V18h3v-2.5M6.5 12h11M7 15.5h.01M17 15.5h.01",
  wrench: "M14.7 6.3a4 4 0 0 0-5.2 5.2L3.5 17.5a1.8 1.8 0 0 0 2.6 2.6l6-6a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.4-.6-.6-2.4 2.8-2Z",
  box: "M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Zm0 0L12 12m0 0 8.5-4.5M12 12v9",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8a7.5 7.5 0 0 1 15 0",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z",
  alert: "M12 9v4m0 3.5h.01M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  doc: "M7 3h7l5 5v13H7V3Zm7 0v5h5M9.5 13h7m-7 4h5",
  share: "M8.6 13.5 15.4 17.5M15.4 6.5l-6.8 4M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v10h-13V11Zm6.5 4v2",
  gauge: "M4.5 17a8 8 0 1 1 15 0M12 13l4-4.5M12 13h.01",
  cart: "M3 4h2l2.2 11h11l2-8H6.3M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  shield: "M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6L12 3Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2",
  book: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5m0-15v15m0 0A1.5 1.5 0 0 0 6.5 21H19",
};

export function Icon({ name, size = 20, className = "", title }: { name: keyof typeof P | string; size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={P[name] ?? P.doc} />
    </svg>
  );
}
