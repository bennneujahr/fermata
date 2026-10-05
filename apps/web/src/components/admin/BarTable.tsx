import { TableWrap } from "@/components/ui";
import { adminCommon as c } from "@/copy/admin-common";
import { kNum } from "@/app/admin/_lib/format";

export interface BarRow {
  key: string;
  label: string;
  /** null = unterdrückt (k-Anonymität) */
  value: number | null;
  note?: string;
}

/**
 * Tabelle mit waagrechten Balken (Trichter, Verteilungen): Diagramm und Tabelle in einem,
 * Werte stehen immer als Zahl daneben (Farbe trägt keine Information allein).
 */
export function BarTable({ caption, rows, k = 5, labelHeader, valueHeader, max }: { caption: string; rows: BarRow[]; k?: number; labelHeader: string; valueHeader: string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <TableWrap label={caption}>
      <table className="table table--dense">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{labelHeader}</th>
            <th scope="col" className="bar-cell">
              <span className="visually-hidden">{c.chartValue}</span>
            </th>
            <th scope="col" className="num">
              {valueHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = r.value === null ? 0 : Math.round((r.value / top) * 100);
            return (
              <tr key={r.key}>
                <th scope="row">
                  {r.label}
                  {r.note ? <div className="muted text-sm">{r.note}</div> : null}
                </th>
                <td className="bar-cell" aria-hidden="true">
                  <span className="bar-track">
                    <span className={r.value === null ? "bar-fill bar-fill--hidden bar-w-8" : `bar-fill bar-w-${w}`} />
                  </span>
                </td>
                <td className="num" title={r.value === null ? c.kLessLong(k) : undefined}>
                  {kNum(r.value, k)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
