import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

interface Common {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  block?: boolean;
  icon?: IconName;
  iconAfter?: IconName;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}

export function buttonClass({ variant = "primary", size = "md", block, className }: Pick<Common, "variant" | "size" | "block" | "className">) {
  return ["btn", variant !== "primary" && `btn--${variant}`, size === "sm" && "btn--sm", block && "btn--block", className]
    .filter(Boolean)
    .join(" ");
}

function Inner({ icon, iconAfter, loading, children }: Pick<Common, "icon" | "iconAfter" | "loading" | "children">) {
  return (
    <>
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
      {iconAfter && !loading ? <Icon name={iconAfter} /> : null}
    </>
  );
}

/** Knopf. Mit href wird daraus ein Link, der wie ein Knopf aussieht. */
export function Button(props: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { variant, size, block, icon, iconAfter, loading, children, className, type = "button", disabled, ...rest } = props;
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Inner icon={icon} iconAfter={iconAfter} loading={loading}>
        {children}
      </Inner>
    </button>
  );
}

export function ButtonLink(props: Common & { href: string; prefetch?: boolean; download?: boolean | string }) {
  const { variant, size, block, icon, iconAfter, children, className, href, prefetch, download } = props;
  const cls = buttonClass({ variant, size, block, className });
  if (download) {
    return (
      <a href={href} className={cls} download={download === true ? "" : download}>
        <Inner icon={icon} iconAfter={iconAfter}>
          {children}
        </Inner>
      </a>
    );
  }
  return (
    <Link href={href} className={cls} prefetch={prefetch}>
      <Inner icon={icon} iconAfter={iconAfter}>
        {children}
      </Inner>
    </Link>
  );
}
