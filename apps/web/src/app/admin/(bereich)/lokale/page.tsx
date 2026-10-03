import type { Metadata } from "next";
import Link from "next/link";
import { labelOf, num } from "@/app/admin/_lib/format";
import { rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { VenueRow } from "@/app/admin/_lib/types";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { Badge, ButtonLink, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { adminVenues as c } from "@/copy/admin-lokale";

export const metadata: Metadata = { title: c.title };

export default async function VenuesPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams;
  const all = alle !== "0";
  const rows = await rpcOrThrow<VenueRow[]>("admin_venues", { p_include_inactive: all });
  const l = c.list;
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} actions={<ButtonLink href="/admin/lokale/neu" icon="plus">{l.add}</ButtonLink>} />
      <FilterLinks
        label={l.title}
        items={[
          { href: "/admin/lokale", label: l.showInactive, current: all },
          { href: "/admin/lokale?alle=0", label: l.showActive, current: !all },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title={l.empty} action={<ButtonLink href="/admin/lokale/neu" icon="plus">{l.add}</ButtonLink>} />
      ) : (
        <TableWrap label={l.title}>
          <table className="table table--dense">
            <caption className="visually-hidden">{l.title}</caption>
            <thead>
              <tr>
                <th scope="col">{l.cols.name}</th>
                <th scope="col">{l.cols.place}</th>
                <th scope="col">{l.cols.mode}</th>
                <th scope="col">{l.cols.contact}</th>
                <th scope="col" className="num">
                  {l.cols.slots}
                </th>
                <th scope="col" className="num">
                  {l.cols.free}
                </th>
                <th scope="col" className="num">
                  {l.cols.reservations}
                </th>
                <th scope="col">{l.cols.state}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <th scope="row">
                    <Link href={`/admin/lokale/${v.id}`}>{v.name}</Link>
                  </th>
                  <td>
                    {v.street}
                    <div className="muted">
                      {v.postal_code} {v.city}
                    </div>
                  </td>
                  <td>{labelOf(c.modes, v.reservation_mode)}</td>
                  <td className="text-sm">
                    {v.contact_name ?? ""}
                    {v.contact_email ? <div>{v.contact_email}</div> : null}
                    {v.contact_phone ? <div className="muted">{v.contact_phone}</div> : null}
                  </td>
                  <td className="num">{num(v.upcoming_slots)}</td>
                  <td className="num">{num(v.upcoming_free_tables)}</td>
                  <td className="num">{num(v.upcoming_reservations)}</td>
                  <td>
                    <Badge tone={v.active ? "success" : undefined}>{v.active ? l.active : l.inactive}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
