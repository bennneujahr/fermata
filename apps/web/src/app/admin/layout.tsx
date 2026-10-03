import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getAdminStatus, requireSession } from "@/lib/data";

// Nur Personen aus app.admin_users. Andere sehen „nicht gefunden“ (der Bereich wird nicht verraten).
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  await requireSession("/admin");
  const status = await getAdminStatus();
  if (!status.is_admin_user) notFound();
  return children;
}
