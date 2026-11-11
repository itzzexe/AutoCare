import { route } from "@/server/http/handler";
import { adminPlans } from "@/server/modules/billing/service";
import { gatewayStatuses } from "@/server/modules/payments/gateways";

export const GET = route({ permission: "admin:billing" }, async () => ({ plans: await adminPlans(), gateways: gatewayStatuses() }));
