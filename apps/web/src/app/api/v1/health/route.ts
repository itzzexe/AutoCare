import { publicRoute } from "@/server/http/handler";

export const GET = publicRoute({ auth: "none" }, async () => ({ status: "ok", time: new Date().toISOString() }));
