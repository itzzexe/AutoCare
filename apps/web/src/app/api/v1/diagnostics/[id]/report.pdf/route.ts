import { z } from "zod";
import { IdParams, route } from "@/server/http/handler";
import { NextResponse } from "next/server";
import { renderDiagnosticPdf } from "@/server/modules/reports/pdf";

export const GET = route({ permission: "diagnostics:own", params: IdParams, query: z.object({ locale: z.enum(["ar", "en"]).default("ar") }), timeoutMs: 60_000 }, async (ctx) => {
  const pdf = await renderDiagnosticPdf(ctx.auth.user.id, ctx.params.id, ctx.query.locale);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="autocare-report-${ctx.params.id.slice(0, 8)}.pdf"` } });
});
