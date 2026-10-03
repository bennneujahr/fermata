// Ziel der Links in den Sicherheits-Mails (supabase/functions/_shared/mail/templates/safety.ts: „Konto ansehen“, „Widerspruch einlegen“).
import { redirect } from "next/navigation";

export default function KontoSicherheit() {
  redirect("/sicherheit/sanktionen");
}
