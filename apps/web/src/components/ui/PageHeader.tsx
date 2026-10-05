import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  lead,
  actions,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="page-header__title">{title}</h1>
      {lead ? <p className="page-header__lead lead">{lead}</p> : null}
      {children}
      {actions ? <div className="page-header__actions cluster">{actions}</div> : null}
    </header>
  );
}
