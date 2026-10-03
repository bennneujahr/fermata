// Regeln und Formate für Mitgliedschaft und Sicherheit (ui-member-b).
import { describe, expect, it } from "vitest";
import { hasRunningMembership, nextBillingDate } from "./billing-rules";
import type { BillingOverview } from "./billing-types";
import { buildCsp, STRIPE_CSP } from "./csp";
import { dateAndTime, eveningLabel, formatDayTime, formatReceipt } from "./datetime";
import { formatCents } from "./money";
import { isMemberPath, isStripePath } from "./routes";
import { activeShares, asReservation, fallbackHelpContacts, isZeroTolerance, shareableEvenings, tokenFromLocation, trustShareLink } from "./safety-rules";
import type { MyEvening, TrustShare } from "./safety-types";

const base: BillingOverview = {
  status: "free", tier: null, tier_name: null, contract_number: null, ordered_at: null, cancel_at: null, cancelled_at: null,
  withdrawn_at: null, free_phase: { active: true, ended_at: null }, current_period: null, available_evenings: 1, reserved_evenings: 0,
  can_receive_proposal: true, withdrawal: { possible: false, until: null }, cancellation: { possible: false, effective_at: null },
  tiers: [], vat_note: "inkl. 19 % USt", order_button_label: "", cancel_entry_label: "", withdraw_entry_label: "",
};

describe("Mitgliedschaft: was die Oberfläche anbietet", () => {
  it("neue Bestellung nur ohne laufende Mitgliedschaft", () => {
    expect(hasRunningMembership(base)).toBe(false);
    expect(hasRunningMembership({ ...base, status: "pending" })).toBe(false);
    expect(hasRunningMembership({ ...base, status: "active" })).toBe(true);
    expect(hasRunningMembership({ ...base, status: "past_due" })).toBe(true);
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(hasRunningMembership({ ...base, status: "cancelled", cancel_at: "2026-10-20T12:00:00Z" }, now)).toBe(true);
    expect(hasRunningMembership({ ...base, status: "cancelled", cancel_at: "2026-10-01T12:00:00Z" }, now)).toBe(false);
  });
  it("nächste Abbuchung nur bei aktiver Mitgliedschaft, Verlängerung zählt", () => {
    const period = { starts_at: "2026-10-01T10:00:00Z", ends_at: "2026-10-29T10:00:00Z", extended_until: null, extended_by_rule: false, evenings_allowed: 2 };
    expect(nextBillingDate({ ...base, status: "active", current_period: period })).toBe("2026-10-29T10:00:00Z");
    expect(nextBillingDate({ ...base, status: "active", current_period: { ...period, extended_until: "2026-11-26T10:00:00Z" } })).toBe("2026-11-26T10:00:00Z");
    expect(nextBillingDate({ ...base, status: "cancelled", current_period: period })).toBeNull();
  });
  it("Beträge mit Cent", () => {
    expect(formatCents(7450)).toMatch(/^74,50\s€$/);
    expect(formatCents(0)).toMatch(/^0,00\s€$/);
    expect(formatCents(null)).toMatch(/^0,00\s€$/);
  });
});

describe("Zeiten in Europe/Berlin", () => {
  it("Eingang mit Sekunden und Zeitzone", () => {
    expect(formatReceipt("2026-10-03T12:03:07Z")).toBe("03.10.2026, 14:03:07 Uhr (MESZ)");
    expect(formatReceipt("2026-12-03T12:03:07Z")).toBe("03.12.2026, 13:03:07 Uhr (MEZ)");
    expect(formatReceipt(null)).toBe("–");
    expect(dateAndTime("2026-10-03T12:03:07Z")).toEqual({ date: "03.10.2026", time: "14:03:07" });
  });
  it("Abend lesbar", () => {
    expect(formatDayTime("2026-10-10T17:30:00Z")).toBe("Samstag, 10. Oktober, 19:30 Uhr");
    expect(eveningLabel("2026-10-10T17:30:00Z", "Café am See")).toBe("Sa., 10.10.2026, 19:30 · Café am See");
    expect(eveningLabel(null, "Café am See")).toBe("Café am See");
  });
});

