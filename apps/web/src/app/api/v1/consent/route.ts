import { route } from "@/server/http/handler";
import * as learning from "@/server/modules/learning/service";
import { ConsentInput } from "@autocare/contracts";

export const GET = route({}, async (ctx) => ({ current: await learning.activeConsent(ctx.auth.user.id), textVersion: learning.CONSENT_TEXT_VERSION }));
export const PUT = route({ body: ConsentInput }, async (ctx) => ({ current: await learning.setConsent(ctx.auth.user.id, ctx.body.granted, ctx.body.textVersion, ctx.body.sources, ctx.requestId) }));
