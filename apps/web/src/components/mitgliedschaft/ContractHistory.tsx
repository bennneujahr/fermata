// Verlauf der Vertragserklärungen (Bestellung, Kündigung, Widerruf) mit Datum und Uhrzeit.
import { Icon } from "@/components/ui/Icon";
import type { AddressForm } from "@/copy/form";
import { membership } from "@/copy/mitgliedschaft";
import type { ContractAction } from "@/lib/billing-types";
import { formatReceipt } from "@/lib/datetime";
import { formatDate } from "@/lib/format";
import "./mitgliedschaft.css";

export function ContractHistory({ items, form }: { items: ContractAction[] | null; form: AddressForm }) {
  const c = membership(form);
  if (items === null) return <p className="muted">{c.historyUnavailable}</p>;
  if (!items.length) return <p className="muted">{c.historyEmpty}</p>;
  return (
    <ol className="list-plain list-divided" aria-label={c.historyTitle}>
      {items.map((a) => (
        <li key={a.id} className="history__item">
          <span className="history__what">
            {c.historyKinds[a.kind] ?? a.kind}
            {a.contract_number ? <span className="muted"> · {a.contract_number}</span> : null}
          </span>
          <span className="history__meta">
            {formatReceipt(a.at)}
            {a.kind !== "order" && a.effective_at ? ` · ${c.historyEffective(formatDate(a.effective_at))}` : null}
            {a.confirmation_sent_at ? (
              <span className="cluster">
                <Icon name="mail" size={16} />
                {c.historyMailed}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
