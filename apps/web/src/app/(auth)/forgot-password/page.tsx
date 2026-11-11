import { getDict } from "@/i18n/server";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "../token-forms";

export default async function Page() {
  const { t } = await getDict();
  return (
    <AuthCard title={t.auth.forgotTitle} refCode="AUTH-05">
      <ForgotForm />
    </AuthCard>
  );
}
