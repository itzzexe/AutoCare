import { route } from "@/server/http/handler";
import * as account from "@/server/modules/account/service";
import { clearSessionCookies } from "@/server/http/auth-cookies";

export const DELETE = route({ reauth: true }, async (ctx) => {
  await account.deleteAccount(ctx.auth.user.id, ctx.requestId);
  clearSessionCookies(ctx.setCookie);
  return { ok: true };
});
