import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { consents as consentsCopy } from "@/copy/member";
import { getConsents, requireMember } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { RevokeButton } from "./RevokeButton";
import { titles } from "@/copy/titles";
import { nav } from "@/copy/common";

export const metadata: Metadata = { title: titles.einwilligungen };

const NOT_REVOCABLE = new Set(["agb", "datenschutz_kenntnis"]);

export default async function ConsentsPage() {
  const [{ form }, list] = await Promise.all([requireMember("/konto/einwilligungen"), getConsents()]);
  const c = consentsCopy(form);
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/konto">{nav.backToAccount}</Link>
      </p>
      <PageHeader title={c.title} lead={c.lead} />
      <Card>
        <ul className="list-plain list-divided">
          {list.map((k) => (
            <li key={k.kind} className="stack stack-sm">
              <div className="cluster">
                <h2 className="card__title">{c.kinds[k.kind] ?? k.kind}</h2>
                <Badge tone={k.required ? "wine" : undefined}>{k.required ? c.required : c.optional}</Badge>
                {k.needs_renewal ? <Badge tone="warning">{c.renewal}</Badge> : null}
              </div>
              <p className={k.granted ? "soft" : "muted"}>{k.granted && k.at ? c.granted(formatDate(k.at)) : c.notGranted}</p>
              <div className="cluster">
                <Link href={`/rechtliches/${k.kind}`} className="text-sm">
                  {c.read}
                </Link>
                {k.granted && !NOT_REVOCABLE.has(k.kind) ? (
                  <RevokeButton kind={k.kind} title={c.revokeTitle} text={c.revokeText[k.kind] ?? ""} confirmLabel={c.revokeConfirm} label={c.revoke} doneLabel={c.revoked} />
                ) : null}
              </div>
              {k.granted && NOT_REVOCABLE.has(k.kind) ? <p className="muted text-sm">{c.notRevocable}</p> : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
