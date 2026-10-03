import type { Metadata } from "next";
import Link from "next/link";
import { createPeriodAction } from "@/app/admin/_actions/venues";
import { dateShort, dateTime, labelOf, num } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { PeriodRow } from "@/app/admin/_lib/types";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Checkbox, Field, PageHeader, TableWrap } from "@/components/ui";
import { adminRuns } from "@/copy/admin-auswahl";
import { adminVenues as c } from "@/copy/admin-lokale";

export const metadata: Metadata = { title: c.periods.title };

export default async function PeriodsPage() {
  const rows = await rpcOrThrow<PeriodRow[]>("admin_availability_periods");
  const p = c.periods;
  return (
    <>
      <PageHeader title={p.title} lead={p.lead} />
      <Card title={p.createTitle} headingLevel={2}>
        <ActionForm action={createPeriodAction} submitLabel={p.submit} errors={c.errors} resetOnSuccess>
          <div className="form-grid">
            <Field label={p.startsOn} name="starts_on" type="date" />
          </div>
          <Checkbox name="notify" label={p.notify} defaultChecked />
        </ActionForm>
      </Card>
      <TableWrap label={p.title}>
        <table className="table table--dense">
          <caption className="visually-hidden">{p.title}</caption>
          <thead>
            <tr>
              <th scope="col">{p.cols.period}</th>
              <th scope="col">{p.cols.ask}</th>
              <th scope="col">{p.cols.until}</th>
              <th scope="col" className="num">
                {p.cols.people}
              </th>
              <th scope="col">{p.cols.runs}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {p.empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="nowrap">
                    {dateShort(r.starts_on)} – {dateShort(r.ends_on)}
                  </th>
                  <td className="nowrap">{dateTime(r.ask_at)}</td>
                  <td className="nowrap">{dateTime(r.answer_until)}</td>
                  <td className="num">{num(r.people_with_windows)}</td>
                  <td>
                    {r.runs.length === 0
                      ? p.noRuns
                      : r.runs.map((x) => (
                          <div key={x.id}>
                            <Link href={`/admin/auswahl/${x.id}`}>{labelOf(adminRuns.status, x.status)}</Link>
                          </div>
                        ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
