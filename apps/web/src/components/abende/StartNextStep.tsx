// Startseite nach dem Onboarding: der eine nächste Schritt (Gespräch, Zusammenfassung, freie Abende, Abend)
// und eine Karte mit dem nächsten Abend.
import { ButtonLink, Card } from "@/components/ui";
import { startCards } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { formatDeadline, formatEveningTime } from "@/lib/berlin";
import { availabilityLink, eveningLinks } from "@/lib/evening-links";
import type { EveningListItem, MyAction } from "@/lib/evening-types";
import { getDbNow, getMyEvenings, getPeriods } from "@/lib/evenings";
import { getInterviewSessions, getProfileSummary } from "@/lib/gespraech";

const URGENT: MyAction[] = ["find", "answer_time", "choose_time", "feedback"];
const LATER: MyAction[] = ["contact", "debrief", "prepare", "wait"];

function hrefFor(e: EveningListItem): string {
  const l = eveningLinks(e.evening_id);
  if (e.my_action === "find") return l.find;
  if (e.my_action === "feedback") return l.feedback;
  if (e.my_action === "contact") return l.contact;
  if (e.my_action === "debrief") return l.debrief;
  return l.detail;
}

export async function StartNextStep({ form }: { form: AddressForm }) {
  const c = startCards(form);
  const [evenings, periods, sessions, profile, now] = await Promise.all([
    getMyEvenings().catch(() => [] as EveningListItem[]),
    getPeriods().catch(() => []),
    getInterviewSessions().catch(() => []),
    getProfileSummary().catch(() => null),
    getDbNow(),
  ]);
  const urgent = URGENT.map((a) => evenings.find((e) => e.my_action === a)).find(Boolean);
  const later = LATER.map((a) => evenings.find((e) => e.my_action === a)).find(Boolean);
  const draft = sessions.find((s) => s.summary_status === "draft");
  const hasSummary = Boolean(profile?.summary_confirmed_at);
  const period = periods.find((p) => p.is_open && p.window_count === 0);
  const nextEvening = evenings
    .filter((e) => e.state === "confirmed" && e.starts_at && new Date(e.starts_at).getTime() > now.getTime() - 3 * 3_600_000)
    .sort((a, b) => (a.starts_at! < b.starts_at! ? -1 : 1))[0];

  let step: { title: string; text?: string; href: string; cta: string; accent: boolean; id: string };
  if (urgent) {
    const k = c.evening[urgent.my_action]!;
    step = {
      title: k.title(urgent.counterpart_first_name),
      text: urgent.my_deadline_at ? c.answerBy(formatDeadline(urgent.my_deadline_at, now)) : urgent.starts_at ? formatEveningTime(urgent.starts_at, now) : undefined,
      href: hrefFor(urgent),
      cta: k.cta,
      accent: true,
      id: "naechster-schritt",
    };
  } else if (draft) {
    step = { title: c.summary.title, text: c.summary.text, href: `/gespraech/${draft.id}`, cta: c.summary.cta, accent: true, id: "naechster-schritt" };
  } else if (!hasSummary) {
    step = { title: c.conversation.title, text: c.conversation.text, href: "/gespraech", cta: c.conversation.cta, accent: true, id: "naechster-schritt" };
  } else if (period) {
    step = {
      title: c.availability.title,
      text: c.availability.text(formatDeadline(period.answer_until, now)),
      href: availabilityLink(period.period_id),
      cta: c.availability.cta,
      accent: true,
      id: "naechster-schritt",
    };
  } else if (later) {
    const k = c.evening[later.my_action]!;
    step = {
      title: k.title(later.counterpart_first_name),
      text: later.starts_at ? formatEveningTime(later.starts_at, now) : undefined,
      href: hrefFor(later),
      cta: k.cta,
      accent: false,
      id: "naechster-schritt",
    };
  } else {
    step = { title: c.waiting.title, text: c.waiting.text, href: "/konto/mitteilungen", cta: c.waiting.cta, accent: false, id: "naechster-schritt" };
  }

  return (
    <>
      <Card title={step.title} eyebrow={c.eyebrow} variant={step.accent ? "accent" : "night"} id={step.id}>
        {step.text ? <p className="soft">{step.text}</p> : null}
        <div>
          <ButtonLink href={step.href} iconAfter="arrowRight" variant={step.accent ? "primary" : "secondary"}>
            {step.cta}
          </ButtonLink>
        </div>
      </Card>
      <Card title={c.eveningsTitle} id="abende" variant="outline">
        <p className="soft">{nextEvening?.starts_at ? c.eveningsNext(formatEveningTime(nextEvening.starts_at, now), nextEvening.counterpart_first_name) : c.eveningsNone}</p>
        <div>
          <ButtonLink href="/abende" variant="secondary" size="sm" iconAfter="arrowRight">
            {c.eveningsCta}
          </ButtonLink>
        </div>
      </Card>
    </>
  );
}
