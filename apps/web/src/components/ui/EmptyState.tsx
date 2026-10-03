import type { ReactNode } from "react";
import { Fermate } from "./Icon";

export function EmptyState({ title, children, action, headingLevel = 2 }: { title: ReactNode; children?: ReactNode; action?: ReactNode; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <div className="empty-state">
      <Fermate className="empty-state__mark" />
      <H className="empty-state__title">{title}</H>
      {children ? <div className="empty-state__text">{children}</div> : null}
      {action}
    </div>
  );
}
