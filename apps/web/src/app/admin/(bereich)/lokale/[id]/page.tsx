import type { Metadata } from "next";
import { inDays } from "@/app/admin/_lib/clock";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSlotsAction, deleteSlotAction, setVenueActiveAction, updateSlotAction } from "@/app/admin/_actions/venues";
import { dateTime, isoDateBerlin, labelOf, num } from "@/app/admin/_lib/format";
import { adminFrom, rpc } from "@/app/admin/_lib/rpc";
import type { SlotRow, Venue } from "@/app/admin/_lib/types";
import { ActionForm } from "@/components/admin/ActionForm";
import { VenueForm } from "@/components/admin/VenueForm";
import { Badge, Card, Checkbox, Field, Icon, Notice, PageHeader, RadioGroup, TableWrap } from "@/components/ui";
import { adminVenues as c } from "@/copy/admin-lokale";

export const metadata: Metadata = { title: c.title };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VenuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ angelegt?: string }> }) {
  const { id } = await params;
  const { angelegt } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { data: venue } = await (await adminFrom("app", "venues")).select("*").eq("id", id).maybeSingle<Venue>();
  if (!venue) notFound();
  const to = inDays(56).toISOString();
  const slots = (await rpc<SlotRow[]>("admin_venue_slots", { p_venue_id: id, p_from: null, p_to: to })).data ?? [];
  const tomorrow = isoDateBerlin(inDays(1));
  const s = c.slots;

  return (
    <>
      <p>
        <Link href="/admin/lokale" className="cluster">
          <Icon name="arrowLeft" size={18} />
          <span>{c.form.back}</span>
        </Link>
      </p>
      <PageHeader title={c.form.editTitle(venue.name)}>
        <div className="cluster">
          <Badge tone={venue.active ? "success" : undefined}>{venue.active ? c.list.active : c.list.inactive}</Badge>
          <span className="muted text-sm">
            {labelOf(c.modes, venue.reservation_mode)} · {c.form.coords(num(venue.lat, 4), num(venue.lon, 4))}
          </span>
        </div>
      </PageHeader>
      {angelegt ? (
        <Notice tone="success" live="polite">
          {c.form.created}
        </Notice>
      ) : null}

      <Card title={c.form.basics} headingLevel={2} id="lokal">
        <VenueForm venue={venue} />
      </Card>

      <Card title={c.active.title} headingLevel={2} id="stand">
        <p className="soft">{venue.active ? c.active.isActive : c.active.isInactive}</p>
        <ActionForm
          action={setVenueActiveAction}
          submitLabel={venue.active ? c.active.deactivate : c.active.activate}
          variant={venue.active ? "danger" : "secondary"}
          errors={c.errors}
          confirm={venue.active ? { title: c.active.dialogTitle, text: c.active.dialogText, confirmLabel: c.active.confirm, danger: true } : undefined}
        >
          <input type="hidden" name="venue_id" value={venue.id} />
          <input type="hidden" name="active" value={venue.active ? "false" : "true"} />
        </ActionForm>
      </Card>

      <Card title={s.title} headingLevel={2} id="plaetze-anlegen">
        <p className="soft text-sm">{s.lead}</p>
        <ActionForm action={createSlotsAction} submitLabel={s.submit} errors={c.errors} testId="slot-form">
          <input type="hidden" name="venue_id" value={venue.id} />
          <div className="form-grid">
            <Field label={s.firstDay} name="first_day" type="date" defaultValue={tomorrow} required />
            <Field label={s.weeks} name="weeks" type="number" min={1} max={26} defaultValue="4" required />
            <Field label={s.tables} name="tables" type="number" min={0} max={50} defaultValue="2" required />
          </div>
          <RadioGroup
            legend={s.weekdays}
            name="weekdays"
            multiple
            inline
            defaultValue={["4", "5", "6"]}
            options={s.weekdayNames.map((label, i) => ({ value: String(i + 1), label }))}
          />
          <Field label={s.times} hint={s.timesHint} name="times" defaultValue="19:00, 19:30" required />
          <Checkbox name="update_existing" label={s.update} />
        </ActionForm>
      </Card>

      <section className="stack" aria-labelledby="plaetze">
        <h2 id="plaetze">{s.listTitle}</h2>
        {slots.length === 0 ? (
          <p className="muted">{s.empty}</p>
        ) : (
          <TableWrap label={s.listTitle}>
            <table className="table table--dense">
              <caption className="visually-hidden">{s.listTitle}</caption>
              <thead>
                <tr>
                  <th scope="col">{s.cols.when}</th>
                  <th scope="col" className="num">
                    {s.cols.tables}
                  </th>
                  <th scope="col" className="num">
                    {s.cols.reserved}
                  </th>
                  <th scope="col" className="num">
                    {s.cols.free}
                  </th>
                  <th scope="col">{s.cols.reservations}</th>
                  <th scope="col">{s.cols.action}</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((x) => (
                  <tr key={x.slot_id}>
                    <th scope="row" className="nowrap">
                      {dateTime(x.starts_at)}
                    </th>
                    <td className="num">{num(x.tables)}</td>
                    <td className="num">{num(x.reserved)}</td>
                    <td className="num">{num(x.free)}</td>
                    <td className="text-sm">
                      {x.reservations.length === 0
                        ? "–"
                        : x.reservations.map((r) => (
                            <div key={r.reservation_id}>
                              {s.reservation(r.table_code)} · {labelOf(s.resStatus, r.status)}
                              {r.status === "reserved" ? ` · ${r.venue_confirmed_at ? s.confirmed : r.venue_notified_at ? `${s.notified}, ${s.unconfirmed}` : s.unconfirmed}` : ""}
                            </div>
                          ))}
                    </td>
                    <td className="actions">
                      <div className="cluster">
                        <ActionForm action={updateSlotAction} submitLabel={s.setTablesSubmit} variant="secondary" size="sm" errors={c.errors} className="inline-form">
                          <input type="hidden" name="slot_id" value={x.slot_id} />
                          <input type="hidden" name="venue_id" value={venue.id} />
                          <label className="visually-hidden" htmlFor={`tische-${x.slot_id}`}>
                            {`${s.setTables} ${dateTime(x.starts_at)}`}
                          </label>
                          <input id={`tische-${x.slot_id}`} className="input input--narrow input--sm" name="tables" type="number" min={x.reserved} max={50} defaultValue={String(x.tables)} />
                        </ActionForm>
                        {x.reserved === 0 ? (
                          <ActionForm
                            action={deleteSlotAction}
                            submitLabel={s.delete}
                            variant="quiet"
                            size="sm"
                            errors={c.errors}
                            confirm={{ title: s.deleteTitle, text: s.deleteText, confirmLabel: s.deleteConfirm, danger: true }}
                          >
                            <input type="hidden" name="slot_id" value={x.slot_id} />
                            <input type="hidden" name="venue_id" value={venue.id} />
                          </ActionForm>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
