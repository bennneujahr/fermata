"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { code as copy, login } from "@/copy/auth";
import { status } from "@/copy/common";
import { browserClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/routes";
import { isEmail, normalizeEmail, normalizeOtp, OTP_RE } from "@/lib/validation";
import { LOGIN_EMAIL_KEY } from "../LoginForm";

const RESEND_SECONDS = 60;

export function CodeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("weiter"), "/");
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(LOGIN_EMAIL_KEY);
    } catch {
      stored = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- E-Mail kommt aus dem sessionStorage dieses Tabs
    setEmail(stored);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    const value = normalizeOtp(token);
    if (!OTP_RE.test(value)) {
      setError(copy.format);
      return;
    }
    if (!email) return;
    setError(null);
    setBusy(true);
    const { error: err } = await browserClient().auth.verifyOtp({ email, token: value, type: "email" });
    if (err) {
      setBusy(false);
      setError(copy.invalid);
      return;
    }
    try {
      sessionStorage.removeItem(LOGIN_EMAIL_KEY);
    } catch {
      /* egal */
    }
    router.replace(next);
    router.refresh();
  }

  async function resend() {
    if (!email || wait > 0) return;
    setInfo(null);
    await browserClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/anmelden/bestaetigen?weiter=${encodeURIComponent(next)}` },
    });
    setWait(RESEND_SECONDS);
    setInfo(copy.resent);
  }

  function useEmail(e: FormEvent) {
    e.preventDefault();
    const v = normalizeEmail(emailInput);
    if (!isEmail(v)) {
      setError(login.invalidEmail);
      return;
    }
    setError(null);
    try {
      sessionStorage.setItem(LOGIN_EMAIL_KEY, v);
    } catch {
      /* egal */
    }
    setEmail(v);
  }

  if (!loaded) return <p className="muted">{status.loading}</p>;

  if (!email) {
    return (
      <form onSubmit={useEmail} noValidate className="stack">
        <p>{copy.leadNoEmail}</p>
        <Field
          label={login.emailLabel}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" block>
          {copy.submit}
        </Button>
      </form>
    );
  }

  return (
    <div className="stack">
      <p className="soft">{copy.lead(email)}</p>
      <form onSubmit={verify} noValidate className="stack">
        <Field
          label={copy.label}
          hint={copy.hint}
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={9}
          className="input--code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          error={error}
          required
          autoFocus
        />
        <Button type="submit" loading={busy} block>
          {busy ? copy.checking : copy.submit}
        </Button>
      </form>
      {info ? (
        <Notice tone="success" live="polite">
          {info}
        </Notice>
      ) : null}
      <div className="cluster">
        <Button variant="quiet" onClick={resend} disabled={wait > 0} aria-describedby="resend-wait">
          {copy.resend}
        </Button>
        {wait > 0 ? (
          <span id="resend-wait" className="muted text-sm">
            {copy.resendWait(wait)}
          </span>
        ) : null}
      </div>
      <p className="muted text-sm">{copy.noMail}</p>
      <p className="text-sm">
        <Link href={`/anmelden?weiter=${encodeURIComponent(next)}`}>{copy.otherEmail}</Link>
      </p>
    </div>
  );
}
