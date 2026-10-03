import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminRpc, type AdminVerificationRow } from "@/lib/admin";
import { formatDateShort } from "@/lib/format";

export const metadata: Metadata = { title: admin.verifications.title };

const yn = (v: boolean | null) => (v === null ? "–" : v ? admin.account.yes : admin.account.no);

export default async function AdminVerifications() {
  const c = admin.verifications;
  const rows = await adminRpc<AdminVerificationRow[]>("admin_verifications", { p_limit: 200 });
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{c.cols.person}</th>
              <th scope="col">{c.cols.status}</th>
              <th scope="col">{c.cols.adult}</th>
              <th scope="col">{c.cols.year}</th>
              <th scope="col">{c.cols.name}</th>
              <th scope="col">{c.cols.birth}</th>
              <th scope="col">{c.cols.blocklist}</th>
              <th scope="col">{c.cols.deleted}</th>
              <th scope="col">{c.cols.started}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  {c.empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/admin/konten/${r.user_id}`}>{r.email}</Link>
                  </th>
                  <td>{admin.verificationStatus[r.status] ?? r.status}</td>
                  <td>{yn(r.is_adult)}</td>
                  <td>{r.birth_year ?? "–"}</td>
                  <td>{yn(r.name_match)}</td>
                  <td>{yn(r.birth_date_match)}</td>
                  <td>{yn(r.blocklist_hit)}</td>
                  <td className="nowrap">{r.provider_session_deleted_at ? formatDateShort(r.provider_session_deleted_at) : r.completed_at ? admin.account.no : "–"}</td>
                  <td className="nowrap">{formatDateShort(r.started_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
