import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type NoticeTone = "info" | "success" | "warning" | "danger" | "draft";

const icons: Record<NoticeTone, IconName> = {
  info: "info",
  success: "checkCircle",
  warning: "warning",
  danger: "alert",
  draft: "info",
};

/**
 * Hinweis. live="polite" für Rückmeldungen nach einer Aktion, live="assertive" für Fehler,
 * ohne live für dauerhafte Hinweise.
 */
export function Notice({
  tone = "info",
  title,
  children,
  live,
  id,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  live?: "polite" | "assertive";
  id?: string;
}) {
  const role = live === "assertive" ? "alert" : live === "polite" ? "status" : undefined;
  return (
    <div className={`notice notice--${tone}`} role={role} id={id}>
      <span className="notice__icon">
        <Icon name={icons[tone]} />
      </span>
      <div className="notice__body">
        {title ? <p className="notice__title">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
