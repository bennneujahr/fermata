// Ein Abend in der Liste: Gegenüber, Lokal, Zeit, Zustand und was jetzt zu tun ist (my_action).
import Link from "next/link";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { abende } from "@/copy/abende";
import type { AddressForm } from "@/copy/form";
import { formatDeadline, formatEveningTime, formatSlotShort } from "@/lib/berlin";
import type { EveningListItem, MyAction } from "@/lib/evening-types";

const ACTION_TONE: Partial<Record<MyAction, "wine" | "brass" | "success">> = {
  choose_time: "wine",
  answer_time: "wine",
  find: "wine",
  feedback: "wine",
  contact: "success",
  debrief: "brass",
  prepare: "success",
};

export function actionLabel(c: ReturnType<typeof abende>, action: MyAction, name: string | null): string {
  const v = c.actions[action];
  return typeof v === "function" ? v(name) : (v ?? "");
}

export function EveningCard({ evening: e, form, now, compact }: { evening: EveningListItem; form: AddressForm; now: Date; compact?: boolean }) {
  const c = abende(form);
  const name = e.counterpart_first_name;
  const proposal = e.state === "proposed" || e.state === "time_requested" || e.state === "time_countered";
  const action = actionLabel(c, e.my_action, name);
  const times = e.state === "proposed" ? e.proposed_times : e.state === "time_requested" ? e.requested_times : e.state === "time_countered" ? e.countered_times : [];
  return (
    <Link href={`/abende/${e.evening_id}`} className={["card", "card--link", "evening-card", compact && "evening-card--compact"].filter(Boolean).join(" ")} data-state={e.state} data-action={e.my_action}>
      <div className="evening-card__head">
        <div className="stack stack-sm">
          <p className="eyebrow">{c.states[e.state] ?? e.state}</p>
          <h3 className="evening-card__title">{proposal ? c.proposalWith(name) : c.withName(name)}</h3>
        </div>
        <Icon name="arrowRight" className="evening-card__arrow" />
      </div>
      <div className="evening-card__meta">
        {e.starts_at ? (
          <span className="cluster evening-card__when">
            <Icon name="clock" size={18} />
            {formatEveningTime(e.starts_at, now)}
          </span>
        ) : times.length ? (
          <span className="cluster evening-card__when">
            <Icon name="clock" size={18} />
            {times.map((t) => formatSlotShort(t)).join(" · ")}
          </span>
        ) : null}
        {e.venue?.name ? (
          <span className="cluster">
            <Icon name="evening" size={18} />
            {e.venue.name}
            {e.venue.city ? `, ${e.venue.city}` : ""}
          </span>
        ) : null}
      </div>
      {action && !compact ? (
        <div className="cluster">
          <Badge tone={ACTION_TONE[e.my_action]}>{action}</Badge>
          {e.my_deadline_at ? <span className="muted text-sm">{c.deadline(formatDeadline(e.my_deadline_at, now))}</span> : null}
        </div>
      ) : action && compact && (e.my_action === "feedback" || e.my_action === "contact" || e.my_action === "debrief") ? (
        <div className="cluster">
          <Badge tone={ACTION_TONE[e.my_action]}>{action}</Badge>
        </div>
      ) : null}
    </Link>
  );
}
