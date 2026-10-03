// Formular für ein Partner-Lokal (anlegen und ändern).
import { saveVenueAction } from "@/app/admin/_actions/venues";
import type { Venue } from "@/app/admin/_lib/types";
import { ActionForm } from "@/components/admin/ActionForm";
import { Checkbox, Field, Select, TextArea } from "@/components/ui";
import { adminVenues as c } from "@/copy/admin-lokale";

const s = (v: unknown) => (typeof v === "string" ? v : "");

export function VenueForm({ venue }: { venue?: Venue | null }) {
  const f = c.form;
  const a = venue?.agreement ?? {};
  return (
    <ActionForm action={saveVenueAction} submitLabel={venue ? f.save : f.create} errors={c.errors} className="stack" testId="venue-form">
      {venue ? <input type="hidden" name="venue_id" value={venue.id} /> : null}
      <fieldset className="fieldset">
        <legend className="fieldset__legend">{f.basics}</legend>
        <div className="form-grid">
          <Field label={f.name} name="name" defaultValue={venue?.name ?? ""} required maxLength={120} />
          <Field label={f.street} name="street" defaultValue={venue?.street ?? ""} required maxLength={120} autoComplete="off" />
          <Field label={f.postalCode} name="postal_code" defaultValue={venue?.postal_code ?? ""} required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} className="input--narrow" />
          <Field label={f.city} hint={f.cityHint} name="city" defaultValue={venue?.city ?? ""} maxLength={80} optional={f.optional} />
        </div>
        <div className="form-grid">
          <Field label={f.lat} name="lat" defaultValue={venue ? String(venue.lat) : ""} inputMode="decimal" optional={f.optional} describedBy="koordinaten-hinweis" />
          <Field label={f.lon} name="lon" defaultValue={venue ? String(venue.lon) : ""} inputMode="decimal" optional={f.optional} describedBy="koordinaten-hinweis" />
        </div>
        <p className="field__hint" id="koordinaten-hinweis">
          {f.coordsHint}
        </p>
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">{f.contact}</legend>
        <div className="form-grid">
          <Select
            label={f.mode}
            hint={f.modeHint}
            name="reservation_mode"
            defaultValue={venue?.reservation_mode ?? "email"}
            options={Object.entries(c.modes).map(([value, label]) => ({ value, label }))}
          />
          <Field label={f.contactEmail} name="contact_email" type="email" defaultValue={venue?.contact_email ?? ""} autoComplete="off" optional={f.optional} />
          <Field label={f.contactName} name="contact_name" defaultValue={venue?.contact_name ?? ""} autoComplete="off" optional={f.optional} />
          <Field label={f.contactPhone} name="contact_phone" type="tel" defaultValue={venue?.contact_phone ?? ""} autoComplete="off" optional={f.optional} />
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">{f.guests}</legend>
        <TextArea label={f.description} name="description" rows={3} className="textarea--plain" defaultValue={venue?.description ?? ""} maxLength={2000} optional={f.optional} />
        <div className="form-grid">
          <TextArea label={f.accessibility} hint={f.accessibilityHint} name="accessibility" rows={2} className="textarea--plain" defaultValue={venue?.accessibility ?? ""} maxLength={1000} optional={f.optional} />
          <TextArea label={f.transport} name="public_transport" rows={2} className="textarea--plain" defaultValue={venue?.public_transport ?? ""} maxLength={1000} optional={f.optional} />
        </div>
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">{f.agreement}</legend>
        <Field label={f.reservationNote} hint={f.reservationNoteHint} name="reservation_note" defaultValue={s(a.reservation_note)} maxLength={300} optional={f.optional} />
        <TextArea label={f.agreementNotes} hint={f.agreementNotesHint} name="agreement_notes" rows={3} className="textarea--plain" defaultValue={s(a.absprachen)} maxLength={2000} optional={f.optional} />
        <Checkbox name="briefed" label={f.agreementBriefed} defaultChecked={a.personal_eingewiesen === true} />
      </fieldset>
    </ActionForm>
  );
}
