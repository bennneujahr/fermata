import type { ReactNode } from "react";

export function Badge({ tone, children }: { tone?: "brass" | "success" | "danger" | "warning" | "wine"; children: ReactNode }) {
  return <span className={["badge", tone && `badge--${tone}`].filter(Boolean).join(" ")}>{children}</span>;
}
