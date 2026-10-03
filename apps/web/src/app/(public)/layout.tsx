import type { ReactNode } from "react";
import { PublicShell } from "@/components/shell/Shells";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
