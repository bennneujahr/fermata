import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminRpc, type AdminFlagRow } from "@/lib/admin";
import { formatDateShort } from "@/lib/format";

export const metadata: Metadata = { title: admin.flags.title };

const tone = (s: string) => (s === "akut" || s === "hoch" ? "danger" : s === "mittel" ? "warning" : undefined);

export default async function AdminFlags({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams;
  const all = alle === "1";
  const c = admin.flags;
  const rows = await adminRpc<AdminFlagRow[]>("admin_safety_flags", { p_open_only: !all, p_limit: 200 });
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} actions={<Link href={all ? "/admin/hinweise" : "/admin/hinweise?alle=1"}>{all ? c.showOpen : c.showAll}</Link>} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{c.cols.severity}</th>
              <th scope="col">{c.cols.kind}</th>
              <th scope="col">{c.cols.person}</th>
              <th scope="col">{c.cols.source}</th>
              <th scope="col">{c.cols.created}</th>
              <th scope="col">{c.cols.reviewed}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {c.empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Badge tone={tone(r.severity)}>{r.severity}</Badge>
                  </td>
                  <th scope="row">{c.kinds[r.kind] ?? r.kind}</th>
                  <td>{r.user_id ? <Link href={`/admin/konten/${r.user_id}`}>{r.email ?? r.user_id}</Link> : "–"}</td>
                  <td>{r.source}</td>
                  <td className="nowrap">{formatDateShort(r.created_at)}</td>
                  <td className="nowrap">{formatDateShort(r.reviewed_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
