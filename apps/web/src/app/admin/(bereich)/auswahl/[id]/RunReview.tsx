"use client";
import { useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { bulkApprove, decidePairing } from "@/app/admin/_actions/runs";
import { dateTime, score } from "@/app/admin/_lib/format";
import type { PairingWarning } from "@/app/admin/_lib/pairing";
import type { PairingRow } from "@/app/admin/_lib/types";
import { Badge, Button, Dialog, Icon, Notice, TextArea } from "@/components/ui";
import { adminRuns as c } from "@/copy/admin-auswahl";
import { adminCommon } from "@/copy/admin-common";

export interface ReviewPairing extends PairingRow {
  warnings: PairingWarning[];
  times: string[];
  timesPreview: boolean;
}

type Filter = "all" | "pending" | "warnings";

const warningText: Record<PairingWarning, string> = {
  hinweise: "",
  empfehlung: "",
  ersatztext: c.pairings.replaced,
  art9_filter: "",
  art9_verdacht: c.pairings.art9Suspicion,
  agent_fehler: c.pairings.agentError,
  ohne_llm: `${c.pairings.llm}: ${c.pairings.noLlm}`,
  ohne_lokal: c.pairings.noVenue,
};

function barClass(v: number | null | undefined) {
  if (v === null || v === undefined) return "bar-fill bar-fill--hidden bar-w-8";
  return `bar-fill bar-w-${Math.max(0, Math.min(100, Math.round(Number(v) * 100)))}`;
}

function ScoreRows({ rows }: { rows: { label: string; value: number | null | undefined; text?: string }[] }) {
  return (
    <dl className="scores">
      {rows.map((r) => (
        <div key={r.label} className="contents-row">
          <dt>{r.label}</dt>
          <dd aria-hidden="true">
            <span className="bar-track">
              <span className={barClass(r.value)} />
            </span>
          </dd>
          <dd>{r.text ?? score(r.value ?? null)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Warnings({ p }: { p: ReviewPairing }) {
  const n = p.review_notes ?? {};
  const items: string[] = [];
  for (const w of p.warnings) {
    if (w === "hinweise") items.push(...(n.hinweise ?? []));
    else if (w === "empfehlung") items.push(`${c.pairings.recommendation}: ${c.pairings.recommendations[n.empfehlung ?? ""] ?? n.empfehlung}`);
    else if (w === "art9_filter") items.push(c.pairings.art9Hits((n.art9_filter?.treffer ?? []).join(", ")));
    else items.push(warningText[w]);
  }
  if (items.length === 0) {
    return (
      <p className="ok-line">
        <Icon name="checkCircle" size={18} />
        <span>{c.pairings.art9Ok}</span>
      </p>
    );
  }
  return (
    <ul className="warn-list" aria-label={c.pairings.warning}>
      {items.map((t, i) => (
        <li key={i} className="warn-list__item">
          <Icon name="warning" size={18} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function PairingCard({
  p,
  canDecide,
  runId,
  selected,
  onSelect,
  index,
}: {
  p: ReviewPairing;
  canDecide: boolean;
  runId: string;
  selected: boolean;
  onSelect: (id: string, on: boolean) => void;
  index: number;
}) {
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"approve" | "reject" | null>(null);
  const pendingReview = p.status === "pending_review";
  const decidable = canDecide && pendingReview;
  const n = p.review_notes ?? {};
  const headingId = `vorschlag-${p.pairing_id}`;
  const warn = p.warnings.length > 0;

  const decide = (decision: "approve" | "reject") => {
    if (decision === "reject" && comment.trim().length < 3) {
      setResult({ tone: "danger", text: c.pairings.rejectNeedsComment });
      return;
    }
    setWhich(decision);
    start(async () => {
      const r = await decidePairing({ runId, pairingId: p.pairing_id, decision, comment });
      if (r.ok) setResult({ tone: "success", text: decision === "approve" ? c.pairings.approvedMsg : c.pairings.rejectedMsg });
      else setResult({ tone: "danger", text: (r.error && c.errors[r.error]) || r.message || adminCommon.errors[r.error ?? ""] || adminCommon.errors.generic! });
      setWhich(null);
    });
  };

  return (
    <article
      className={["pairing", warn && "pairing--warning", !pendingReview && "pairing--decided"].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
      tabIndex={0}
      data-pairing={p.pairing_id}
      data-index={index}
    >
      <div className="pairing__head">
        <div className="stack stack-sm">
          <h3 className="pairing__people" id={headingId}>
            {p.a_display_name ?? "–"} <span className="pairing__band">({c.pairings.ageBand(p.a_age_band)})</span> {c.pairings.and}{" "}
            {p.b_display_name ?? "–"} <span className="pairing__band">({c.pairings.ageBand(p.b_age_band)})</span>
          </h3>
          <div className="cluster">
            <Badge tone={pendingReview ? "brass" : p.status === "rejected" ? "danger" : "success"}>{c.pairings.statusLabel[p.status] ?? p.status}</Badge>
            {warn ? (
              <Badge tone="warning">
                <Icon name="warning" size={14} /> {c.pairings.warning}
              </Badge>
            ) : null}
            {p.reviewed_at ? <span className="muted text-sm">{c.pairings.decided(dateTime(p.reviewed_at))}</span> : null}
          </div>
        </div>
        <div className="pairing__score">
          <span className="pairing__score-value">{score(p.total_score)}</span>
          <span className="muted text-sm">{c.pairings.total}</span>
        </div>
      </div>

      <div className="pairing__grid">
        <section className="pairing__section" aria-label={c.pairings.reasons}>
          <h4 className="pairing__label">{c.pairings.reasons}</h4>
          <blockquote className="quote">{p.reasons_text || c.pairings.noReasons}</blockquote>
        </section>
        <section className="pairing__section" aria-label={c.pairings.venue}>
          <h4 className="pairing__label">{c.pairings.venue}</h4>
          <p>
            <strong>{p.venue_name ?? c.pairings.noVenue}</strong>
            {p.venue_city ? `, ${p.venue_city}` : ""}
          </p>
          {p.venue_reason ? <p className="text-sm soft">{p.venue_reason}</p> : null}
          <h4 className="pairing__label">{c.pairings.times}</h4>
          {p.times.length === 0 ? (
            <p className="text-sm warn-list__item">
              <Icon name="warning" size={18} />
              <span>{c.pairings.noTimes}</span>
            </p>
          ) : (
            <ul className="text-sm">
              {p.times.map((t) => (
                <li key={t}>{dateTime(t)}</li>
              ))}
            </ul>
          )}
          {p.times.length > 0 && p.timesPreview ? <p className="muted text-sm">{c.pairings.timesPreview}</p> : null}
        </section>
        <section className="pairing__section" aria-label={c.pairings.total}>
          <h4 className="pairing__label">{c.pairings.total}</h4>
          <ScoreRows
            rows={[
              { label: c.pairings.rule, value: p.rule_score },
              { label: c.pairings.llm, value: p.llm_score, text: p.llm_score === null ? c.pairings.noLlm : undefined },
              { label: c.pairings.bonus, value: p.wait_bonus },
            ]}
          />
          <h4 className="pairing__label">{c.pairings.subscores}</h4>
          <ScoreRows rows={Object.keys(c.pairings.sub).map((k) => ({ label: c.pairings.sub[k]!, value: p.subscores?.[k] ?? null }))} />
        </section>
        <section className="pairing__section" aria-label={c.pairings.review}>
          <h4 className="pairing__label">{c.pairings.review}</h4>
          <div className="cluster">
            <span className="text-sm soft">{c.pairings.recommendation}:</span>
            <Badge tone={(n.empfehlung ?? "freigeben") === "freigeben" ? "success" : n.empfehlung === "ablehnen" ? "danger" : "warning"}>
              {c.pairings.recommendations[n.empfehlung ?? "freigeben"] ?? n.empfehlung}
            </Badge>
          </div>
          <Warnings p={p} />
          {n.agent?.einschaetzung ? (
            <p className="text-sm">
              <span className="soft">{c.pairings.assessment}: </span>
              {n.agent.einschaetzung}
            </p>
          ) : null}
          {(n.agent?.risiken ?? []).length > 0 ? (
            <div className="text-sm">
              <span className="soft">{c.pairings.risks}:</span>
              <ul>
                {(n.agent?.risiken ?? []).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <h4 className="pairing__label">{c.pairings.rationale}</h4>
          <p className="text-sm">{p.llm_rationale || c.pairings.noRationale}</p>
          {p.review_comment ? (
            <p className="text-sm">
              <span className="soft">{c.pairings.comment}: </span>
              {p.review_comment}
            </p>
          ) : null}
        </section>
      </div>

      {decidable ? (
        <div className="pairing__decide">
          <TextArea
            label={c.pairings.comment}
            hint={c.pairings.commentHint}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="textarea--plain"
            maxLength={1000}
          />
          <div className="pairing__buttons">
            {!warn ? (
              <label className="choice choice--plain" htmlFor={`sel-${p.pairing_id}`}>
                <input
                  id={`sel-${p.pairing_id}`}
                  type="checkbox"
                  className="choice__control"
                  checked={selected}
                  onChange={(e) => onSelect(p.pairing_id, e.target.checked)}
                />
                <span className="choice__text">
                  <span className="choice__label">{c.pairings.select}</span>
                </span>
              </label>
            ) : (
              <span className="muted text-sm">{c.pairings.selectDisabled}</span>
            )}
            <Button variant="secondary" onClick={() => decide("reject")} loading={pending && which === "reject"} disabled={pending}>
              {pending && which === "reject" ? c.pairings.rejecting : c.pairings.reject}
            </Button>
            <Button onClick={() => decide("approve")} loading={pending && which === "approve"} disabled={pending} icon="check">
              {pending && which === "approve" ? c.pairings.approving : c.pairings.approve}
            </Button>
          </div>
        </div>
      ) : null}
      {result ? (
        <Notice tone={result.tone} live={result.tone === "danger" ? "assertive" : "polite"}>
          {result.text}
        </Notice>
      ) : null}
    </article>
  );
}

export function RunReview({ runId, pairings, canDecide }: { runId: string; pairings: ReviewPairing[]; canDecide: boolean }) {
  const [filter, setFilter] = useState<Filter>(pairings.some((p) => p.status === "pending_review") ? "pending" : "all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: { id: string; message: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const list = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => pairings.filter((p) => (filter === "pending" ? p.status === "pending_review" : filter === "warnings" ? p.warnings.length > 0 : true)),
    [pairings, filter],
  );
  const eligible = pairings.filter((p) => p.status === "pending_review" && p.warnings.length === 0);
  const chosen = [...selected].filter((id) => eligible.some((p) => p.pairing_id === id));

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLElement) || !t.matches("article.pairing")) return;
    const down = e.key === "ArrowDown" || e.key === "j";
    const up = e.key === "ArrowUp" || e.key === "k";
    if (!down && !up) return;
    const cards = [...(list.current?.querySelectorAll<HTMLElement>("article.pairing") ?? [])];
    const i = cards.indexOf(t);
    const next = cards[down ? i + 1 : i - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  if (pairings.length === 0) return <p className="muted">{c.pairings.empty}</p>;

  return (
    <div className="stack">
      <div className="review-toolbar" role="group" aria-label={c.bulk.title}>
        <div className="cluster" role="group" aria-label={c.pairings.filterLabel}>
          {(
            [
              ["pending", c.pairings.filterPending],
              ["warnings", c.pairings.filterWarnings],
              ["all", c.pairings.filterAll],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <Button key={f} size="sm" variant={filter === f ? "primary" : "secondary"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}
            </Button>
          ))}
          <span className="muted text-sm" aria-live="polite">
            {c.pairings.count(shown.length, pairings.length)}
          </span>
        </div>
        {canDecide && eligible.length > 0 ? (
          <div className="cluster">
            <Button size="sm" variant="quiet" onClick={() => setSelected(new Set(eligible.map((p) => p.pairing_id)))}>
              {c.bulk.selectAll(eligible.length)}
            </Button>
            {chosen.length > 0 ? (
              <Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>
                {c.bulk.clear}
              </Button>
            ) : null}
            <Button size="sm" icon="check" disabled={chosen.length === 0 || pending} loading={pending} onClick={() => setDialog(true)}>
              {c.bulk.submit(chosen.length)}
            </Button>
          </div>
        ) : null}
      </div>
      {bulkResult ? (
        <Notice tone={bulkResult.failed.length ? "warning" : "success"} live="polite">
          {c.bulk.result(bulkResult.ok, bulkResult.failed.length)}
          {bulkResult.failed.length ? (
            <ul>
              {bulkResult.failed.map((f) => (
                <li key={f.id}>{f.message}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      <p className="kbd-hint">{c.pairings.lead}</p>
      <div className="stack" ref={list} onKeyDown={onKey}>
        {shown.map((p, i) => (
          <PairingCard
            key={p.pairing_id}
            p={p}
            index={i}
            runId={runId}
            canDecide={canDecide}
            selected={selected.has(p.pairing_id)}
            onSelect={(id, on) =>
              setSelected((s) => {
                const n = new Set(s);
                if (on) n.add(id);
                else n.delete(id);
                return n;
              })
            }
          />
        ))}
      </div>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title={c.bulk.dialogTitle(chosen.length)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog(false)}>
              {adminCommon.cancel}
            </Button>
            <Button
              onClick={() => {
                setDialog(false);
                start(async () => {
                  const r = await bulkApprove({ runId, pairingIds: chosen });
                  setBulkResult(r);
                  setSelected(new Set());
                });
              }}
            >
              {c.bulk.confirm}
            </Button>
          </>
        }
      >
        <p className="soft">{c.bulk.dialogText}</p>
      </Dialog>
    </div>
  );
}
