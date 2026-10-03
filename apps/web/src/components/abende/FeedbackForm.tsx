"use client";
// Rückmeldung am Tag nach dem Abend (einmal, nur Fermata sieht sie). Mit freiwilligem Kontakttausch:
// Einwilligung „kontakttausch“ direkt im Formular, Wahl von E-Mail und/oder Telefon.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { submitFeedbackAction, type FeedbackInput } from "@/app/actions/abende";
import { Button, Checkbox, Notice, TextArea } from "@/components/ui";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { errorText } from "./errors";

type Tri = boolean | null;

function YesNo({ legend, value, onChange, name, yes, no, describedBy }: { legend: string; value: Tri; onChange: (v: boolean) => void; name: string; yes: string; no: string; describedBy?: string }) {
  const gid = useId();
  return (
    <fieldset className="fieldset" aria-describedby={describedBy}>
      <legend className="fieldset__legend">{legend}</legend>
      <div className="choice-list choice-list--inline">
        {[true, false].map((v) => (
          <label className="choice" key={String(v)} htmlFor={`${gid}-${v}`}>
            <input className="choice__control" type="radio" id={`${gid}-${v}`} name={name} checked={value === v} onChange={() => onChange(v)} />
            <span className="choice__text">
              <span className="choice__label">{v ? yes : no}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Rating({ legend, value, onChange, name, labels, optional }: { legend: string; value: number | null; onChange: (v: number) => void; name: string; labels: string[]; optional: string }) {
  const gid = useId();
  return (
    <fieldset className="fieldset">
      <legend className="fieldset__legend">
        {legend} <span className="field__optional">({optional})</span>
      </legend>
      <div className="rating">
        {labels.map((label, i) => (
          <label className="rating__option" key={label} htmlFor={`${gid}-${i}`}>
            <input className="rating__control" type="radio" id={`${gid}-${i}`} name={name} checked={value === i + 1} onChange={() => onChange(i + 1)} />
            <span className="rating__number" aria-hidden="true">
              {i + 1}
            </span>
            <span className="rating__label">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FeedbackForm({
  eveningId,
  form,
  counterpartName,
  hasPhone,
  consentGranted,
  consentVersion,
  consentDoc,
  reportHref,
}: {
  eveningId: string;
  form: AddressForm;
  counterpartName: string | null;
  hasPhone: boolean;
  consentGranted: boolean;
  consentVersion: string | null;
  consentDoc: ReactNode;
  reportHref: string;
}) {
  const c = abende(form);
  const router = useRouter();
  const [attended, setAttended] = useState<Tri>(null);
  const [otherAttended, setOtherAttended] = useState<Tri>(null);
  const [feltSafe, setFeltSafe] = useState<Tri>(null);
  const [meet, setMeet] = useState<FeedbackInput["wouldMeetAgain"]>(null);
  const [venueRating, setVenueRating] = useState<number | null>(null);
  const [matchQuality, setMatchQuality] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [wantsContact, setWantsContact] = useState<Tri>(null);
  const [shareEmail, setShareEmail] = useState(true);
  const [sharePhone, setSharePhone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const meetId = useId();

  const submit = () => {
    setError(null);
    if (attended === null) {
      setError("invalid_input");
      return;
    }
    const wants = attended && wantsContact === true;
    if (wants && !shareEmail && !sharePhone) {
      setError("nothing_to_share");
      return;
    }
    if (wants && !consentGranted && !consent) {
      setError("consent_required");
      return;
    }
    start(async () => {
      const res = await submitFeedbackAction(eveningId, {
        attended,
        otherAttended: attended ? otherAttended : null,
        feltSafe,
        wouldMeetAgain: attended ? meet : null,
        venueRating: attended ? venueRating : null,
        matchQuality: attended ? matchQuality : null,
        note,
        wantsContact: wants,
        shareEmail: wants && shareEmail,
        sharePhone: wants && sharePhone,
        contactConsentVersion: wants && !consentGranted ? consentVersion : null,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.error === "already_submitted" || res.error === "feedback_not_open") router.refresh();
        return;
      }
      router.push(`/abende/${eveningId}?rueckmeldung=danke`);
      router.refresh();
    });
  };

  return (
    <form
      className="stack stack-lg feedback-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <YesNo legend={c.attendedLegend} value={attended} onChange={setAttended} name="attended" yes={c.yes} no={c.no} />

      {attended ? (
        <>
          <YesNo legend={c.otherAttendedLegend(counterpartName)} value={otherAttended} onChange={setOtherAttended} name="other_attended" yes={c.yes} no={c.no} />
          <fieldset className="fieldset">
            <legend className="fieldset__legend" id={meetId}>
              {c.meetAgainLegend(counterpartName)} <span className="field__optional">({c.ratingOptional})</span>
            </legend>
            <div className="choice-list choice-list--inline">
              {(["ja", "vielleicht", "nein"] as const).map((v) => (
                <label className="choice" key={v} htmlFor={`${meetId}-${v}`}>
                  <input className="choice__control" type="radio" id={`${meetId}-${v}`} name="meet_again" checked={meet === v} onChange={() => setMeet(v)} />
                  <span className="choice__text">
                    <span className="choice__label">{c.meetAgain[v]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      <YesNo legend={c.feltSafeLegend} value={feltSafe} onChange={setFeltSafe} name="felt_safe" yes={c.yes} no={c.no} />
      {feltSafe === false ? (
        <Notice tone="warning">
          {c.feltSafeNo} <Link href={reportHref}>{c.reportLink}</Link>
        </Notice>
      ) : null}

      {attended ? (
        <>
          <Rating legend={c.venueRatingLegend} value={venueRating} onChange={setVenueRating} name="venue_rating" labels={c.ratingLabels} optional={c.ratingOptional} />
          <Rating legend={c.matchQualityLegend} value={matchQuality} onChange={setMatchQuality} name="match_quality" labels={c.ratingLabels} optional={c.ratingOptional} />

          <section className="card card--sunk stack" aria-labelledby="kontakt-titel">
            <h2 className="card__title" id="kontakt-titel">
              {c.contactTitle}
            </h2>
            <p className="soft" id="kontakt-lead">
              {c.contactLead(counterpartName)}
            </p>
            <YesNo legend={c.contactLegend} value={wantsContact} onChange={setWantsContact} name="wants_contact" yes={c.contactYes} no={c.contactNo} describedBy="kontakt-lead" />
            {wantsContact ? (
              <>
                <fieldset className="fieldset">
                  <legend className="fieldset__legend">{c.shareWhat}</legend>
                  <Checkbox label={c.shareEmail} checked={shareEmail} onChange={(e) => setShareEmail(e.target.checked)} name="share_email" />
                  <Checkbox
                    label={c.sharePhone}
                    checked={sharePhone}
                    onChange={(e) => setSharePhone(e.target.checked)}
                    name="share_phone"
                    disabled={!hasPhone}
                    description={!hasPhone ? c.noPhone : undefined}
                  />
                </fieldset>
                {!consentGranted ? (
                  <div className="stack stack-sm inline-consent">
                    <p className="fieldset__legend">{c.contactConsentTitle}</p>
                    <p className="soft">{c.contactConsentLead}</p>
                    <details className="inline-consent__doc">
                      <summary>{c.contactConsentRead}</summary>
                      {consentDoc}
                    </details>
                    <Checkbox label={c.contactConsentAgree} checked={consent} onChange={(e) => setConsent(e.target.checked)} name="contact_consent" />
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </>
      ) : null}

      <TextArea label={c.noteLabel} hint={c.noteHint} optional={c.ratingOptional} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4} name="note" className="textarea--prose" />

      {error ? (
        <Notice tone="danger" live="assertive">
          {errorText(c, error)}
        </Notice>
      ) : null}
      <div>
        <Button type="submit" loading={pending} iconAfter="arrowRight">
          {c.feedbackSubmit}
        </Button>
      </div>
    </form>
  );
}
