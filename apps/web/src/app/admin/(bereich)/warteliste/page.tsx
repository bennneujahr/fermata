import type { Metadata } from "next";
import { dateShort, dateTime, dayMonth, labelOf, num } from "@/app/admin/_lib/format";
import { rpc, rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { WaitlistEntry, WaitlistStats } from "@/app/admin/_lib/types";
import { ColumnChart } from "@/components/admin/ColumnChart";
import { Figures } from "@/components/admin/Figures";
import { Button, Card, Checkbox, Field, Notice, PageHeader, Select, TableWrap } from "@/components/ui";
import { adminCommon } from "@/copy/admin-common";
import { adminWaitlist as c } from "@/copy/admin-warteliste";
import { WaitlistInvite } from "./WaitlistInvite";

export const metadata: Metadata = { title: c.title };

const GROUPS = ["westmecklenburg", "hamburg", "luebeck", "rostock", "anderswo"];

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ region?: string; anzahl?: string; alle?: string }> }) {
  const sp = await searchParams;
  const region = sp.region && GROUPS.includes(sp.region) ? sp.region : "westmecklenburg";
  const count = Math.min(100, Math.max(1, Number(sp.anzahl) || 10));
  const includeInvited = sp.alle === "1";
  const stats = await rpcOrThrow<WaitlistStats>("admin_waitlist_stats");
  const entries = await rpc<WaitlistEntry[]>("admin_waitlist_entries", { p_region_group: region, p_include_invited: includeInvited, p_limit: includeInvited ? 200 : Math.max(count * 3, 30) });
  const days = stats.by_day.slice(-30);
  const hits = new Map(stats.link_hits.map((h) => [h.slug, h]));
  const sources = [...stats.by_source];
  for (const h of stats.link_hits) if (!sources.some((s) => s.source === h.slug)) sources.push({ source: h.slug, signups: 0, confirmed: 0 });

  return (
    <>
      <PageHeader title={c.title} lead={c.lead}>
        <p className="muted text-sm">{c.generatedAt(dateTime(stats.generated_at))}</p>
      </PageHeader>

      <Card title={c.totals} headingLevel={2} id="gesamt">
        <Figures
          items={[
            { label: c.confirmed, value: num(stats.totals.confirmed) },
            { label: c.unconfirmed, value: num(stats.totals.unconfirmed) },
            { label: c.founding, value: num(stats.totals.founding_members) },
            { label: c.invitedToApp, value: num(stats.totals.invited_to_app) },
            { label: c.invitesCreated, value: num(stats.invites.created) },
            { label: c.invitesUsed, value: num(stats.invites.used) },
          ]}
        />
      </Card>

      <div className="stack">
        <Card title={c.byRegion} headingLevel={2} id="regionen">
          <TableWrap label={c.byRegion}>
            <table className="table table--dense">
              <thead>
                <tr>
                  <th scope="col">{c.regionCols.group}</th>
                  <th scope="col" className="num">{c.regionCols.confirmed}</th>
                  <th scope="col" className="num">{c.regionCols.unconfirmed}</th>
                  <th scope="col" className="num">{c.regionCols.founding}</th>
                  <th scope="col" className="num">{c.regionCols.last}</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_region_group.map((g) => (
                  <tr key={g.region_group}>
                    <th scope="row">{labelOf(c.groups, g.region_group)}</th>
                    <td className="num">{num(g.confirmed)}</td>
                    <td className="num">{num(g.unconfirmed)}</td>
                    <td className="num">{num(g.founding_members)}</td>
                    <td className="num">{num(g.last_base_number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title={c.bySource} headingLevel={2} id="quellen">
          <TableWrap label={c.bySource}>
            <table className="table table--dense">
              <thead>
                <tr>
                  <th scope="col">{c.sourceCols.source}</th>
                  <th scope="col" className="num">{c.sourceCols.signups}</th>
                  <th scope="col" className="num">{c.sourceCols.confirmed}</th>
                  <th scope="col" className="num">{c.sourceCols.hits}</th>
                  <th scope="col" className="num">{c.sourceCols.recent}</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">{c.empty}</td>
                  </tr>
                ) : (
                  sources.map((s) => (
                    <tr key={s.source}>
                      <th scope="row">{s.source}</th>
                      <td className="num">{num(s.signups)}</td>
                      <td className="num">{num(s.confirmed)}</td>
                      <td className="num">{num(hits.get(s.source)?.total ?? null)}</td>
                      <td className="num">{num(hits.get(s.source)?.last_30_days ?? null)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>

      <Card title={c.byDay} headingLevel={2} id="tage">
        <p className="soft text-sm">{c.byDayLead}</p>
        {days.length === 0 ? (
          <p className="muted">{c.empty}</p>
        ) : (
          <>
            <ColumnChart
              title={`${c.byDay}: ${c.dayCols.signups}`}
              summary={c.chartLabel(days.length)}
              columns={days.map((d) => ({ key: d.day, label: dayMonth(d.day), value: d.signups }))}
              labelHeader={c.dayCols.day}
              valueHeader={c.dayCols.signups}
              table={false}
            />
            <details className="values">
              <summary>{`${c.dayCols.signups} / ${c.dayCols.confirmations}: ${adminCommon.chartTable}`}</summary>
              <TableWrap label={c.byDay}>
                <table className="table table--dense">
                  <thead>
                    <tr>
                      <th scope="col">{c.dayCols.day}</th>
                      <th scope="col" className="num">{c.dayCols.signups}</th>
                      <th scope="col" className="num">{c.dayCols.confirmations}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d.day}>
                        <th scope="row">{dateShort(d.day)}</th>
                        <td className="num">{num(d.signups)}</td>
                        <td className="num">{num(d.confirmations)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </details>
          </>
        )}
      </Card>

      <Card title={c.invite.title} headingLevel={2} variant="accent" id="einladen">
        <p className="soft">{c.invite.lead}</p>
        <form method="get" className="inline-form" role="search" aria-label={c.invite.title}>
          <Select label={c.invite.region} name="region" defaultValue={region} options={GROUPS.map((g) => ({ value: g, label: labelOf(c.groups, g) }))} />
          <Field label={c.invite.count} name="anzahl" type="number" min={1} max={100} defaultValue={String(count)} className="input--narrow" />
          <Checkbox name="alle" value="1" label={c.invite.includeInvited} defaultChecked={includeInvited} />
          <Button type="submit" variant="secondary" icon="search">
            {c.invite.show}
          </Button>
        </form>
        {entries.error ? <Notice tone="danger">{c.errors[entries.error.hint ?? ""] ?? adminCommon.errors.generic}</Notice> : <WaitlistInvite entries={entries.data ?? []} defaultCount={count} key={`${region}-${count}-${includeInvited}`} />}
      </Card>
    </>
  );
}
