import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice, PageHeader, TableWrap } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminMembership } from "@/copy/admin-mitgliedschaft";
import { adminSafety } from "@/copy/admin-sicherheit";
import { consents as consentCopy } from "@/copy/member";
import { adminRpc } from "@/lib/admin";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Facts, Onboarding } from "@/lib/types";

export const metadata: Metadata = { title: admin.accounts.title };

interface AccountDetail {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  status: string;
  address_form: string;
  is_founding_member: boolean;
  facts: Facts | null;
  onboarding: Onboarding;
  consents: { kind: string; action: string; version: string; at: string }[];
  verifications: { id: string; status: string; is_adult: boolean | null; birth_year: number | null; name_match: boolean | null; birth_date_match: boolean | null; blocklist_hit: boolean; started_at: string; provider_session_deleted_at: string | null }[];
  invitations: { invited_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }[];
  membership: { status: string; tier: string | null } | null;
  available_evenings: number;
  safety_flags: { id: string; kind: string; severity: string; source: string; created_at: string; reviewed_at: string | null }[];
}

const yn = (v: boolean | null | undefined) => (v === null || v === undefined ? "–" : v ? admin.account.yes : admin.account.no);

export default async function AdminAccount({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let a: AccountDetail;
  try {
    a = await adminRpc<AccountDetail>("admin_account", { p_user: id });
  } catch {
    notFound();
  }
  const c = admin.account;
  const kinds = consentCopy("sie").kinds;
  return (
    <>
      <p>
        <Link href="/admin/konten">{c.back}</Link>
      </p>
      <PageHeader title={a.facts ? `${a.facts.first_name} ${a.facts.last_name}` : a.email} lead={a.email}>
        <div className="cluster">
          <Badge>{admin.status[a.status] ?? a.status}</Badge>
          {a.is_founding_member ? <Badge tone="brass">{admin.accounts.founding}</Badge> : null}
        </div>
        <div className="cluster text-sm">
          <Link href={`/admin/mitgliedschaft?person=${a.user_id}`}>{adminMembership.ledger.title}</Link>
          <Link href={`/admin/sicherheit/sanktionen/neu?person=${a.user_id}`}>{adminSafety.sanction.title}</Link>
        </div>
      </PageHeader>
      <Notice tone="info">{c.noArt9}</Notice>
      <div className="grid-auto">
        <Card title={c.facts} headingLevel={2}>
          {a.facts ? (
            <dl className="facts">
              <dt>{admin.accounts.cols.person}</dt>
              <dd>
                {a.facts.first_name} {a.facts.last_name}
              </dd>
              <dt>{c.birthDate}</dt>
              <dd>{formatDate(a.facts.birth_date)}</dd>
              <dt>{admin.accounts.cols.place}</dt>
              <dd>
                {a.facts.postal_code} {a.facts.city}
              </dd>
              <dt>{c.phone}</dt>
              <dd>{a.facts.phone ?? "–"}</dd>
            </dl>
          ) : (
            <p className="muted">{c.none}</p>
          )}
        </Card>
        <Card title={c.onboarding} headingLevel={2}>
          <dl className="facts">
            <dt>{admin.accounts.cols.step}</dt>
            <dd>{admin.steps[a.onboarding.next_step ?? ""] ?? "–"}</dd>
            <dt>{admin.accounts.cols.created}</dt>
            <dd>{formatDateTime(a.created_at)}</dd>
            <dt>{c.lastSignIn}</dt>
            <dd>{formatDateTime(a.last_sign_in_at)}</dd>
            <dt>{c.membership}</dt>
            <dd>
              {a.membership?.status ?? "–"} · {a.available_evenings}
            </dd>
          </dl>
        </Card>
      </div>
      <Card title={c.consents} headingLevel={2}>
        <TableWrap label={c.consents}>
          <table className="table">
            <tbody>
              {a.consents.map((k, i) => (
                <tr key={i}>
                  <th scope="row">{kinds[k.kind] ?? k.kind}</th>
                  <td>{k.action === "granted" ? c.granted : c.revoked}</td>
                  <td className="muted">{k.version}</td>
                  <td className="nowrap">{formatDateTime(k.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      <Card title={c.verifications} headingLevel={2}>
        {a.verifications.length === 0 ? (
          <p className="muted">{c.none}</p>
        ) : (
          <TableWrap label={c.verifications}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{admin.verifications.cols.status}</th>
                  <th scope="col">{admin.verifications.cols.adult}</th>
                  <th scope="col">{admin.verifications.cols.year}</th>
                  <th scope="col">{admin.verifications.cols.name}</th>
                  <th scope="col">{admin.verifications.cols.birth}</th>
                  <th scope="col">{admin.verifications.cols.blocklist}</th>
                  <th scope="col">{admin.verifications.cols.deleted}</th>
                </tr>
              </thead>
              <tbody>
                {a.verifications.map((v) => (
                  <tr key={v.id}>
                    <td>{admin.verificationStatus[v.status] ?? v.status}</td>
                    <td>{yn(v.is_adult)}</td>
                    <td>{v.birth_year ?? "–"}</td>
                    <td>{yn(v.name_match)}</td>
                    <td>{yn(v.birth_date_match)}</td>
                    <td>{yn(v.blocklist_hit)}</td>
                    <td>{formatDateTime(v.provider_session_deleted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <Card title={c.flags} headingLevel={2}>
        {a.safety_flags.length === 0 ? (
          <p className="muted">{c.none}</p>
        ) : (
          <ul className="list-plain list-divided">
            {a.safety_flags.map((f) => (
              <li key={f.id}>
                <strong>{admin.flags.kinds[f.kind] ?? f.kind}</strong> · {f.severity} · {formatDateTime(f.created_at)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
