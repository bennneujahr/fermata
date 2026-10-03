"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { confirm } from "@/copy/auth";
import { browserClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/routes";

type OtpType = "email" | "magiclink" | "invite" | "signup" | "recovery" | "email_change";
const TYPES: OtpType[] = ["email", "magiclink", "invite", "signup", "recovery", "email_change"];

/**
 * Link aus der Mail: /anmelden/bestaetigen?token_hash=…&type=email.
 * Erst ein Klick löst die Anmeldung aus, damit Vorschau-Programme den Link nicht verbrauchen.
 * Fallback für PKCE (?code=…), falls der Link aus der Standardvorlage kommt.
 */
export function ConfirmLink() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  const rawType = params.get("type") ?? "email";
  const type: OtpType = (TYPES as string[]).includes(rawType) ? (rawType as OtpType) : "email";
  const next = safeNext(params.get("weiter"), "/");
  const providerError = params.get("error_description") ?? params.get("error");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(Boolean(providerError));

  if (!tokenHash && !code && !failed) {
    return <Notice tone="warning">{confirm.missing}</Notice>;
  }

  async function go() {
    setBusy(true);
    const auth = browserClient().auth;
    const { error } = tokenHash ? await auth.verifyOtp({ token_hash: tokenHash, type }) : await auth.exchangeCodeForSession(code!);
    if (error) {
      setBusy(false);
      setFailed(true);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (failed) {
    return (
      <div className="stack">
        <Notice tone="danger" live="assertive">
          {confirm.invalid}
        </Notice>
        <ButtonLink href="/anmelden" variant="secondary">
          {confirm.toLogin}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="soft">{confirm.lead}</p>
      <Button onClick={go} loading={busy} block iconAfter="arrowRight">
        {busy ? confirm.checking : confirm.submit}
      </Button>
      <p className="muted text-sm">{confirm.why}</p>
    </div>
  );
}