describe("CSP: Stripe nur auf der Bestellseite", () => {
  it("Wege", () => {
    expect(isStripePath("/mitgliedschaft/bestellen/andante")).toBe(true);
    expect(isStripePath("/mitgliedschaft/bestellen/ergebnis")).toBe(true);
    expect(isStripePath("/mitgliedschaft")).toBe(false);
    expect(isStripePath("/mitgliedschaft/bestellenx")).toBe(false);
    expect(isMemberPath("/sicherheit/melden")).toBe(true);
    expect(isMemberPath("/teilen")).toBe(false);
    expect(isMemberPath("/lokal/bestaetigen")).toBe(false);
  });
  it("ohne Stripe: keine Rahmen, keine fremden Ziele; mit Stripe: nur die Stripe-Ziele dazu", () => {
    const plain = buildCsp({ nonce: "n", supabaseUrl: "https://x.supabase.co" });
    expect(plain).toContain("frame-src 'none'");
    expect(plain).not.toContain("stripe");
    const stripe = buildCsp({
      nonce: "n",
      supabaseUrl: "https://x.supabase.co",
      extraConnect: [...STRIPE_CSP.connect],
      extraFrame: [...STRIPE_CSP.frame],
      extraScript: [...STRIPE_CSP.script],
      extraImg: [...STRIPE_CSP.img],
    });
    expect(stripe).toContain("script-src 'self' 'nonce-n' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com");
    expect(stripe).toContain("frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com");
    expect(stripe).toContain("connect-src 'self' https://x.supabase.co wss://x.supabase.co https://api.stripe.com");
    expect(stripe).not.toContain("unsafe-inline");
  });
});

describe("Sicherheit", () => {
  it("Schlüssel aus dem Fragment, nicht aus beliebigem Text", () => {
    expect(tokenFromLocation("#t=abcDEF123_-=xyz")).toBe("abcDEF123_-=xyz");
    expect(tokenFromLocation("", "?t=abcdefgh12")).toBe("abcdefgh12");
    expect(tokenFromLocation("#t=<script>")).toBeNull();
    expect(tokenFromLocation("#x=1")).toBeNull();
    const venue = "6f1c2c1e-1111-4222-8333-944444444444.1790000000.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(tokenFromLocation(`#t=${venue}`)).toBe(venue);
  });
  it("Link für die Vertrauensperson mit Schlüssel im Fragment", () => {
    expect(trustShareLink("https://app.fermata.example/", "tok123")).toBe("https://app.fermata.example/teilen#t=tok123");
    expect(trustShareLink("https://a.example", "tok", "https://a.example/functions/v1/trust-view?t=tok")).toBe("https://a.example/teilen#t=tok");
    expect(trustShareLink("https://a.example", "tok", "https://app.example/teilen#t=tok")).toBe("https://app.example/teilen#t=tok");
  });
  it("teilbare Abende: bestätigt, mit Zeit, höchstens 24 Stunden vorbei", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    const e = (id: string, state: string, starts: string | null): MyEvening => ({ evening_id: id, state, counterpart_first_name: "J", venue: null, starts_at: starts });
    const list = shareableEvenings(
      [e("a", "confirmed", "2026-10-05T17:00:00Z"), e("b", "proposed", "2026-10-05T17:00:00Z"), e("c", "confirmed", "2026-10-01T17:00:00Z"), e("d", "confirmed", "2026-10-03T10:00:00Z")],
      now,
    );
    expect(list.map((x) => x.evening_id)).toEqual(["d", "a"]);
    const shares: TrustShare[] = [
      { id: "1", evening_id: "a", created_at: "", expires_at: "", revoked_at: null, active: true },
      { id: "2", evening_id: "a", created_at: "", expires_at: "", revoked_at: "x", active: false },
      { id: "3", evening_id: "b", created_at: "", expires_at: "", revoked_at: null, active: true },
    ];
    expect(activeShares(shares, "a").map((s) => s.id)).toEqual(["1"]);
  });
  it("Null-Toleranz und Ersatz-Nummern", () => {
    expect(isZeroTolerance("uebergriff")).toBe(true);
    expect(isZeroTolerance("belaestigung")).toBe(false);
    const f = fallbackHelpContacts(undefined, "030 12074182", "So–Do 21–01 Uhr");
    expect(f.police).toMatchObject({ number: "110", tel: "110" });
    expect(f.emergency.tel).toBe("112");
    expect(f.heimwegtelefon).toMatchObject({ tel: "03012074182", hours: "So–Do 21–01 Uhr" });
  });
  it("Reservierung aus venue-confirm (JSON) lesen", () => {
    const r = { venue_name: "Café", starts_at: "2026-10-10T17:30:00Z", table_code: "AB12", reservation_name: "Fermata", persons: 2, status: "reserved", venue_confirmed_at: null };
    expect(asReservation(r)).toEqual(r);
    expect(asReservation({ reservation: r })).toEqual(r);
    expect(asReservation({ error: "not_found" })).toBeNull();
    expect(asReservation(null)).toBeNull();
  });
});
