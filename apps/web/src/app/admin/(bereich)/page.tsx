import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminRpc, type AdminOverview } from "@/lib/admin";

export const metadata: Metadata = { title: admin.dashboard.title };

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <p className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </p>
  );
}

export default async function AdminDashboard() {
  const o = await adminRpc<AdminOverview>("admin_overview");
  const d = admin.dashboard;
  return (
    <>
      <PageHeader title={d.title} lead={d.lead} />
      <div className="grid-auto">
        <Card title={d.accounts} headingLevel={2}>
          <Stat value={o.accounts_total} label={d.accounts} />
          <ul className="list-plain stack stack-sm">
            {Object.entries(o.accounts).map(([k, n]) => (
              <li key={k} className="cluster">
                <span className="soft">{admin.status[k] ?? k}</span>
                <strong>{n}</strong>
              </li>
            ))}
          </ul>
          <Link href="/admin/konten">{admin.nav.accounts}</Link>
        </Card>
        <Card title={d.invitations} headingLevel={2}>
          <div className="cluster">
            <Stat value={o.invitations.open} label={d.open} />
            <Stat value={o.invitations.accepted} label={d.accepted} />
            <Stat value={o.invitations.expired} label={d.expired} />
          </div>
          <Link href="/admin/einladen">{admin.nav.invite}</Link>
        </Card>
        <Card title={d.verifications} headingLevel={2}>
          <ul className="list-plain stack stack-sm">
            {Object.entries(o.verifications).map(([k, n]) => (
              <li key={k} className="cluster">
                <span className="soft">{admin.verificationStatus[k] ?? k}</span>
                <strong>{n}</strong>
              </li>
            ))}
          </ul>
          <p className="muted text-sm">
            {d.pendingDeletion}: <strong>{o.verifications_pending_deletion}</strong>
          </p>
          <Link href="/admin/pruefungen">{admin.nav.verifications}</Link>
        </Card>
        <Card title={d.flags} headingLevel={2} variant={o.safety_flags_open > 0 ? "accent" : "raised"}>
          <div className="cluster">
            <Stat value={o.safety_flags_open} label={d.flags} />
            <Stat value={o.reports_open} label={d.reports} />
          </div>
          <Link href="/admin/hinweise">{admin.nav.flags}</Link>
        </Card>
        <Card title={d.waitlist} headingLevel={2} variant="sunk">
          {o.waitlist ? (
            <div className="cluster">
              <Stat value={o.waitlist.total} label={d.waitlist} />
              <Stat value={o.waitlist.invited_to_app} label={d.waitlistInvited} />
            </div>
          ) : (
            <p className="muted">{d.waitlistMissing}</p>
          )}
        </Card>
      </div>
      <p className="muted text-sm">{d.later}</p>
    </>
  );
}
