import { publicRoute } from "@/server/http/handler";
import { openApiDocument } from "@/server/http/openapi";

export const GET = publicRoute({ auth: "none" }, async () => openApiDocument());
