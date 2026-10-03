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
