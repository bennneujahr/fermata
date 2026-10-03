import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { deletion } from "@/copy/member";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Konto löschen" };

// Löschung, Schritt 1: was gelöscht wird und was bleibt.
export default async function DeletePage() {
  const { form } = await requireMember("/konto/loeschen");
  const c = deletion(form);
  return (
    <div className="stack stack-lg">
      <p>
        <Link href="/konto">Konto</Link>
      </p>
      <PageHeader eyebrow={c.step1} title={c.title} lead={c.lead} />
      <div className="grid-auto">
        <Card title={c.whatTitle} headingLevel={2}>
          <ul className="list-check list-plain stack stack-sm">
            {c.what.map((w) => (
              <li key={w}>
                <Icon name="trash" size={18} />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={c.keepTitle} headingLevel={2} variant="sunk">
          <ul className="list-check list-plain stack stack-sm">
            {c.keep.map((w) => (
              <li key={w}>
                <Icon name="lock" size={18} />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="soft">
        {c.exportHint} <Link href="/konto/daten">Daten herunterladen</Link>
      </p>
      <div className="cluster">
        <ButtonLink href="/konto/loeschen/bestaetigen" variant="danger" iconAfter="arrowRight">
          {c.continue}
        </ButtonLink>
        <ButtonLink href="/konto" variant="secondary">
          {c.cancel}
        </ButtonLink>
      </div>
    </div>
  );
}
