import { Suspense } from "react";
import { AuthCard } from "../auth-card";
import { getDict } from "@/i18n/server";
import { LoginForm } from "./login-form";

export const metadata = { title: "الدخول" };

export default async function LoginPage() {
  const { t } = await getDict();
  return (
    <AuthCard title={t.auth.loginTitle} refCode="AUTH-01">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
