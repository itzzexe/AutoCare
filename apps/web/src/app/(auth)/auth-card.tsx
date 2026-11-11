import type { ReactNode } from "react";

export function AuthCard({ title, refCode, children }: { title: string; refCode: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <section className="ticket">
        <div className="ticket-head">
          <span>AutoCare IQ</span>
          <span dir="ltr">{refCode}</span>
        </div>
        <div className="p-6">
          <h1 className="mb-6 text-2xl font-bold">{title}</h1>
          {children}
        </div>
      </section>
    </div>
  );
}
