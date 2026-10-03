"use client";
import { useId, useState, useTransition } from "react";
import { listCaseSessions, openTranscript } from "@/app/admin/_actions/safety";
import { dateShort, dateTime, labelOf } from "@/app/admin/_lib/format";
import type { CaseSession, TranscriptResult } from "@/app/admin/_lib/types";
import { Badge, Button, Notice, TableWrap, TextArea } from "@/components/ui";
import { adminCommon } from "@/copy/admin-common";
import { adminSafety } from "@/copy/admin-sicherheit";

const c = adminSafety.transcript;

function errorText(key: string | undefined) {
  return (key && c.errors[key]) || adminSafety.errors[key ?? ""] || c.errors.not_found!;
}

/** Ein Gespräch: Begründung angeben, Hinweis „wird protokolliert“, dann das Transkript zeigen. */
export function OpenTranscript({ sessionId, label }: { sessionId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [pending, start] = useTransition();
  const id = useId();

  if (result) {
    return (
      <div className="stack stack-sm">
        {result.deleted ? (
          <Notice tone="info">{c.deleted}</Notice>
        ) : result.turns.length === 0 ? (
          <Notice tone="info">{c.empty}</Notice>
        ) : (
          <div className="table-wrap" role="region" aria-label={label ?? c.sessionInfo} tabIndex={0}>
            <ol className="transcript">
              {result.turns.map((t, i) => (
                <li key={i} className={`transcript__turn transcript__turn--${t.role === "person" ? "person" : "viola"}`}>
                  <span className="transcript__who">
                    {labelOf(c.roles, t.role ?? "system")}
                    {t.at ? ` · ${dateTime(t.at)}` : ""}
                  </span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div>
          <Button variant="secondary" size="sm" onClick={() => { setResult(null); setOpen(false); setReason(""); }}>
            {c.close}
          </Button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" icon="lock" onClick={() => setOpen(true)}>
        {c.open}
      </Button>
    );
  }

  return (
    <form
      className="stack stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (reason.trim().length < 10) {
          setError(c.errors.reason_required!);
          return;
        }
        start(async () => {
          const r = await openTranscript({ sessionId, reason });
          if (r.error) setError(errorText(r.error));
          else if (r.transcript) setResult(r.transcript);
        });
      }}
    >
      <Notice tone="warning" title={c.open}>
        {c.notice}
      </Notice>
      <TextArea
        id={`${id}-reason`}
        label={c.reason}
        hint={c.reasonHint}
        rows={2}
        className="textarea--plain"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
        required
        minLength={10}
        maxLength={1000}
      />
      <div className="cluster">
        <Button type="submit" loading={pending} icon="lock">
          {pending ? c.opening : c.submit}
        </Button>
        <Button variant="quiet" onClick={() => { setOpen(false); setError(null); }}>
          {adminCommon.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Gespräche einer Person mit offenem Sicherheitsfall: erst die Liste (protokolliert), dann einzeln öffnen. */
export function CaseSessions({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<CaseSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!sessions) {
    return (
      <div className="stack stack-sm">
        <div>
          <Button
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await listCaseSessions(userId);
                if (r.error) setError(errorText(r.error));
                else setSessions(r.sessions ?? []);
              })
            }
          >
            {pending ? c.listing : c.list}
          </Button>
        </div>
        {error ? (
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        ) : null}
      </div>
    );
  }
  if (sessions.length === 0) return <p className="muted">{c.noSessions}</p>;
  return (
    <TableWrap label={c.title}>
      <table className="table table--dense">
        <thead>
          <tr>
            <th scope="col">{c.cols.kind}</th>
            <th scope="col">{c.cols.when}</th>
            <th scope="col">{c.cols.end}</th>
            <th scope="col">{c.cols.transcript}</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.session_id}>
              <th scope="row">
                {labelOf(c.kinds, s.kind)} <span className="muted">({labelOf(c.modes, s.mode)})</span>
                {s.safety_flagged ? (
                  <>
                    {" "}
                    <Badge tone="warning">{c.flagged}</Badge>
                  </>
                ) : null}
              </th>
              <td className="nowrap">{dateTime(s.started_at)}</td>
              <td>{s.end_reason ? labelOf(c.endReasons, s.end_reason) : "–"}</td>
              <td>
                {s.has_transcript ? (
                  <div className="stack stack-sm">
                    <span className="muted text-sm">{c.available(dateShort(s.transcript_delete_at))}</span>
                    <OpenTranscript sessionId={s.session_id} label={`${labelOf(c.kinds, s.kind)} ${dateTime(s.started_at)}`} />
                  </div>
                ) : (
                  <span className="muted">{c.gone}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
