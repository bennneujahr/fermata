// Finde-Fenster (15 Minuten vor bis 45 Minuten nach Beginn): Reservierung, Tisch-Code, Vorname und Erkennungszeichen.
import { ButtonLink } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { formatClock } from "@/lib/berlin";
import type { FindInfo } from "@/lib/evening-types";

export function FindCard({ info, form, href, full }: { info: FindInfo; form: AddressForm; href?: string; full?: boolean }) {
  const c = abende(form);
  const name = c.findCounterpart(info.counterpart_first_name);
  return (
    <section className={["card", "card--night", "find-card", full && "find-card--full"].filter(Boolean).join(" ")} aria-labelledby="finden-titel" id="finden">
      <div className="card__header">
        <p className="eyebrow">{`${formatClock(info.opens_at)} – ${formatClock(info.closes_at)}`}</p>
        <h2 className="card__title" id="finden-titel">
          {c.findTitle}
        </h2>
      </div>
      <p className="find-card__ask">{c.findAsk(info.reservation_name)}</p>
      {info.table_code ? (
        <div className="find-card__code">
          <span className="find-card__code-label">{c.tableCode}</span>
          <span className="table-code table-code--large">{info.table_code}</span>
        </div>
      ) : null}
      <div className="find-card__person">
        <Icon name="account" size={28} />
        <div>
          <p className="find-card__name">{name}</p>
          <p className="find-card__hint">
            {info.counterpart_hint ? (
              <>
                <span className="find-card__hint-label">{c.findCounterpartHint}: </span>
                {info.counterpart_hint}
              </>
            ) : (
              c.findNoHint
            )}
          </p>
        </div>
      </div>
      {info.my_hint ? (
        <p className="find-card__mine">
          {c.findMyHint}: {info.my_hint}
        </p>
      ) : null}
      {href && !full ? (
        <div>
          <ButtonLink href={href} variant="secondary" iconAfter="arrowRight">
            {c.findOpenCta}
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}
