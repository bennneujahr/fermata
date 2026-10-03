import { redirect } from "next/navigation";
import { eveningLinks } from "@/lib/evening-links";

// Mails und Mitteilungen verlinken /abende/<id>/check-in; die Seite selbst (Bereich Sicherheit) liegt unter /checkin.
export default async function CheckinRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(eveningLinks(id).checkin);
}
