// Umgebungsvariablen der Web-App an einer Stelle.
// NEXT_PUBLIC_* landen im Browser-Bundle; alles andere bleibt auf dem Server.

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt");
  return v.replace(/\/$/, "");
}

export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt");
  return v;
}

/** Basis der Edge Functions (Standard: <Supabase-URL>/functions/v1). Nur Server. */
export function functionsUrl(): string {
  return (process.env.SUPABASE_FUNCTIONS_URL ?? `${supabaseUrl()}/functions/v1`).replace(/\/$/, "");
}

export type FermataEnv = "production" | "staging" | "local" | "test" | "ci";

export function fermataEnv(): FermataEnv {
  return (process.env.FERMATA_ENV ?? "production") as FermataEnv;
}

/** Fake-Ausweisprüfung (Simulationsseite) nur außerhalb von production und nur mit DIDIT_MODE=fake. */
export function diditFakeEnabled(): boolean {
  return process.env.DIDIT_MODE === "fake" && fermataEnv() !== "production";
}

export function diditFakeWebhookSecret(): string {
  return process.env.DIDIT_WEBHOOK_SECRET || "fermata-fake-didit-secret";
}

export function vapidPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined;
}
