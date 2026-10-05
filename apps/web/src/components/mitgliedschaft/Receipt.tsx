"use client";
// Eingangsbestätigung nach Kündigung oder Widerruf: Datum und Uhrzeit mit Sekunden, zum Drucken oder Speichern.
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import "./mitgliedschaft.css";

export function Receipt({
  title,
  rows,
  children,
  printLabel,
}: {
  title: string;
  rows: { label: string; value: ReactNode; strong?: boolean }[];
  children?: ReactNode;
  printLabel: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <section className="card receipt stack" aria-labelledby="eingang-titel">
      <div className="receipt__head">
        <Icon name="checkCircle" size={30} />
        <h2 id="eingang-titel" ref={ref} tabIndex={-1}>
          {title}
        </h2>
      </div>
      <dl className="facts">
        {rows.map((r) => (
          <Fragment key={r.label}>
            <dt>{r.label}</dt>
            <dd className={r.strong ? "receipt__time" : undefined}>{r.value}</dd>
          </Fragment>
        ))}
      </dl>
      {children}
      <div className="no-print">
        <Button variant="secondary" size="sm" icon="download" onClick={() => window.print()}>
          {printLabel}
        </Button>
      </div>
    </section>
  );
}
