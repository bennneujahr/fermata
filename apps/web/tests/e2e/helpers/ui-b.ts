// Testdaten für Mitgliedschaft und Sicherheit (ui-member-b): laufende Mitgliedschaft, bestätigter Abend mit
// Reservierung, Lokal-Link, Sanktion, Mails aus ops.mail_outbox. Alles direkt in der Stapel-Datenbank.
import { createHmac } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { sql } from "./backend";
import { stack } from "./env";

/** Bestellung wie billing-checkout (record_order) und bezahlte erste Rechnung wie stripe-webhook (apply_invoice_paid). */
export async function activeMembership(userId: string, tier = "andante"): Promise<{ contractNumber: string }> {
  const tag = userId.slice(0, 8);
  await sql`select billing.record_order(${userId}::uuid, ${tier}, billing.order_summary(${tier}), ${`cus_e2e_${tag}`}, ${`sub_e2e_${tag}`}, 'web')`;
  const [t] = await sql`select (billing.tier_config(${tier}) ->> 'price_cents')::int as cents`;
  await sql`
    select billing.apply_invoice_paid(${`sub_e2e_${tag}`}, ${`cus_e2e_${tag}`}, ${`in_e2e_${tag}`},
      app.now(), app.now() + interval '28 days', ${t!.cents as number}, ${`pi_e2e_${tag}`}, null, ${userId}::uuid)`;
  const [m] = await sql`select contract_number from billing.memberships where user_id = ${userId}::uuid`;
  return { contractNumber: m!.contract_number as string };
}

let venueCounter = 0;

/** Bestätigter Abend zwischen a und b in einem neuen Partner-Lokal (mit Tisch-Reservierung). */
export async function confirmedEvening(
  a: string,
  b: string,
  opts: { startsInMinutes?: number; venueName?: string } = {},
): Promise<{ eveningId: string; reservationId: string; tableCode: string; startsAt: Date; venueName: string }> {
  const venueName = opts.venueName ?? `Café am See ${++venueCounter}`;
  const minutes = opts.startsInMinutes ?? 2 * 24 * 60;
  const [v] = await sql`
    insert into app.venues (name, street, postal_code, city, lat, lon, public_transport, contact_email)
    values (${venueName}, 'Seestraße 1', '19053', 'Schwerin', 53.62, 11.41, 'Bus 10, Haltestelle Markt', 'tisch@cafe.example')
    returning id`;
  const [run] = await sql`insert into app.match_runs (scheduled_for, status) values (now(), 'approved') returning id`;
  const [p] = await sql`
    insert into app.pairings (run_id, user_a, user_b, total_score, venue_id, reasons_text, status)
    values (${run!.id}, least(${a}::uuid, ${b}::uuid), greatest(${a}::uuid, ${b}::uuid), 0.8, ${v!.id},
            'Sie gehen beide gern am Wasser spazieren.', 'proposed')
    returning id`;
  const [s] = await sql`
    insert into app.venue_slots (venue_id, starts_at, tables)
    values (${v!.id}, date_trunc('minute', app.now()) + make_interval(mins => ${minutes}), 2)
    returning starts_at`;
  const [e] = await sql`
    insert into app.evenings (pairing_id, user_a, user_b, starts_at, venue_id)
    values (${p!.id}, least(${a}::uuid, ${b}::uuid), greatest(${a}::uuid, ${b}::uuid), ${s!.starts_at}, ${v!.id})
    returning id`;
  await sql`select app.evening_transition(${e!.id}::uuid, 'request_time', least(${a}::uuid, ${b}::uuid))`;
  await sql`select app.evening_transition(${e!.id}::uuid, 'confirm', greatest(${a}::uuid, ${b}::uuid))`;
  const [r] = await sql`select id, table_code from app.evening_reservations where evening_id = ${e!.id}::uuid`;
  return { eveningId: e!.id as string, reservationId: r!.id as string, tableCode: r!.table_code as string, startsAt: s!.starts_at as Date, venueName };
}

