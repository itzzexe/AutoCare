import { z } from "zod";
import { route } from "@/server/http/handler";
import * as files from "@/server/modules/files/service";

/** Raw file body (no multipart parsing). Purpose in the query string. Owner-scoped. */
export const POST = route(
  { query: z.object({ purpose: z.enum(["case_attachment", "product_image", "merchant_document"]) }), rawBody: "binary", maxBodyBytes: 8 * 1024 * 1024, rateLimit: [{ policy: "upload:user", by: "user" }], timeoutMs: 45_000 },
  async (ctx) => files.storeUpload(ctx.auth.user.id, ctx.query.purpose, ctx.body as unknown as Buffer, ctx.requestId),
);
export const GET = route({}, async (ctx) => ({ items: await files.myUploads(ctx.auth.user.id) }));
