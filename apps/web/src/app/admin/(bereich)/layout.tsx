import "@/components/admin/admin.css";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/Shells";
import { getAdminStatus } from "@/lib/data";

// Zwei-Faktor (aal2) serverseitig erzwingen; die Datenbank verlangt es ohnehin (app.is_admin()).
export default async function AdminAreaLayout({ children }: { children: ReactNode }) {
  const status = await getAdminStatus();
  if (!status.is_admin) redirect("/admin/mfa/bestaetigen");
  return <AdminShell>{children}</AdminShell>;
}
