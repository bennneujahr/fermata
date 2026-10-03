"use client";
import { useState, useTransition } from "react";
import { grantWaitlistInvite, inviteFromWaitlist, type InviteOutcome } from "@/app/admin/_actions/waitlist";
import { dateShort } from "@/app/admin/_lib/format";
import type { WaitlistEntry } from "@/app/admin/_lib/types";
import { Badge, Button, Dialog, Notice, TableWrap } from "@/components/ui";
import { adminCommon } from "@/copy/admin-common";
import { adminWaitlist as c } from "@/copy/admin-warteliste";
import { admin } from "@/copy/admin";

function GrantButton({ entry }: { entry: WaitlistEntry }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="stack stack-sm">
      <Button
        size="sm"
        variant="quiet"
        loading={pending}
        aria-label={c.grant.label(entry.first_name)}
        onClick={() =>
          start(async () => {
            const r = await grantWaitlistInvite(entry.id);
            setResult(r.code ? c.grant.done(r.code) : (c.errors[r.error ?? ""] ?? adminCommon.errors.generic!));
          })
        }
      >
        {c.grant.submit}
      </Button>
      <span role="status" className="text-sm">
        {result ?? ""}
      </span>
    </div>
  );
}

/** Bestätigte Einträge einer Region nach Platz: auswählen und in die App einladen. */
export function WaitlistInvite({ entries, defaultCount }: { entries: WaitlistEntry[]; defaultCount: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState(false);
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);
  const [pending, start] = useTransition();
  const invitable = entries.filter((e) => !e.invited_to_app_at);
  const chosen = invitable.filter((e) => selected.has(e.id));
  const i = c.invite;

  if (entries.length === 0) return <p className="muted">{i.empty}</p>;

  return (
    <div className="stack">
      <div className="cluster">
        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(invitable.slice(0, defaultCount).map((e) => e.id)))}>
          {i.selectFirst(Math.min(defaultCount, invitable.length))}
        </Button>
        {selected.size > 0 ? (
          <Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>
            {i.clear}
          </Button>
        ) : null}
        <Button icon="send" disabled={chosen.length === 0 || pending} loading={pending} onClick={() => setDialog(true)}>
          {i.submit(chosen.length)}
        </Button>
      </div>
      {outcome ? (
        <Notice tone={outcome.failed.length ? "warning" : "success"} live="polite">
          {i.result(outcome.ok, outcome.failed.length)}
          {outcome.failed.length ? (
            <ul>
              {outcome.failed.map((f) => (
                <li key={f.email}>{i.failedItem(f.email, c.errors[f.error] ?? admin.invite.errors[f.error] ?? adminCommon.errors.generic!)}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      <TableWrap label={i.title}>
        <table className="table table--dense">
          <caption className="visually-hidden">{i.title}</caption>
          <thead>
            <tr>
              <th scope="col" className="check-cell">
                <span className="visually-hidden">{i.cols.select}</span>
              </th>
              <th scope="col" className="num">
                {i.cols.place}
              </th>
              <th scope="col">{i.cols.name}</th>
              <th scope="col">{i.cols.email}</th>
              <th scope="col">{i.cols.region}</th>
              <th scope="col">{i.cols.source}</th>
              <th scope="col">{i.cols.confirmed}</th>
              <th scope="col">{i.cols.invited}</th>
              <th scope="col">{i.cols.action}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="check-cell">
                  {e.invited_to_app_at ? null : (
                    <input
                      type="checkbox"
                      aria-label={i.selectRow(e.first_name, e.place)}
                      checked={selected.has(e.id)}
                      onChange={(ev) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (ev.target.checked) n.add(e.id);
                          else n.delete(e.id);
                          return n;
                        })
                      }
                    />
                  )}
                </td>
                <td className="num">{e.place}</td>
                <th scope="row">
                  {e.first_name}
                  {e.is_founding_member ? (
                    <>
                      {" "}
                      <Badge tone="brass">{i.founding}</Badge>
                    </>
                  ) : null}
                </th>
                <td>{e.email}</td>
                <td>
                  {e.postal_code} <span className="muted">({e.region})</span>
                </td>
                <td>{e.source ?? c.noSource}</td>
                <td className="nowrap">{dateShort(e.confirmed_at)}</td>
                <td className="nowrap">{e.invited_to_app_at ? i.invited(dateShort(e.invited_to_app_at)) : "–"}</td>
                <td>
                  <GrantButton entry={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title={i.dialogTitle(chosen.length)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog(false)}>
              {adminCommon.cancel}
            </Button>
            <Button
              icon="send"
              onClick={() => {
                setDialog(false);
                start(async () => {
                  const r = await inviteFromWaitlist(chosen.map((e) => ({ id: e.id, email: e.email })));
                  setOutcome(r);
                  setSelected(new Set());
                });
              }}
            >
              {i.confirm}
            </Button>
          </>
        }
      >
        <p className="soft">{i.dialogText}</p>
        <ul className="text-sm">
          {chosen.map((e) => (
            <li key={e.id}>
              {e.place}. {e.first_name} ({e.email})
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
