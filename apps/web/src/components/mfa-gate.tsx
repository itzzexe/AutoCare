import Link from "next/link";
import type { Dict } from "@/i18n/ar";
import type { AuthContext } from "@/server/modules/identity/sessions";
import { Container, Notice } from "./ui/bits";

/** Privileged pages: same rule as the API — MFA must be enrolled and verified in this session. */
export function MfaRequired({ auth, t }: { auth: AuthContext; t: Dict }) {
  return (
    <Container narrow>
      <Notice tone="warn" title={t.errors.mfa_required}>
        <p>{auth.user.mfaEnabled ? t.account.mfaRequiredRole : t.account.mfaRequiredRole}</p>
        <Link className="btn btn-sm mt-3" href="/account/security">{t.account.mfa}</Link>
      </Notice>
    </Container>
  );
}

export const needsMfa = (auth: AuthContext) => !auth.mfaVerified;
