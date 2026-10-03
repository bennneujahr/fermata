import type { Metadata } from "next";
import Link from "next/link";
import { resolveEveningAction } from "@/app/admin/_actions/venues";
import { dateTime, labelOf } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { EveningToResolve } from "@/app/admin/_lib/types";
import { ActionForm } from "@/components/admin/ActionForm";
import { Badge, Card, EmptyState, Field, PageHeader, RadioGroup } from "@/components/ui";
import { adminVenues as c } from "@/copy/admin-lokale";

export const metadata: Metadata = { title: c.evenings.title };

export default async function EveningsToResolvePage() {
  const rows = await rpcOrThrow<EveningToResolve[]>("admin_evenings_to_resolve");
  const e = c.evenings;
  return (
    <>
      <PageHeader title={e.title} lead={e.lead} />
      {rows.length === 0 ? <EmptyState title={e.empty} /> : null}
      {rows.map((r) => {
        const name = (uid: string) => (uid === r.a_user_id ? r.a_name : r.b_name);
        return (
          <Card key={r.evening_id} headingLevel={2} title={`${r.a_name} · ${r.b_name}`} eyebrow={`${dateTime(r.starts_at)} · ${r.venue_name ?? "–"}${r.venue_city ? `, ${r.venue_city}` : ""}`} variant="accent">
            <div className="cluster">
              {r.reasons.map((x) => (
                <Badge key={x} tone={x === "meldung" ? "danger" : "warning"}>
                  {labelOf(e.reasons, x)}
                </Badge>
              ))}
              {r.open_reports > 0 ? <Link href="/admin/sicherheit">{e.openReports(r.open_reports)}</Link> : null}
            </div>
            <div className="stack stack-sm">
              <h3 className="pairing__label">{e.feedback}</h3>
              {r.feedback.length === 0 ? (
                <p className="muted text-sm">{e.noFeedback}</p>
              ) : (
                <ul className="text-sm">
                  {r.feedback.map((f) => (
                    <li key={f.user_id}>{e.attended(name(f.user_id), f.attended, f.other_attended)}</li>
                  ))}
                </ul>
              )}
            </div>
            <ActionForm
              action={resolveEveningAction}
              submitLabel={e.submit}
              errors={c.errors}
              confirm={{ title: e.dialogTitle, text: e.dialogText, confirmLabel: e.confirm }}
            >
              <input type="hidden" name="evening_id" value={r.evening_id} />
              <input type="hidden" name="a_user" value={r.a_user_id} />
              <input type="hidden" name="b_user" value={r.b_user_id} />
              {r.flag_ids.map((f) => (
                <input key={f} type="hidden" name="flag_id" value={f} />
              ))}
              <RadioGroup
                legend={e.outcome}
                name="outcome"
                required
                options={[
                  { value: "happened", label: e.happened },
                  { value: "no_show_a", label: e.noShow(r.a_name) },
                  { value: "no_show_b", label: e.noShow(r.b_name) },
                  { value: "no_show_both", label: e.noShowBoth },
                ]}
              />
              <Field label={e.note} name="note" maxLength={500} />
            </ActionForm>
          </Card>
        );
      })}
    </>
  );
}
