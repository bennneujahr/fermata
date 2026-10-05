import type { ReactNode } from "react";
import { AppShell, PublicShell } from "@/components/shell/Shells";
import { getSession } from "@/lib/data";

// Hilfe, Installieren, Rechtliches: mit Navigation, wenn angemeldet; sonst schlicht.
export default async function InfoLayout({ children }: { children: ReactNode }) {
  const { claims } = await getSession();
  return claims?.sub ? <AppShell>{children}</AppShell> : <PublicShell narrow={false}>{children}</PublicShell>;
}
