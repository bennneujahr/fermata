import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { legal } from "@/copy/help";

export const metadata: Metadata = { title: legal.title };

const ORDER = ["impressum", "datenschutz", "agb", "datenschutz_kenntnis", "ki_hinweis", "art9_profile", "art9_religion", "art9_health", "biometrie", "gespraech", "push", "kontakttausch"];

export default function LegalIndex() {
  return (
    <div className="stack stack-lg">
      <PageHeader title={legal.title} lead={legal.lead} />
      <Card>
        <ul className="list-plain list-divided">
          {ORDER.map((k) => (
            <li key={k}>
              <Link href={`/rechtliches/${k}`}>{legal.kinds[k]}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
