import { Ltr, PageHeader, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { ROLE_LABELS } from "@/server/modules/identity/rbac";
import { requireAuth } from "@/server/http/session";

export default async function AccountHome() {
  const auth = await requireAuth("/account");
  const { t, locale } = await getDict();
  const u = auth.user;
  return (
    <>
      <PageHeader title={u.displayName} kicker={t.account.profile} />
      <dl className="ticket grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 p-5 text-sm">
        <dt className="text-ink-3">{t.auth.email}</dt><dd><Ltr>{u.email}</Ltr> {u.emailVerified ? <Stamp tone="ok">✓</Stamp> : <Stamp tone="warn">{t.common.unknown}</Stamp>}</dd>
        <dt className="text-ink-3">{t.common.status}</dt><dd className="flex flex-wrap gap-1">{u.roles.map((r) => <Stamp key={r} tone="info">{ROLE_LABELS[r][locale]}</Stamp>)}</dd>
        <dt className="text-ink-3">{t.account.mfa}</dt><dd>{u.mfaEnabled ? <Stamp tone="ok">{t.account.mfaOn}</Stamp> : <Stamp tone="neutral">{t.account.mfaOff}</Stamp>}</dd>
      </dl>
    </>
  );
}
