import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Field, PageHeader, Select } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminRpc, type AdminAccountRow } from "@/lib/admin";
import { formatDateShort } from "@/lib/format";

export const metadata: Metadata = { title: admin.accounts.title };

export default async function AdminAccounts({ searchParams }: { searchParams: Promise<{ q?: string; stand?: string }> }) {
  const { q, stand } = await searchParams;
  const c = admin.accounts;
  const rows = await adminRpc<AdminAccountRow[]>("admin_accounts", { p_search: q || null, p_status: stand || null, p_limit: 100 });
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <form method="get" className="cluster" role="search">
        <Field label={c.searchLabel} name="q" defaultValue={q ?? ""} type="search" />
        <Select
          label={c.statusFilter}
          name="stand"
          defaultValue={stand ?? ""}
          options={[{ value: "", label: c.all }, ...Object.entries(admin.status).map(([value, label]) => ({ value, label }))]}
        />
        <Button type="submit" icon="search" variant="secondary">
          {c.search}
        </Button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{c.cols.person}</th>
              <th scope="col">{c.cols.place}</th>
              <th scope="col">{c.cols.status}</th>
              <th scope="col">{c.cols.step}</th>
              <th scope="col">{c.cols.verification}</th>
              <th scope="col">{c.cols.created}</th>
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
                <tr key={r.user_id}>
                  <th scope="row">
                    <Link href={`/admin/konten/${r.user_id}`}>{[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email}</Link>
                    <div className="muted">{r.email}</div>
                    {r.is_founding_member ? <Badge tone="brass">{c.founding}</Badge> : null}
                  </th>
                  <td>{[r.postal_code, r.city].filter(Boolean).join(" ") || "–"}</td>
                  <td>{admin.status[r.status] ?? r.status}</td>
                  <td>{r.next_step ? (admin.steps[r.next_step] ?? r.next_step) : "–"}</td>
                  <td>{r.verification_status ? (admin.verificationStatus[r.verification_status] ?? r.verification_status) : "–"}</td>
                  <td className="nowrap">{formatDateShort(r.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
