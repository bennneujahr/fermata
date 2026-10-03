"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { login } from "@/copy/auth";
import { browserClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/routes";
import { isEmail, normalizeEmail } from "@/lib/validation";

export const LOGIN_EMAIL_KEY = "fermata-login-email";

export function LoginForm({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const value = normalizeEmail(email);
    if (!isEmail(value)) {
      setError(login.invalidEmail);
      return;
    }
    setError(null);
    setBusy(true);
    const next = safeNext(params.get("weiter"), "/");
    const { error: err } = await browserClient().auth.signInWithOtp({
      email: value,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/anmelden/bestaetigen?weiter=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (err && (err.status === 429 || /rate|seconds/i.test(err.message))) {
      setNotice(login.rateLimited);
      return;
    }
    // Andere Fehler (z. B. nicht eingeladen) zeigen wir bewusst nicht: niemand soll erfahren,
    // ob eine Adresse bei Fermata ist. Die Code-Seite erklärt das.
    try {
      sessionStorage.setItem(LOGIN_EMAIL_KEY, value);
    } catch {
      /* ohne Speicher fragt die Code-Seite erneut */
    }
    router.push(`/anmelden/code?weiter=${encodeURIComponent(next)}`);
  }

  return (
    <form onSubmit={submit} noValidate className="stack">
      <Field
        label={login.emailLabel}
        hint={login.emailHint}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      {notice ? (
        <Notice tone="warning" live="polite">
          {notice}
        </Notice>
      ) : null}
      <Button type="submit" loading={busy} block iconAfter="arrowRight">
        {busy ? login.sending : login.submit}
      </Button>
    </form>
  );
}
