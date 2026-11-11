import { Suspense } from "react";
import { getDict } from "@/i18n/server";
import { AuthCard } from "../auth-card";
import { ResetForm } from "../token-forms";

export default async function Page() {
  const { t } = await getDict();
  return (
    <AuthCard title={t.auth.resetTitle} refCode="AUTH-06">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
