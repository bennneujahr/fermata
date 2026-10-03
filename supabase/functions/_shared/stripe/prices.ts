// Preise bei Stripe: je Stufe ein wiederkehrender Preis alle 4 Wochen (interval=week, interval_count=4).
// Gefunden über einen lookup_key, der den Betrag enthält: Ändert sich der Preis in ops.app_settings,
// entsteht automatisch ein neuer Preis; bestehende Abos behalten ihren alten Preis.
// Alternativ feste Preis-IDs über STRIPE_PRICE_AUFTAKT, STRIPE_PRICE_ANDANTE, STRIPE_PRICE_LOGE.
import { optionalEnv } from "../env.ts";
import type { StripeClient } from "./client.ts";

export interface TierConfig {
  key: string;
  name: string;
  price_cents: number;
  evenings: number;
}

export function lookupKey(tier: TierConfig): string {
  return `fermata_${tier.key}_${tier.price_cents}_4w`;
}

export async function ensurePrice(client: StripeClient, tier: TierConfig, vatMode: string, currency = "eur"): Promise<string> {
  const fixed = optionalEnv(`STRIPE_PRICE_${tier.key.toUpperCase()}`);
  if (fixed) return fixed;
  const key = lookupKey(tier);
  const list = await client.request<{ data?: Array<{ id: string }> }>("GET", "/v1/prices", { lookup_keys: [key], active: true, limit: 1 });
  if (list.data?.[0]?.id) return list.data[0].id;
  const product = await client.request<{ id: string }>("POST", "/v1/products", {
    name: `Fermata Mitgliedschaft ${tier.name}`,
    metadata: { fermata_tier: tier.key },
  }, { idempotencyKey: `fermata-product-${key}` });
  const price = await client.request<{ id: string }>("POST", "/v1/prices", {
    product: product.id,
    currency,
    unit_amount: tier.price_cents,
    recurring: { interval: "week", interval_count: 4 },
    lookup_key: key,
    tax_behavior: vatMode === "kleinunternehmer" ? "unspecified" : "inclusive",
    metadata: { fermata_tier: tier.key, evenings: String(tier.evenings) },
  }, { idempotencyKey: `fermata-price-${key}` });
  return price.id;
}
