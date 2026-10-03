import type { ReactNode } from "react";

/** Waagrecht scrollbare Tabelle: per Tastatur erreichbar (WCAG 2.1.1, axe scrollable-region-focusable). */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
