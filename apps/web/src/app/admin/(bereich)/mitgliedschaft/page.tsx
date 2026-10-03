import type { Metadata } from "next";
import Link from "next/link";
import { ledgerAdjustAction } from "@/app/admin/_actions/membership";
import { dateShort, dateTime, labelOf, num } from "@/app/admin/_lib/format";
import { adminFrom, rpc, rpcOrThrow } from "@/app/admin/_lib/rpc";
import type { ContractActionRow, LedgerEntry } from "@/app/admin/_lib/types";
import { ActionForm } from "@/components/admin/ActionForm";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { Figures } from "@/components/admin/Figures";
import { Badge, Button, Card, Field, PageHeader, TableWrap, TextArea } from "@/components/ui";
import { adminToday } from "@/copy/admin-heute";
import { adminMembership as c } from "@/copy/admin-mitgliedschaft";
import type { AdminAccountRow } from "@/lib/admin";

export const metadata: Metadata = { title: c.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["order", "cancel", "withdraw"];

const txt = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);

interface AccountDetail {
  user_id: string;
  email: string;
  facts: { first_name: string; last_name: string } | null;
  membership: { status: string; tier: string | null } | null;
  available_evenings: number;
}

export default async function MembershipPage({ searchParams }: { searchParams: Promise<{ art?: string; q?: string; person?: string }> }) {
  const sp = await searchParams;
  const kind = sp.art && KINDS.includes(sp.art) ? sp.art : null;
  const actions = await rpcOrThrow<ContractActionRow[]>("admin_contract_actions", { p_kind: kind, p_limit: 200 });
  const results = sp.q ? ((await rpc<AdminAccountRow[]>("admin_accounts", { p_search: sp.q, p_limit: 20 })).data ?? []) : null;
  const person = sp.person && UUID.test(sp.person) ? sp.person : null;
  const acc = person ? (await rpc<AccountDetail>("admin_account", { p_user: person })).data : null;
  const ledger = person
    ? (((await (await adminFrom("billing", "evening_ledger")).select("id, at, kind, amount, expires_at, note, evening_id").eq("user_id", person).order("at", { ascending: false }).limit(50)).data ?? []) as LedgerEntry[])
    : [];
  const a = c.actions;
  const l = c.ledger;

  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />

      <section className="stack" aria-labelledby="erklaerungen">
        <h2 id="erklaerungen">{a.title}</h2>
        <FilterLinks
          label={a.filterLabel}
          items={[
            { href: "/admin/mitgliedschaft", label: a.all, current: !kind },
            ...KINDS.map((k) => ({ href: `/admin/mitgliedschaft?art=${k}`, label: a.kinds[k]!, current: kind === k })),
          ]}
        />
        <TableWrap label={a.title}>
          <table className="table table--dense">
            <caption className="visually-hidden">{a.title}</caption>
            <thead>
              <tr>
                <th scope="col">{a.cols.at}</th>
                <th scope="col">{a.cols.kind}</th>
                <th scope="col">{a.cols.contract}</th>
                <th scope="col">{a.cols.person}</th>
                <th scope="col">{a.cols.effective}</th>
                <th scope="col">{a.cols.confirmation}</th>
                <th scope="col">{a.cols.result}</th>
              </tr>
            </thead>
            <tbody>
              {actions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    {a.empty}
                  </td>
                </tr>
              ) : (
                actions.map((x) => {
                  const refund = x.result?.refund as { status?: string } | undefined;
                  return (
                    <tr key={x.id}>
                      <td className="nowrap">{dateTime(x.at)}</td>
                      <th scope="row">
                        <Badge tone={x.kind === "withdraw" ? "danger" : x.kind === "cancel" ? "warning" : "success"}>{labelOf(a.kinds, x.kind)}</Badge>
                        {txt(x.details.tier) ? <div className="muted text-sm">{a.tier(labelOf(adminToday.kpi.tiers, txt(x.details.tier)))}</div> : null}
                      </th>
                      <td className="nowrap">{txt(x.details.contract_number) ?? "–"}</td>
                      <td>
                        {x.user_id ? <Link href={`/admin/konten/${x.user_id}`}>{txt(x.details.name) ?? txt(x.details.contact_email) ?? x.user_id}</Link> : <span className="muted">{a.deletedPerson}</span>}
                      </td>
                      <td className="nowrap">{dateTime(x.effective_at)}</td>
                      <td className="nowrap">{x.confirmation_sent_at ? a.confirmationSent(dateTime(x.confirmation_sent_at)) : <strong className="due due--soon">{a.confirmationMissing}</strong>}</td>
                      <td className="text-sm">
                        {txt(x.result?.stripe) ? <div>{a.stripe(txt(x.result.stripe)!)}</div> : null}
                        {refund?.status ? <div>{a.refund(refund.status)}</div> : null}
                        {!txt(x.result?.stripe) && !refund?.status ? "–" : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <Card title={l.title} headingLevel={2} variant="accent">
        <p className="soft">{l.lead}</p>
        <form method="get" className="inline-form" role="search" aria-label={l.search}>
          <Field label={l.searchLabel} name="q" type="search" defaultValue={sp.q ?? ""} />
          <Button type="submit" variant="secondary" icon="search">
            {l.searchSubmit}
          </Button>
        </form>
        {results ? (
          results.length === 0 ? (
            <p className="muted">{l.noResults}</p>
          ) : (
            <TableWrap label={l.results}>
              <table className="table table--dense">
                <caption className="visually-hidden">{l.results}</caption>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.user_id}>
                      <th scope="row">{[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email}</th>
                      <td>{r.email}</td>
                      <td>
                        <Link href={`/admin/mitgliedschaft?person=${r.user_id}&q=${encodeURIComponent(sp.q ?? "")}`}>{l.choose}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )
        ) : null}
        {acc ? (
          <div className="stack">
            <h3>
              {[acc.facts?.first_name, acc.facts?.last_name].filter(Boolean).join(" ") || acc.email} <span className="muted text-sm">({acc.email})</span>
            </h3>
            <Figures
              items={[
                { label: l.membership, value: labelOf(adminToday.kpi.membershipStatus, acc.membership?.status) },
                { label: l.available, value: num(acc.available_evenings) },
              ]}
            />
            <ActionForm
              action={ledgerAdjustAction}
              submitLabel={l.submit}
              errors={c.errors}
              resetOnSuccess
              confirm={{ title: l.dialogTitle, text: l.dialogText, confirmLabel: l.confirm }}
              testId="ledger-form"
            >
              <input type="hidden" name="user_id" value={acc.user_id} />
              <div className="form-grid">
                <Field label={l.amount} hint={l.amountHint} name="amount" type="number" min={-20} max={20} step={1} required />
                <Field label={l.expiresAt} name="expires_at" type="date" />
              </div>
              <TextArea label={l.note} name="note" rows={2} className="textarea--plain" required minLength={3} maxLength={500} />
            </ActionForm>
            <TableWrap label={l.entries}>
              <table className="table table--dense">
                <caption className="table__caption">{l.entries}</caption>
                <thead>
                  <tr>
                    <th scope="col">{l.cols.at}</th>
                    <th scope="col">{l.cols.kind}</th>
                    <th scope="col" className="num">
                      {l.cols.amount}
                    </th>
                    <th scope="col">{l.cols.expires}</th>
                    <th scope="col">{l.cols.note}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        {l.noEntries}
                      </td>
                    </tr>
                  ) : (
                    ledger.map((e) => (
                      <tr key={e.id}>
                        <td className="nowrap">{dateTime(e.at)}</td>
                        <th scope="row">{labelOf(l.kinds, e.kind)}</th>
                        <td className="num">{e.amount > 0 ? `+${e.amount}` : `−${Math.abs(e.amount)}`}</td>
                        <td className="nowrap">{dateShort(e.expires_at)}</td>
                        <td className="text-sm">{e.note ?? "–"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Link href={`/admin/konten/${acc.user_id}`}>{l.toAccount}</Link>
          </div>
        ) : null}
      </Card>
    </>
  );
}
