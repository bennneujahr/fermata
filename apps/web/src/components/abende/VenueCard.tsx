import { Card } from "@/components/ui";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import type { Venue } from "@/lib/evening-types";

/** Lokal mit Adresse, Anreise mit Bus und Bahn und Barrierefreiheit (öffentliche Angaben). */
export function VenueCard({ venue, form }: { venue: Venue; form: AddressForm }) {
  const c = abende(form);
  return (
    <Card title={venue.name} eyebrow={c.venueTitle} id="lokal">
      {venue.description ? <p className="soft">{venue.description}</p> : null}
      <dl className="facts">
        <dt>{c.address}</dt>
        <dd>
          <address className="venue-address">
            {venue.street}
            <br />
            {[venue.postal_code, venue.city].filter(Boolean).join(" ")}
          </address>
        </dd>
        <dt>{c.transport}</dt>
        <dd>{venue.public_transport || <span className="muted">{c.noInfo}</span>}</dd>
        <dt>{c.accessibility}</dt>
        <dd>{venue.accessibility || <span className="muted">{c.noInfo}</span>}</dd>
      </dl>
      <p className="muted text-sm">{c.mapHint}</p>
    </Card>
  );
}
