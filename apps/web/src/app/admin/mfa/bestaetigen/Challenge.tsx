"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { mfa } from "@/copy/auth";
import { browserClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/routes";
import { normalizeOtp, OTP_RE } from "@/lib/validation";

export function Challenge() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("weiter"), "/admin");
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await browserClient().auth.mfa.listFactors();
      const f = (data?.totp as { id: string; status: string }[] | undefined)?.find((x) => x.status === "verified");
      setFactorId(f?.id ?? null);
    })();
  }, []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    const value = normalizeOtp(code);
    if (!OTP_RE.test(value)) {
      setError(mfa.invalid);
      return;
    }
    setBusy(true);
    const { error: err } = await browserClient().auth.mfa.challengeAndVerify({ factorId, code: value });
    if (err) {
      setBusy(false);
      setError(mfa.invalid);
      return;
    }
    router.replace(next.startsWith("/admin") ? next : "/admin");
    router.refresh();
  }

  if (factorId === undefined) return <p className="muted" role="status">{mfa.preparing}</p>;
  if (factorId === null) {
    return (
      <div className="stack">
        <Notice tone="info">{mfa.noFactor}</Notice>
        <ButtonLink href="/admin/mfa/einrichten">{mfa.toEnrol}</ButtonLink>
      </div>
    );
  }
  return (
    <form onSubmit={verify} noValidate className="stack">
      <Field
        label={mfa.codeLabel}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        className="input--code"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error}
        autoFocus
      />
      <Button type="submit" loading={busy}>
        {busy ? mfa.checking : mfa.submit}
      </Button>
    </form>
  );
}
