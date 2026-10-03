// Sicher unterwegs: Abend teilen, Check-in, Melden, Hilfe. Die Seiten dazu baut der Bereich Sicherheit.
import Link from "next/link";
import { Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import type { eveningLinks } from "@/lib/evening-links";

export function SafetyCard({ form, links, showCheckin, showShare }: { form: AddressForm; links: ReturnType<typeof eveningLinks>; showCheckin: boolean; showShare: boolean }) {
  const c = abende(form);
  const items: { href: string; label: string; text: string; icon: IconName }[] = [
    ...(showShare ? [{ href: links.share, label: c.shareLink, text: c.shareText, icon: "share" as IconName }] : []),
    ...(showCheckin ? [{ href: links.checkin, label: c.checkinLink, text: c.checkinText, icon: "checkCircle" as IconName }] : []),
    { href: links.report, label: c.reportLink, text: c.reportText, icon: "flag" },
    { href: links.help, label: c.helpLink, text: "", icon: "help" },
  ];
  return (
    <Card title={c.safetyTitle} id="sicherheit" variant="outline">
      <ul className="list-plain safety-links">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="safety-link">
              <span className="safety-link__icon" aria-hidden="true">
                <Icon name={i.icon} />
              </span>
              <span className="safety-link__text">
                <span className="safety-link__label">{i.label}</span>
                {i.text ? <span className="safety-link__sub">{i.text}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
