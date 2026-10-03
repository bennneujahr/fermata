// Startwerte der Einstellungen (= öffentliche Einstellungen aus supabase/migrations/*settings_seed.sql und
// *_waitlist.sql). Ohne Vite-Abhängigkeiten, damit die Tests sie mit der Datenbank vergleichen können.
export type PricesMode = "geplant" | "fest" | "aus";
export type VatMode = "inkl_ust" | "kleinunternehmer";
export interface Tier {
  name: string;
  price_cents: number;
  evenings: number;
}

export const defaults = {
  "landing.hoerprobe_enabled": false as boolean,
  "landing.prices_mode": "geplant" as PricesMode,
  "landing.vat_mode": "inkl_ust" as VatMode,
  "safety.heimwegtelefon_number": "030 12074182",
  "safety.heimwegtelefon_hours": "So–Do 21–01 Uhr, Fr/Sa 21–03 Uhr",
  "safety.emergency_number": "110",
  "site.contact_email": "hallo@fermata.example",
  "site.start_month": null as string | null,
  "waitlist.bonus_places": 50,
  "waitlist.founding_limit": 500,
  "waitlist.founding_region_group": "westmecklenburg",
  "waitlist.consent_version": "warteliste-2026-10-03-entwurf",
  "billing.period_days": 28,
  "billing.free_until_first_evening": true as boolean,
  "billing.tiers": {
    auftakt: { name: "Auftakt", price_cents: 4900, evenings: 1 },
    andante: { name: "Andante", price_cents: 14900, evenings: 2 },
    loge: { name: "Loge", price_cents: 29900, evenings: 4 },
  } as Record<"auftakt" | "andante" | "loge", Tier>,
};
