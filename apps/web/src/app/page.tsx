import { redirect } from "next/navigation";
import { getAdminStatus, getOverview, getSession } from "@/lib/data";

// Einstieg: angemeldet → Start (oder Admin, wenn es kein Mitgliedskonto gibt), sonst → Anmeldung.
export default async function Home() {
  const { claims } = await getSession();
  if (!claims?.sub) redirect("/anmelden");
  const overview = await getOverview();
  if (!overview.onboarding.has_account) {
    const admin = await getAdminStatus();
    if (admin.is_admin_user) redirect("/admin");
  }
  redirect("/start");
}
