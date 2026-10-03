import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "raised" | "sunk" | "outline" | "night" | "accent";

export function Card({
  title,
  eyebrow,
  headingLevel = 2,
  variant = "raised",
  children,
  footer,
  className,
  id,
  labelledBy,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  variant?: Variant;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      className={["card", variant !== "raised" && `card--${variant}`, className].filter(Boolean).join(" ")}
      id={id}
      aria-labelledby={labelledBy ?? (title ? headingId : undefined)}
    >
      {title || eyebrow ? (
        <div className="card__header">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          {title ? (
            <H className="card__title" id={headingId}>
              {title}
            </H>
          ) : null}
        </div>
      ) : null}
      {children}
      {footer ? <div className="card__footer">{footer}</div> : null}
    </section>
  );
}

/** Ganze Karte als Link (z. B. „Nächster Schritt“). */
export function CardLink({ href, children, variant = "raised" }: { href: string; children: ReactNode; variant?: Variant }) {
  return (
    <Link href={href} className={["card", "card--link", variant !== "raised" && `card--${variant}`].filter(Boolean).join(" ")}>
      {children}
    </Link>
  );
}
