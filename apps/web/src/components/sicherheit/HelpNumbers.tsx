// Hilfe-Nummern als große Telefon-Knöpfe: tel:-Link plus die Nummer als Text (auch ohne Telefon lesbar).
// Ohne Hooks, damit Server- und Client-Komponenten sie nutzen können.
import { Icon } from "@/components/ui/Icon";
import { phones } from "@/copy/sicherheit";
import type { AddressForm } from "@/copy/form";
import type { HelpContacts } from "@/lib/safety-types";
import "./sicherheit.css";

function Call({ tel, label, sub, emergency }: { tel: string; label: string; sub?: string | null; emergency?: boolean }) {
  return (
    <a href={`tel:${tel}`} className={["call", emergency && "call--emergency"].filter(Boolean).join(" ")}>
      <span className="call__icon">
        <Icon name="phone" />
      </span>
      <span className="call__text">
        <span>{label}</span>
        {sub ? <span className="call__sub">{sub}</span> : null}
      </span>
    </a>
  );
}

/** Notruf 110 als großer roter Knopf. */
export function PoliceCall({ contacts, form }: { contacts: HelpContacts; form: AddressForm }) {
  const c = phones(form);
  return <Call tel={contacts.police.tel} label={c.policeCta(contacts.police.number)} emergency />;
}

export function HeimwegCall({ contacts, form }: { contacts: HelpContacts; form: AddressForm }) {
  const c = phones(form);
  const h = contacts.heimwegtelefon;
  if (!h) return null;
  return <Call tel={h.tel} label={c.heimwegCta(h.number)} sub={h.hours ? c.hours(h.hours) : null} />;
}

/**
 * Alle Hilfe-Nummern. variant="urgent": 110 zuerst und groß, dann 112 und Heimwegtelefon (Check-in „Hilfe“).
 * variant="full": alles mit Erklärung (Hilfe-Seite).
 */
export function HelpNumbers({
  contacts,
  form,
  variant = "full",
  headingLevel = 3,
  showPolice = true,
}: {
  contacts: HelpContacts;
  form: AddressForm;
  variant?: "full" | "urgent" | "compact";
  headingLevel?: 2 | 3;
  showPolice?: boolean;
}) {
  const c = phones(form);
  const H = `h${headingLevel}` as "h2" | "h3";
  const h = contacts.heimwegtelefon;
  const ts = contacts.telefonseelsorge;
  const g = contacts.hilfetelefon_gewalt;
  return (
    <div className={`help-numbers help-numbers--${variant}`}>
      {showPolice ? (
        <div className="help-numbers__item help-numbers__item--police">
          <Call tel={contacts.police.tel} label={c.policeCta(contacts.police.number)} emergency />
          {variant !== "compact" ? <p className="help-numbers__note">{c.policeText}</p> : null}
        </div>
      ) : null}
      {variant !== "compact" ? (
        <div className="help-numbers__item">
          <Call tel={contacts.emergency.tel} label={c.emergencyCta(contacts.emergency.number)} sub={c.emergencyText} />
        </div>
      ) : null}
      {h ? (
        <div className="help-numbers__item">
          {variant === "full" ? <H className="help-numbers__title">{c.heimwegTitle}</H> : null}
          {variant === "full" ? <p className="help-numbers__text soft">{c.heimwegText}</p> : null}
          <Call tel={h.tel} label={c.heimwegCta(h.number)} sub={h.hours ? c.hours(h.hours) : null} />
        </div>
      ) : null}
      {variant !== "compact" && g ? (
        <div className="help-numbers__item">
          {variant === "full" ? <H className="help-numbers__title">{c.gewaltTitle}</H> : null}
          {variant === "full" ? <p className="help-numbers__text soft">{c.gewaltText}</p> : null}
          <Call tel={g.tel} label={variant === "full" ? c.call(g.number) : `${c.gewaltTitle}: ${g.number}`} sub={g.hours ?? null} />
        </div>
      ) : null}
      {variant === "full" && ts?.numbers?.length ? (
        <div className="help-numbers__item">
          <H className="help-numbers__title">{c.seelsorgeTitle}</H>
          <p className="help-numbers__text soft">
            {c.seelsorgeText}
            {ts.hours ? ` ${ts.hours.charAt(0).toUpperCase()}${ts.hours.slice(1)}.` : null}
          </p>
          <ul className="list-plain help-numbers__list" aria-label={c.seelsorgeTitle}>
            {ts.numbers.map((n, i) => (
              <li key={n}>
                <Call tel={ts.tels?.[i] ?? n.replace(/[^\d+]/g, "")} label={c.call(n)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
