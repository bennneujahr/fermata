// Bericht eines Auswahl-Laufs (app.match_runs.report): Pool, Filter, Scores, Ergebnis, Fairness (k-anonym), Lokale, Prüfung, Kosten, Laufzeit.
import { ColumnChart } from "@/components/admin/ColumnChart";
import { Card, TableWrap } from "@/components/ui";
import { euro, labelOf, num, pct, score, usd } from "@/app/admin/_lib/format";
import type { FairnessGroups, RunReport } from "@/app/admin/_lib/types";
import { adminRuns } from "@/copy/admin-auswahl";

const r = adminRuns.report;

function CountTable({ caption, rows, labels, total, hideCaption }: { caption: string; rows: Record<string, number> | undefined; labels: Record<string, string>; total?: { label: string; value: number | undefined }; hideCaption?: boolean }) {
  const entries = Object.entries(rows ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <TableWrap label={caption}>
      <table className="table table--dense">
        <caption className={hideCaption ? "visually-hidden" : "table__caption"}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{r.reason}</th>
            <th scope="col" className="num">
              {r.count}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={2} className="muted">
                –
              </td>
            </tr>
          ) : (
            entries.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{labelOf(labels, k)}</th>
                <td className="num">{num(v)}</td>
              </tr>
            ))
          )}
        </tbody>
        {total ? (
          <tfoot>
            <tr>
              <th scope="row">{total.label}</th>
              <td className="num">{num(total.value)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </TableWrap>
  );
}

function Fairness({ caption, data }: { caption: string; data: FairnessGroups | undefined }) {
  if (!data) return null;
  return (
    <TableWrap label={caption}>
      <table className="table table--dense">
        <caption className="table__caption">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{r.group}</th>
            <th scope="col" className="num">
              {r.inPoolCol}
            </th>
            <th scope="col" className="num">
              {r.proposedCol}
            </th>
            <th scope="col" className="num">
              {r.shareCol}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.gruppen.map((g) => (
            <tr key={g.gruppe}>
              <th scope="row">{r.genders[g.gruppe] ?? g.gruppe}</th>
              <td className="num">{num(g.im_pool)}</td>
              <td className="num">{g.vorgeschlagen === null ? r.tooFew : num(g.vorgeschlagen)}</td>
              <td className="num">{g.anteil === null ? "–" : pct(g.anteil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.unterdrueckt?.anzahl_gruppen ? <p className="muted text-sm">{r.hidden(data.unterdrueckt.anzahl_gruppen, data.unterdrueckt.im_pool)}</p> : null}
    </TableWrap>
  );
}

export function RunReportView({ report }: { report: RunReport }) {
  if (!report || Object.keys(report).length === 0) return <p className="muted">{r.empty}</p>;
  const scores = report.scores ?? {};
  const q = scores.qualitaet;
  const hist = q?.histogramm ?? [];
  const llm = report.llm ?? {};
  const t = llm.token ?? {};
  const k = report.fairness?.k ?? 5;
  return (
    <div className="stack">
      <div className="two-col">
        <Card title={r.pool} headingLevel={3}>
          <p className="soft text-sm">{r.poolLead}</p>
          <CountTable hideCaption caption={r.pool} rows={report.pool?.ausgeschlossen} labels={r.poolReasons} total={{ label: r.inPool, value: report.pool?.im_pool }} />
          <p className="muted text-sm">
            {r.accounts}: {num(report.pool?.konten)}
          </p>
        </Card>
        <Card title={r.filter} headingLevel={3}>
          <p className="soft text-sm">{r.filterLead}</p>
          <CountTable hideCaption caption={r.filter} rows={report.filter?.verworfen} labels={r.filterReasons} total={{ label: r.passed, value: report.filter?.paare_bestanden }} />
          <p className="muted text-sm">
            {r.checked}: {num(report.filter?.paare_geprueft)} · {r.preselect}: {num(report.vorauswahl?.paare)}
            {report.mindestscore ? ` · ${r.minScore(score(report.mindestscore.wert))}: ${num(report.mindestscore.paare_darueber)}` : ""}
          </p>
        </Card>
      </div>

      <Card title={r.scores} headingLevel={3}>
        <p className="soft text-sm">{r.scoresLead}</p>
        {hist.length > 0 ? (
          <ColumnChart
            title={r.histogram}
            summary={r.histogramLabel(q?.anzahl ?? 0)}
            columns={hist.map((h) => ({ key: String(h.von), label: r.bucket(score(h.von), score(h.bis)), short: num(h.von, 1), value: h.anzahl }))}
            labelHeader={r.group}
            valueHeader={r.count}
          />
        ) : null}
        <TableWrap label={r.scores}>
          <table className="table table--dense">
            <thead>
              <tr>
                <th scope="col">{r.group}</th>
                <th scope="col" className="num">
                  {r.dist.n}
                </th>
                <th scope="col" className="num">
                  {r.dist.min}
                </th>
                <th scope="col" className="num">
                  {r.dist.median}
                </th>
                <th scope="col" className="num">
                  {r.dist.mean}
                </th>
                <th scope="col" className="num">
                  {r.dist.max}
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(scores).map(([key, d]) => (
                <tr key={key}>
                  <th scope="row">{r.scoreKinds[key] ?? key}</th>
                  <td className="num">{num(d.anzahl)}</td>
                  <td className="num">{score(d.min)}</td>
                  <td className="num">{score(d.median)}</td>
                  <td className="num">{score(d.mittel)}</td>
                  <td className="num">{score(d.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <div className="two-col">
        <Card title={r.result} headingLevel={3}>
          <dl className="facts facts--compact">
            <dt>{r.proposals}</dt>
            <dd>{num(report.ergebnis?.vorschlaege)}</dd>
            <dt>{r.share}</dt>
            <dd>{pct(report.ergebnis?.anteil_im_pool, 1)}</dd>
          </dl>
          <CountTable caption={r.withoutReason} rows={report.ergebnis?.ohne_vorschlag} labels={r.unmatched} />
        </Card>
        <Card title={r.fairness} headingLevel={3}>
          <p className="soft text-sm">{r.fairnessLead(k)}</p>
          <Fairness caption={r.byGender} data={report.fairness?.nach_geschlecht} />
          <Fairness caption={r.byAge} data={report.fairness?.nach_altersband} />
        </Card>
      </div>

      <div className="two-col">
        <Card title={r.venues} headingLevel={3}>
          <CountTable hideCaption caption={r.perVenue} rows={report.lokale?.nach_lokal} labels={{}} />
          <p className="muted text-sm">
            {r.ratioExceeded}: {num(report.lokale?.verhaeltnis_ueberschritten)}
          </p>
        </Card>
        <Card title={r.review} headingLevel={3}>
          <dl className="facts facts--compact">
            <dt>{r.replaced}</dt>
            <dd>{num(report.pruefung?.ersatztext_verwendet)}</dd>
            <dt>{r.agentSuspicion}</dt>
            <dd>{num(report.pruefung?.agent_art9_verdacht)}</dd>
          </dl>
          <CountTable caption={r.filterHits} rows={report.pruefung?.filter_treffer} labels={{}} />
          <CountTable caption={r.recommendations} rows={report.pruefung?.empfehlungen} labels={adminRuns.pairings.recommendations} />
        </Card>
      </div>

      <div className="two-col">
        <Card title={r.llm} headingLevel={3}>
          <dl className="facts facts--compact">
            <dt>{r.llmModel}</dt>
            <dd>{llm.modell ?? llm.backend ?? "–"}</dd>
            <dt>{r.llmCalls}</dt>
            <dd>{num(llm.bewertungen_angefragt)}</dd>
            <dt>{r.llmReused}</dt>
            <dd>{num(llm.wiederverwendet)}</dd>
            <dt>{r.llmErrors}</dt>
            <dd>{num(llm.fehler)}</dd>
            <dt>{r.llmRefusals}</dt>
            <dd>{num(llm.ablehnungen)}</dd>
            <dt>{r.llmReviewCalls}</dt>
            <dd>{num(llm.aufrufe_pruef_agent)}</dd>
            <dt>{r.tokens}</dt>
            <dd className="num">
              {num(t.eingabe)} / {num(t.ausgabe)} / {num(t.cache_lesen)} / {num(t.cache_schreiben)}
            </dd>
            <dt>{r.costLlm}</dt>
            <dd>{usd(llm.kosten?.llm_usd)}</dd>
            <dt>{r.costEmb}</dt>
            <dd>{usd(llm.kosten?.embeddings_usd, 6)}</dd>
            <dt>{r.costTotal}</dt>
            <dd>
              <strong>{euro(llm.kosten?.gesamt_eur)}</strong> ({usd(llm.kosten?.gesamt_usd)})
            </dd>
          </dl>
          <p className="muted text-sm">{llm.kosten_hinweis ?? r.costNote}</p>
        </Card>
        <Card title={r.runtime} headingLevel={3}>
          <TableWrap label={r.runtime}>
            <table className="table table--dense">
              <thead>
                <tr>
                  <th scope="col">{r.stage}</th>
                  <th scope="col" className="num">
                    {r.seconds}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.laufzeit_sekunden ?? {}).map(([key, v]) => (
                  <tr key={key}>
                    <th scope="row">{labelOf(r.stages, key)}</th>
                    <td className="num">{num(v, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>
    </div>
  );
}
