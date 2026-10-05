// Ziel der Links in den Mails der Mitgliedschaft (supabase/functions/_shared/stripe/contract.ts manageUrl).
import { redirect } from "next/navigation";

export default function KontoMitgliedschaft() {
  redirect("/mitgliedschaft");
}
