import { IdParams, route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";
import { NextResponse } from "next/server";

export const GET = route({ permission: "admin:learning", reauth: true, params: IdParams }, async (ctx) => {
  const body = await learning.exportDataset(ctx.params.id);
  return new NextResponse(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": `attachment; filename="dataset-${ctx.params.id.slice(0, 8)}.jsonl"` } });
});
