"use client";
// Supabase-Client im Browser: nur für die Anmeldung (Code/Link, TOTP). Die Sitzung liegt im Auth-Cookie,
// damit der Server sie lesen kann. Keine weiteren Cookies, kein localStorage für die Sitzung.
import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function browserClient() {
  if (!client) {
    client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return client;
}

/**
 * Nach erfolgreicher Anmeldung: Hilfs-Cookies des PKCE-Ablaufs entfernen (es bleibt nur das Auth-Cookie)
 * und die Seite vollständig neu laden, damit kein zwischengespeicherter Stand (z. B. eine frühere
 * Weiterleitung) des Routers greift.
 */
export function finishAuth(next: string): void {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && /^sb-.+-code-verifier$/.test(name)) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
  window.location.assign(next);
}
