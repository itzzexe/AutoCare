import { route } from "@/server/http/handler";
import * as account from "@/server/modules/account/service";
import { NextResponse } from "next/server";

export const GET = route({ reauth: true }, async (ctx) => {
  const data = await account.exportMyData(ctx.auth.user.id, ctx.requestId);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="autocare-my-data.json"' } });
});
