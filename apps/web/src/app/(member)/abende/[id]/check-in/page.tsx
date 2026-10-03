// Alte Schreibweise aus den Mitteilungen (supabase/functions/_shared/mail/templates/notify-common.ts: /abende/<id>/check-in).
import { redirect } from "next/navigation";

export default async function CheckinAlias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/abende/${encodeURIComponent(id)}/checkin`);
}
