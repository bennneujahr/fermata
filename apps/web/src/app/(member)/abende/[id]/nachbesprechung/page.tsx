import { redirect } from "next/navigation";
import { eveningLinks } from "@/lib/evening-links";

// Link aus der Mail „Nachbesprechung“: das Gespräch mit Viola zum Abend.
export default async function DebriefRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(eveningLinks(id).debrief);
}
