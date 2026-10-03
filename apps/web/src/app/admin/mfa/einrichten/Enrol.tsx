"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { mfa } from "@/copy/auth";
import { browserClient } from "@/lib/supabase/browser";
import { normalizeOtp, OTP_RE } from "@/lib/validation";

interface Enrolment {
  factorId: string;
  qr: string;
  secret: string;
}

/** TOTP einrichten: alte, unbestätigte Faktoren entfernen, neuen anlegen, mit Code bestätigen (→ aal2). */
export function Enrol() {
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [failed, setFailed] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const auth = browserClient().auth;
      const { data: factors } = await auth.mfa.listFactors();
      type F = { id: string; status: string; factor_type: string };
      if ((factors?.totp as F[] | undefined)?.some((f) => f.status === "verified")) {
        router.replace("/admin/mfa/bestaetigen");
        return;
      }
      for (const f of (factors?.all as F[] | undefined) ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") await auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await auth.mfa.enroll({ factorType: "totp", friendlyName: "Fermata Admin" });
      if (err || !data) {
        setFailed(true);
        return;
      }
      setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [router]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!enrolment) return;
    const value = normalizeOtp(code);
    if (!OTP_RE.test(value)) {
      setError(mfa.invalid);
      return;
    }
    setBusy(true);
    const { error: err } = await browserClient().auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: value });
    if (err) {
      setBusy(false);
      setError(mfa.invalid);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  if (failed) return <Notice tone="danger">{mfa.enrolFailed}</Notice>;
  if (!enrolment) return <p className="muted" role="status">{mfa.preparing}</p>;

  return (
    <div className="stack">
      <p>{mfa.step1}</p>
      {/* QR-Code kommt als data:-URI von Supabase Auth (kein Dritter). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrolment.qr} alt={mfa.qrAlt} width={192} height={192} className="qr" />
      <p className="text-sm muted">{mfa.manual}</p>
      <p>
        <code className="secret" data-testid="totp-secret">
          {enrolment.secret}
        </code>
      </p>
      <form onSubmit={verify} noValidate className="stack">
        <p>{mfa.step2}</p>
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
        />
        <Button type="submit" loading={busy}>
          {busy ? mfa.checking : mfa.submit}
        </Button>
      </form>
    </div>
  );
}
