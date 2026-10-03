import { Icon } from "@/components/ui";
import { due } from "@/app/admin/_lib/format";

/** Frist mit Hervorhebung: überfällig rot (mit Symbol und Text, nicht nur Farbe), bald fällig gelb. */
export function DueText({ at, now }: { at: string | null | undefined; now: number }) {
  const d = due(at, now);
  if (!d) return <span className="muted">–</span>;
  return (
    <span className={["due", d.overdue && "due--overdue", d.soon && "due--soon"].filter(Boolean).join(" ")}>
      {d.overdue ? <Icon name="alert" size={16} /> : d.soon ? <Icon name="clock" size={16} /> : null}
      <span>{d.label}</span>
    </span>
  );
}
