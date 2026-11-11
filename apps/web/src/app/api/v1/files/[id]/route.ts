import { z } from "zod";
import { IdParams, publicRoute } from "@/server/http/handler";
import { NextResponse } from "next/server";
import * as files from "@/server/modules/files/service";

export const GET = publicRoute({ params: IdParams, query: z.object({ exp: z.coerce.number().int(), sig: z.string().min(20).max(100) }) }, async (ctx) => {
  const f = await files.readSignedFile(ctx.params.id, ctx.auth?.user.id ?? null, ctx.query.exp, ctx.query.sig);
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": f.attachment ? `attachment; filename="file-${ctx.params.id.slice(0, 8)}.pdf"` : "inline",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      "Cache-Control": "private, max-age=60",
    },
  });
});
