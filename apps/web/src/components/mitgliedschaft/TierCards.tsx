// Stufen mit Preis, Abenden und USt-Hinweis (api.billing_tiers bzw. billing_overview().tiers).
// Der Link zur Bestellung ist ein normaler Link (ganzer Seitenaufruf): Nur so bekommt die Bestellseite ihre
// eigene CSP mit Stripe (src/proxy.ts). Ein Wechsel per Client-Navigation würde die CSP der alten Seite behalten.
import { Badge, buttonClass } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { AddressForm } from "@/copy/form";
import { membership } from "@/copy/mitgliedschaft";
import type { Tier } from "@/lib/billing-types";
import "./mitgliedschaft.css";

export function orderHref(tier: string): string {
  return `/mitgliedschaft/bestellen/${encodeURIComponent(tier)}`;
}

export function TierCards({
  tiers,
  form,
  currentTier,
  canOrder,
}: {
  tiers: Tier[];
  form: AddressForm;
  currentTier?: string | null;
  /** false, solange eine Mitgliedschaft läuft (neue Bestellung erst danach). */
  canOrder: boolean;
}) {
  const c = membership(form);
  return (
    <ul className="tier-grid list-plain">
      {tiers.map((t) => {
        const current = currentTier === t.key;
        return (
          <li key={t.key} className={["card", "card--outline", "tier", current && "tier--current"].filter(Boolean).join(" ")}>
            <div className="stack stack-sm">
              <div className="tier__head">
                <h3>{t.name}</h3>
                {current ? <Badge tone="wine">{c.currentTier}</Badge> : null}
              </div>
              <div className="tier__price">
                <span className="stat__value">{t.price_display}</span>
                <span className="stat__label">
                  {c.perPeriod} · {t.vat_note}
                </span>
              </div>
              <div className="tier__facts">
                <span className="cluster">
                  <Icon name="evening" size={18} />
                  {c.eveningsPerPeriod(t.evenings)}
                </span>
                {t.note ? <span>{t.note}</span> : null}
              </div>
            </div>
            <div className="tier__action">
              {!t.orderable ? (
                <p className="muted text-sm">{c.notOrderable}</p>
              ) : canOrder ? (
                <a href={orderHref(t.key)} className={buttonClass({ variant: current ? "secondary" : "primary", block: true })}>
                  <span>{c.choose(t.name)}</span>
                  <Icon name="arrowRight" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
