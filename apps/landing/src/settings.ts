// Einstellungen für den Build (die Seite ist statisch; geändert wird per neuem Build).
// Reihenfolge: Startwerte (= öffentliche Einstellungen aus supabase/migrations/*settings_seed.sql und
// *_waitlist.sql) → optional src/generated/settings.json (scripts/pull-settings.mjs lädt sie beim Build aus
// Supabase, wenn SUPABASE_URL und SUPABASE_ANON_KEY gesetzt sind) → einzelne Umgebungsvariablen (LANDING_*).
// Die Playwright-Tests prüfen, dass die Startwerte zur Datenbank passen.

import { defaults, type PricesMode, type Tier, type VatMode } from "./settings-defaults";

export { defaults };
export type { PricesMode, Tier, VatMode };
type Settings = typeof defaults;

const generated = Object.values(
  import.meta.glob<Partial<Settings>>("./generated/settings.json", { eager: true, import: "default" }),
)[0] ?? {};

function fromEnv(): Partial<Settings> {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  const out: Partial<Settings> = {};
  if (env.LANDING_HOERPROBE_ENABLED) out["landing.hoerprobe_enabled"] = env.LANDING_HOERPROBE_ENABLED === "true";
  if (env.LANDING_PRICES_MODE) out["landing.prices_mode"] = env.LANDING_PRICES_MODE as PricesMode;
  if (env.LANDING_VAT_MODE) out["landing.vat_mode"] = env.LANDING_VAT_MODE as VatMode;
  if (env.LANDING_START_MONTH) out["site.start_month"] = env.LANDING_START_MONTH;
  if (env.LANDING_CONTACT_EMAIL) out["site.contact_email"] = env.LANDING_CONTACT_EMAIL;
  return out;
}

const pick = (src: Record<string, unknown>): Partial<Settings> =>
  Object.fromEntries(Object.entries(src).filter(([k]) => k in defaults)) as Partial<Settings>;

export const settings: Settings = { ...defaults, ...pick(generated), ...fromEnv() };

/** Hörprobe-Datei (liegt in public/, erst nach dem Stimmen-Blindtest, Frage A4). */
export const hoerprobeSrc = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  ?.LANDING_HOERPROBE_SRC ?? "/hoerprobe/viola.mp3";

/** Basisadresse der Edge Functions (im Browser genutzt, landet in der CSP). */
export const functionsUrl = (import.meta.env.PUBLIC_FUNCTIONS_URL || "http://localhost:54331/functions/v1").replace(/\/$/, "");
export const functionsOrigin = new URL(functionsUrl).origin;

export function euro(cents: number): string {
  const v = cents / 100;
  return `${Number.isInteger(v) ? v.toString() : v.toFixed(2).replace(".", ",")} €`;
}
