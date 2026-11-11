import { getDict } from "@/i18n/server";
import { AuthCard } from "../auth-card";
import { RegisterForm } from "./register-form";

export const metadata = { title: "حساب جديد" };

export default async function RegisterPage() {
  const { t } = await getDict();
  return (
    <AuthCard title={t.auth.registerTitle} refCode="AUTH-02">
      <RegisterForm />
    </AuthCard>
  );
}
