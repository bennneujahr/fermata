import type { ReactNode } from "react";

/** Kennzahlen als Beschreibungsliste (Wert groß, Beschriftung darunter). */
export function Figures({ items }: { items: { label: ReactNode; value: ReactNode; key?: string }[] }) {
  return (
    <dl className="kpi__figures">
      {items.map((i, n) => (
        <div className="kpi__figure" key={i.key ?? n}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
