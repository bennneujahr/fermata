import { redirect } from "next/navigation";

// Die Hinweise liegen seit der UI-Welle unter „Sicherheit“.
export default async function OldFlagsPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams;
  redirect(alle === "1" ? "/admin/sicherheit/hinweise?alle=1" : "/admin/sicherheit/hinweise");
}
