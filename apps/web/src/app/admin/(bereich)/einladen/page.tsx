import type { Metadata } from "next";
import { Card, PageHeader, TableWrap } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminRpc, type AdminInvitationRow } from "@/lib/admin";
import { formatDateShort } from "@/lib/format";
import { InviteForm } from "./InviteForm";

export const metadata: Metadata = { title: admin.invite.title };

export default async function AdminInvite() {
  const c = admin.invite;
  const rows = await adminRpc<AdminInvitationRow[]>("admin_invitations", { p_limit: 50 });
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <Card>
        <InviteForm />
      </Card>
      <section className="stack" aria-labelledby="einladungen">
        <h2 id="einladungen">{c.listTitle}</h2>
        <TableWrap label={admin.invite.listTitle}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{c.cols.email}</th>
                <th scope="col">{c.cols.state}</th>
                <th scope="col">{c.cols.invited}</th>
                <th scope="col">{c.cols.until}</th>
                <th scope="col">{c.cols.waitlist}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.email}</th>
                  <td>{c.states[r.state] ?? r.state}</td>
                  <td className="nowrap">{formatDateShort(r.invited_at)}</td>
                  <td className="nowrap">{formatDateShort(r.expires_at)}</td>
                  <td>{r.waitlist_linked ? admin.account.yes : admin.account.no}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </>
  );
}