/** Bestätigungslink für das Lokal wie _shared/notify/venue-token.ts (HMAC-SHA256, base64url). */
export function venueToken(reservationId: string, validHours = 72): string {
  const secret = stack.VENUE_LINK_SECRET ?? "fermata-local-venue-link-secret";
  const payload = `${reservationId}.${Math.floor(Date.now() / 1000) + validHours * 3600}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export async function sanction(userId: string, kind: "hinweis" | "sperre" = "hinweis", reason = "Bitte achten Sie auf einen freundlichen Ton."): Promise<string> {
  const [s] = await sql`insert into safety.sanctions (user_id, kind, reason) values (${userId}::uuid, ${kind}, ${reason}) returning id`;
  return s!.id as string;
}

/** Neueste Mail an diese Adresse mit dieser Vorlage (Edge Functions schreiben lokal in ops.mail_outbox). */
export async function waitForOutbox(to: string, template: string, after = new Date(0)): Promise<{ subject: string; text: string; html: string }> {
  for (let i = 0; i < 40; i++) {
    const [row] = await sql`
      select subject, text, html from ops.mail_outbox
      where recipient = ${to} and template = ${template} and created_at >= ${after}
      order by id desc limit 1`;
    if (row) return row as unknown as { subject: string; text: string; html: string };
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Keine Mail ${template} an ${to}`);
}

export function linkFromMail(text: string, contains: string): string {
  const m = new RegExp(`https?://[^\\s"<>]*${contains.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s"<>]*`).exec(text);
  if (!m) throw new Error(`Kein Link mit ${contains} in der Mail`);
  return m[0].replace(/&amp;/g, "&");
}

/**
 * Ersatz für Stripe.js im Browser (keine echten Schlüssel, kein Netz zu Stripe im Test):
 * loadStripe() bindet https://js.stripe.com/<train>/stripe.js ein; wir liefern ein kleines Skript mit
 * elements(), create("payment"), mount(), submit() und confirmPayment(). Merkt sich die Aufrufe in window.__stripeCalls.
 * submit() liefert mit opts.submitError einen Kartenfehler; confirmPayment schlägt fehl, wenn window.__stripeFail gesetzt ist.
 */
export async function fakeStripe(page: Page, opts: { submitError?: string } = {}): Promise<void> {
  const script = `
    (function () {
      window.__stripeCalls = [];
      var submitError = ${JSON.stringify(opts.submitError ?? null)};
      window.Stripe = function (key, opts) {
        window.__stripeCalls.push({ fn: "Stripe", key: key, locale: opts && opts.locale });
        return {
          elements: function (o) {
            window.__stripeCalls.push({ fn: "elements", mode: o.mode, amount: o.amount, currency: o.currency });
            return {
              create: function (type) {
                var handlers = {};
                return {
                  on: function (ev, cb) { handlers[ev] = cb; return this; },
                  mount: function (node) {
                    var el = typeof node === "string" ? document.querySelector(node) : node;
                    var box = document.createElement("div");
                    box.setAttribute("data-fake-stripe", type);
                    box.textContent = "Testkarte 4242 4242 4242 4242";
                    el.appendChild(box);
                    setTimeout(function () { handlers.ready && handlers.ready({}); }, 10);
                  },
                  destroy: function () {},
                };
              },
              submit: function () {
                window.__stripeCalls.push({ fn: "submit" });
                return Promise.resolve(submitError ? { error: { type: "card_error", message: submitError } } : {});
              },
            };
          },
          confirmPayment: function (o) {
            window.__stripeCalls.push({ fn: "confirmPayment", clientSecret: o.clientSecret, redirect: o.redirect, returnUrl: o.confirmParams && o.confirmParams.return_url });
            if (window.__stripeFail) return Promise.resolve({ error: { type: "card_error", message: "Ihre Karte wurde abgelehnt." } });
            return Promise.resolve({ paymentIntent: { status: "succeeded" } });
          },
        };
      };
    })();`;
  await page.route("https://js.stripe.com/**", (route: Route) => route.fulfill({ status: 200, contentType: "application/javascript", body: script }));
}
