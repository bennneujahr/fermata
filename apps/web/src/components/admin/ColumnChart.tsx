import { TableWrap } from "@/components/ui";
import { adminCommon as c } from "@/copy/admin-common";
import { num } from "@/app/admin/_lib/format";

export interface Column {
  key: string;
  label: string;
  /** Kurze Beschriftung unter der Achse (sonst nur erste und letzte). */
  short?: string;
  value: number;
}

/**
 * Säulendiagramm in HTML (eine Reihe, daher ohne Legende). Höhen über Klassen bar-h-0 … bar-h-100,
 * weil die CSP keine Inline-Styles erlaubt. Für Screenreader eine Zusammenfassung und die Werte als Tabelle.
 */
export function ColumnChart({
  title,
  summary,
  columns,
  labelHeader,
  valueHeader,
  table = true,
}: {
  title: string;
  summary: string;
  columns: Column[];
  labelHeader: string;
  valueHeader: string;
  /** Eigene Werte-Tabelle zeigen (aus, wenn die Seite eine ausführlichere Tabelle hat). */
  table?: boolean;
}) {
  const max = Math.max(1, ...columns.map((x) => x.value));
  const first = columns[0];
  const last = columns[columns.length - 1];
  const all = columns.length <= 12 && columns.every((x) => x.short);
  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <div className="chart__plot" role="img" aria-label={summary}>
        <div className="chart__axis" aria-hidden="true">
          <span>{num(max)}</span>
          <span>{num(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <ol className="chart__cols" aria-hidden="true">
          {columns.map((x) => {
            const h = Math.round((x.value / max) * 100);
            return (
              <li key={x.key} className="chart__col" title={`${x.label}: ${num(x.value)}`}>
                <span className={`chart__bar ${h === 0 ? "chart__bar--zero" : `bar-h-${h}`}`} />
              </li>
            );
          })}
        </ol>
        <div className={all ? "chart__xlabels chart__xlabels--all" : "chart__xlabels"} aria-hidden="true">
          {all ? columns.map((x) => <span key={x.key}>{x.short}</span>) : (
            <>
              <span>{first?.label}</span>
              <span>{last?.label}</span>
            </>
          )}
        </div>
      </div>
      {table ? (
      <details className="values">
        <summary>{c.chartTable}</summary>
        <TableWrap label={title}>
          <table className="table table--dense">
            <thead>
              <tr>
                <th scope="col">{labelHeader}</th>
                <th scope="col" className="num">
                  {valueHeader}
                </th>
              </tr>
            </thead>
            <tbody>
              {columns.map((x) => (
                <tr key={x.key}>
                  <th scope="row">{x.label}</th>
                  <td className="num">{num(x.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </details>
      ) : null}
    </figure>
  );
}
