import { Suspense } from "react";
import { getDict } from "@/i18n/server";
import { AuthCard } from "../auth-card";
import { VerifyEmail } from "../token-forms";

export default async function Page() {
  const { t } = await getDict();
  return (
    <AuthCard title={t.auth.verifyTitle} refCode="AUTH-04">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
