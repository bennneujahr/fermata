// Kontakttausch aus eigener Sicht: nur, was das Gegenüber freigegeben hat. Ein Nein wird nie gezeigt.
import { Card } from "@/components/ui";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import type { ContactShare } from "@/lib/evening-types";
import { telHref } from "@/lib/format";

export function ContactResult({ share, form, name }: { share: ContactShare; form: AddressForm; name: string | null }) {
  const c = abende(form);
  const mine = share.mine ? [share.mine.share_email && c.shareEmail, share.mine.share_phone && c.sharePhone].filter(Boolean).join(", ") : "";
  if (share.status === "released" && share.counterpart) {
    const cp = share.counterpart;
    return (
      <Card title={c.contactReleasedTitle(cp.first_name ?? name)} id="kontakt" variant="accent">
        <p className="soft">{c.contactReleasedText}</p>
        <dl className="facts contact-facts">
          {cp.email ? (
            <>
              <dt>{c.email}</dt>
              <dd>
                <a href={`mailto:${cp.email}`}>{cp.email}</a>
              </dd>
            </>
          ) : null}
          {cp.phone ? (
            <>
              <dt>{c.phone}</dt>
              <dd>
                <a href={telHref(cp.phone)}>{cp.phone}</a>
              </dd>
            </>
          ) : null}
        </dl>
        {mine ? (
          <p className="muted text-sm">
            {c.contactMine} {mine}
          </p>
        ) : null}
        <p className="muted text-sm">{c.contactNoteApp}</p>
      </Card>
    );
  }
  return (
    <Card title={c.contactTitle} id="kontakt" variant="sunk">
      <p className="soft">{share.status === "pending" ? c.contactPending : share.status === "closed" ? c.contactClosed : c.contactNone}</p>
      {mine && share.status === "pending" ? (
        <p className="muted text-sm">
          {c.contactMine} {mine}
        </p>
      ) : null}
    </Card>
  );
}
