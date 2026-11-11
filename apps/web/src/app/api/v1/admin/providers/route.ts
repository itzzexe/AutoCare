import { route } from "@/server/http/handler";
import * as admin from "@/server/modules/admin/service";

export const GET = route({ permission: "admin:providers" }, async () => admin.providerOverview());
