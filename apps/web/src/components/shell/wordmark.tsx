import Link from "next/link";

/** Wordmark: Kufi name + an inspection-tag "IQ" (Iraq / the car's "intelligence quotient"). */
export function Wordmark({ name, suffix }: { name: string; suffix: string }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2 font-display text-[1.35rem] font-bold leading-none tracking-tight text-ink">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className="shrink-0">
        <circle cx="13" cy="13" r="11.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="13" cy="13" r="3.2" fill="var(--signal)" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect key={a} x="12" y="1.8" width="2" height="5" fill="currentColor" transform={`rotate(${a} 13 13)`} />
        ))}
      </svg>
      <span>{name}</span>
      <span className="code-tag text-[0.72rem] transition-transform group-hover:-rotate-3">{suffix}</span>
    </Link>
  );
}
