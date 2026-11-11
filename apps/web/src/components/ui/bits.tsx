import type { ReactNode } from "react";

export function Stamp({ tone = "neutral", children, className = "" }: { tone?: "ok" | "warn" | "danger" | "info" | "neutral"; children: ReactNode; className?: string }) {
  return <span className={`stamp ${tone} ${className}`}>{children}</span>;
}

export function CodeTag({ code, size = "md" }: { code: string; size?: "md" | "lg" }) {
  return <span className={`code-tag ${size === "lg" ? "lg" : ""}`}>{code}</span>;
}

/** Latin identifier (VIN, OE number, version) isolated from surrounding Arabic text. */
export function Ltr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={`ltr-id ${className}`}>{children}</bdi>;
}

export function PageHeader({ kicker, title, lead, actions }: { kicker?: string; title: string; lead?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
      <div className="max-w-2xl">
        {kicker ? <p className="label-mono mb-1">{kicker}</p> : null}
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        {lead ? <p className="mt-2 text-ink-2">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Ticket({ label, refCode, children, className = "" }: { label?: string; refCode?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`ticket ${className}`}>
      {label || refCode ? (
        <div className="ticket-head">
          <span>{label}</span>
          {refCode ? <span dir="ltr">{refCode}</span> : null}
        </div>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="ticket flex flex-col items-start gap-3 border-dashed p-6 text-ink-2">
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  const map = { info: "border-info bg-info-soft", warn: "border-warn bg-warn-soft", danger: "border-danger bg-danger-soft", ok: "border-ok bg-ok-soft" } as const;
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={`border-s-4 ${map[tone]} px-4 py-3 text-sm`}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

export function Container({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <div className={`mx-auto px-4 pt-8 ${narrow ? "max-w-2xl" : "max-w-6xl"}`}>{children}</div>;
}

export function fmtDate(d: Date | string, locale: "ar" | "en", withTime = false) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ" : "en-GB", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}), timeZone: "Asia/Baghdad" }).format(new Date(d));
}
